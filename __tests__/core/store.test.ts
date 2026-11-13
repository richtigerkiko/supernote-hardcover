// The store against a real SQLite (node:sqlite, in memory), so the SQL itself is tested, not a hand-written fake.
import {DatabaseSync} from 'node:sqlite';
import {createJsonFile, createMetaCache, prepareDb, tokenSlot, type Db, type TextSlot} from '../../src/core/store';

// The tests poke at arbitrary JSON, so the files are loosely typed.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// A database with the tables; statements matching `fail` reject, `log` holds every statement that ran.
const memDb = async () => {
  const raw = new DatabaseSync(':memory:');
  const d = {
    raw,
    log: [] as string[],
    fail: null as RegExp | null,
    exec: (async (sql, params = []) => {
      if (d.fail?.test(sql)) throw new Error('SQL_FAILED');
      d.log.push(sql);
      return raw.prepare(sql).all(...params) as Record<string, unknown>[];
    }) as Db['exec'],
  };
  await prepareDb(d, null);
  d.log.length = 0;
  return d;
};
const rows = (d: {raw: DatabaseSync}, table: string) => d.raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Json[];

// File sizes for stat; a path that is not listed does not exist.
const sizes = (s: Record<string, number> = {}) => {
  const stat = async (p: string) => (p in s ? {exists: true, size: s[p]} : {exists: false, size: 0});
  return {s, stat};
};

// A text slot over one string; it can be made to fail.
const fakeSlot = (text = '') => {
  const t = {
    text,
    writes: 0,
    failWrite: false,
    failRead: false,
    read: async () => {
      if (t.failRead) throw new Error('READ_FAILED');
      return t.text;
    },
    write: (async (v: string) => {
      if (t.failWrite) throw new Error('WRITE_FAILED');
      t.writes++;
      t.text = v;
    }) as TextSlot['write'],
  };
  return t;
};
const jf = (slot: TextSlot | null, defaults?: Json, strict = false) => createJsonFile<Json>(slot, defaults, strict);

describe('prepareDb', () => {
  // The two JSON files of the versions before SQLite, as a fake private directory.
  const legacy = (files: Record<string, string>) => ({
    files,
    read: async (name: string) => files[name] ?? '',
    remove: async (name: string) => void delete files[name],
  });
  const TOKENS = {accessToken: 'hc_at_1', refreshToken: 'hc_rt_1', scope: 'read:library'};
  const CACHE = {
    '/a.epub': {size: 5, meta: {title: 'A', ids: [], tracking: true, edition: {id: 1, pages: 9}, book: {bookId: 2, userBookId: 3, title: 'A'}}},
    '/b.pdf': {size: 7, meta: {ids: [], linked: {bookId: 4, editionId: 5}}},
  };

  test('imports tokens.json and meta-cache.json once, in order, and removes both files', async () => {
    const d = await memDb();
    const old = legacy({'tokens.json': JSON.stringify(TOKENS), 'meta-cache.json': JSON.stringify(CACHE)});
    await prepareDb(d, old);
    expect(old.files).toEqual({});
    expect(await jf(tokenSlot(d)).load()).toEqual(TOKENS);
    const {stat} = sizes({'/a.epub': 5, '/b.pdf': 7});
    const cache = createMetaCache(d, stat);
    expect(await cache.get('/a.epub')).toEqual(CACHE['/a.epub'].meta);
    expect(await cache.get('/b.pdf')).toEqual(CACHE['/b.pdf'].meta);
    expect(await cache.tracked()).toEqual(['/a.epub']);
    expect(rows(d, 'files').map(r => r.path)).toEqual(['/a.epub', '/b.pdf']);
  });

  test('rows that already exist win, so a second import changes nothing', async () => {
    const d = await memDb();
    await jf(tokenSlot(d)).load().then(() => tokenSlot(d).write(JSON.stringify({accessToken: 'new', scope: ''})));
    d.raw.prepare('INSERT INTO files VALUES (?, ?, ?)').run('/a.epub', 6, '{"ids":[],"title":"newer"}');
    const old = legacy({'tokens.json': JSON.stringify(TOKENS), 'meta-cache.json': JSON.stringify(CACHE)});
    await prepareDb(d, old);
    expect(old.files).toEqual({});
    expect(await jf(tokenSlot(d)).load()).toEqual({accessToken: 'new', scope: ''});
    expect(rows(d, 'files').map(r => [r.path, r.size])).toEqual([
      ['/a.epub', 6],
      ['/b.pdf', 7],
    ]);
  });

  test('a signed-out row ({}) is not replaced by an old tokens.json', async () => {
    const d = await memDb();
    const file = jf(tokenSlot(d));
    await file.load();
    await file.save(); // "{}"
    await prepareDb(d, legacy({'tokens.json': JSON.stringify(TOKENS)}));
    expect(await jf(tokenSlot(d)).load()).toEqual({});
  });

  test('a file whose rows could not be written stays for the next start; the other file is still imported', async () => {
    const d = await memDb();
    const old = legacy({'tokens.json': JSON.stringify(TOKENS), 'meta-cache.json': JSON.stringify(CACHE)});
    d.fail = /INTO tokens/;
    await expect(prepareDb(d, old)).resolves.toBeUndefined();
    expect(Object.keys(old.files)).toEqual(['tokens.json']);
    expect(rows(d, 'files').length).toBe(2);
    d.fail = null;
    await prepareDb(d, old);
    expect(old.files).toEqual({});
    expect(await jf(tokenSlot(d)).load()).toEqual(TOKENS);
  });

  test('corrupt files and broken entries are dropped without throwing; an unreadable file stays', async () => {
    const d = await memDb();
    const old = legacy({'tokens.json': '{not json', 'meta-cache.json': JSON.stringify({'/x.epub': {meta: {ids: []}}, '/y.epub': null, '/z.epub': {size: 1, meta: {ids: []}}})});
    await prepareDb(d, old);
    expect(old.files).toEqual({});
    expect(rows(d, 'tokens')).toEqual([]);
    expect(rows(d, 'files').map(r => r.path)).toEqual(['/z.epub']);
    const broken = {...legacy({'tokens.json': '{}'}), read: async () => Promise.reject(new Error('READ_FAILED'))};
    await expect(prepareDb(d, broken)).resolves.toBeUndefined();
    expect(Object.keys(broken.files)).toEqual(['tokens.json']);
  });

  test('a database that cannot create its tables throws, so the caller falls back to memory', async () => {
    const d = await memDb();
    d.fail = /CREATE TABLE/;
    await expect(prepareDb(d, null)).rejects.toThrow('SQL_FAILED');
  });
});

describe('tokens row', () => {
  test('tokens survive a restart in one row, and a failed write rejects (strict)', async () => {
    const d = await memDb();
    const file = jf(tokenSlot(d), {}, true);
    (await file.load()).accessToken = 'a1';
    await file.save();
    (await file.load()).accessToken = 'a2';
    await file.save();
    expect(rows(d, 'tokens')).toEqual([{id: 1, json: '{"accessToken":"a2"}'}]);
    expect(await jf(tokenSlot(d)).load()).toEqual({accessToken: 'a2'});
    d.fail = /INTO tokens/;
    (await file.load()).accessToken = 'a3';
    await expect(file.save()).rejects.toThrow('SQL_FAILED');
    d.fail = null;
    await file.save(); // the next save retries and works
    expect(await jf(tokenSlot(d)).load()).toEqual({accessToken: 'a3'});
  });

  test('an unreadable tokens table starts signed out without throwing', async () => {
    const d = await memDb();
    d.fail = /FROM tokens/;
    expect(await jf(tokenSlot(d), {}, true).load()).toEqual({});
  });
});

test('a set during a slow first read does not lose the saved entries', async () => {
  const d = await memDb();
  const {stat} = sizes({'/b.epub': 5, '/c.epub': 7});
  d.raw.prepare('INSERT INTO files VALUES (?, ?, ?)').run('/b.epub', 5, JSON.stringify({tracking: true, edition: {id: 1, pages: 9}}));
  const fast = d.exec;
  d.exec = async (sql, params) => {
    await new Promise(r => setTimeout(r, 20));
    return fast(sql, params);
  };
  const cache = createMetaCache(d, stat);
  await Promise.all([cache.get('/b.epub'), cache.set('/c.epub', {title: 'C', ids: []})]);
  d.exec = fast;
  const again = createMetaCache(d, stat);
  expect(await again.get('/b.epub')).toEqual({tracking: true, edition: {id: 1, pages: 9}});
  expect(await again.get('/c.epub')).toEqual({title: 'C', ids: []});
});

describe('createJsonFile', () => {
  test('no text gives the defaults; a save writes JSON and a new instance reads it back', async () => {
    const s = fakeSlot();
    const f = jf(s, {x: 1});
    const data = await f.load();
    expect(data).toEqual({x: 1});
    data.y = 2;
    await f.save();
    expect(JSON.parse(s.text)).toEqual({x: 1, y: 2});
    expect(await jf(s, {x: 9}).load()).toEqual({x: 1, y: 2});
  });

  test('corrupt JSON, a non-object, or an unreadable slot fall back to the defaults without throwing', async () => {
    for (const text of ['{not json', '[1,2]', '42', 'null']) {
      expect(await jf(fakeSlot(text), {x: 1}).load()).toEqual({x: 1});
    }
    const s = fakeSlot();
    s.failRead = true;
    expect(await jf(s, {x: 1}).load()).toEqual({x: 1});
  });

  test('a failed write does not throw and the in-memory copy keeps working; the next save tries again', async () => {
    const s = fakeSlot();
    const f = jf(s);
    const data = await f.load();
    s.failWrite = true;
    data.a = 1;
    await expect(f.save()).resolves.toBeUndefined();
    expect(s.text).toBe('');
    s.failWrite = false;
    await f.save();
    expect(JSON.parse(s.text)).toEqual({a: 1});
  });

  test('without a slot everything works in memory and nothing throws', async () => {
    const f = jf(null, {x: 1}, true);
    const data = await f.load();
    data.y = 2;
    await f.save();
    expect(await f.load()).toEqual({x: 1, y: 2});
  });

  test('saves requested during a write are coalesced into one more write of the latest data', async () => {
    const s = fakeSlot();
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    const slow = s.write;
    let first = true;
    s.write = async t => {
      if (first) {
        first = false;
        await gate;
      }
      return slow(t);
    };
    const f = jf(s);
    const data = await f.load();
    data.v = 1;
    const p1 = f.save();
    data.v = 2;
    const p2 = f.save();
    data.v = 3;
    const p3 = f.save();
    release();
    await Promise.all([p1, p2, p3]);
    expect(JSON.parse(s.text)).toEqual({v: 3});
    expect(s.writes).toBe(2); // the first write, and one for everything that came after
  });

  test('a failed write rejects in strict mode and is swallowed otherwise', async () => {
    const s = fakeSlot();
    s.failWrite = true;
    const strict = jf(s, {}, true);
    (await strict.load()).a = 1;
    await expect(strict.save()).rejects.toThrow('WRITE_FAILED');
    s.failWrite = false;
    await strict.save(); // the next save retries and works
    expect(JSON.parse(s.text)).toEqual({a: 1});
  });
});

describe('createMetaCache', () => {
  const META = {title: 'The Butcher of Nazareth', creator: 'David S. Hay', ids: ['9781668287323']};

  test('a cached entry is used while the file keeps its size, and survives a restart', async () => {
    const d = await memDb();
    const {stat} = sizes({'/b.epub': 5390935});
    const cache = createMetaCache(d, stat);
    expect(await cache.get('/b.epub')).toBeNull();
    await cache.set('/b.epub', META);
    expect(await cache.get('/b.epub')).toEqual(META);
    expect(await createMetaCache(d, stat).get('/b.epub')).toEqual(META);
  });

  test('a set writes one row, not the whole cache', async () => {
    const d = await memDb();
    const {stat} = sizes({'/a.epub': 1, '/b.epub': 2});
    const cache = createMetaCache(d, stat);
    await cache.set('/a.epub', META);
    d.log.length = 0;
    await cache.set('/b.epub', {...META, tracking: true});
    await cache.set('/b.epub', {...META, tracking: false});
    expect(d.log).toEqual(Array(2).fill('INSERT OR REPLACE INTO files (path, size, meta) VALUES (?, ?, ?)'));
    expect(rows(d, 'files').map(r => r.path)).toEqual(['/a.epub', '/b.epub']);
  });

  test('a file replaced under the same name (different size) is a miss', async () => {
    const d = await memDb();
    const {s, stat} = sizes({'/b.epub': 100});
    const cache = createMetaCache(d, stat);
    await cache.set('/b.epub', META);
    s['/b.epub'] = 101;
    expect(await cache.get('/b.epub')).toBeNull();
  });

  test('a file that is gone or cannot be stat-ed is a miss and is not stored', async () => {
    const d = await memDb();
    const cache = createMetaCache(d, sizes().stat);
    await cache.set('/gone.epub', META);
    expect(rows(d, 'files')).toEqual([]);
    const broken = createMetaCache(d, async () => {
      throw new Error('boom');
    });
    await broken.set('/b.epub', META);
    expect(await broken.get('/b.epub')).toBeNull();
  });

  test('the cache is capped and the oldest entries go first, also after a restart', async () => {
    const d = await memDb();
    const {s, stat} = sizes();
    for (let i = 0; i < 305; i++) s[`/b${i}.epub`] = i + 1;
    const cache = createMetaCache(d, stat);
    for (let i = 0; i < 300; i++) await cache.set(`/b${i}.epub`, {title: `t${i}`, ids: []});
    await cache.set('/b0.epub', {title: 't0 again', ids: []}); // set again: now the newest
    const restarted = createMetaCache(d, stat);
    for (let i = 300; i < 305; i++) await restarted.set(`/b${i}.epub`, {title: `t${i}`, ids: []});
    for (const c of [restarted, createMetaCache(d, stat)]) {
      expect(await c.get('/b0.epub')).toEqual({title: 't0 again', ids: []});
      expect(await c.get('/b1.epub')).toBeNull();
      expect(await c.get('/b5.epub')).toBeNull();
      expect(await c.get('/b6.epub')).toEqual({title: 't6', ids: []});
      expect(await c.get('/b304.epub')).toEqual({title: 't304', ids: []});
    }
    expect(rows(d, 'files').length).toBe(300);
  });

  test('tracked lists the files whose entry has tracking on', async () => {
    const d = await memDb();
    const {stat} = sizes({'/a.epub': 1, '/b.epub': 2});
    const cache = createMetaCache(d, stat);
    await cache.set('/a.epub', {ids: [], tracking: true});
    await cache.set('/b.epub', {ids: []});
    expect(await cache.tracked()).toEqual(['/a.epub']);
    expect(await createMetaCache(d, stat).tracked()).toEqual(['/a.epub']);
  });

  test('without a database, or with one whose calls fail, it works in memory and never throws', async () => {
    const {stat} = sizes({'/a.epub': 1});
    const d = await memDb();
    d.fail = /./;
    for (const db of [null, d]) {
      const cache = createMetaCache(db, stat);
      expect(await cache.get('/a.epub')).toBeNull();
      await expect(cache.set('/a.epub', {ids: [], tracking: true})).resolves.toBeUndefined();
      expect(await cache.get('/a.epub')).toEqual({ids: [], tracking: true});
      expect(await cache.tracked()).toEqual(['/a.epub']);
    }
    expect(rows(d, 'files')).toEqual([]);
  });

  test('a corrupt row is skipped, the others load', async () => {
    const d = await memDb();
    d.raw.prepare('INSERT INTO files VALUES (?, ?, ?)').run('/bad.epub', 1, '{not json');
    d.raw.prepare('INSERT INTO files VALUES (?, ?, ?)').run('/ok.epub', 2, '{"ids":[]}');
    const cache = createMetaCache(d, sizes({'/bad.epub': 1, '/ok.epub': 2}).stat);
    expect(await cache.get('/bad.epub')).toBeNull();
    expect(await cache.get('/ok.epub')).toEqual({ids: []});
  });
});

import {createJsonFile, createMetaCache, createSettings} from '../src/store';

// A fake native adapter over an in-memory "disk"; files can be made to fail.
const fakeNative = (files = {}, sizes = {}) => {
  const writes = [];
  const n = {
    files,
    sizes,
    writes,
    failWrite: false,
    failRead: false,
    readTextFile: async p => {
      if (n.failRead) throw new Error('READ_FAILED');
      return files[p] ?? '';
    },
    writeFile: async (p, text) => {
      if (n.failWrite) throw new Error('WRITE_FAILED');
      writes.push(p);
      files[p] = text;
      return true;
    },
    stat: async p => (p in sizes ? {exists: true, size: sizes[p]} : {exists: false, size: 0}),
  };
  return n;
};

test('a set during a slow first read does not lose the saved entries', async () => {
  const saved = {'/b.epub': {size: 5, meta: {tracking: true, edition: {id: 1, pages: 9}}}};
  const n = fakeNative({'/d/c.json': JSON.stringify(saved)}, {'/b.epub': 5, '/c.epub': 7});
  const read = n.readTextFile;
  n.readTextFile = async p => {
    await new Promise(r => setTimeout(r, 20));
    return read(p);
  };
  const cache = createMetaCache(createJsonFile(n, '/d/c.json'), async p => n.stat(p));
  await Promise.all([cache.get('/b.epub'), cache.set('/c.epub', {title: 'C'})]);
  n.readTextFile = read;
  const again = createMetaCache(createJsonFile(n, '/d/c.json'), async p => n.stat(p));
  expect(await again.get('/b.epub')).toEqual({tracking: true, edition: {id: 1, pages: 9}});
  expect(await again.get('/c.epub')).toEqual({title: 'C'});
});

describe('createJsonFile', () => {
  test('a missing file gives the defaults; a save writes JSON and a new instance reads it back', async () => {
    const n = fakeNative();
    const f = createJsonFile(n, '/d/a.json', {x: 1});
    const data = await f.load();
    expect(data).toEqual({x: 1});
    data.y = 2;
    await f.save();
    expect(JSON.parse(n.files['/d/a.json'])).toEqual({x: 1, y: 2});
    expect(await createJsonFile(n, '/d/a.json', {x: 9}).load()).toEqual({x: 1, y: 2});
  });

  test('corrupt JSON, a non-object, or an unreadable file fall back to the defaults without throwing', async () => {
    for (const text of ['{not json', '[1,2]', '42', 'null']) {
      const n = fakeNative({'/d/a.json': text});
      expect(await createJsonFile(n, '/d/a.json', {x: 1}).load()).toEqual({x: 1});
    }
    const n = fakeNative();
    n.failRead = true;
    expect(await createJsonFile(n, '/d/a.json', {x: 1}).load()).toEqual({x: 1});
  });

  test('a failed write does not throw and the in-memory copy keeps working; the next save tries again', async () => {
    const n = fakeNative();
    const f = createJsonFile(n, '/d/a.json');
    const data = await f.load();
    n.failWrite = true;
    data.a = 1;
    await expect(f.save()).resolves.toBeUndefined();
    expect(n.files['/d/a.json']).toBeUndefined();
    n.failWrite = false;
    await f.save();
    expect(JSON.parse(n.files['/d/a.json'])).toEqual({a: 1});
  });

  test('without a native adapter everything works in memory and nothing throws', async () => {
    const f = createJsonFile(null, '/d/a.json', {x: 1});
    const data = await f.load();
    data.y = 2;
    await f.save();
    expect(await f.load()).toEqual({x: 1, y: 2});
  });

  test('saves requested during a write are coalesced into one more write of the latest data', async () => {
    const n = fakeNative();
    let release;
    const gate = new Promise(r => (release = r));
    const slow = n.writeFile;
    let first = true;
    n.writeFile = async (p, t) => {
      if (first) {
        first = false;
        await gate;
      }
      return slow(p, t);
    };
    const f = createJsonFile(n, '/d/a.json');
    const data = await f.load();
    data.v = 1;
    const p1 = f.save();
    data.v = 2;
    const p2 = f.save();
    data.v = 3;
    const p3 = f.save();
    release();
    await Promise.all([p1, p2, p3]);
    expect(JSON.parse(n.files['/d/a.json'])).toEqual({v: 3});
    expect(n.writes.length).toBe(2); // the first write, and one for everything that came after
  });
});

describe('createMetaCache', () => {
  const META = {title: 'The Butcher of Nazareth', creator: 'David S. Hay', ids: ['9781668287323']};

  test('a cached entry is used while the file keeps its size, and survives a restart', async () => {
    const n = fakeNative({}, {'/b.epub': 5390935});
    const cache = createMetaCache(createJsonFile(n, '/d/cache.json'), n.stat);
    expect(await cache.get('/b.epub')).toBeNull();
    await cache.set('/b.epub', META);
    expect(await cache.get('/b.epub')).toEqual(META);
    const restarted = createMetaCache(createJsonFile(n, '/d/cache.json'), n.stat);
    expect(await restarted.get('/b.epub')).toEqual(META);
  });

  test('a file replaced under the same name (different size) is a miss', async () => {
    const n = fakeNative({}, {'/b.epub': 100});
    const cache = createMetaCache(createJsonFile(n, '/d/cache.json'), n.stat);
    await cache.set('/b.epub', META);
    n.sizes['/b.epub'] = 101;
    expect(await cache.get('/b.epub')).toBeNull();
  });

  test('a file that is gone or cannot be stat-ed is a miss and is not stored', async () => {
    const n = fakeNative({}, {});
    const cache = createMetaCache(createJsonFile(n, '/d/cache.json'), n.stat);
    await cache.set('/gone.epub', META);
    expect(n.files['/d/cache.json']).toBeUndefined();
    const broken = createMetaCache(createJsonFile(n, '/d/cache.json'), async () => {
      throw new Error('boom');
    });
    await broken.set('/b.epub', META);
    expect(await broken.get('/b.epub')).toBeNull();
  });

  test('the cache is capped and the oldest entries go first', async () => {
    const n = fakeNative();
    for (let i = 0; i < 305; i++) n.sizes[`/b${i}.epub`] = i + 1;
    const cache = createMetaCache(createJsonFile(n, '/d/cache.json'), n.stat);
    for (let i = 0; i < 305; i++) await cache.set(`/b${i}.epub`, {title: `t${i}`});
    expect(await cache.get('/b0.epub')).toBeNull();
    expect(await cache.get('/b4.epub')).toBeNull();
    expect(await cache.get('/b5.epub')).toEqual({title: 't5'});
    expect(await cache.get('/b304.epub')).toEqual({title: 't304'});
  });
});

describe('createSettings', () => {
  test('defaults until set; a set value is persisted and read back after a restart', async () => {
    const n = fakeNative();
    const s = createSettings(createJsonFile(n, '/m/settings.json'), {quotePrivacy: 3});
    expect(await s.get('quotePrivacy')).toBe(3);
    await s.set('quotePrivacy', 2);
    const restarted = createSettings(createJsonFile(n, '/m/settings.json'), {quotePrivacy: 3});
    expect(await restarted.get('quotePrivacy')).toBe(2);
  });
});

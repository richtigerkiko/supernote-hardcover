import {createJsonFile, createMetaCache, type NativeFs} from '../../src/core/store';

// The tests poke at arbitrary JSON, so the files are loosely typed.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const jf = (n: NativeFs | null, path: string, defaults?: Json) => createJsonFile<Json>(n, path, defaults);

// A fake native adapter over an in-memory "disk"; files can be made to fail.
const fakeNative = (files: Record<string, string> = {}, sizes: Record<string, number> = {}) => {
  const writes: string[] = [];
  const n = {
    files,
    sizes,
    writes,
    failWrite: false,
    failRead: false,
    readTextFile: async (p: string) => {
      if (n.failRead) throw new Error('READ_FAILED');
      return files[p] ?? '';
    },
    writeFile: async (p: string, text: string) => {
      if (n.failWrite) throw new Error('WRITE_FAILED');
      writes.push(p);
      files[p] = text;
      return true;
    },
    stat: async (p: string) => (p in sizes ? {exists: true, size: sizes[p]} : {exists: false, size: 0}),
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
  const cache = createMetaCache(jf(n, '/d/c.json'), async p => n.stat(p));
  await Promise.all([cache.get('/b.epub'), cache.set('/c.epub', {title: 'C', ids: []})]);
  n.readTextFile = read;
  const again = createMetaCache(jf(n, '/d/c.json'), async p => n.stat(p));
  expect(await again.get('/b.epub')).toEqual({tracking: true, edition: {id: 1, pages: 9}});
  expect(await again.get('/c.epub')).toEqual({title: 'C', ids: []});
});

describe('createJsonFile', () => {
  test('a missing file gives the defaults; a save writes JSON and a new instance reads it back', async () => {
    const n = fakeNative();
    const f = jf(n, '/d/a.json', {x: 1});
    const data = await f.load();
    expect(data).toEqual({x: 1});
    data.y = 2;
    await f.save();
    expect(JSON.parse(n.files['/d/a.json'])).toEqual({x: 1, y: 2});
    expect(await jf(n, '/d/a.json', {x: 9}).load()).toEqual({x: 1, y: 2});
  });

  test('corrupt JSON, a non-object, or an unreadable file fall back to the defaults without throwing', async () => {
    for (const text of ['{not json', '[1,2]', '42', 'null']) {
      const n = fakeNative({'/d/a.json': text});
      expect(await jf(n, '/d/a.json', {x: 1}).load()).toEqual({x: 1});
    }
    const n = fakeNative();
    n.failRead = true;
    expect(await jf(n, '/d/a.json', {x: 1}).load()).toEqual({x: 1});
  });

  test('a failed write does not throw and the in-memory copy keeps working; the next save tries again', async () => {
    const n = fakeNative();
    const f = jf(n, '/d/a.json');
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
    const f = jf(null, '/d/a.json', {x: 1});
    const data = await f.load();
    data.y = 2;
    await f.save();
    expect(await f.load()).toEqual({x: 1, y: 2});
  });

  test('saves requested during a write are coalesced into one more write of the latest data', async () => {
    const n = fakeNative();
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    const slow = n.writeFile;
    let first = true;
    n.writeFile = async (p, t) => {
      if (first) {
        first = false;
        await gate;
      }
      return slow(p, t);
    };
    const f = jf(n, '/d/a.json');
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
    const cache = createMetaCache(jf(n, '/d/cache.json'), n.stat);
    expect(await cache.get('/b.epub')).toBeNull();
    await cache.set('/b.epub', META);
    expect(await cache.get('/b.epub')).toEqual(META);
    const restarted = createMetaCache(jf(n, '/d/cache.json'), n.stat);
    expect(await restarted.get('/b.epub')).toEqual(META);
  });

  test('a file replaced under the same name (different size) is a miss', async () => {
    const n = fakeNative({}, {'/b.epub': 100});
    const cache = createMetaCache(jf(n, '/d/cache.json'), n.stat);
    await cache.set('/b.epub', META);
    n.sizes['/b.epub'] = 101;
    expect(await cache.get('/b.epub')).toBeNull();
  });

  test('a file that is gone or cannot be stat-ed is a miss and is not stored', async () => {
    const n = fakeNative({}, {});
    const cache = createMetaCache(jf(n, '/d/cache.json'), n.stat);
    await cache.set('/gone.epub', META);
    expect(n.files['/d/cache.json']).toBeUndefined();
    const broken = createMetaCache(jf(n, '/d/cache.json'), async () => {
      throw new Error('boom');
    });
    await broken.set('/b.epub', META);
    expect(await broken.get('/b.epub')).toBeNull();
  });

  test('the cache is capped and the oldest entries go first', async () => {
    const n = fakeNative();
    for (let i = 0; i < 305; i++) n.sizes[`/b${i}.epub`] = i + 1;
    const cache = createMetaCache(jf(n, '/d/cache.json'), n.stat);
    for (let i = 0; i < 305; i++) await cache.set(`/b${i}.epub`, {title: `t${i}`, ids: []});
    expect(await cache.get('/b0.epub')).toBeNull();
    expect(await cache.get('/b4.epub')).toBeNull();
    expect(await cache.get('/b5.epub')).toEqual({title: 't5', ids: []});
    expect(await cache.get('/b304.epub')).toEqual({title: 't304', ids: []});
  });
});

test('tracked lists the files whose entry has tracking on', async () => {
  const n = fakeNative();
  n.sizes['/a.epub'] = 1;
  n.sizes['/b.epub'] = 2;
  const cache = createMetaCache(jf(n, '/d/cache.json'), n.stat);
  await cache.set('/a.epub', {ids: [], tracking: true});
  await cache.set('/b.epub', {ids: []});
  expect(await cache.tracked()).toEqual(['/a.epub']);
});

describe("createJsonFile strict", () => {
  test("a failed write rejects in strict mode and is swallowed otherwise", async () => {
    const n = fakeNative();
    n.failWrite = true;
    const strict = createJsonFile<Json>(n, "/d/t.json", {}, true);
    (await strict.load()).a = 1;
    await expect(strict.save()).rejects.toThrow("WRITE_FAILED");
    n.failWrite = false;
    await strict.save(); // the next save retries and works
    expect(JSON.parse(n.files["/d/t.json"])).toEqual({a: 1});
    n.failWrite = true;
    const loose = jf(n, "/d/l.json");
    (await loose.load()).b = 2;
    await expect(loose.save()).resolves.toBeUndefined();
  });
});

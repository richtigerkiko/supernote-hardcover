import {fileTokenStore} from '../../src/hardcover/auth';
import {createJsonFile, type NativeFs} from '../../src/core/store';

// A fake native module: one string per path, so a second store on the same module is "after a restart".
const disk: Record<string, string> = {};
const native: NativeFs = {
  readTextFile: async p => disk[p] ?? '',
  writeFile: async (p, t) => void (disk[p] = t),
  stat: async () => ({exists: false, size: 0}),
};
const store = () => fileTokenStore(async () => createJsonFile(native, '/tokens.json'));

beforeEach(() => Object.keys(disk).forEach(k => delete disk[k]));

test('no tokens file means signed out', async () => {
  expect(await store().get()).toBeNull();
});

test('tokens survive a restart, and a rotated pair replaces the old one completely', async () => {
  const a = store();
  await a.set({accessToken: 'hc_at_1', refreshToken: 'hc_rt_1', scope: 'read:library', expiresAt: 1});
  expect(await store().get()).toEqual({accessToken: 'hc_at_1', refreshToken: 'hc_rt_1', scope: 'read:library', expiresAt: 1});
  await a.set({accessToken: 'hc_at_2', refreshToken: 'hc_rt_2', scope: 'read:library'});
  expect(await store().get()).toEqual({accessToken: 'hc_at_2', refreshToken: 'hc_rt_2', scope: 'read:library'}); // no stale expiresAt
});

test('signing out clears the file', async () => {
  const a = store();
  await a.set({accessToken: 'hc_at_1', scope: ''});
  await a.set(null);
  expect(await store().get()).toBeNull();
});

test('get hands out a copy', async () => {
  const a = store();
  await a.set({accessToken: 'x', scope: ''});
  const t = (await a.get())!;
  t.accessToken = 'changed';
  expect((await a.get())!.accessToken).toBe('x');
});

test('hasScope finds a scope in the space-separated grant', () => {
  const {hasScope} = require('../../src/hardcover/auth');
  expect(hasScope('read:library write:reviews', 'write:reviews')).toBe(true);
  expect(hasScope('read:library write:library', 'write:reviews')).toBe(false);
  expect(hasScope(undefined, 'write:reviews')).toBe(false);
});

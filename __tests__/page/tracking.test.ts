import {createTracking} from '../../src/page/tracking';
import type {FileMeta} from '../../src/core/store';

const PATH = '/b.epub';
const flush = () => new Promise<void>(r => setTimeout(r, 0));

function setup(files: Record<string, FileMeta>, row: any = {userBookId: 9, bookId: 5, title: 'Dune', read: {id: 4, started_at: 's', finished_at: null, progress_pages: 10, edition_id: 77}}) {
  const meta: any = {anyTracked: jest.fn(async () => Object.values(files).some(m => m.tracking)), get: jest.fn(async (p: string) => files[p]), save: jest.fn(async () => {})};
  const hc: any = {fetchUserBook: jest.fn(async () => row), saveProgress: jest.fn(async () => {})};
  const library: any = {resolvePath: jest.fn(async () => null)};
  const grants: any = {granted: jest.fn(async () => true), needGranted: jest.fn(async () => {}), revoke: jest.fn()};
  let page = 10;
  const sample = jest.fn(async () => ({path: PATH, page, total: 100}));
  const tr = createTracking({auth: {} as any, hc, meta, library, grants, dialog: jest.fn() as any, sample, enabled: true});
  return {tr, hc, library, grants, sample, goTo: (p: number) => (page = p)};
}
const ON: FileMeta = {ids: [], tracking: true, edition: {id: 5, pages: 200}, book: {bookId: 5, userBookId: 9, title: 'Dune'}};

test('a touch with no tracked book and nothing pending makes no SDK call', async () => {
  const t = setup({[PATH]: {ids: []}});
  t.tr.onTouch();
  await flush();
  expect(t.sample).not.toHaveBeenCalled();
  expect(t.grants.granted).not.toHaveBeenCalled();
});

test('a tracked book pushes through one row refresh, with the saved ids and no library list', async () => {
  const t = setup({[PATH]: ON});
  t.tr.onTouch(); // first sight: baseline
  await flush();
  t.goTo(40);
  t.tr.onTouch();
  await flush();
  expect(t.sample).toHaveBeenCalledTimes(2);
  expect(t.library.resolvePath).not.toHaveBeenCalled();
  expect(t.hc.fetchUserBook).toHaveBeenCalledTimes(1);
  expect(t.hc.fetchUserBook).toHaveBeenCalledWith({}, 9);
  // the file's edition (5) goes on the read, not the one the entry has (77)
  expect(t.hc.saveProgress.mock.calls[0][1]).toMatchObject({userBookId: 9, read: {id: 4, edition_id: 5}});
  expect(t.hc.saveProgress.mock.calls[0][2]).toBe(82);
});

test('a saved row that is gone drops the saved ids so the next touch looks the book up again', async () => {
  const files = {[PATH]: {...ON}};
  const t = setup(files, null);
  t.tr.onTouch();
  await flush();
  t.goTo(40);
  t.tr.onTouch();
  await flush();
  expect(t.hc.saveProgress).not.toHaveBeenCalled();
  expect(files[PATH].book).toBeUndefined();
  expect(t.tr.syncNote(PATH)).toContain('no longer in your library');
});

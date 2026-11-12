import {createTracking} from '../../src/page/tracking';
import type {FileMeta} from '../../src/core/store';
import {NOT_READING} from '../../src/core/types';

const PATH = '/b.epub';
const flush = () => new Promise<void>(r => setTimeout(r, 0));

function setup(files: Record<string, FileMeta>, row: any = {userBookId: 9, bookId: 5, statusId: 2, title: 'Dune', read: {id: 4, started_at: 's', finished_at: null, progress_pages: 10, edition_id: 77}}) {
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
  // and the status the row has now, not the 0 of the saved ids
  expect(t.hc.saveProgress.mock.calls[0][1]).toMatchObject({userBookId: 9, statusId: 2, read: {id: 4, edition_id: 5}});
  expect(t.hc.saveProgress.mock.calls[0][2]).toBe(82);
});

test('a book that is not Currently Reading is not pushed: the sync line says why, the grant stays, and forget clears it', async () => {
  const t = setup({[PATH]: ON});
  t.hc.saveProgress.mockRejectedValue(new Error(NOT_READING));
  t.tr.onTouch();
  await flush();
  t.goTo(40);
  t.tr.onTouch();
  await flush();
  expect(t.tr.syncNote(PATH)).toBe(NOT_READING);
  expect(t.grants.revoke).not.toHaveBeenCalled();
  t.tr.tracker.forget(PATH); // what the status picker does
  expect(t.tr.syncNote(PATH)).toBe('');
});

test('an entry from before the saved ids is looked up once and the ids go into the cached object', async () => {
  const files: Record<string, FileMeta> = {[PATH]: {ids: [], tracking: true}};
  const t = setup(files);
  t.library.resolvePath.mockResolvedValue({userBookId: 9, bookId: 5, title: 'Dune', statusId: 2, authors: [], editionId: 5, editionPages: 200, read: null});
  t.tr.onTouch();
  await flush();
  expect(files[PATH].book).toEqual({bookId: 5, userBookId: 9, title: 'Dune'});
  expect(files[PATH].edition).toEqual({id: 5, pages: 200});
  t.tr.tracker.forget(PATH);
  t.tr.onTouch();
  await flush();
  expect(t.library.resolvePath).toHaveBeenCalledTimes(1); // not again after a forget
});

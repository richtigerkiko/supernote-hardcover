import {createApi} from '../../src/page/api';
import {createLibrary} from '../../src/page/library';
import {createMeta} from '../../src/page/meta';
import {SCOPES} from '../../src/hardcover/auth';
import type {ReadingItem} from '../../src/core/types';

const PATH = '/b.epub';
const item = (over: Partial<ReadingItem> = {}): ReadingItem => ({
  userBookId: 9, bookId: 5, statusId: 2, title: 'Dune', authors: ['Frank Herbert'], editionId: 1, editionPages: 300, read: null, ...over,
});
const apiBook = {
  title: 'Dune', contributions: [], cachedTags: {}, rating: 0,
  editions: [{id: 1, editionFormat: 'Paperback', pages: 300, audioSeconds: null, publisher: null, language: null}],
};

function setup({list = [item()], scope = SCOPES.join(' '), dialogYes = true, sampled = true} = {}) {
  const hc: any = {
    fetchUserBooks: jest.fn(async () => list),
    fetchUserBookForBook: jest.fn(async () => null),
    bookIdsForIsbns: jest.fn(async () => []),
    editionsForIsbns: jest.fn(async () => []),
    searchBooks: jest.fn(async () => [{bookId: 5, title: 'Dune', authors: ['Frank Herbert']}]),
    fetchBookDetail: jest.fn(async () => apiBook),
    addOwned: jest.fn(async () => ({id: 1, pages: 300})),
    fetchReview: jest.fn(async () => ({markdown: 'm', hasSpoilers: true, notes: 'n', rating: 4})),
    saveReview: jest.fn(async () => {}),
    fetchReviews: jest.fn(async () => ({reviews: [], hasMore: false})),
    setStatus: jest.fn(async () => {}),
    saveJournal: jest.fn(async () => {}),
  };
  const store = new Map();
  const meta = createMeta({
    read: async () => ({title: 'Dune', creator: 'Frank Herbert', ids: []}),
    cache: async () => ({get: async (p: string) => store.get(p) ?? null, set: async (p: string, m: any) => void store.set(p, m), tracked: async () => []}) as any,
  });
  const auth: any = {isSignedIn: jest.fn(async () => true), tokens: jest.fn(async () => ({scope})), signOut: jest.fn(async () => {})};
  const dialog = jest.fn(async () => dialogYes);
  const library = createLibrary({auth, hc, meta, dialog});
  const tracking: any = {syncNote: () => 'note', tracker: {forget: jest.fn()}, resume: jest.fn()};
  const editions = [
    {id: 1, editionFormat: 'Paperback', pages: 300, audioSeconds: null, publisher: null, language: null},
    {id: 2, editionFormat: 'Hardcover', pages: 350, audioSeconds: null, publisher: null, language: null, isbn13: '9781668287323'},
    {id: 3, editionFormat: 'Audible', pages: null, audioSeconds: 99, publisher: null, language: null},
  ];
  hc.fetchBookDetail.mockImplementation(async () => ({...apiBook, editions}));
  const grants: any = {need: jest.fn(async () => {})};
  const sess: any = {pending: null, selection: null, opened: jest.fn()};
  const api = createApi({auth, hc, meta, library, tracking, grants, dialog, session: sess, sample: async () => (sampled ? {path: PATH, page: 149, total: 300} : null)});
  return {api, hc, auth, dialog, tracking, store, sess};
}

describe('load', () => {
  test('signed out: asks to sign in, reads nothing else', async () => {
    const t = setup();
    t.auth.isSignedIn.mockResolvedValue(false);
    expect(await t.api.load()).toEqual({message: expect.any(String), signIn: true});
    expect(t.hc.fetchUserBooks).not.toHaveBeenCalled();
  });

  test('a library book gives the detail, tracking off and the sync note', async () => {
    const r: any = await setup().api.load();
    expect(r.book).toMatchObject({title: 'Dune', inLibrary: true, editionId: '1'});
    expect(r.tracking).toBe(false);
    expect(r.sync).toBe('note');
  });

  test('no sample: tells to open an EPUB', async () => {
    const {api} = setup({sampled: false});
    expect(await api.load()).toEqual({message: expect.stringContaining('Open an EPUB')});
  });

  test('a book outside the library is added after a Yes, and the dialog is asked once', async () => {
    const t = setup({list: []});
    t.hc.addOwned.mockImplementation(async () => (t.hc.fetchUserBookForBook.mockResolvedValue(item()), {id: 1, pages: 300})); // the entry exists once added
    const r: any = await t.api.load();
    expect(t.dialog).toHaveBeenCalledTimes(1);
    expect(t.hc.addOwned).toHaveBeenCalledWith(t.auth, 5, undefined);
    expect(r.book.inLibrary).toBe(true);
  });

  test('a No keeps the link: the page shows the book without library features', async () => {
    const t = setup({list: [], dialogYes: false});
    const r: any = await t.api.load();
    expect(t.hc.addOwned).not.toHaveBeenCalled();
    expect(r.book.inLibrary).toBe(false);
    expect(t.store.get(PATH).linked).toEqual({bookId: 5});
  });
});

describe('one edition per file', () => {
  test('with nothing selected the default (library edition) is saved and shown, and the tracker rebases', async () => {
    const t = setup();
    const r: any = await t.api.load();
    expect(r.book).toMatchObject({editionId: '1', editionSaved: true});
    expect(t.store.get(PATH).edition).toEqual({id: 1, pages: 300});
    expect(t.tracking.tracker.forget).toHaveBeenCalledWith(PATH);
  });

  test("the file's ISBN edition is the default and is saved", async () => {
    const t = setup();
    t.store.set(PATH, {title: 'Dune', creator: 'Frank Herbert', ids: ['9781668287323']});
    const r: any = await t.api.load();
    expect(r.book.editionId).toBe('2');
    expect(t.store.get(PATH).edition).toEqual({id: 2, pages: 350});
  });

  test('a saved selection is kept and nothing is rewritten', async () => {
    const t = setup();
    t.store.set(PATH, {title: 'Dune', creator: 'Frank Herbert', ids: [], edition: {id: 2, pages: 350}});
    await t.api.load();
    expect(t.tracking.tracker.forget).not.toHaveBeenCalled();
    expect(t.store.get(PATH).edition).toEqual({id: 2, pages: 350});
  });

  test('setEdition refuses an edition without pages and saves nothing; a usable one is saved', async () => {
    const t = setup();
    await t.api.load();
    await expect(t.api.setEdition('3')).rejects.toThrow('no page count');
    await t.api.setEdition('2');
    expect(t.store.get(PATH).edition).toEqual({id: 2, pages: 350});
  });

  test('switching tracking on saves the ids the tracker uses, and a failing save rejects', async () => {
    const t = setup();
    await t.api.load();
    await t.api.setTracking(true);
    expect(t.store.get(PATH)).toMatchObject({tracking: true, book: {bookId: 5, userBookId: 9, title: 'Dune'}});
    await expect(setup().api.setTracking(true)).rejects.toThrow('no book loaded');
  });
});

describe('add to library', () => {
  test('does nothing for a book that is already in the library', async () => {
    const t = setup();
    await t.api.load();
    await t.api.addToLibrary();
    expect(t.hc.addOwned).not.toHaveBeenCalled();
  });

  test('adds the linked book and forgets the file in the tracker', async () => {
    const t = setup({list: [], dialogYes: false});
    await t.api.load();
    t.hc.addOwned.mockImplementation(async () => (t.hc.fetchUserBookForBook.mockResolvedValue(item()), {id: 1, pages: 300}));
    await t.api.addToLibrary();
    expect(t.hc.addOwned).toHaveBeenCalledWith(t.auth, 5, undefined);
    expect(t.store.get(PATH).linked).toBeUndefined();
    expect(t.tracking.tracker.forget).toHaveBeenCalledWith(PATH);
  });
});

describe('review calls', () => {
  test('they need a loaded book', async () => {
    const t = setup();
    await expect(t.api.writeReview()).rejects.toThrow('no book loaded');
    await expect(t.api.loadReviews(0)).rejects.toThrow('no book loaded');
  });

  test('writeReview starts from what the entry holds', async () => {
    const t = setup();
    await t.api.load();
    expect(await t.api.writeReview()).toEqual({markdown: 'm', hasSpoilers: true, sponsored: false, notes: 'n', rating: 4});
    expect(t.hc.fetchReview).toHaveBeenCalledWith(t.auth, 9);
  });

  test('a sign-in without read:journal posts nothing: dialog, sign out, reload; Cancel keeps it', async () => {
    const t = setup({scope: SCOPES.filter(x => x !== 'read:journal').join(' '), dialogYes: false});
    await t.api.load(); // "Later" to the load() prompt
    t.dialog.mockResolvedValue(true);
    const entry = {event: 'note' as const, passage: '', text: 'hi', privacy: 3 as const};
    await expect(t.api.saveJournal(entry)).rejects.toThrow('new sign-in');
    expect(t.auth.signOut).toHaveBeenCalled();
    t.dialog.mockResolvedValue(false);
    await expect(t.api.saveJournal(entry)).rejects.toThrow('new sign-in');
    expect(t.hc.saveJournal).not.toHaveBeenCalled();
  });

  test('load offers a new sign-in once when a scope is missing', async () => {
    const t = setup({scope: 'read:library'});
    expect(await t.api.load()).toEqual({message: expect.any(String), signIn: true});
    expect(t.auth.signOut).toHaveBeenCalledTimes(1);
    expect(await t.api.load()).toMatchObject({book: expect.anything()}); // not asked again this session
    expect(t.dialog).toHaveBeenCalledTimes(1);
  });

  test('a sign-in without write:reviews is dropped after the dialog; Cancel keeps it', async () => {
    const t = setup({scope: SCOPES.filter(x => x !== 'write:reviews').join(' '), dialogYes: false});
    await t.api.load(); // "Later" to the load() prompt
    t.dialog.mockResolvedValue(true);
    expect(await t.api.writeReview()).toBe(false);
    expect(t.auth.signOut).toHaveBeenCalled();
    t.auth.signOut.mockClear();
    t.dialog.mockResolvedValue(false);
    await expect(t.api.writeReview()).rejects.toThrow('new sign-in');
    expect(t.auth.signOut).not.toHaveBeenCalled();
  });

  test('saveReview and loadReviews use the loaded book', async () => {
    const t = setup();
    await t.api.load();
    const r = {markdown: 'x', hasSpoilers: false, sponsored: false, notes: ''};
    await t.api.saveReview(r);
    expect(t.hc.saveReview).toHaveBeenCalledWith(t.auth, 9, r);
    await t.api.loadReviews(10);
    expect(t.hc.fetchReviews).toHaveBeenCalledWith(t.auth, 5, 10);
  });

  test('a book outside the library cannot be reviewed', async () => {
    const t = setup({list: [], dialogYes: false});
    await t.api.load();
    await expect(t.api.saveReview({markdown: 'x', hasSpoilers: false, sponsored: false, notes: ''})).rejects.toThrow('add the book to your library first');
  });
});

import type {ReadingItem} from '../../src/core/types';
import {bookIdsForIsbns, fetchBookDetail, fetchUserBooks, localDate, progressInput, saveProgress, saveJournal, saveReview, fetchReview, setStatus} from '../../src/hardcover/client';

// The SDK is the transport; these tests check what we send it and how we map what it returns.
type Mocks = Record<string, jest.Mock>;
const mockSdk: {library: Mocks; books: Mocks; journal: Mocks; request: jest.Mock; graphql?: jest.Mock; options: unknown} = {
  library: {},
  books: {},
  journal: {},
  request: jest.fn(),
  options: undefined,
};
jest.mock('@hardcover/sdk', () => ({
  HardcoverClient: function (options: unknown) {
    mockSdk.options = options;
    return mockSdk;
  },
  JournalEvent: {Quote: 'quote', Note: 'note'},
  PrivacySetting: {Public: 1, Follows: 2, Private: 3},
  operations: {UpdateUserBookRead: 'UPDATE', AddUserBookRead: 'ADD', UpdateUserBook: 'UPDATE_BOOK'},
}));

const ITEM: ReadingItem = {
  userBookId: 7,
  bookId: 2312000,
  statusId: 2,
  title: 'The Butcher of Nazareth',
  authors: ['David Scott Hay'],
  editionId: 32560293,
  editionPages: 330,
  read: {id: 99, started_at: '2026-11-01', finished_at: null, progress_pages: 100, edition_id: 32560293},
};

const libraryRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  bookId: 2312000,
  statusId: 2,
  editionId: 32560293,
  book: {title: 'The Butcher of Nazareth', cachedContributors: [{author: {name: 'David Scott Hay'}}]},
  edition: {id: 32560293, pages: 330},
  userBookReads: [{id: 99, startedAt: null, finishedAt: null, progressPages: 100, editionId: 32560293}],
  ...over,
});

beforeEach(() => {
  mockSdk.library = {list: jest.fn(), setStatus: jest.fn()};
  mockSdk.books = {get: jest.fn(), editions: jest.fn(), edition: jest.fn(), findByIsbn: jest.fn()};
  mockSdk.journal = {add: jest.fn()};
  mockSdk.request = jest.fn();
});

test('the client never waits with timers and never retries (the tracker owns both)', async () => {
  mockSdk.library.list.mockResolvedValue({items: [], hasMore: false});
  await fetchUserBooks('T');
  expect(mockSdk.options).toMatchObject({token: 'T', pace: false, maxRetries: 0});
});

test('fetchUserBooks flattens the response and keeps the newest read', async () => {
  mockSdk.library.list.mockResolvedValue({items: [libraryRow()], hasMore: false});
  expect(await fetchUserBooks('T')).toEqual([
    {
      userBookId: 7,
      bookId: 2312000,
      statusId: 2,
      title: 'The Butcher of Nazareth',
      authors: ['David Scott Hay'],
      editionId: 32560293,
      editionPages: 330,
      read: {id: 99, started_at: null, finished_at: null, progress_pages: 100, edition_id: 32560293},
    },
  ]);
});

test('fetchUserBooks reads every page, and a book with no read has read: null', async () => {
  mockSdk.library.list
    .mockResolvedValueOnce({items: [libraryRow({id: 1})], hasMore: true})
    .mockResolvedValueOnce({items: [libraryRow({id: 2, userBookReads: [], editionId: null, edition: null})], hasMore: false});
  const books = await fetchUserBooks('T');
  expect(books.map(b => b.userBookId)).toEqual([1, 2]);
  expect(books[1]).toMatchObject({read: null, editionId: null, editionPages: null});
  expect(mockSdk.library.list.mock.calls.map((c: {offset: number}[]) => c[0].offset)).toEqual([0, 100]);
});

test('bookIdsForIsbns returns each book once, even when several editions match', async () => {
  mockSdk.books.findByIsbn.mockResolvedValue([{bookId: 2312000}, {bookId: 2312000}, {bookId: 383598}]);
  expect(await bookIdsForIsbns('T', ['9781668287323', '9781668287309'])).toEqual([2312000, 383598]);
  expect(mockSdk.books.findByIsbn).toHaveBeenCalledWith(['9781668287323', '9781668287309']);
});

test('progressInput keeps the existing started_at and edition, and leaves null fields out', () => {
  expect(progressInput(ITEM, 120)).toEqual({progress_pages: 120, edition_id: 32560293, started_at: '2026-11-01'});
  const noDates: ReadingItem = {...ITEM, read: {...ITEM.read!, started_at: null}};
  expect(progressInput(noDates, 120)).toEqual({progress_pages: 120, edition_id: 32560293});
});

test('saveProgress updates the newest read, sending its existing fields back', async () => {
  mockSdk.request.mockResolvedValue({});
  await saveProgress('T', ITEM, 120);
  expect(mockSdk.request).toHaveBeenCalledWith('UPDATE', {
    id: 99,
    read: {progress_pages: 120, edition_id: 32560293, started_at: '2026-11-01'},
  });
});

test('saveProgress inserts a new read when there is none', async () => {
  mockSdk.request.mockResolvedValue({insert_user_book_read: {userBookRead: {id: 55}}});
  await saveProgress('T', {...ITEM, read: null}, 120);
  const [op, vars] = mockSdk.request.mock.calls[0];
  expect(op).toBe('ADD');
  expect(vars.userBookId).toBe(7);
  expect(vars.read).toMatchObject({progress_pages: 120, edition_id: 32560293, started_at: localDate(new Date())});
});

test('a second save on the same item updates the read the first one inserted', async () => {
  mockSdk.request.mockResolvedValueOnce({insert_user_book_read: {userBookRead: {id: 55}}}).mockResolvedValueOnce({});
  const item = {...ITEM, read: null};
  await saveProgress('T', item, 120);
  await saveProgress('T', item, 130);
  expect(mockSdk.request.mock.calls[0][0]).toBe('ADD');
  expect(mockSdk.request.mock.calls[1][0]).toBe('UPDATE');
  expect(mockSdk.request.mock.calls[1][1].id).toBe(55);
});

test('an insert that returns no read id throws and caches nothing', async () => {
  mockSdk.request.mockResolvedValue({insert_user_book_read: {userBookRead: null}});
  const item = {...ITEM, read: null};
  await expect(saveProgress('T', item, 120)).rejects.toThrow(/no read id/);
  expect(item.read).toBeNull();
});

test('localDate is the local calendar day, in any time zone', () => {
  expect(localDate(new Date(2026, 10, 10, 0, 30))).toBe('2026-11-10');
});

test('never writes without a real page count', async () => {
  await expect(saveProgress('T', ITEM, 0)).rejects.toThrow(/no page count/);
  await expect(saveProgress('T', ITEM, null as unknown as number)).rejects.toThrow(/no page count/);
  expect(mockSdk.request).not.toHaveBeenCalled();
});

test('an SDK failure reaches the caller with its status (the 401 stop and the 429 retry branch on it)', async () => {
  mockSdk.request.mockRejectedValue(Object.assign(new Error('rejected'), {status: 401}));
  await expect(saveProgress('T', ITEM, 120)).rejects.toMatchObject({status: 401});
});

test('fetchBookDetail adds an edition that only the reader uses, once', async () => {
  mockSdk.books.get.mockResolvedValue({title: 'T'});
  mockSdk.books.editions.mockResolvedValue({items: [{id: 1}, {id: 2}], hasMore: false});
  mockSdk.books.edition.mockImplementation(async (id: number) => ({id}));
  const book = await fetchBookDetail('T', 5, [2, 300]);
  expect(book.editions.map(e => e.id)).toEqual([1, 2, 300]);
  expect(mockSdk.books.edition).toHaveBeenCalledTimes(1);
  expect(mockSdk.books.editions).toHaveBeenCalledTimes(1);
  expect(mockSdk.books.editions).toHaveBeenCalledWith(5, {limit: 100});
});

test('fetchBookDetail loads further editions pages up to 300', async () => {
  mockSdk.books.get.mockResolvedValue({title: 'T'});
  mockSdk.books.editions.mockImplementation(async (_id: number, o: {offset?: number}) => ({
    items: Array.from({length: 100}, (_x, i) => ({id: (o.offset ?? 0) + i})),
    hasMore: true,
  }));
  const book = await fetchBookDetail('T', 5);
  expect(book.editions).toHaveLength(300);
  expect(mockSdk.books.editions).toHaveBeenLastCalledWith(5, {limit: 100, offset: 200});
});

test('fetchBookDetail throws for an unknown book and skips editions that no longer exist', async () => {
  mockSdk.books.get.mockResolvedValue(null);
  mockSdk.books.editions.mockResolvedValue({items: []});
  await expect(fetchBookDetail('T', 5)).rejects.toThrow(/not found/);
  mockSdk.books.get.mockResolvedValue({title: 'T'});
  mockSdk.books.edition.mockResolvedValue(null);
  expect((await fetchBookDetail('T', 5, [9])).editions).toEqual([]);
});

test('setStatus sends only the status', async () => {
  await setStatus('T', 7, 3);
  expect(mockSdk.library.setStatus).toHaveBeenCalledWith(7, 3);
});

describe('saveJournal', () => {
  const POSITION = {type: 'pages', value: 83, percent: 28.81944444444444, possible: 288};
  const ENTRY = {bookId: 2312000, editionId: 32560293, event: 'quote' as const, entry: 'a line', position: POSITION};

  test('sends a private entry for the book and edition, with the position', async () => {
    mockSdk.journal.add.mockResolvedValue({id: 5});
    expect(await saveJournal('T', ENTRY)).toBe(5);
    expect(mockSdk.journal.add).toHaveBeenCalledWith(2312000, {
      event: 'quote',
      entry: 'a line',
      privacy: 3,
      editionId: 32560293,
      metadata: {position: POSITION},
    });
  });

  test('no editionId without an edition; privacy is passed through', async () => {
    mockSdk.journal.add.mockResolvedValue({id: 6});
    await saveJournal('T', {...ENTRY, editionId: null, event: 'note', privacy: 1, position: undefined});
    expect(mockSdk.journal.add.mock.calls[0][1]).toEqual({event: 'note', entry: 'a line', privacy: 1});
  });

  test('empty entries and unknown events are refused before any request', async () => {
    await expect(saveJournal('T', {...ENTRY, entry: '   '})).rejects.toThrow(/empty/);
    await expect(saveJournal('T', {...ENTRY, event: 'review' as 'quote'})).rejects.toThrow(/event/);
    expect(mockSdk.journal.add).not.toHaveBeenCalled();
  });
});

test("an OAuth session is passed to the SDK as auth, not as a token", async () => {
  const session = {getAccessToken: async () => "hc_at_1"};
  mockSdk.library.list = jest.fn().mockResolvedValue({items: [], hasMore: false});
  await fetchUserBooks(session);
  expect(mockSdk.options).toMatchObject({auth: session, pace: false, maxRetries: 0});
  expect(mockSdk.options).not.toHaveProperty("token");
});

describe('saveReview', () => {
  const REVIEW = {markdown: ' great ', hasSpoilers: true, sponsored: false, notes: ' mine '};
  test('one UpdateUserBook request with the review fields; sponsored only when set', async () => {
    mockSdk.request.mockResolvedValue({});
    await saveReview('T', 7, {...REVIEW, rating: 4.5});
    expect(mockSdk.request).toHaveBeenLastCalledWith('UPDATE_BOOK', {
      id: 7,
      object: {rating: 4.5, review_markdown: 'great', review_has_spoilers: true, private_notes: 'mine'},
    });
    await saveReview('T', 7, {...REVIEW, sponsored: true});
    expect(mockSdk.request.mock.calls.at(-1)![1].object).toEqual({review_markdown: 'great', review_has_spoilers: true, sponsored_review: true, private_notes: 'mine'});
  });

  test('empty text and bad ratings are refused before any request', async () => {
    mockSdk.request.mockClear();
    await expect(saveReview('T', 7, {...REVIEW, markdown: '  '})).rejects.toThrow(/empty/);
    await expect(saveReview('T', 7, {...REVIEW, rating: 4.3})).rejects.toThrow(/rating/);
    expect(mockSdk.request).not.toHaveBeenCalled();
  });

  test('fetchReview maps the entry for prefilling', async () => {
    mockSdk.library.get = jest.fn().mockResolvedValue({reviewMarkdown: null, reviewHasSpoilers: true, privateNotes: 'n', rating: 3.5});
    expect(await fetchReview('T', 7)).toEqual({markdown: '', hasSpoilers: true, notes: 'n', rating: 3.5});
  });
});

test("an OAuth session is passed to the SDK as auth, not as a token", async () => {
  const session = {getAccessToken: async () => "hc_at_1"};
  mockSdk.library.list = jest.fn().mockResolvedValue({items: [], hasMore: false});
  await fetchUserBooks(session);
  expect(mockSdk.options).toMatchObject({auth: session, pace: false, maxRetries: 0});
  expect(mockSdk.options).not.toHaveProperty("token");
});


describe('fetchReviews', () => {
  const { fetchReviews } = require('../../src/hardcover/client');
  const row = (id: number) => ({id, rating: 4.5, review_raw: ' Great ', review_has_spoilers: false, reviewed_at: '2026-10-02T10:00:00', user: {name: 'Ann', flair: 'Supporter'}});

  test('maps rows, asks for one extra to know hasMore and sends the offset', async () => {
    mockSdk.graphql = jest.fn().mockResolvedValue({user_books: Array.from({length: 11}, (_, i) => row(i + 1))});
    const r = await fetchReviews('t', 5, 20);
    expect(mockSdk.graphql.mock.calls[0][1]).toEqual({bookId: 5, limit: 11, offset: 20});
    expect(r.reviews).toHaveLength(10);
    expect(r.hasMore).toBe(true);
    expect(r.reviews[0]).toEqual({id: 1, user: 'Ann', supporter: true, rating: 4.5, text: 'Great', spoiler: false, date: '2026-10-02'});
  });
});

describe('journal read, edit, remove', () => {
  const { fetchJournal, updateJournal, deleteJournal } = require('../../src/hardcover/client');
  const row = (id: number, over: any = {}) => ({id, event: 'quote', entry: 'q', action_at: '2026-11-10T08:00:00', privacy_setting_id: 3, metadata: {position: {value: 83}}, ...over});

  test('fetchJournal asks for the user\'s note/quote rows, maps them and pages by the full 100', async () => {
    mockSdk.graphql = jest.fn(async (q: string) => (q.includes('Me') ? {me: [{id: 9}]} : {reading_journals: Array.from({length: 100}, (_, i) => row(i + 1, i ? {metadata: null} : {}))}));
    const r = await fetchJournal({}, 5, 100);
    expect(mockSdk.graphql.mock.calls[1][0]).toContain('["note", "quote"]');
    expect(mockSdk.graphql.mock.calls[1][1]).toEqual({userId: 9, bookId: 5, limit: 100, offset: 100});
    expect(r.hasMore).toBe(true);
    expect(r.entries[0]).toEqual({id: 1, event: 'quote', entry: 'q', page: 83, date: '2026-11-10', privacy: 3});
    expect(r.entries[1].page).toBeNull();
  });

  test('a short page is the end', async () => {
    mockSdk.graphql = jest.fn(async (q: string) => (q.includes('Me') ? {me: {id: 9}} : {reading_journals: [row(1, {event: 'note'})]}));
    const r = await fetchJournal({}, 5);
    expect(r.hasMore).toBe(false);
    expect(r.entries[0].event).toBe('note');
  });

  test('update sends entry and privacy, refuses empty text and surfaces server errors', async () => {
    mockSdk.graphql = jest.fn().mockResolvedValue({update_reading_journal: {errors: null}});
    await updateJournal('t', 7, {entry: 'new', privacy: 2});
    expect(mockSdk.graphql.mock.calls[0][1]).toEqual({id: 7, entry: 'new', privacy: 2});
    await expect(updateJournal('t', 7, {entry: '  ', privacy: 2})).rejects.toThrow(/empty/);
    mockSdk.graphql = jest.fn().mockResolvedValue({update_reading_journal: {errors: ['nope']}});
    await expect(updateJournal('t', 7, {entry: 'x', privacy: 2})).rejects.toThrow(/refused/);
  });

  test('delete sends the id and surfaces server errors', async () => {
    mockSdk.graphql = jest.fn().mockResolvedValue({delete_reading_journal: {errors: null}});
    await deleteJournal('t', 7);
    expect(mockSdk.graphql.mock.calls[0][1]).toEqual({id: 7});
    mockSdk.graphql = jest.fn().mockResolvedValue({delete_reading_journal: {errors: ['nope']}});
    await expect(deleteJournal('t', 7)).rejects.toThrow(/refused/);
  });
});

import {bookIdsForIsbns, fetchBookDetail, fetchUserBooks, localDate, progressInput, saveProgress} from '../src/hardcover';

const reply = (data, status = 200) => ({ok: status < 400, status, json: async () => ({data})});
let calls;
const mockFetch = (...replies) => {
  calls = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push(JSON.parse(init.body));
    return replies.shift();
  });
};

const ITEM = {
  userBookId: 7,
  editionId: 32560293,
  editionPages: 330,
  read: {id: 99, started_at: '2026-11-01', finished_at: null, progress_pages: 100, edition_id: 32560293},
};

test('fetchUserBooks flattens the response', async () => {
  mockFetch(
    reply({
      me: [
        {
          user_books: [
            {
              id: 7,
              book_id: 2312000,
              edition_id: 32560293,
              status_id: 2,
              book: {title: 'The Butcher of Nazareth', contributions: [{author: {name: 'David Scott Hay'}}]},
              edition: {id: 32560293, pages: 330},
              user_book_reads: [{id: 99, started_at: null, finished_at: null, progress_pages: 100, edition_id: 32560293}],
            },
          ],
        },
      ],
    }),
  );
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
  expect(global.fetch.mock.calls[0][1].headers.authorization).toBe('Bearer T');
});

test('bookIdsForIsbns returns each book once, even when several editions match', async () => {
  mockFetch(reply({editions: [{book_id: 2312000}, {book_id: 2312000}, {book_id: 383598}]}));
  expect(await bookIdsForIsbns('T', ['9781668287323', '9781668287309'])).toEqual([2312000, 383598]);
  expect(calls[0].variables).toEqual({isbns: ['9781668287323', '9781668287309']});
});

test('progressInput keeps the existing started_at and edition, and leaves null fields out', () => {
  expect(progressInput(ITEM, 120)).toEqual({progress_pages: 120, edition_id: 32560293, started_at: '2026-11-01'});
  const noDates = {...ITEM, read: {...ITEM.read, started_at: null}};
  expect(progressInput(noDates, 120)).toEqual({progress_pages: 120, edition_id: 32560293});
});

test('saveProgress updates the active read when there is one', async () => {
  mockFetch(reply({update_user_book_read: {error: null}}));
  await saveProgress('T', ITEM, 120);
  expect(calls[0].variables).toEqual({id: 99, object: {progress_pages: 120, edition_id: 32560293, started_at: '2026-11-01'}});
});

test('saveProgress inserts a new read when there is none', async () => {
  mockFetch(reply({insert_user_book_read: {id: 55, error: null}}));
  await saveProgress('T', {...ITEM, read: null}, 120);
  expect(calls[0].variables.ub).toBe(7);
  expect(calls[0].variables.read).toMatchObject({progress_pages: 120, edition_id: 32560293, started_at: localDate(new Date())});
});

test('a second save on the same item updates the read the first one inserted', async () => {
  mockFetch(reply({insert_user_book_read: {id: 55, error: null}}), reply({update_user_book_read: {error: null}}));
  const item = {...ITEM, read: null};
  await saveProgress('T', item, 120);
  await saveProgress('T', item, 130);
  expect(calls[0].query).toMatch(/insert_user_book_read/);
  expect(calls[1].query).toMatch(/update_user_book_read/);
  expect(calls[1].variables.id).toBe(55);
});

test('an insert that returns no read id throws and caches nothing', async () => {
  mockFetch(reply({insert_user_book_read: {id: null, error: null}}));
  const item = {...ITEM, read: null};
  await expect(saveProgress('T', item, 120)).rejects.toThrow(/no read id/);
  expect(item.read).toBeNull();
});

test('localDate is the local calendar day, in any time zone', () => {
  expect(localDate(new Date(2026, 10, 10, 0, 30))).toBe('2026-11-10');
});

test('never writes without a real page count', async () => {
  mockFetch();
  await expect(saveProgress('T', ITEM, 0)).rejects.toThrow(/no page count/);
  await expect(saveProgress('T', ITEM, null)).rejects.toThrow(/no page count/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  [401, /401/],
  [429, /429/],
  [500, /HTTP 500/],
])('HTTP %i is an error, not a silent success', async (status, msg) => {
  mockFetch(reply(null, status));
  await expect(saveProgress('T', ITEM, 120)).rejects.toMatchObject({status, message: expect.stringMatching(msg)});
});

test('a GraphQL error or an error field in the result throws', async () => {
  mockFetch({ok: true, status: 200, json: async () => ({errors: [{message: 'bad'}]})});
  await expect(saveProgress('T', ITEM, 120)).rejects.toThrow('Hardcover: bad');
  mockFetch(reply({update_user_book_read: {error: 'nope'}}));
  await expect(saveProgress('T', ITEM, 120)).rejects.toThrow('Hardcover: nope');
});

test('fetchBookDetail adds an edition that only comes back under mine, once', async () => {
  mockFetch(reply({books_by_pk: {title: 'T', editions: [{id: 1}, {id: 2}], mine: [{id: 2}, {id: 300}]}}));
  const book = await fetchBookDetail('T', 5, [2, 300]);
  expect(book.editions.map(e => e.id)).toEqual([1, 2, 300]);
  expect(book.mine).toBeUndefined();
  expect(calls[0].variables).toEqual({id: 5, ids: [2, 300]});
});

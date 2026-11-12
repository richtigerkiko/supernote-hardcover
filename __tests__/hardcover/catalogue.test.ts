import {addOwned} from '../../src/hardcover/client';
import {catalogueBook} from '../../src/core/resolve';

const mockSdk: any = {library: {}, books: {}};
jest.mock('@hardcover/sdk', () => ({
  HardcoverClient: function () {
    return mockSdk;
  },
  JournalEvent: {},
  PrivacySetting: {},
  operations: {},
}));

describe('catalogueBook (book not in the library)', () => {
  const hits = [
    {bookId: 1, title: 'Dune Messiah', authors: ['Frank Herbert']},
    {bookId: 2, title: 'Dune', authors: ['Frank Herbert']},
  ];

  test('an ISBN known to Hardcover names the book and the edition', async () => {
    const found = await catalogueBook({
      meta: {title: 'x', ids: ['9781668287323']},
      editionsForIsbns: async () => [{id: 55, bookId: 2312000}],
      searchBooks: async () => {
        throw new Error('should not search');
      },
    });
    expect(found).toEqual({bookId: 2312000, editionId: 55});
  });

  test('without a usable ISBN, title and author search decide (longer title wins)', async () => {
    const found = await catalogueBook({
      meta: {title: 'Dune Messiah', creator: 'Frank Herbert', ids: []},
      editionsForIsbns: async () => [],
      searchBooks: async () => hits,
    });
    expect(found).toEqual({bookId: 1});
  });

  test('no match anywhere -> null', async () => {
    const found = await catalogueBook({
      meta: {title: 'Unrelated Thing', creator: 'Nobody', ids: []},
      editionsForIsbns: async () => [],
      searchBooks: async () => hits,
    });
    expect(found).toBeNull();
  });
});

test('addOwned marks the edition owned first, then adds the book as an import', async () => {
  mockSdk.library = {markOwned: jest.fn().mockResolvedValue({}), add: jest.fn().mockResolvedValue({})};
  mockSdk.books = {
    editions: jest.fn().mockResolvedValue({items: [{id: 1, pages: null}, {id: 2, pages: 300}]}),
    edition: jest.fn().mockResolvedValue({id: 77, pages: 250}),
  };
  const ed = await addOwned('T', 9);
  expect(mockSdk.library.markOwned).toHaveBeenCalledWith(2); // first edition with a page count
  expect(mockSdk.library.add).toHaveBeenCalledWith(9, {imported: true, editionId: 2}); // the entry gets the edition too
  expect(ed).toEqual({id: 2, pages: 300}); // returned, so the file can use its page count
  expect(mockSdk.library.markOwned.mock.invocationCallOrder[0]).toBeLessThan(mockSdk.library.add.mock.invocationCallOrder[0]);
  expect(await addOwned('T', 9, 77)).toEqual({id: 77, pages: 250}); // an ISBN match names the edition
  expect(mockSdk.library.markOwned).toHaveBeenLastCalledWith(77);
});

test('addOwned writes nothing when the book has no edition to mark as owned', async () => {
  mockSdk.library = {markOwned: jest.fn(), add: jest.fn()};
  mockSdk.books = {editions: jest.fn().mockResolvedValue({items: []}), edition: jest.fn().mockResolvedValue(null)};
  await expect(addOwned('T', 9)).rejects.toThrow('no edition');
  await expect(addOwned('T', 9, 5)).rejects.toThrow('no edition');
  expect(mockSdk.library.markOwned).not.toHaveBeenCalled();
  expect(mockSdk.library.add).not.toHaveBeenCalled();
});

import {addOwned} from '../../src/hardcover/client';
import {catalogueBook, resolveBook} from '../../src/core/resolve';

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

  // The real search hits in rank order (read-only `search` queries, 2026-11-12).
  const hit = (bookId: number, title: string, ...authors: string[]) => ({bookId, title, authors});
  const MEDITATIONS = [
    hit(157096, 'Meditations', 'Marcus Aurelius', 'Martin Hammond', 'Albert Wittstock', 'عادل مصطفى', 'Simone Mooij-Valk', 'Diskin Clay'),
    hit(667349, 'Marcus Aurelius - Meditations: Adapted for the Contemporary Reader', 'James  Harris', 'Marcus Aurelius'),
    hit(2075356, 'Meditations - Marcus Aurelius', 'NR Publishers', 'Marcus Aurelius', 'NR Bach', 'J Boulton', 'David Widger'),
    hit(2177942, 'by Aurelius, Marcus :: Meditations: A New Translation-Paperback', 'Marcus Aurelius'),
    hit(2840857, "The Cambridge Companion to Marcus Aurelius' Meditations", 'John Sellars'),
    hit(2107890, 'A Short Guide to the Inner Citadel: On Pierre Hadot’s Classic Analysis of Marcus Aurelius’ Meditations', 'Massimo Pigliucci'),
    hit(972851, 'MARCUS AURELIUS - MEDITATIONS. OUR LIFE IS WHAT OUR THOUGHTS MAKE IT', 'Marcus Aurelius'),
    hit(767142, 'Marcus Aurelius: Meditations', 'Christopher Gill'),
    hit(489086, 'Meditations of Marcus Aurelius', 'Marcus Aurelius', 'Prentice Onayemi'),
    hit(558478, 'The Meditations of Marcus Aurelius', 'Marcus Aurelius'),
  ];
  const DUNE = [
    hit(435136, 'The Great Dune Trilogy', 'Frank Herbert'),
    hit(490427, "Frank Herbert's Dune Saga Collection", 'Frank Herbert'),
    hit(2132902, 'Novels by Frank Herbert (Book Guide): Dune, Heretics of Dune, Children of Dune, Chapterhouse: Dune, God Emperor of Dune, Dune Messiah', 'Books LLC'),
    hit(427393, 'Dune Messiah', 'Frank Herbert'),
    hit(1342920, 'Dune Messiah & Children Of Dune', 'Frank Herbert'),
    hit(2341217, 'Dune Messiah (2 of 2)', 'Frank Herbert', 'Любомир Николов-Нарви'),
    hit(2341214, 'Dune Messiah (1 of 2)', 'Frank Herbert', 'Любомир Николов-Нарви'),
    hit(2466987, 'Galaxy Science Fiction Magazine, July 1969', 'Frank Herbert', 'Frederik Pohl'),
  ];
  const search = (title: string, creator: string, hits: typeof DUNE) => catalogueBook({meta: {title, creator, ids: []}, editionsForIsbns: async () => [], searchBooks: async () => hits});

  test("titles that repeat the author's name do not outscore the main book, and a tie goes to the search rank", async () => {
    expect(await search('Meditations', 'Marcus Aurelius', MEDITATIONS)).toEqual({bookId: 157096});
    expect(await search('Dune Messiah', 'Frank Herbert', DUNE)).toEqual({bookId: 427393});
  });

  test("a hit whose title is only the author's name is no match", async () => {
    expect(await search('Meditations', 'Marcus Aurelius', [hit(1, 'Marcus Aurelius', 'Marcus Aurelius')])).toBeNull();
  });

  test('the library match keeps its tie rule: the same titles on the shelves give null', async () => {
    const reading = MEDITATIONS.map(h => ({...h, userBookId: h.bookId, statusId: 1, editionId: null, editionPages: null, read: null}));
    expect(await resolveBook({meta: {title: 'Meditations', creator: 'Marcus Aurelius', ids: []}, reading, bookIdsForIsbns: async () => []})).toBeNull();
  });
});

test('addOwned marks the given edition owned first, then adds the book as an import', async () => {
  mockSdk.library = {markOwned: jest.fn().mockResolvedValue({}), add: jest.fn().mockResolvedValue({})};
  mockSdk.books = {edition: jest.fn().mockResolvedValue({id: 77, pages: 250})};
  expect(await addOwned('T', 9, 77)).toEqual({id: 77, pages: 250}); // returned, so the file can use its page count
  expect(mockSdk.library.markOwned).toHaveBeenCalledWith(77);
  expect(mockSdk.library.add).toHaveBeenCalledWith(9, {imported: true, editionId: 77}); // the entry gets the edition too
  expect(mockSdk.library.markOwned.mock.invocationCallOrder[0]).toBeLessThan(mockSdk.library.add.mock.invocationCallOrder[0]);
});

test('addOwned writes nothing when the edition does not exist', async () => {
  mockSdk.library = {markOwned: jest.fn(), add: jest.fn()};
  mockSdk.books = {edition: jest.fn().mockResolvedValue(null)};
  await expect(addOwned('T', 9, 5)).rejects.toThrow('no edition');
  expect(mockSdk.library.markOwned).not.toHaveBeenCalled();
  expect(mockSdk.library.add).not.toHaveBeenCalled();
});

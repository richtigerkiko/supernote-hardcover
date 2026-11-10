import {cleanQuote} from '../src/quote';
import {saveQuote} from '../src/hardcover';

test('joins the reader line wraps and keeps paragraph breaks (real selection from the device)', () => {
  const raw = 'Such a simple thing this fig, purple and squat, the Butcher\nthought. His wife craved them when she was with child, yet\nneither of their daughters cared for them.\n\nHe made many\nspecial trips.';
  expect(cleanQuote(raw)).toBe(
    'Such a simple thing this fig, purple and squat, the Butcher thought. His wife craved them when she was with child, yet neither of their daughters cared for them.\n\nHe made many special trips.',
  );
});

test('trims, collapses spaces, and gives an empty string for nothing', () => {
  expect(cleanQuote('  a   b  \n c ')).toBe('a b c');
  expect(cleanQuote('')).toBe('');
  expect(cleanQuote(undefined)).toBe('');
});

describe('saveQuote', () => {
  const ITEM = {bookId: 2312000, editionId: 32560293};
  const mock = out => {
    const sent = [];
    global.fetch = jest.fn(async (u, init) => (sent.push(JSON.parse(init.body)), {ok: true, status: 200, json: async () => ({data: {insert_reading_journal: out}})}));
    return sent;
  };

  test('sends a private quote for the book and edition, with the page', async () => {
    const sent = mock({id: 5, errors: null});
    expect(await saveQuote('T', ITEM, 'a line', 82)).toBe(5);
    expect(sent[0].variables.o).toEqual({book_id: 2312000, edition_id: 32560293, entry: 'a line', event: 'quote', privacy_setting_id: 3, metadata: {page: 82}});
  });

  test('an errors list from Hardcover throws; an empty quote is refused before any request', async () => {
    mock({id: null, errors: ['bad']});
    await expect(saveQuote('T', ITEM, 'x', 1)).rejects.toThrow(/bad/);
    global.fetch = jest.fn();
    await expect(saveQuote('T', ITEM, '   ', 1)).rejects.toThrow(/empty/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

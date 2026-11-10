import {cleanQuote} from '../src/quote';
import {saveJournal} from '../src/hardcover';

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

describe('saveJournal', () => {
  const POSITION = {type: 'pages', value: 83, percent: 28.81944444444444, possible: 288};
  const ENTRY = {bookId: 2312000, editionId: 32560293, event: 'quote', entry: 'a line', position: POSITION};
  const mock = out => {
    const sent = [];
    global.fetch = jest.fn(async (u, init) => (sent.push(JSON.parse(init.body)), {status: 200, headers: {forEach() {}}, text: async () => JSON.stringify({data: {insert_reading_journal: out}})}));
    return sent;
  };

  test('sends a private entry for the book and edition, with the position and empty tags', async () => {
    const sent = mock({id: 5, errors: null, reading_journal: {id: 5}});
    expect(await saveJournal('T', ENTRY)).toBe(5);
    expect(sent[0].variables.o).toEqual({
      book_id: 2312000,
      edition_id: 32560293,
      event: 'quote',
      entry: 'a line',
      privacy_setting_id: 3,
      tags: [],
      metadata: {position: POSITION},
    });
  });

  test('no edition_id without an edition; privacy is passed through', async () => {
    const sent = mock({id: 6, errors: []});
    await saveJournal('T', {...ENTRY, editionId: null, event: 'note', privacy: 1});
    expect(sent[0].variables.o).not.toHaveProperty('edition_id');
    expect(sent[0].variables.o).toMatchObject({event: 'note', privacy_setting_id: 1});
  });

  test('an errors list from Hardcover throws; empty entries and unknown events are refused before any request', async () => {
    mock({id: null, errors: ['bad']});
    await expect(saveJournal('T', ENTRY)).rejects.toThrow(/bad/);
    global.fetch = jest.fn();
    await expect(saveJournal('T', {...ENTRY, entry: '   '})).rejects.toThrow(/empty/);
    await expect(saveJournal('T', {...ENTRY, event: 'review'})).rejects.toThrow(/event/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

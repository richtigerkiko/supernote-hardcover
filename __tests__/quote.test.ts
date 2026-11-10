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

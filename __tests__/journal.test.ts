import {journalEntry, journalPosition} from '../src/journal';

describe('journalPosition', () => {
  test('middle: reader page 82 of 288 on a 288-page edition is p. 83', () => {
    expect(journalPosition(82, 288, 288)).toEqual({type: 'pages', value: 83, percent: (83 / 288) * 100, possible: 288});
  });

  test('the first page is never page 0, the last is the edition page count', () => {
    expect(journalPosition(0, 1000, 288)?.value).toBe(1);
    expect(journalPosition(999, 1000, 288)).toMatchObject({value: 288, percent: 100});
    expect(journalPosition(1200, 1000, 288)?.value).toBe(288);
  });

  test('null when it cannot be computed', () => {
    expect(journalPosition(5, 100, null)).toBeNull();
    expect(journalPosition(5, 0, 288)).toBeNull();
  });
});

describe('journalEntry', () => {
  test('a quote with thoughts joins them with the divider', () => {
    expect(journalEntry('quote', 'a\nline', '  my thoughts \n')).toBe('a line\n\n━━━\n\nmy thoughts');
  });

  test('a quote with blank thoughts is just the passage', () => {
    expect(journalEntry('quote', ' a line ', '   ')).toBe('a line');
    expect(journalEntry('quote', 'a line', undefined)).toBe('a line');
  });

  test('a note is the trimmed text only', () => {
    expect(journalEntry('note', 'ignored passage', '  a note  ')).toBe('a note');
  });

  test('nothing to save gives an empty string', () => {
    expect(journalEntry('quote', '  \n ', 'thoughts')).toBe('');
    expect(journalEntry('note', 'passage', ' ')).toBe('');
  });
});

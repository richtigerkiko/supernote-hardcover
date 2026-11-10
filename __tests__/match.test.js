import {matchBook, toPages} from '../src/match';

// Currently Reading as returned by Hardcover for the real account (checked live).
const READING = [
  {title: 'Circe', authors: ['Madeline Miller']},
  {title: 'The Butcher of Nazareth', authors: ['David Scott Hay']},
  {title: 'Steppenwolf', authors: ['Hermann Hesse', 'Basil Creighton']},
];

// The 8 real EPUBs as (title, author) from their metadata, and the book each must resolve to (null = not being read).
const BOOKS = [
  ['Ich bin Circe', 'Madeline Miller', 'Circe'], // German edition and title
  ['The Butcher of Nazareth', 'David S. Hay', 'The Butcher of Nazareth'], // "David S." vs "David Scott"
  ['Imperium', 'Harris, Robert', null],
  ['Der Spaß an der Sache. Alle Essays', 'David Foster Wallace', null],
  ['Die Frau in den Dünen', 'Kobo Abe', null],
  ['Birds of America: Stories', 'Lorrie Moore', null],
  ['The Wedding People', 'Alison Espach', null],
  ['Betriebsverfassungsgesetz', '', null],
];

test.each(BOOKS)('%s / %s', (title, author, expected) => {
  expect(matchBook(`${title} ${author}`, READING)?.title ?? null).toBe(expected);
});

test('EPUB metadata text matches the same way, including diacritics', () => {
  expect(matchBook('Ich bin Circe Madeline Miller', READING).title).toBe('Circe');
  expect(matchBook('Der Steppenwolf Hermann Hesse', READING).title).toBe('Steppenwolf');
  expect(matchBook('Circé Miller', READING).title).toBe('Circe');
});

test('a short title needs the author too, so a stray word does not match', () => {
  expect(matchBook('Circe cookbook.epub', READING)).toBeNull();
});

test('two equally good matches are ambiguous and give null', () => {
  const twins = [
    {title: 'Dune', authors: ['Frank Herbert']},
    {title: 'Dune', authors: ['Frank Herbert']},
  ];
  expect(matchBook('Dune - Frank Herbert.epub', twins)).toBeNull();
});

describe('toPages', () => {
  test('0-based page 0 of 332 on a 330 page edition is page 1, last page is the last edition page', () => {
    expect(toPages(0, 332, 330)).toBe(1);
    expect(toPages(331, 332, 330)).toBe(330);
  });
  test('middle: index 81 is shown page 82 of 332, which is 81.5 of 330 and rounds to 82', () => {
    expect(toPages(81, 332, 330)).toBe(82);
  });
  test('never exceeds the edition, even if the reader reports a page past the total', () => {
    expect(toPages(999, 332, 330)).toBe(330);
  });
  test('refuses when it cannot compute a real page', () => {
    expect(toPages(5, 0, 330)).toBeNull();
    expect(toPages(5, 332, null)).toBeNull();
    expect(toPages(-1, 332, 330)).toBeNull();
    expect(toPages(undefined, 332, 330)).toBeNull();
  });
});

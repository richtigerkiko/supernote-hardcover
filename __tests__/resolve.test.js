import {isbnsIn} from '../src/match';
import {resolveBook} from '../src/resolve';

// Metadata, book ids and ISBNs below are the real ones: read from the real EPUBs, checked live on Hardcover.
const READING = [
  {bookId: 383598, title: 'Circe', authors: ['Madeline Miller']},
  {bookId: 2312000, title: 'The Butcher of Nazareth', authors: ['David Scott Hay']},
];
const KNOWN = {9781668287323: 2312000, 9781668287309: 2312000, 9781250899569: 1197330, 9783961610747: 383598};

const run = async meta => {
  const lookups = [];
  const hit = await resolveBook({
    meta,
    reading: READING,
    bookIdsForIsbns: async isbns => {
      lookups.push(isbns);
      return [...new Set(isbns.map(i => KNOWN[i]).filter(Boolean))];
    },
  });
  return {hit, lookups};
};

test('isbnsIn finds ISBN-13s in hyphenated identifiers and drops invalid checksums', () => {
  expect(isbnsIn('978-0-307-81688-7')).toEqual(['9780307816887']);
  expect(isbnsIn('9783961610741')).toEqual([]); // the real Circe EPUB ISBN: a typo, fails its checksum
  expect(isbnsIn('calibre:4 uuid:25fe41a0-64d3-44ae-93dc-51f661219484 BJNR000130972')).toEqual([]);
});

test('Butcher: its e-ISBN and print ISBN both lead to the book being read', async () => {
  const {hit, lookups} = await run({title: 'The Butcher of Nazareth', creator: 'David S. Hay', ids: ['calibre:4', '9781668287323'], pageBreakSource: '9781668287309'});
  expect(hit.title).toBe('The Butcher of Nazareth');
  expect(lookups).toEqual([['9781668287323', '9781668287309']]);
});

test('Circe: the EPUB ISBN is a typo and unknown to Hardcover, so title and author decide', async () => {
  const {hit} = await run({title: 'Ich bin Circe', creator: 'Madeline Miller', ids: ['9783961610741', '9783961610741']});
  expect(hit.title).toBe('Circe');
});

test('a known ISBN of a book that is not being read gives null, even if the title would match something', async () => {
  const {hit} = await run({title: 'The Wedding People', creator: 'Alison Espach', ids: ['calibre:8005', '9781250899569']});
  expect(hit).toBeNull();
});

test('books Hardcover has no edition for, and whose title is not being read, give null', async () => {
  expect((await run({title: 'Imperium', creator: 'Harris, Robert', ids: ['9783641108328']})).hit).toBeNull();
  expect((await run({title: 'Birds of America: Stories', creator: 'Lorrie Moore', ids: ['978-0-307-81688-7']})).hit).toBeNull();
});

test('no ISBN, no author and no match (the labour-law text) gives null; so does missing metadata', async () => {
  expect((await run({title: 'Betriebsverfassungsgesetz', creator: undefined, ids: ['BJNR000130972']})).hit).toBeNull();
  const {hit, lookups} = await run({title: undefined, creator: undefined, ids: []});
  expect(hit).toBeNull();
  expect(lookups).toEqual([]);
});

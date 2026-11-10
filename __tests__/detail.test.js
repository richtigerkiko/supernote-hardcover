import {buildDetail, STATUS_ID, withEdition} from '../src/detail';

const book = {
  title: 'T', subtitle: null, rating: 0, ratings_count: 0, reviews_count: 0, description: 'd', image: null,
  contributions: [{author: {name: 'A'}}],
  cached_tags: {Genre: [{tag: 'Horror'}], Mood: [{tag: 'dark'}], Tag: [{tag: 'x'}, {tag: 'y'}], 'Content Warning': [{tag: 'cw'}]},
  editions: [
    {id: 1, edition_format: 'Paperback', pages: 330, audio_seconds: null, release_date: '2026-02-26', isbn_13: '9781952600562', publisher: {name: 'P'}, language: {language: 'English'}},
    {id: 2, edition_format: 'Kindle Edition', pages: 288, audio_seconds: null, release_date: null, isbn_13: '9781668287323', publisher: null, language: null},
    {id: 3, edition_format: 'Audible', pages: null, audio_seconds: 23940, release_date: '2026-10-20', publisher: null, language: null},
  ],
};
const item = {userBookId: 9, bookId: 5, editionId: 1, editionPages: 330, read: {id: 7, edition_id: 1}};

test('builds the page props: tags by group, string ids, audio flagged, no content warnings', () => {
  const d = buildDetail({book, item, saved: null, sample: {page: 105, total: 400}});
  expect(d.genres).toEqual(['Horror']);
  expect(d.moods).toEqual(['dark']);
  expect(d.tags).toEqual(['x', 'y']);
  expect(d.authors).toEqual(['A']);
  expect(d.rating).toBeNull();
  expect(d.editions.map(e => [e.id, e.audio])).toEqual([['1', false], ['2', false], ['3', true]]);
  expect(d.editions[1]).toMatchObject({publisher: 'Unknown publisher', year: null, lang: ''});
  expect(d.editionId).toBe('1');
  expect(d.editionSaved).toBe(false);
  expect(d.progress).toBeCloseTo(106 / 400);
});

test("the file's own ISBN picks the edition before the reading entry does, a saved pick still wins", () => {
  const base = {book, item, sample: {page: 0, total: 10}};
  const byIsbn = buildDetail({...base, saved: null, isbns: ['9781668287323']});
  expect(byIsbn).toMatchObject({editionId: '2', editionIsbn: true, editionSaved: false});
  expect(buildDetail({...base, saved: {id: 1, pages: 330}, isbns: ['9781668287323']})).toMatchObject({editionId: '1', editionIsbn: false, editionSaved: true});
  expect(buildDetail({...base, saved: null, isbns: ['9780000000002']})).toMatchObject({editionId: '1', editionIsbn: false});
});

test('a saved edition wins over the reading entry and changes the pages', () => {
  const d = buildDetail({book, item, saved: {id: 2, pages: 288}, sample: {page: 105, total: 400}});
  expect(d.editionId).toBe('2');
  expect(d.editionSaved).toBe(true);
  expect(d.progress).toBeCloseTo(106 / 400);
});

test('a saved edition that Hardcover no longer lists falls back to the reading entry, unsaved', () => {
  const d = buildDetail({book, item, saved: {id: 99, pages: 10}, sample: {page: 0, total: 10}});
  expect(d.editionId).toBe('1');
  expect(d.editionSaved).toBe(false);
});

test('withEdition swaps edition id and pages on the item and its read, and ignores a pageless edition', () => {
  const w = withEdition(item, {id: 2, pages: 288});
  expect(w).toMatchObject({editionId: 2, editionPages: 288, read: {id: 7, edition_id: 2}});
  expect(item.editionId).toBe(1); // original untouched
  expect(withEdition(item, {id: 3, pages: 0})).toBe(item);
  expect(withEdition(item, undefined)).toBe(item);
  expect(withEdition(null, {id: 2, pages: 288})).toBeNull();
});

test('status ids', () => {
  expect(STATUS_ID).toEqual({'Want to read': 1, 'Currently reading': 2, Paused: 4, 'Did not finish': 5, Finished: 3});
});

test('an edition without a page count is never the default: it falls through to one that has pages', () => {
  const nopages = {...book, editions: [{...book.editions[0], id: 1, pages: null}, book.editions[1]]};
  const d = buildDetail({book: nopages, item, saved: null, sample: {page: 0, total: 10}, isbns: ['9781952600562']});
  expect(d.editionId).toBe('2'); // neither the reading entry's edition (1) nor the file's ISBN edition (1) has pages
});

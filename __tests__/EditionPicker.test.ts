import {editionMatches} from '../src/ui/EditionPicker';

const E = {id: '1', format: 'Kindle', publisher: 'Ullstein', year: 2019, pages: 494, lang: 'German', isbn: '9783961610747', audio: false} as any;

test.each([
  ['ull kindle 2019', true],
  ['german 610747', true],
  ['2019 KINDLE', true],
  ['  ', true],
  ['ull hardcover', false],
  ['french', false],
])('editionMatches %j -> %s', (q, ok) => expect(editionMatches(E, q)).toBe(ok));

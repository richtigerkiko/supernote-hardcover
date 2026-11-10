import {zipSync, strToU8} from 'fflate';
import {parseEpub} from '../src/epub';

const OPF = `<package><metadata xmlns:dc="x">
  <dc:title id="t1">The Butcher of Nazareth</dc:title>
  <dc:creator>David S. Hay</dc:creator>
  <dc:identifier>calibre:4</dc:identifier>
  <dc:identifier id="eisbn">9781668287323</dc:identifier>
  <meta property="pageBreakSource">9781668287309</meta></metadata></package>`;

const build = (opfPath, opf, opts = {}) =>
  zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), {level: 0}],
      'META-INF/container.xml': strToU8(`<container><rootfiles><rootfile full-path="${opfPath}"/></rootfiles></container>`),
      [opfPath]: strToU8(opf),
      ...opts.extra,
    },
    opts.zip,
  );

// A reader over in-memory bytes that records how much was read.
const reader = bytes => {
  const stats = {bytes: 0};
  const read = async (o, l) => ((stats.bytes += l), bytes.subarray(o, o + l));
  return {read, size: bytes.length, stats};
};

test('reads title, author, ids and print ISBN from a nested package file', async () => {
  const r = reader(build('OEBPS/content.opf', OPF));
  expect(await parseEpub(r.read, r.size)).toEqual({
    title: 'The Butcher of Nazareth',
    creator: 'David S. Hay',
    ids: ['calibre:4', '9781668287323'],
    pageBreakSource: '9781668287309',
  });
});

test('works when the package file is stored, not deflated', async () => {
  const r = reader(build('book.opf', OPF, {zip: {level: 0}}));
  expect((await parseEpub(r.read, r.size)).title).toBe('The Butcher of Nazareth');
});

test('a 3 MB book is read with far less than the whole file', async () => {
  const filler = new Uint8Array(3_000_000).map((_, i) => (i * 7919) % 251); // poorly compressible
  const r = reader(build('book.opf', OPF, {extra: {'big.bin': [filler, {level: 0}]}}));
  expect((await parseEpub(r.read, r.size)).title).toBe('The Butcher of Nazareth');
  expect(r.stats.bytes).toBeLessThan(100_000);
});

test('a book without author or print ISBN gives undefined, not a throw', async () => {
  const r = reader(build('inhalt.opf', '<package><metadata><dc:title>Gesetz</dc:title></metadata></package>'));
  const m = await parseEpub(r.read, r.size);
  expect(m.title).toBe('Gesetz');
  expect(m.creator).toBeUndefined();
  expect(m.pageBreakSource).toBeUndefined();
});

test('rejects data that is not a zip, and a zip without container.xml', async () => {
  const junk = reader(new Uint8Array(500));
  await expect(parseEpub(junk.read, junk.size)).rejects.toThrow(/not a zip/);
  const bare = reader(zipSync({a: strToU8('x')}));
  await expect(parseEpub(bare.read, bare.size)).rejects.toThrow(/container\.xml/);
});

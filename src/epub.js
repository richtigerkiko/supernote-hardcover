import {inflateSync, strFromU8} from 'fflate';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const tag = (xml, name) =>
  [...xml.matchAll(new RegExp(`<dc:${name}[^>]*>([^<]*)</dc:${name}>`, 'g'))].map(m => m[1]);

// Reads title/author/ids from an EPUB with a few small range reads, never the whole file:
// the zip's end record, its central directory, and the two entries needed (container.xml, .opf).
// read(offset, length) -> Promise<Uint8Array>; size = file size in bytes.
// shortcut: no ZIP64 (EPUBs over 4 GB) and regex instead of an XML parser; upgrade if either shows up.
export async function parseEpub(read, size) {
  const tailLen = Math.min(size, 65536);
  const tailOff = size - tailLen;
  const tail = await read(tailOff, tailLen);
  let e = tail.length - 22;
  while (e >= 0 && u32(tail, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip: no end-of-central-directory record');
  const cdSize = u32(tail, e + 12);
  const cdOff = u32(tail, e + 16);
  const cd = cdOff >= tailOff ? tail.subarray(cdOff - tailOff, cdOff - tailOff + cdSize) : await read(cdOff, cdSize);

  const entries = {};
  for (let p = 0; p + 46 <= cd.length && u32(cd, p) === 0x02014b50; ) {
    const n = u16(cd, p + 28), x = u16(cd, p + 30), c = u16(cd, p + 32);
    entries[strFromU8(cd.subarray(p + 46, p + 46 + n))] = {
      method: u16(cd, p + 10),
      packed: u32(cd, p + 20),
      local: u32(cd, p + 42),
    };
    p += 46 + n + x + c;
  }

  const text = async name => {
    const en = entries[name];
    if (!en) throw new Error(`missing in zip: ${name}`);
    const h = await read(en.local, 30);
    const data = await read(en.local + 30 + u16(h, 26) + u16(h, 28), en.packed);
    if (en.method !== 0 && en.method !== 8) throw new Error(`unsupported zip method ${en.method}`);
    return strFromU8(en.method === 8 ? inflateSync(data) : data);
  };

  const opfPath = /full-path="([^"]+)"/.exec(await text('META-INF/container.xml'))[1];
  const opf = await text(opfPath);
  return {
    title: tag(opf, 'title')[0],
    creator: tag(opf, 'creator')[0],
    ids: tag(opf, 'identifier'),
    pageBreakSource: (/pageBreakSource[^>]*>([^<]*)</.exec(opf) || [])[1],
  };
}

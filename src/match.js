// Words that carry no identity in a title; dropped from the Hardcover title only, never from the file text.
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'der', 'die', 'das', 'ein', 'eine', 'und', 'von', 'de', 'la', 'le', 'el']);

const words = s =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Finds which Currently Reading book a file is, from its EPUB title + author.
// A book matches when every meaningful word of its Hardcover title appears in the text AND an author's
// surname appears (or the title has 3+ meaningful words). This is the fallback for when no ISBN settles it
// (see resolve.js). Returns the single best match, or null when none or ambiguous.
// shortcut: exact word match, no fuzzy spelling or transliteration; upgrade if a real file misses.
export function matchBook(text, candidates) {
  const have = new Set(words(text));
  let best = null;
  let tie = false;
  for (const c of candidates) {
    const all = words(c.title);
    const need = all.filter(w => !STOP.has(w));
    const needle = need.length ? need : all;
    if (!needle.length || !needle.every(w => have.has(w))) continue;
    const author = c.authors.some(a => have.has(words(a).pop()));
    const score = author ? 2 : needle.length >= 3 ? 1 : 0;
    if (!score) continue;
    if (!best || score > best.score) {
      best = {candidate: c, score};
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return tie ? null : best && best.candidate;
}

// ISBN-13s in any text (filename, EPUB identifiers); hyphens allowed. Checksum-verified so a random
// 13-digit number in a filename is not mistaken for one.
// shortcut: ISBN-10 only is ignored; upgrade if a file has just that.
export function isbnsIn(text) {
  const found = new Set();
  for (const m of text.replace(/(\d)-(?=\d)/g, '$1').matchAll(/97[89]\d{10}/g)) {
    const d = m[0];
    const sum = [...d].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
    if (sum % 10 === 0) found.add(d);
  }
  return [...found];
}

// Supernote page (0-based, of total) -> page in the Hardcover edition. Reflowed EPUBs have their own page count.
export function toPages(pageIndex, total, editionPages) {
  if (!(total > 0) || !(editionPages > 0) || !(pageIndex >= 0)) return null;
  const current = Math.min(pageIndex + 1, total);
  return Math.min(editionPages, Math.max(1, Math.round((current / total) * editionPages)));
}

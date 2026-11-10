import type {EpubMeta} from './epub';
import type {ReadingItem} from './hardcover';
import {isbnsIn, matchBook} from './match';

// Which book on the reader's shelves is this EPUB? Decided only by its own metadata, never its filename.
//   meta: parseEpub() result {title, creator, ids, pageBreakSource}
//   reading: fetchUserBooks() result; bookIdsForIsbns(isbns): async () => [book ids]
// An ISBN that Hardcover knows decides it (that book is the one). Otherwise
// title + author are matched. Both are needed: real files have ISBN typos (an invalid checksum) and
// editions Hardcover lacks. Returns the reading item, or null.
export async function resolveBook({
  meta,
  reading,
  bookIdsForIsbns,
}: {
  meta: EpubMeta;
  reading: ReadingItem[];
  bookIdsForIsbns: (isbns: string[]) => Promise<number[]>;
}): Promise<ReadingItem | null> {
  const isbns = isbnsIn([...meta.ids, meta.pageBreakSource ?? ''].join(' '));
  if (isbns.length) {
    const ids = await bookIdsForIsbns(isbns);
    if (ids.length) return reading.find(r => ids.includes(r.bookId)) ?? null;
  }
  return meta.title ? matchBook(`${meta.title} ${meta.creator ?? ''}`, reading) : null;
}

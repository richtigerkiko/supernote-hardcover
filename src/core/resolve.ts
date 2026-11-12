import type {EpubMeta} from './epub';
import type {CatalogueBook, ReadingItem} from './types';
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
    const hit = reading.find(r => ids.includes(r.bookId));
    if (hit) return hit; // known to Hardcover but not on the shelf: the title may still match a shelf book
  }
  return meta.title ? matchBook(`${meta.title} ${meta.creator ?? ''}`, reading) : null;
}

// The same file looked up in Hardcover's whole catalogue (for a book that is not in the library).
// editionsForIsbns(isbns): async () => [{id, bookId}]; searchBooks(text): async () => [{bookId, title, authors}].
// Returns {bookId, editionId?} (an ISBN match also names the edition to mark as owned) or null.
export async function catalogueBook({
  meta,
  editionsForIsbns,
  searchBooks,
}: {
  meta: EpubMeta;
  editionsForIsbns: (isbns: string[]) => Promise<{id: number; bookId: number}[]>;
  searchBooks: (text: string) => Promise<CatalogueBook[]>;
}): Promise<{bookId: number; editionId?: number} | null> {
  const isbns = isbnsIn([...meta.ids, meta.pageBreakSource ?? ''].join(' '));
  if (isbns.length) {
    const [e] = await editionsForIsbns(isbns);
    if (e) return {bookId: e.bookId, editionId: e.id};
  }
  if (!meta.title) return null;
  const text = `${meta.title} ${meta.creator ?? ''}`;
  const hit = matchBook(text, await searchBooks(text), true);
  return hit ? {bookId: hit.bookId} : null;
}

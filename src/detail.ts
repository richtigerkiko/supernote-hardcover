import {UserBookStatus} from '@hardcover/sdk';
import type {BookDetail as ApiBook, ReadingItem} from './hardcover';
import type {Sample} from './session';
import type {BookDetail as PageBook, Edition as PageEdition} from './ui/DetailPage';

// Hardcover user_books.status_id by the labels of the detail page.
export const STATUS_ID = {
  'Want to read': UserBookStatus.WantToRead,
  'Currently reading': UserBookStatus.CurrentlyReading,
  Paused: UserBookStatus.Paused,
  'Did not finish': UserBookStatus.DidNotFinish,
  Finished: UserBookStatus.Read,
};

// The edition the reader said this file is replaces the one on the reading entry, for the pages we compute and for the
// edition id sent with each progress update.
export function withEdition(item: ReadingItem | null, ed?: {id: number; pages: number} | null): ReadingItem | null {
  if (!item || !ed || !(ed.pages > 0)) return item;
  return {...item, editionId: ed.id, editionPages: ed.pages, read: item.read && {...item.read, edition_id: ed.id}};
}

const tagNames = (tags: ApiBook['cachedTags'] | undefined, group: string): string[] =>
  (tags?.[group] ?? []).flatMap(t => (t.tag ? [t.tag] : []));

// Raw Hardcover record (fetchBookDetail) + the reading item + this file's saved edition + the reader position -> the
// props of DetailPage. All ids are strings there.
// isbns: the ISBN-13s in the file's own identifiers; an edition with one of them is the file's edition.
export function buildDetail({
  book,
  item,
  saved,
  sample,
  isbns = [],
}: {
  book: ApiBook;
  item: ReadingItem;
  saved?: {id: number; pages: number} | null;
  sample: Sample;
  isbns?: string[];
}): PageBook {
  const editions: PageEdition[] = book.editions.map(e => ({
    id: String(e.id),
    format: e.editionFormat ?? 'Edition',
    publisher: e.publisher?.name ?? 'Unknown publisher',
    year: e.releaseDate ? Number(e.releaseDate.slice(0, 4)) : null,
    pages: e.pages ?? 0,
    lang: e.language?.language ?? '',
    isbn: e.isbn13 ?? undefined,
    audio: !!e.audioSeconds && !e.pages,
  }));
  const wanted = String(saved?.id ?? '');
  const byFile = editions.find(e => e.isbn && e.pages > 0 && isbns.includes(e.isbn));
  const theirs = String(item.editionId ?? '');
  const ed =
    editions.find(e => e.id === wanted) ??
    byFile ??
    editions.find(e => e.id === theirs && e.pages > 0) ??
    editions.find(e => !e.audio && e.pages) ??
    editions[0];
  return {
    title: book.title ?? '',
    subtitle: book.subtitle,
    authors: (book.contributions ?? []).flatMap(c => (c.author ? [c.author.name] : [])),
    cover: book.cachedImage?.url ?? null,
    rating: book.rating || null,
    ratingsCount: book.ratingsCount,
    status: (Object.keys(STATUS_ID) as (keyof typeof STATUS_ID)[]).find(k => STATUS_ID[k] === item.statusId) ?? 'Currently reading',
    progress: Math.min(1, (sample.page + 1) / sample.total),
    genres: tagNames(book.cachedTags, 'Genre'),
    moods: tagNames(book.cachedTags, 'Mood'),
    tags: tagNames(book.cachedTags, 'Tag'),
    description: book.description,
    editions,
    editionId: ed ? ed.id : '',
    editionSaved: !!saved && !!ed && ed.id === String(saved.id),
    editionIsbn: !!ed && ed === byFile, // the file's own ISBN names this edition
  };
}

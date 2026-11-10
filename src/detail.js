// Hardcover user_books.status_id by the labels of the detail page. 1, 2, 3 and 5 are confirmed against the account
// (via user_book_status); 4 (Paused) is used by no book here, so it is only known from third-party docs.
export const STATUS_ID = {'Currently reading': 2, Paused: 4, 'Did not finish': 5, Finished: 3};

// The edition the reader said this file is replaces the one on the reading entry, for the pages we compute and for the
// edition id sent with each progress update.
export function withEdition(item, ed) {
  if (!item || !ed || !(ed.pages > 0)) return item;
  return {...item, editionId: ed.id, editionPages: ed.pages, read: item.read && {...item.read, edition_id: ed.id}};
}

const tagNames = (tags, group) => (tags?.[group] ?? []).map(t => t.tag);

// Raw Hardcover record (fetchBookDetail) + the reading item + this file's saved edition + the reader position -> the
// props of DetailPage. All ids are strings there.
// isbns: the ISBN-13s in the file's own identifiers; an edition with one of them is the file's edition.
export function buildDetail({book, item, saved, sample, isbns = []}) {
  const editions = book.editions.map(e => ({
    id: String(e.id),
    format: e.edition_format ?? 'Edition',
    publisher: e.publisher?.name ?? 'Unknown publisher',
    year: e.release_date ? Number(e.release_date.slice(0, 4)) : null,
    pages: e.pages ?? 0,
    lang: e.language?.language ?? '',
    isbn: e.isbn_13 ?? undefined,
    audio: !!e.audio_seconds && !e.pages,
  }));
  const wanted = String(saved?.id ?? '');
  const byFile = editions.find(e => e.isbn && isbns.includes(e.isbn));
  const theirs = String(item.editionId ?? '');
  const ed =
    editions.find(e => e.id === wanted) ??
    byFile ??
    editions.find(e => e.id === theirs) ??
    editions.find(e => !e.audio && e.pages) ??
    editions[0];
  return {
    title: book.title,
    subtitle: book.subtitle,
    authors: (book.contributions ?? []).map(c => c.author.name),
    cover: book.image?.url ?? null,
    rating: book.rating || null,
    ratingsCount: book.ratings_count,
    reviewsCount: book.reviews_count,
    status: 'Currently reading', // only books on the Currently Reading list are shown
    progress: Math.min(1, (sample.page + 1) / sample.total),
    genres: tagNames(book.cached_tags, 'Genre'),
    moods: tagNames(book.cached_tags, 'Mood'),
    tags: tagNames(book.cached_tags, 'Tag'),
    description: book.description,
    editions,
    editionId: ed ? ed.id : '',
    editionSaved: !!saved && !!ed && ed.id === String(saved.id),
    editionIsbn: !!ed && ed === byFile, // the file's own ISBN names this edition
  };
}

import {
  HardcoverClient,
  JournalEvent,
  PrivacySetting,
  operations,
  type Book,
  type Edition,
  type LibraryEntryWithBook,
  type LibraryListItem,
  type TokenSource,
  type UserBookStatus,
} from '@hardcover/sdk';
import {NOT_READING, type CatalogueBook, type JournalItem, type Privacy, type PublicReview, type ReadingItem} from '../core/types';

// One client per credential. `auth` is a plain token (tests) or an OAuth session that refreshes itself and replays a
// 401 once. pace: false because the SDK would wait with setTimeout, which the host only runs in lifecycle state 2 (see
// CLAUDE.md); maxRetries 0 because the tracker owns retries (RETRY_MS, RATE_LIMIT_RETRY_MS). SDK errors carry `status`,
// which the 429 retry branch and the 401 stop use; a lost sign-in is a SignedOutError.
export type Auth = string | TokenSource;
let client: HardcoverClient | undefined;
let clientAuth: Auth | undefined;
function sdk(auth: Auth): HardcoverClient {
  if (!client || clientAuth !== auth) {
    client = new HardcoverClient({...(typeof auth === 'string' ? {token: auth} : {auth}), pace: false, maxRetries: 0, onWarning: () => {}});
    clientAuth = auth;
  }
  return client;
}

const LIBRARY_PAGE = 100;

function toItem(u: LibraryListItem | LibraryEntryWithBook): ReadingItem {
  const r = u.userBookReads.find(x => !x.finishedAt); // newest first: the read in progress, never a finished one
  return {
    userBookId: u.id,
    bookId: u.bookId,
    statusId: u.statusId,
    title: u.book?.title ?? '',
    authors: (u.book?.cachedContributors ?? []).flatMap(x => (x.author?.name ? [x.author.name] : [])),
    editionId: u.editionId ?? u.edition?.id ?? null,
    editionPages: u.edition?.pages ?? null,
    read: r ? {id: r.id, started_at: r.startedAt, finished_at: r.finishedAt, progress_pages: r.progressPages, edition_id: r.editionId} : null,
  };
}

// Every book on the reader's shelves (any status). The whole library: only for a button press, never while reading.
export async function fetchUserBooks(auth: Auth): Promise<ReadingItem[]> {
  const c = sdk(auth);
  const items: ReadingItem[] = [];
  for (let offset = 0; ; offset += LIBRARY_PAGE) {
    const page = await c.library.list({limit: LIBRARY_PAGE, offset});
    items.push(...page.items.map(toItem));
    if (!page.hasMore) return items;
  }
}

// One library entry by its id (null: gone), with its status and its read in progress. Used at each progress push.
export async function fetchUserBook(auth: Auth, userBookId: number): Promise<ReadingItem | null> {
  const u = await sdk(auth).library.get(userBookId);
  return u && toItem(u);
}

// The entry for a book, if the reader has one.
export async function fetchUserBookForBook(auth: Auth, bookId: number): Promise<ReadingItem | null> {
  const e = await sdk(auth).library.forBook(bookId);
  return e ? fetchUserBook(auth, e.id) : null;
}

// A reading-journal entry, event 'quote' or 'note'. PRIVATE by default: the account default is Public, and journal.add
// would otherwise use that. The server stamps the date.
export const PRIVACY_PRIVATE = PrivacySetting.Private;

export interface JournalInput {
  bookId: number;
  editionId?: number | null;
  event: 'quote' | 'note';
  entry: string;
  position?: {type: string; value: number; percent: number; possible: number};
  privacy?: PrivacySetting;
}

export async function saveJournal(auth: Auth, {bookId, editionId, event, entry, position, privacy = PRIVACY_PRIVATE}: JournalInput): Promise<number> {
  if (event !== JournalEvent.Quote && event !== JournalEvent.Note) throw new Error(`refusing to save: unknown journal event ${event}`);
  if (!entry || !entry.trim()) throw new Error('refusing to save an empty journal entry');
  const saved = await sdk(auth).journal.add(bookId, {
    event,
    entry,
    privacy,
    ...(editionId ? {editionId} : {}),
    ...(position ? {metadata: {position}} : {}),
  });
  return saved.id;
}

// A review on a library entry, as hardcover.app's edit form has it. Needs write:reviews. One UpdateUserBook request (the
// SDK's library.update has no sponsored flag), so a retry never leaves half of it saved. No rating leaves the existing one
// alone (null would clear it); sponsored is always sent, so a review can be unmarked (checked live 2026-11-12).
export interface ReviewInput {
  markdown: string;
  hasSpoilers: boolean;
  sponsored: boolean;
  notes: string; // private notes; '' clears them, so the card is always prefilled from fetchReview
  rating?: number | null;
}

export async function saveReview(auth: Auth, userBookId: number, {markdown, hasSpoilers, sponsored, notes, rating}: ReviewInput): Promise<void> {
  if (!markdown || !markdown.trim()) throw new Error('refusing to save an empty review');
  if (rating != null && !(rating >= 0.5 && rating <= 5 && rating * 2 === Math.round(rating * 2))) throw new Error(`refusing to save: bad rating ${rating}`);
  await sdk(auth).request(operations.UpdateUserBook, {
    id: userBookId,
    object: {
      ...(rating != null ? {rating} : {}),
      review_markdown: markdown.trim(),
      review_has_spoilers: hasSpoilers,
      sponsored_review: sponsored,
      private_notes: notes.trim(),
    },
  });
}

// What the entry already holds, to prefill the card (saving replaces it). The SDK's entry has no sponsored flag, so
// user_books.sponsored_review is read with one small query.
export async function fetchReview(auth: Auth, userBookId: number): Promise<{markdown: string; hasSpoilers: boolean; sponsored: boolean; notes: string; rating: number | null}> {
  const c = sdk(auth);
  const [e, flag] = await Promise.all([
    c.library.get(userBookId),
    c.graphql<{user_books: {sponsored_review: boolean}[]}>('query Sponsored($id: Int!) { user_books(where: {id: {_eq: $id}}) { sponsored_review } }', {id: userBookId}),
  ]);
  if (!e) throw new Error('library entry not found');
  return {markdown: e.reviewMarkdown ?? '', hasSpoilers: e.reviewHasSpoilers, sponsored: !!flag.user_books?.[0]?.sponsored_review, notes: e.privateNotes ?? '', rating: e.rating};
}

// Which books do these ISBN-13s belong to? Different editions of one book share a book_id.
export async function bookIdsForIsbns(auth: Auth, isbns: string[]): Promise<number[]> {
  const editions = await sdk(auth).books.findByIsbn(isbns);
  return [...new Set(editions.map(e => e.bookId))];
}

// Progress follows the documented read lifecycle (docs/hardcover-api guides/updatingabooksprogress.md, checked live
// 2026-11-12), like the KOReader plugin:
//  - only a book that is Currently Reading with a read in progress is written; anything else throws NOT_READING. A page
//    turn never changes a status and never starts a read: the status picker does (the server starts the read).
//  - update_user_book_read changes only the fields it is sent, so only the page and the file's edition go out.
//  - progress that reaches the end of the edition would finish the read and mark the book Read, so the last page is sent
//    as one before it: a book is finished only with the status picker.
// shortcut: reads.setProgress is not used, it takes no edition_id. The typed operation keeps the exact write.
export async function saveProgress(auth: Auth, item: ReadingItem, pages: number): Promise<void> {
  if (!(pages > 0)) throw new Error('refusing to save: no page count');
  const read = item.read;
  if (item.statusId !== 2 || !read || read.finished_at) throw new Error(NOT_READING);
  const progress_pages = Math.min(pages, (item.editionPages ?? Infinity) - 1);
  if (progress_pages < 1) return; // an edition with one page: any progress would finish it
  const edition = read.edition_id ?? item.editionId;
  await sdk(auth).request(operations.UpdateUserBookRead, {id: read.id, read: {progress_pages, ...(edition ? {edition_id: edition} : {})}});
}

// Everything the detail page shows about a book, and all its editions (the page hides audiobooks).
// The `mine` editions are the ones the reader already uses; they come along even when they are not among the 100 listed.
export type ApiBook = Book & {editions: Edition[]};
const EDITIONS_SHOWN = 100;
const EDITIONS_MAX = 300; // the picker searches these; every further 100 is another request on each detail page load

export async function fetchBookDetail(auth: Auth, bookId: number, editionIds: number[] = []): Promise<ApiBook> {
  const c = sdk(auth);
  const [book, first] = await Promise.all([c.books.get(bookId), c.books.editions(bookId, {limit: EDITIONS_SHOWN})]);
  if (!book) throw new Error(`Hardcover: book ${bookId} not found`);
  const editions = [...first.items];
  // hasMore is true after a full page, so a book with under 100 editions makes no extra request.
  for (let page = first; page.hasMore && editions.length < EDITIONS_MAX; ) {
    page = await c.books.editions(bookId, {limit: EDITIONS_SHOWN, offset: editions.length});
    editions.push(...page.items);
  }
  const missing = editionIds.filter(id => !editions.some(e => e.id === id));
  const mine = await Promise.all(missing.map(id => c.books.edition(id)));
  return {...book, editions: [...editions, ...mine.filter((e): e is NonNullable<typeof e> => !!e)]};
}

export async function setStatus(auth: Auth, userBookId: number, statusId: UserBookStatus): Promise<void> {
  await sdk(auth).library.setStatus(userBookId, statusId);
}

// ---- the whole catalogue (for a book that is not in the library yet) ----
// Editions with these ISBN-13s anywhere on Hardcover.
export async function editionsForIsbns(auth: Auth, isbns: string[]): Promise<{id: number; bookId: number}[]> {
  return (await sdk(auth).books.findByIsbn(isbns)).map(e => ({id: e.id, bookId: e.bookId}));
}

export async function searchBooks(auth: Auth, query: string): Promise<CatalogueBook[]> {
  const {hits} = await sdk(auth).search.books(query, {perPage: 10});
  return hits.map(h => ({bookId: h.id, title: h.title, authors: h.authorNames ?? []}));
}

// Having the EPUB means owning the book: mark one of its editions as owned (Owned list only, no library entry; checked
// 2026-11-10), then add the book. A library entry cannot be made without a status: the server gives Want to Read
// (checked 2026-11-10), so this is only called for a book with no entry yet. `imported` keeps it out of followers' feeds.
// The edition (the file's ISBN edition, or the one the reader picked) is also put on the new entry, and returned so the
// caller can use its page count for this file.
export async function addOwned(auth: Auth, bookId: number, editionId: number): Promise<{id: number; pages: number | null}> {
  const c = sdk(auth);
  const edition = await c.books.edition(editionId);
  // Nothing to own means nothing is written: an unowned entry would never be retried, it is found in the library next time.
  if (!edition) throw new Error('Hardcover has no edition of this book to mark as owned');
  await c.library.markOwned(edition.id); // safe to repeat, so a failed add below can simply be retried
  await c.library.add(bookId, {imported: true, editionId: edition.id});
  return {id: edition.id, pages: edition.pages ?? null};
}

// ---- other readers' reviews ----
export const REVIEWS_PAGE = 10;

// Public reviews only (privacy_setting_id 1), newest first. One extra row is asked for to know whether there is more.
// shortcut: the field names (user.name, user.flair as the Supporter badge) come from the SDK's generated schema and are
// not yet run against the live API; verify with a read-only query before release.
const REVIEWS_QUERY = `query Reviews($bookId: Int!, $limit: Int!, $offset: Int!) {
  user_books(where: {book_id: {_eq: $bookId}, has_review: {_eq: true}, privacy_setting_id: {_eq: 1}}, order_by: {reviewed_at: desc_nulls_last}, limit: $limit, offset: $offset) {
    id rating review_raw review_has_spoilers reviewed_at
    user { name flair }
  }
}`;

type ReviewRow = {
  id: number;
  rating: number | null;
  review_raw: string | null;
  review_has_spoilers: boolean | null;
  reviewed_at: string | null;
  user: {name: string | null; flair: string | null} | null;
};

export async function fetchReviews(auth: Auth, bookId: number, offset = 0): Promise<{reviews: PublicReview[]; hasMore: boolean}> {
  const data = await sdk(auth).graphql<{user_books: ReviewRow[]}>(REVIEWS_QUERY, {bookId, limit: REVIEWS_PAGE + 1, offset});
  const rows = data.user_books ?? [];
  const reviews = rows.slice(0, REVIEWS_PAGE).map(r => ({
    id: r.id,
    user: r.user?.name || 'Reader',
    supporter: /supporter/i.test(r.user?.flair ?? ''),
    rating: r.rating || null,
    text: (r.review_raw ?? '').trim(),
    spoiler: !!r.review_has_spoilers,
    date: (r.reviewed_at ?? '').slice(0, 10),
  }));
  return {reviews, hasMore: rows.length > REVIEWS_PAGE};
}

// ---- the book's own notes and quotes (read, edit, remove) ----
export const JOURNAL_PAGE = 100; // the server's cap per request
// The table also holds events the server writes (progress, status, rating...): only note and quote are the reader's own.
// shortcut: field names come from docs/hardcover-api (guides/updatingreadingjournal.md), not yet run against the live API.
const JOURNAL_QUERY = `query BookJournal($userId: Int!, $bookId: Int!, $limit: Int!, $offset: Int!) {
  reading_journals(where: {user_id: {_eq: $userId}, book_id: {_eq: $bookId}, event: {_in: ["note", "quote"]}}, order_by: [{action_at: desc}, {id: desc}], limit: $limit, offset: $offset) {
    id event entry action_at privacy_setting_id metadata
  }
}`;

type JournalRow = {id: number; event: string; entry: string | null; action_at: string; privacy_setting_id: number; metadata: {position?: {value?: number}} | null};

// `me` is a list in Hardcover's API. Not cached: the sign-in object survives an account switch, and one small request per page is cheap.
async function userId(auth: Auth): Promise<number> {
  const data = await sdk(auth).graphql<{me: {id: number} | {id: number}[]}>('query Me { me { id } }', {});
  const id = [data.me].flat()[0]?.id;
  if (typeof id !== 'number') throw new Error('Hardcover: no user id');
  return id;
}

export async function fetchJournal(auth: Auth, bookId: number, offset = 0): Promise<{entries: JournalItem[]; hasMore: boolean}> {
  const data = await sdk(auth).graphql<{reading_journals: JournalRow[]}>(JOURNAL_QUERY, {userId: await userId(auth), bookId, limit: JOURNAL_PAGE, offset});
  const rows = data.reading_journals ?? [];
  const entries = rows.map(r => ({
    id: Number(r.id),
    event: r.event === 'quote' ? ('quote' as const) : ('note' as const),
    entry: r.entry ?? '',
    page: r.metadata?.position?.value ?? null,
    date: (r.action_at ?? '').slice(0, 10),
    privacy: r.privacy_setting_id as Privacy,
  }));
  // A full page may be followed by another; a short one is the end (the server cuts a larger limit silently).
  return {entries, hasMore: rows.length >= JOURNAL_PAGE};
}

type Mutated = {errors?: unknown} | null;
const failed = (r: Mutated | undefined) => {
  if (!r || (Array.isArray(r.errors) ? r.errors.length : r.errors)) throw new Error(`Hardcover refused the change: ${JSON.stringify(r?.errors ?? 'no answer')}`);
};

export async function updateJournal(auth: Auth, id: number, {entry, privacy}: {entry: string; privacy: Privacy}): Promise<void> {
  if (!entry || !entry.trim()) throw new Error('refusing to save an empty journal entry');
  const data = await sdk(auth).graphql<{update_reading_journal: Mutated}>(
    'mutation EditJournal($id: Int!, $entry: String!, $privacy: Int!) { update_reading_journal(id: $id, object: {entry: $entry, privacy_setting_id: $privacy}) { errors } }',
    {id, entry, privacy},
  );
  failed(data.update_reading_journal);
}

export async function deleteJournal(auth: Auth, id: number): Promise<void> {
  // The delete output has only `id` (no `errors`, unlike update): no id back means nothing was deleted.
  const data = await sdk(auth).graphql<{delete_reading_journal: {id: number} | null}>('mutation RemoveJournal($id: Int!) { delete_reading_journal(id: $id) { id } }', {id});
  if (!data.delete_reading_journal?.id) throw new Error('Hardcover did not delete the entry');
}

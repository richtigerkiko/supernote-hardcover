import {HardcoverClient} from '@hardcover/sdk';

const QUERY_READING = `query { me { user_books {
  id book_id edition_id status_id
  book { title contributions(limit: 5) { author { name } } }
  edition { id pages }
  user_book_reads(order_by: {id: desc}, limit: 1) { id started_at finished_at progress_pages edition_id }
} } }`;

const UPDATE = `mutation($id: Int!, $object: DatesReadInput!) { update_user_book_read(id: $id, object: $object) { error } }`;
const INSERT = `mutation($ub: Int!, $read: DatesReadInput!) { insert_user_book_read(user_book_id: $ub, user_book_read: $read) { id error user_book_read { id } } }`;

// One client per token. The SDK paces requests and throws typed errors that carry `status` (callers branch on it). maxRetries 0: the tracker owns retries (RETRY_MS, RATE_LIMIT_RETRY_MS).
let client;
let clientToken;
function gql(token, query, variables) {
  if (!client || clientToken !== token) {
    client = new HardcoverClient({token, maxRetries: 0, onWarning: () => {}});
    clientToken = token;
  }
  return client.graphql(query, variables);
}

// Every book on the reader's shelves (any status), flattened to what matching and saving need.
export async function fetchUserBooks(token) {
  const data = await gql(token, QUERY_READING);
  return data.me[0].user_books.map(u => ({
    userBookId: u.id,
    bookId: u.book_id,
    statusId: u.status_id,
    title: u.book.title,
    authors: u.book.contributions.map(c => c.author.name),
    editionId: u.edition_id ?? u.edition?.id ?? null,
    editionPages: u.edition?.pages ?? null,
    read: u.user_book_reads[0] ?? null,
  }));
}

// A reading-journal entry, event 'quote' or 'note'. PRIVATE (3) by default: the account default is Public.
// action_at is not sent: the server stamps it.
export const PRIVACY_PRIVATE = 3;
const INSERT_JOURNAL = `mutation($o: ReadingJournalCreateType!) { insert_reading_journal(object: $o) { id errors reading_journal { id } } }`;

export async function saveJournal(token, {bookId, editionId, event, entry, position, privacy = PRIVACY_PRIVATE}) {
  if (event !== 'quote' && event !== 'note') throw new Error(`refusing to save: unknown journal event ${event}`);
  if (!entry || !entry.trim()) throw new Error('refusing to save an empty journal entry');
  const object = {book_id: bookId, event, entry, privacy_setting_id: privacy, tags: []}; // tags is required, even empty
  if (editionId) object.edition_id = editionId;
  if (position) object.metadata = {position};
  const data = await gql(token, INSERT_JOURNAL, {o: object});
  const out = data.insert_reading_journal;
  if (out.errors && out.errors.length) throw new Error(`Hardcover: ${JSON.stringify(out.errors)}`);
  return out.id;
}

// Which books do these ISBN-13s belong to? Different editions of one book share a book_id.
export async function bookIdsForIsbns(token, isbns) {
  const data = await gql(token, 'query($isbns: [String!]) { editions(where: {isbn_13: {_in: $isbns}}) { book_id } }', {isbns});
  return [...new Set(data.editions.map(e => e.book_id))];
}

// Hardcover's update replaces what it is not sent (reported by other clients), so every existing
// field of the read is sent back along with the new progress.
export function progressInput(item, pages) {
  const r = item.read || {};
  const input = {progress_pages: pages};
  const edition = r.edition_id ?? item.editionId;
  if (edition) input.edition_id = edition;
  if (r.started_at) input.started_at = r.started_at;
  if (r.finished_at) input.finished_at = r.finished_at;
  return input;
}

// The day as the reader lives it; toISOString gives the UTC day, which is yesterday just after midnight east of UTC.
export const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function saveProgress(token, item, pages) {
  if (!(pages > 0)) throw new Error('refusing to save: no page count');
  const input = progressInput(item, pages);
  const started_at = localDate(new Date());
  const data = item.read
    ? await gql(token, UPDATE, {id: item.read.id, object: input})
    : await gql(token, INSERT, {ub: item.userBookId, read: {...input, started_at}});
  const res = data.update_user_book_read || data.insert_user_book_read;
  if (res.error) throw new Error(`Hardcover: ${res.error}`);
  // The tracker pushes this same item next time: remember the new read so that push is an update, not a second insert.
  if (!item.read) {
    const id = res.user_book_read?.id ?? res.id;
    if (typeof id !== 'number') throw new Error('Hardcover: insert returned no read id');
    item.read = {id, started_at, edition_id: input.edition_id};
  }
}

// Everything the detail page shows about a book, and all its editions (the page hides audiobooks).
// `mine` brings the editions the reader already uses even when they are not among the 100 listed (most used first).
const EDITION_FIELDS = 'id edition_format pages audio_seconds release_date isbn_13 publisher { name } language { language }';
const QUERY_DETAIL = `query($id: Int!, $ids: [Int!]) { books_by_pk(id: $id) {
  title subtitle rating ratings_count reviews_count description cached_tags image { url }
  contributions(limit: 5) { author { name } }
  editions(order_by: [{users_count: desc_nulls_last}, {id: asc}], limit: 100) { ${EDITION_FIELDS} }
  mine: editions(where: {id: {_in: $ids}}) { ${EDITION_FIELDS} }
} }`;

export async function fetchBookDetail(token, bookId, editionIds = []) {
  const data = await gql(token, QUERY_DETAIL, {id: bookId, ids: editionIds});
  const book = data.books_by_pk;
  if (!book) throw new Error(`Hardcover: book ${bookId} not found`);
  const {mine = [], ...rest} = book;
  return {...rest, editions: [...rest.editions, ...mine.filter(m => !rest.editions.some(e => e.id === m.id))]};
}

const UPDATE_USER_BOOK = `mutation($id: Int!, $object: UserBookUpdateInput!) { update_user_book(id: $id, object: $object) { id error } }`;

export async function setStatus(token, userBookId, statusId) {
  const data = await gql(token, UPDATE_USER_BOOK, {id: userBookId, object: {status_id: statusId}});
  if (data.update_user_book.error) throw new Error(`Hardcover: ${data.update_user_book.error}`);
}

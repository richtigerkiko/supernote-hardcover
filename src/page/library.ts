import type {OAuthSession} from '@hardcover/sdk/oauth';
import {catalogueBook, resolveBook} from '../core/resolve';
import type {FileMeta} from '../core/store';
import type {ReadingItem} from '../core/types';
import {withTimeout} from '../core/util';
import type * as client from '../hardcover/client';
import {authorsOf, toEditions, withEdition} from './detail';
import type {Meta} from './meta';
import type {Ask} from './session';

// The Hardcover calls the page modules make; plugin.ts passes the real client, tests a fake.
export type Client = Pick<
  typeof client,
  | 'addOwned'
  | 'deleteJournal'
  | 'bookIdsForIsbns'
  | 'editionsForIsbns'
  | 'fetchBookDetail'
  | 'fetchJournal'
  | 'fetchReview'
  | 'fetchReviews'
  | 'fetchUserBook'
  | 'fetchUserBookForBook'
  | 'fetchUserBooks'
  | 'saveJournal'
  | 'saveProgress'
  | 'saveReview'
  | 'searchBooks'
  | 'setStatus'
  | 'updateJournal'
>;
export type Dialog = (tip: string, left: string, right: string, ok: boolean) => Promise<unknown>;

type Link = {bookId: number; editionId?: number};

const READING_TTL_MS = 600_000;

// What the book search starts with: the EPUB's title and author.
export const searchText = (m: FileMeta) => [m.title, m.creator].filter(Boolean).join(' ');

// The books in the library (cached) and which item a file is.
export function createLibrary({auth, hc, meta, dialog}: {auth: OAuthSession; hc: Client; meta: Meta; dialog: Dialog}) {
  let reading: {at: number; list: ReadingItem[]} = {at: 0, list: []};
  let gen = 0; // bumped when the list is known stale; a fetch that started before that is not cached
  function drop() {
    gen++;
    reading.at = 0;
  }
  async function list() {
    if (Date.now() - reading.at <= READING_TTL_MS) return reading.list;
    const mine = gen;
    const fetched = await hc.fetchUserBooks(auth);
    if (mine === gen) reading = {list: fetched, at: Date.now()};
    return fetched;
  }
  async function resolvePath(path: string) {
    const m = await meta.get(path);
    const item = await resolveBook({meta: m, reading: await list(), bookIdsForIsbns: isbns => hc.bookIdsForIsbns(auth, isbns)});
    return withEdition(item, m.edition); // the edition the reader picked for this file, if any
  }

  // The library entry for a catalogue book, asked for that book only: a failed match (missing author, ambiguous title) or
  // the cached list can hide an entry that exists, and an existing entry must never be written to here.
  const entryFor = (bookId: number) => hc.fetchUserBookForBook(auth, bookId);

  // Having the EPUB means owning the book: add the catalogue book to the library (Want to Read) with this edition marked as
  // owned, and return its library item. The edition (when it has pages) becomes the file's edition, so tracking has a page
  // count. The link stays: the next load finds the entry through it even when its title would not match the file.
  async function addToLibrary(path: string, m: FileMeta, to: {bookId: number; editionId: number}) {
    let item = await entryFor(to.bookId);
    if (!item) {
      const ed = await withTimeout(hc.addOwned(auth, to.bookId, to.editionId), 20_000, 'add to library');
      if (ed.pages) m.edition = {id: ed.id, pages: ed.pages};
      item = await entryFor(to.bookId);
      drop(); // the cached list lacks the new entry
    }
    m.linked = to;
    await meta.save(path, m);
    return withEdition(item, m.edition);
  }

  // The catalogue book shown without a library entry (userBookId 0): no tracking and no status (see CLAUDE.md).
  const stub = (to: Link): ReadingItem => ({userBookId: 0, bookId: to.bookId, statusId: 0, title: '', authors: [], editionId: to.editionId ?? null, editionPages: null, read: null});

  // This file is the catalogue book `to` (found by catalogueBook, or picked in the book search). Not in the library yet:
  // ask whether to add it. Yes with an ISBN edition adds it; Yes without one returns the edition picker for the page to
  // show (nothing is written before the pick). On No the link is saved per file (`linked` in the metadata cache, like
  // KOReader's link), so there is no second prompt and the page works for the book without tracking and status.
  // Null: the book has no edition to own (search hits are full of such records). Nothing is saved, or the file would be
  // stuck on a book whose page cannot show.
  async function link(path: string, to: Link): Promise<ReadingItem | Ask | null> {
    const m = await meta.get(path);
    const item = await entryFor(to.bookId); // on the shelves after all: nothing to ask or write
    const book = await withTimeout(hc.fetchBookDetail(auth, to.bookId), 20_000, 'book details');
    const editions = toEditions(book);
    if (!to.editionId && !editions.some(e => !e.audio && e.pages > 0)) return null; // also for a library entry: load() would only reopen the search
    if (!item) {
      const by = authorsOf(book).slice(0, 2).join(', '); // the rest are mostly translators
      if (await dialog(`"${book.title}"${by ? ` by ${by}` : ''} is not in your Hardcover library. Add it as Want to Read and mark your copy as owned?`, 'No', 'Yes', false)) {
        if (!to.editionId) return {pick: {bookId: to.bookId, editions}};
        return (await addToLibrary(path, m, {bookId: to.bookId, editionId: to.editionId})) ?? stub(to);
      }
    }
    m.linked = to;
    await meta.save(path, m);
    return withEdition(item ?? stub(to), m.edition)!;
  }

  // A linked file, or a book that the library match did not find: the saved link, else the whole catalogue (catalogueBook), else the book
  // search on the page. Only from a button press: a touch never opens a dialog.
  async function linkFromCatalogue(path: string): Promise<ReadingItem | Ask> {
    const m = await meta.get(path);
    // The entry is asked for each time: the linked book may have been added since (here or on hardcover.app).
    if (m.linked) return withEdition((await entryFor(m.linked.bookId)) ?? stub(m.linked), m.edition)!;
    const found = await withTimeout(
      catalogueBook({meta: m, editionsForIsbns: i => hc.editionsForIsbns(auth, i), searchBooks: t => hc.searchBooks(auth, t)}),
      20_000,
      'catalogue search',
    );
    return (found && (await link(path, found))) ?? {search: searchText(m)};
  }

  return {drop, list, cached: () => reading.list, resolvePath, addToLibrary, link, linkFromCatalogue};
}
export type Library = ReturnType<typeof createLibrary>;

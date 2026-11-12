import type {OAuthSession} from '@hardcover/sdk/oauth';
import {catalogueBook, resolveBook} from '../core/resolve';
import type {FileMeta} from '../core/store';
import type {ReadingItem} from '../core/types';
import {withTimeout} from '../core/util';
import type * as client from '../hardcover/client';
import {withEdition} from './detail';
import type {Meta} from './meta';

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
  | 'fetchUserBooks'
  | 'saveJournal'
  | 'saveProgress'
  | 'saveReview'
  | 'searchBooks'
  | 'setStatus'
  | 'updateJournal'
>;
export type Dialog = (tip: string, left: string, right: string, ok: boolean) => Promise<unknown>;

const READING_TTL_MS = 600_000;

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

  // The library entry for a catalogue book, from a freshly fetched list: a failed match (missing author, ambiguous title) or
  // the cached list can hide an entry that exists, and an existing entry must never be written to here.
  async function entryFor(bookId: number) {
    drop();
    return (await list()).find(r => r.bookId === bookId) ?? null;
  }

  // Having the EPUB means owning the book: add the catalogue book `link` to the library (Want to Read) with its edition
  // marked as owned, and return its library item. The edition (when it has pages) is saved for this file, so tracking
  // has a page count without a manual edition change.
  async function addToLibrary(path: string, m: FileMeta, link: {bookId: number; editionId?: number}) {
    let item = await entryFor(link.bookId);
    if (!item) {
      const ed = await withTimeout(hc.addOwned(auth, link.bookId, link.editionId), 20_000, 'add to library');
      if (ed.pages && !m.edition) m.edition = {id: ed.id, pages: ed.pages};
      item = await entryFor(link.bookId);
    }
    delete m.linked;
    await meta.save(path, m);
    return withEdition(item, m.edition);
  }

  // A book that is in no library list: find it in the whole catalogue (like KOReader's link) and remember the link per file
  // as `linked` in the metadata cache. The first time, ask whether to add it; on No the page still works for the linked
  // book, without tracking and status (they need a library entry, see CLAUDE.md). Only from a button press: a touch never
  // opens a dialog. Returns the new library item, a stub for the linked book (userBookId 0 = no library entry), or null.
  async function linkFromCatalogue(path: string): Promise<ReadingItem | null> {
    const m = await meta.get(path);
    if (m.failed) return null;
    let link = m.linked;
    if (!link) {
      const found = await withTimeout(
        catalogueBook({meta: m, editionsForIsbns: i => hc.editionsForIsbns(auth, i), searchBooks: t => hc.searchBooks(auth, t)}),
        20_000,
        'catalogue search',
      );
      if (!found) return null;
      link = found;
      const existing = await entryFor(link.bookId);
      if (existing) return withEdition(existing, m.edition); // it was on the shelves after all: nothing to ask or write
      const book = await withTimeout(hc.fetchBookDetail(auth, link.bookId), 20_000, 'book details');
      const yes = await dialog(`"${book.title}" is not in your Hardcover library. Add it as Want to Read and mark your copy as owned?`, 'No', 'Yes', false);
      if (yes) return addToLibrary(path, m, link);
      m.linked = link;
      await meta.save(path, m);
    }
    return withEdition(
      {userBookId: 0, bookId: link.bookId, statusId: 0, title: '', authors: [], editionId: link.editionId ?? null, editionPages: null, read: null},
      m.edition,
    );
  }

  return {drop, list, cached: () => reading.list, resolvePath, addToLibrary, linkFromCatalogue};
}
export type Library = ReturnType<typeof createLibrary>;

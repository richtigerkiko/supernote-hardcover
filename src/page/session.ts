// The detail page (App.tsx) and the tracking code (src/plugin.ts) run in one JS runtime, so plugin.ts hands the page its
// functions through this object instead of the page importing the SDK or the token. Null until plugin.ts has run;
// `pending` is the reader sample taken when the button was pressed, `selection` the selected text (hardcover-select
// only) and `mode` which page the pressed button opens.
// The view stays mounted after it is closed (measured: "Running" is logged once), so a later press of the button
// does not remount the page: plugin.ts calls opened() on every press and the page reloads its book from it.
import type {BookDetail as PageBook, CatalogueBook, Edition, Entry, JournalItem, Privacy, PublicReview, Review, Sample} from '../core/types';

/** The page must ask before the book can show: `search` opens the book search with this text (no automatic match), `pick` the edition picker for a book the reader said Yes to adding. */
export type Ask = {search: string} | {pick: {bookId: number; editions: Edition[]}};
/** What the page shows after load(): a book, a question (Ask), or a message when there is nothing to show. */
export type LoadResult = {message: string; signIn?: boolean} | {book: PageBook; tracking: boolean; sync: string} | Ask;

/** What plugin.ts hands the page; the page never sees the SDK or the token. */
export interface SessionApi {
  load(): Promise<LoadResult>;
  signIn(onCode: (uri: string, code: string, qr: string) => void): Promise<boolean>;
  setTracking(on: boolean): Promise<string>; // the new sync line
  setEdition(editionId: string): Promise<void>;
  passage(): Promise<string>;
  saveJournal(entry: Entry): Promise<void>;
  setStatus(label: string): Promise<string>; // the new sync line
  /** Adds the loaded page's linked book with the file's edition, or (after an Ask) the given book with the picked edition. Reload after. */
  addToLibrary(pick?: {bookId: number; editionId: string}): Promise<void>;
  /** Catalogue hits for the book search. */
  searchBooks(query: string): Promise<CatalogueBook[]>;
  /** The reader chose this hit: asks to add it. Resolves with the edition picker to show, or null when done (reload). */
  pickBook(bookId: number): Promise<Ask | null>;
  /** The review to start from (what the entry holds). false: the stored sign-in lacked write:reviews and was dropped, so reload to sign in again. Rejects with a message when the book is not in the library. */
  writeReview(): Promise<Review | false>;
  saveReview(review: Review): Promise<void>;
  loadReviews(offset: number): Promise<{reviews: PublicReview[]; hasMore: boolean}>;
  /** This book's notes and quotes, newest first, 100 at a time. */
  loadJournal(offset: number): Promise<{entries: JournalItem[]; hasMore: boolean}>;
  /** Saves the new thoughts (quote) or text (note) and privacy; resolves with the whole new entry text. */
  editJournal(item: JournalItem, text: string, privacy: Privacy): Promise<string>;
  removeJournal(id: number): Promise<void>;
}

export interface Session {
  api: SessionApi | null;
  pending: Promise<Sample | null> | null;
  selection: Promise<string> | null;
  mode: 'detail' | 'journal';
  opened: () => void;
  onOpen: (f: () => void) => () => void;
  /** Host facts the page needs; plugin.ts replaces them, so src/ui never imports the SDK. */
  isFakeSdk: () => Promise<boolean>;
  deviceType: () => Promise<number>; // SDK getDeviceType: 0 A5, 1 A6, 2 A6X, 3 A5X, 4 Nomad, 5 Manta
  close: () => void;
}

const listeners = new Set<() => void>();
export const session: Session = {
  api: null,
  pending: null,
  selection: null,
  mode: 'detail',
  opened: () => listeners.forEach(f => f()),
  onOpen: f => {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  isFakeSdk: async () => false,
  deviceType: async () => -1,
  close: () => {},
};

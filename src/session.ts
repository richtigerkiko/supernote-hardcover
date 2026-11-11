// The detail page (App.tsx) and the tracking code (src/plugin.ts) run in one JS runtime, so plugin.ts hands the page its
// functions through this object instead of the page importing the SDK or the token. Null until plugin.ts has run;
// `pending` is the reader sample taken when the button was pressed, `selection` the selected text (hardcover-select
// only) and `mode` which page the pressed button opens.
// The view stays mounted after it is closed (measured: "Running" is logged once), so a later press of the button
// does not remount the page: plugin.ts calls opened() on every press and the page reloads its book from it.
import type {BookDetail as PageBook} from './ui/DetailPage';
import type {Entry} from './ui/JournalPage';
import type {Review} from './hardcover';

/** One reader sample: the open file, its 0-based page and the total pages. */
export interface Sample {
  path: string;
  page: number;
  total: number;
}

/** What the page shows after load(): a book, or a message when there is nothing to show. */
export type LoadResult = {message: string; signIn?: boolean} | {book: PageBook; tracking: boolean; sync: string};

/** What plugin.ts hands the page; the page never sees the SDK or the token. */
export interface SessionApi {
  load(): Promise<LoadResult>;
  signIn(onCode: (uri: string, code: string, qr: string) => void): Promise<boolean>;
  setTracking(on: boolean): Promise<void>;
  setEdition(editionId: string): Promise<void>;
  passage(): Promise<string>;
  saveJournal(entry: Entry): Promise<void>;
  setStatus(label: string): Promise<void>;
  addToLibrary(): Promise<void>;
  writeReview(): Promise<void>;
  loadReviews(offset: number): Promise<{reviews: Review[]; hasMore: boolean}>;
}

interface Session {
  api: SessionApi | null;
  pending: Promise<Sample | null> | null;
  selection: Promise<string> | null;
  mode: 'detail' | 'journal';
  opened: () => void;
  onOpen: (f: () => void) => () => void;
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
};

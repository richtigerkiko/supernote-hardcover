// The shapes shared by the page (src/ui), the plugin's logic (src/page) and the Hardcover client. Imports nothing.

/** One reader sample: the open file, its 0-based page and the total pages. */
export interface Sample {
  path: string;
  page: number;
  total: number;
}

// The newest read of a library entry, in the wire spelling the tracker and detail page already use.
export interface ReadRecord {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  progress_pages: number | null;
  edition_id: number | null;
}

// A book on the reader's shelves, flattened to what matching and saving need.
export interface ReadingItem {
  userBookId: number;
  bookId: number;
  statusId: number;
  title: string;
  authors: string[];
  editionId: number | null;
  editionPages: number | null;
  read: ReadRecord | null;
}

export interface CatalogueBook {
  bookId: number;
  title: string;
  authors: string[];
}

export interface PublicReview {
  id: number;
  user: string;
  supporter: boolean;
  rating: number | null; // 0.5 steps
  text: string;
  spoiler: boolean;
  date: string; // YYYY-MM-DD
}

// The labels of the status list on the detail page (src/page/detail.ts maps them to Hardcover's status ids).
export const STATUSES = ['Want to read', 'Currently reading', 'Paused', 'Did not finish', 'Finished'] as const;

export type Edition = {
  id: string;
  format: string;
  publisher: string;
  year?: number | null;
  pages: number;
  lang: string;
  isbn?: string;
  audio?: boolean;
};

export type BookDetail = {
  title: string;
  subtitle?: string | null;
  authors: string[];
  cover?: string | null;
  rating?: number | null; // 0-5
  ratingsCount?: number;
  inLibrary?: boolean; // false: not on the reader's shelves, so no status and no tracking, only an Add to library button
  status: string; // one of STATUSES
  progress: number; // reading position, 0-1 of the book; the page shown follows the chosen edition
  genres: string[];
  moods: string[];
  tags: string[];
  description?: string | null;
  editions: Edition[];
  editionId: string; // the chosen edition
  editionSaved: boolean; // false: our best guess, not confirmed by the reader
  editionIsbn?: boolean; // the file's own ISBN names this edition
};

export type Privacy = 1 | 2 | 3;
export type Entry = {event: 'quote' | 'note'; passage: string; text: string; privacy: Privacy};

export type Review = {markdown: string; hasSpoilers: boolean; sponsored: boolean; notes: string; rating?: number};
export const BLANK_REVIEW: Review = {markdown: '', hasSpoilers: false, sponsored: false, notes: ''};

/** File and internet permissions (src/device/permissions.ts). */
export interface Grants {
  /** Asks the reader when needed; for button presses only. Throws when not granted. */
  need(): Promise<void>;
  /** Only checks, never asks, so a touch can never open a dialog. */
  granted(): Promise<boolean>;
  needGranted(): Promise<void>;
  /** The grant may be gone: the next check asks again. */
  revoke(): void;
}

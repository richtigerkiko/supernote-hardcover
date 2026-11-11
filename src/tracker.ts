import {toPages} from './match';
import type {ReadingItem} from './hardcover';
import type {Sample} from './session';

const PUSH_INTERVAL_MS = 10_000; // at most one push per book in this window; a page turned inside it goes out at the first touch after
const RECHECK_MS = 600_000; // look a book up again after this (you may have added it to Hardcover, or its reading entry changed)
const RETRY_MS = 60_000;
const RATE_LIMIT_RETRY_MS = 300_000;
const BUSY_EXPIRY_MS = 60_000;

// Decides when reading progress goes to Hardcover. Rules (agreed with the user, same idea as the KOReader plugin's
// percentage mode):
//  - never push on first sight of a book (opening at page 12 must not overwrite real progress)
//  - push whenever your page on the edition changes (computed from (page + 1) / total, so a font size or orientation
//    change, which reflows the book, does not count as a page turn), and send your CURRENT page
//  - both directions: going back pushes too, so progress follows you
//  - throttle: at most one push per PUSH_INTERVAL_MS per book (checked against timestamps at touch time, as no timer
//    runs in some lifecycle states); the latest page stays pending and goes out at the first touch after the window
//  - a book Hardcover cannot match (not on any of your shelves) is never pushed
// resolve(path) -> reading item | null; push(item, pages) -> Promise; both are injected.
// tick(sample) takes {path, page (0-based), total} or null when the reader gave nothing usable (a note, the screen
// asleep). It is called at touches (no timers run in some lifecycle states); a null sample still retries a failed push.
// A failure carries the HTTP status (SDK errors do) and, once it happened, the file it happened for.
export type TrackerError = Error & {status?: number; path?: string};

interface Tracked {
  item: ReadingItem | null;
  pages: number | null; // edition page last pushed, or first seen
  total: number; // reader pages at the last touch
  pending: number | null; // edition page waiting to be pushed
  retryAt: number;
  checkedAt: number;
}

export interface TrackerDeps {
  resolve: (path: string) => Promise<ReadingItem | null>;
  push: (item: ReadingItem, pages: number) => Promise<void>;
  now?: () => number;
}

export function createTracker({resolve, push, now = Date.now}: TrackerDeps) {
  const books = new Map<string, Tracked>();
  const state: {lastError: TrackerError | null; lastPush: {path: string; title: string; pages: number; at: number} | null} = {
    lastError: null,
    lastPush: null,
  };
  let busyAt = 0; // wall-clock start of the running tick, 0 when idle

  async function observe({path, page, total}: Sample): Promise<void> {
    if (!(total > 0) || !(page >= 0)) return;
    let b = books.get(path);
    if (b && now() - b.checkedAt >= RECHECK_MS) {
      b.checkedAt = now(); // also when resolve throws (offline), so it is not retried on every touch; the old item stays
      const was = b.item;
      b.item = await resolve(path);
      if (was?.editionPages !== b.item?.editionPages) {
        b.pages = toPages(page, total, b.item?.editionPages ?? null); // newly matched or a new edition: the old pages are in other units, so rebase
        b.pending = null;
      }
      if (!b.item) b.pending = null; // it left the list: nothing to push
    }
    if (!b) {
      const item = await resolve(path);
      books.set(path, {item, pages: toPages(page, total, item?.editionPages ?? null), total, pending: null, retryAt: 0, checkedAt: now()});
      return;
    }
    if (!b.item) return;
    const pages = toPages(page, total, b.item.editionPages);
    if (pages === null) {
      b.pending = null;
      state.lastError = Object.assign(new Error(`no page count for ${b.item.title}`), {path});
      return;
    }
    if (total !== b.total) {
      // The book reflowed (font, orientation): rounding can move the edition page by one at the same place, which is
      // not a page turn. Rebase the baseline; a page already waiting to be pushed stays.
      b.total = total;
      b.pages = pages;
      return;
    }
    b.pending = pages === b.pages ? null : pages; // still (or back) on the page that was last sent
  }

  async function sweep(): Promise<void> {
    for (const [path, b] of books) {
      const p = b.pending;
      if (p === null || now() < b.retryAt) continue;
      const item = b.item; // a re-check can null b.item while a slow push is still hanging
      if (!item) continue;
      try {
        await push(item, p);
        b.pages = p;
        b.pending = null;
        b.retryAt = now() + PUSH_INTERVAL_MS;
        state.lastPush = {path, title: item.title, pages: p, at: now()};
        state.lastError = null;
      } catch (err) {
        const e = err as TrackerError;
        b.retryAt = now() + (e.status === 429 ? RATE_LIMIT_RETRY_MS : RETRY_MS);
        state.lastError = e;
        e.path = path; // lets the page show the error only for this file
      }
    }
  }

  return {
    state,
    // After a sign-in: the cached items hold the previous account's ids (userBookId, read id), so every book resolves
    // again at its next touch (no push on first sight) and an error from the old credentials is gone.
    reset() {
      books.clear();
      state.lastError = null;
    },
    forget: (path: string) => books.delete(path), // the next touch re-reads the book (its edition changed); no push on first sight
    async tick(sample: Sample | null): Promise<void> {
      // No timers run in some lifecycle states, so a hung call (network, SDK) is detected by wall clock: after
      // BUSY_EXPIRY_MS a new tick goes ahead instead of waiting forever for the old one.
      if (busyAt && now() - busyAt < BUSY_EXPIRY_MS) return;
      const mine = (busyAt = now());
      try {
        if (sample) {
          try {
            await observe(sample);
          } catch (err) {
            const e = err as TrackerError;
            state.lastError = e;
            e.path = sample.path;
          }
        }
        await sweep();
      } finally {
        if (busyAt === mine) busyAt = 0;
      }
    },
  };
}

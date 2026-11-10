import {toPages} from './match';
import type {ReadingItem} from './hardcover';
import type {Sample} from './session';

export const STEP_PERCENT = 2; // progress is sent each time you cross a multiple of this many percent of the book
const RECHECK_MS = 600_000; // look a book up again after this (you may have added it to Hardcover, or its reading entry changed)
const RETRY_MS = 60_000;
const RATE_LIMIT_RETRY_MS = 300_000;
const BUSY_EXPIRY_MS = 60_000;

// Decides when reading progress goes to Hardcover. Rules (agreed with the user, same idea as the KOReader plugin's
// percentage mode):
//  - never push on first sight of a book (opening at page 12 must not overwrite real progress)
//  - push when you cross a STEP_PERCENT step (the position is (page + 1) / total, so it does not change with the font
//    size or orientation, which reflow the book), and send your CURRENT page on the edition, not the step boundary
//  - both directions: going back across a step pushes too, so progress follows you
//  - no timers, no dwell, no interval: a few pages inside one step never push, so accidental turns are harmless
//  - a book Hardcover cannot match (not on any of your shelves) is never pushed
// resolve(path) -> reading item | null; push(item, pages) -> Promise; both are injected.
// tick(sample) takes {path, page (0-based), total} or null when the reader gave nothing usable (a note, the screen
// asleep). It is called at touches (no timers run in some lifecycle states); a null sample still retries a failed push.
export const stepOf = (page: number, total: number): number => Math.floor((Math.min(page + 1, total) * (100 / STEP_PERCENT)) / total);

// A failure carries the HTTP status (SDK errors do) and, once it happened, the file it happened for.
export type TrackerError = Error & {status?: number; path?: string};

interface Tracked {
  item: ReadingItem | null;
  step: number; // last pushed, or first seen
  pending: {pages: number; step: number} | null;
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
    const step = stepOf(page, total);
    let b = books.get(path);
    if (b && now() - b.checkedAt >= RECHECK_MS) {
      b.checkedAt = now(); // also when resolve throws (offline), so it is not retried on every touch; the old item stays
      const was = b.item;
      b.item = await resolve(path);
      if (!was) b.step = step; // a matched book keeps its step and pending push
      if (!b.item) b.pending = null; // it left the list: nothing to push
    }
    if (!b) {
      books.set(path, {item: await resolve(path), step, pending: null, retryAt: 0, checkedAt: now()});
      return;
    }
    if (!b.item) return;
    if (step === b.step) {
      b.pending = null; // still (or back) in the step that was last sent
      return;
    }
    const pages = toPages(page, total, b.item.editionPages);
    if (pages === null) {
      b.pending = null;
      state.lastError = Object.assign(new Error(`no page count for ${b.item.title}`), {path});
      return;
    }
    b.pending = {pages, step};
  }

  async function sweep(): Promise<void> {
    for (const [path, b] of books) {
      const p = b.pending;
      if (!p || now() < b.retryAt) continue;
      const item = b.item; // a re-check can null b.item while a slow push is still hanging
      if (!item) continue;
      try {
        await push(item, p.pages);
        b.step = p.step;
        b.pending = null;
        state.lastPush = {path, title: item.title, pages: p.pages, at: now()};
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

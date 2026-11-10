import {toPages} from './match';

export const STEP_PERCENT = 2; // progress is sent each time you cross a multiple of this many percent of the book
const NEGATIVE_TTL_MS = 600_000; // re-check an unidentified book after this (you may have added it to Hardcover)
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
//  - a book Hardcover cannot match (not Currently Reading) is never pushed
// resolve(path) -> reading item | null; push(item, pages) -> Promise; both are injected.
// tick(sample) takes {path, page (0-based), total} or null when the reader gave nothing usable (a note, the screen
// asleep). It is called at touches (no timers run in some lifecycle states); a null sample still retries a failed push.
export const stepOf = (page, total) => Math.floor((Math.min(page + 1, total) / total) * (100 / STEP_PERCENT));

export function createTracker({resolve, push, now = Date.now}) {
  const books = new Map(); // path -> {item, step (last pushed or first seen), pending: {pages, step}|null, retryAt, checkedAt}
  const state = {lastError: null, lastPush: null};
  let busyAt = 0; // wall-clock start of the running tick, 0 when idle

  async function observe({path, page, total}) {
    if (!(total > 0) || !(page >= 0)) return;
    const step = stepOf(page, total);
    let b = books.get(path);
    if (b && !b.item && now() - b.checkedAt >= NEGATIVE_TTL_MS) {
      b.item = await resolve(path);
      b.checkedAt = now();
      b.step = step;
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
      state.lastError = new Error(`no page count for ${b.item.title}`);
      return;
    }
    b.pending = {pages, step};
  }

  async function sweep() {
    for (const b of books.values()) {
      const p = b.pending;
      if (!p || now() < b.retryAt) continue;
      try {
        await push(b.item, p.pages);
        b.step = p.step;
        b.pending = null;
        state.lastPush = {title: b.item.title, pages: p.pages, at: now()};
        state.lastError = null;
      } catch (e) {
        b.retryAt = now() + (/429/.test(e.message) ? RATE_LIMIT_RETRY_MS : RETRY_MS);
        state.lastError = e;
      }
    }
  }

  return {
    state,
    forget: path => books.delete(path), // the next touch re-reads the book (its edition changed); no push on first sight
    async tick(sample) {
      // No timers run in some lifecycle states, so a hung call (network, SDK) is detected by wall clock: after
      // BUSY_EXPIRY_MS a new tick goes ahead instead of waiting forever for the old one.
      if (busyAt && now() - busyAt < BUSY_EXPIRY_MS) return;
      const mine = (busyAt = now());
      try {
        if (sample) {
          try {
            await observe(sample);
          } catch (e) {
            state.lastError = e;
          }
        }
        await sweep();
      } finally {
        if (busyAt === mine) busyAt = 0;
      }
    },
  };
}

import {SignedOutError, type OAuthSession} from '@hardcover/sdk/oauth';
import {createTracker} from '../core/tracker';
import type {Grants, Sample} from '../core/types';
import {log} from '../core/util';
import type {Client, Dialog, Library} from './library';
import type {Meta} from './meta';

const HUNG_MS = 10_000;

// Tracking: per document, OFF by default (the page's toggle turns it on for the open book), driven by touches.
// Device facts this relies on (measured on the Nomad, see CLAUDE.md): touch events and SDK calls work in every lifecycle
// state, timers only in state 2, so everything that must happen later is decided from timestamps at the next touch
// (see src/core/tracker.ts). SDK calls can hang (not reject) when no document is in front, so a hung sample is detected
// by wall clock. `enabled` false (gesture debugging) keeps tracking off, so test page flipping never reaches Hardcover.
export function createTracking(d: {
  auth: OAuthSession;
  hc: Client;
  meta: Meta;
  library: Library;
  grants: Grants;
  dialog: Dialog;
  sample: () => Promise<Sample | null>;
  enabled: boolean;
}) {
  let ok = d.enabled; // false after the sign-in was lost: tracking stops until the page signs in again
  let sampling = 0; // wall-clock start of the running touch handler, 0 when idle

  const tracker = createTracker({
    // The ids saved when tracking was switched on: no network, no library list.
    resolve: async path => {
      const m = await d.meta.get(path);
      if (m.book && m.edition) {
        return {...m.book, statusId: 0, authors: [], editionId: m.edition.id, editionPages: m.edition.pages, read: null};
      }
      // Tracking was switched on before the ids were saved: look the book up once and save them.
      await d.grants.needGranted();
      const item = await d.library.resolvePath(path);
      if (item) await d.meta.save(path, {...m, book: {bookId: item.bookId, userBookId: item.userBookId, title: item.title}, edition: m.edition ?? (item.editionId && item.editionPages ? {id: item.editionId, pages: item.editionPages} : undefined)});
      return item;
    },
    // One user_books row per push, for the current read (a finished one is not touched, see saveProgress).
    push: async (item, pages) => {
      await d.grants.needGranted();
      log('push', item.title, pages);
      try {
        const fresh = await d.hc.fetchUserBook(d.auth, item.userBookId);
        if (!fresh) throw new Error('the book is no longer in your library');
        const read = fresh.read && {...fresh.read, edition_id: item.editionId}; // the file's edition, not the entry's
        await d.hc.saveProgress(d.auth, {...item, read}, pages);
      } catch (e) {
        d.grants.revoke(); // maybe the grant is gone: the next touch asks hasPermission again
        throw e;
      }
    },
  });

  // A lost sign-in (or a 401 the refresh could not fix) will not mend itself: stop instead of retrying on every touch, and
  // tell the reader once (works from a touch handler too). OAuthSession.signOut() does not call onSignedOut, only a lost sign-in does.
  function signInLost() {
    if (!ok) return;
    ok = false;
    log('signed out: tracking stopped');
    d.dialog('Your Hardcover sign-in has expired, so tracking is off. Press the Hardcover button to sign in again.', 'Close', 'OK', false).catch(() => {});
  }
  function stopIfTokenRejected() {
    const e = tracker.state.lastError;
    if (e?.status === 401 || e instanceof SignedOutError) signInLost();
  }

  function onTouch() {
    if (!ok) return;
    const t = Date.now();
    if (sampling && t - sampling < HUNG_MS) return; // one at a time; a call hung longer than HUNG_MS is abandoned
    sampling = t;
    d.meta
      .anyTracked()
      .then(async any => {
        // No book has tracking on and nothing waits for a retry: no SDK call at all.
        if (!any && !tracker.hasPending()) return;
        const s = (await d.grants.granted()) ? await d.sample().catch(() => null) : null;
        log('touch', s ? `${s.page}/${s.total}` : 'no sample'); // one line per finger-down, visible in logcat only
        // A book that tracking is not switched on for is ignored (null still lets a failed push of another book retry).
        const on = s && (await d.meta.get(s.path)).tracking === true;
        await tracker.tick(on ? s : null);
        stopIfTokenRejected();
      })
      .catch(e => {
        d.grants.revoke();
        log('touch error', String(e));
      })
      .finally(() => {
        if (sampling === t) sampling = 0;
      });
  }

  // One line for the page: why tracking is not working, or the last push. lastPush and lastError are shared by all
  // books, so they show only for the file that is open.
  const syncNote = (path: string): string => {
    if (!ok) return 'Signed out, tracking stopped';
    const {lastError: e, lastPush: p} = tracker.state;
    if (e?.path === path) return e.message;
    return p?.path === path ? `Last sync: page ${p.pages}` : '';
  };

  return {
    tracker,
    onTouch,
    syncNote,
    stop: signInLost,
    /** After a sign-in: tracking runs again, from a clean state. */
    resume: () => {
      ok = d.enabled;
      tracker.reset();
    },
  };
}
export type Tracking = ReturnType<typeof createTracking>;

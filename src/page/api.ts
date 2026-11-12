import type {OAuthSession} from '@hardcover/sdk/oauth';
import {isbnsIn} from '../core/match';
import {journalEntry, journalPosition} from '../core/journal';
import type {BookDetail, Grants, ReadingItem, Sample} from '../core/types';
import {log, withTimeout} from '../core/util';
import {hasScope, SCOPES} from '../hardcover/auth';
import {buildDetail, STATUS_ID} from './detail';
import type {Client, Dialog, Library} from './library';
import type {Meta} from './meta';
import type {Session, SessionApi} from './session';
import type {Tracking} from './tracking';

export interface ApiDeps {
  auth: OAuthSession;
  hc: Client;
  meta: Meta;
  library: Library;
  tracking: Tracking;
  grants: Grants;
  dialog: Dialog;
  session: Session;
  sample: () => Promise<Sample | null>; // the reader state, with a timeout
}

// The functions the page calls (through src/page/session.ts, same JS runtime as the page).
export function createApi({auth, hc, meta, library, tracking, grants, dialog, session, sample}: ApiDeps): SessionApi {
  let current: {path: string; item: ReadingItem; detail: BookDetail; sample: Sample; editionId: string} | null = null; // the book the page was opened on
  let signInAbort: AbortController | null = null; // the sign-in that is waiting for its approval, if any
  let askedScopes = false; // the missing-scopes dialog in load() was shown (not again until a restart, so a scope the server never grants cannot loop)
  let loadSeq = 0; // a slow load must not overwrite `current` after a newer one

  const needBook = () => {
    if (!current) throw new Error('no book loaded');
    return current;
  };
  const needLibraryBook = () => {
    const c = needBook();
    if (!c.item.userBookId) throw new Error('add the book to your library first');
    return c;
  };

  // True when the stored sign-in has the scope; otherwise asks, signs out on yes and returns false (sign-ins stored before a scope was added lack it).
  const ensureScope = async (scope: string, what: string): Promise<boolean> => {
    if (hasScope((await auth.tokens())?.scope, scope)) return true;
    if (!(await dialog(what + ' needs a new sign-in with more access. Sign in again now?', 'Cancel', 'Sign in', false))) throw new Error(what + ' need a new sign-in.');
    await auth.signOut();
    return false;
  };

  return {
    // -> {book} for DetailPage, or {message} when there is nothing to show
    async load() {
      signInAbort?.abort(); // a reload (the button pressed again) drops a waiting sign-in: its code is no longer on screen
      const mine = ++loadSeq;
      // Checked before the sample is taken: the pending sample (and, in App, the selection) stays for the reload after the sign-in.
      if (!(await auth.isSignedIn())) return {message: 'Sign in to Hardcover to sync your reading.', signIn: true};
      // A version that asks for more scopes than the stored sign-in has: offer the new sign-in once per session (cancel keeps going).
      const granted = (await auth.tokens())?.scope;
      if (!askedScopes && SCOPES.some(sc => !hasScope(granted, sc))) {
        askedScopes = true;
        if (await dialog('This version needs a new sign-in with more access. Sign in again now?', 'Later', 'Sign in', false)) {
          await auth.signOut();
          return {message: 'Sign in to Hardcover to sync your reading.', signIn: true};
        }
      }
      const s = await (session.pending ?? sample());
      session.pending = null;
      if (!s) return {message: 'Open an EPUB in a document to see its Hardcover page.'};
      meta.retry(s.path);
      await grants.need();
      const found = await withTimeout(library.resolvePath(s.path), 20_000, 'book lookup');
      const m = await meta.get(s.path);
      if (m.failed) return {message: "Could not read this EPUB's title and author."};
      const item = found ?? (await library.linkFromCatalogue(s.path));
      if (!item) return {message: 'This book is not in your Hardcover library.'};
      // resolvePath applied the saved edition to item, so the reading entry's own edition comes from the cached list
      const entry = library.cached().find(r => r.userBookId === item.userBookId);
      const editionIds = [...new Set([entry?.editionId, m.edition?.id].filter((id): id is number => !!id))];
      const book = await withTimeout(hc.fetchBookDetail(auth, item.bookId, editionIds), 20_000, 'book details');
      const detail = buildDetail({book, item, saved: m.edition, sample: s, isbns: isbnsIn((m.ids ?? []).join(' '))});
      if (!detail.editions.some(e => e.pages > 0)) return {message: 'Hardcover has no edition with a page count for this book.'};
      if (mine === loadSeq) current = {path: s.path, item, detail, sample: s, editionId: detail.editionId};
      if (!detail.inLibrary) return {book: detail, tracking: false, sync: 'Not in your library: tracking and status are off.'};
      return {book: detail, tracking: m.tracking === true, sync: tracking.syncNote(s.path)};
    },
    // Device grant (RFC 8628): onCode shows the page where to type the code. Resolves true once the account approved it,
    // false when the attempt was cancelled (see signInAbort).
    async signIn(onCode) {
      await grants.need();
      signInAbort?.abort();
      const mine = (signInAbort = new AbortController());
      try {
        await auth.signInWithDevice({
          scopes: SCOPES,
          signal: mine.signal,
          onCode: d => onCode(d.verificationUri, d.userCode, d.verificationUriComplete ?? d.verificationUri),
        });
      } catch (e) {
        if (mine.signal.aborted) return false;
        throw e;
      } finally {
        if (signInAbort === mine) signInAbort = null;
      }
      library.drop();
      tracking.resume();
      log('signed in');
      return true;
    },
    // The linked book (not in the library) is added now: Want to Read, edition marked as owned. The page reloads after.
    async addToLibrary() {
      const c = current;
      if (!c || c.item.userBookId) return;
      await grants.need();
      const m = await meta.get(c.path);
      await library.addToLibrary(c.path, m, m.linked ?? {bookId: c.item.bookId});
      tracking.tracker.forget(c.path);
    },
    // Tracking is remembered per file like the edition. Turning it on starts from the page the book is at now (nothing is
    // sent for it); turning it off drops anything not yet sent.
    async setTracking(on) {
      const c = needBook();
      const m = await meta.get(c.path);
      m.tracking = on;
      meta.save(c.path, m);
      tracking.tracker.forget(c.path);
      log(on ? 'tracking on for' : 'tracking off for', c.item.title);
    },
    // The edition is remembered per file in the metadata cache and used for the pages we compute from now on.
    async setEdition(editionId) {
      if (!current) return;
      const ed = current.detail.editions.find(e => e.id === editionId);
      if (!ed || !(ed.pages > 0)) return;
      const m = await meta.get(current.path);
      m.edition = {id: Number(ed.id), pages: ed.pages};
      current.editionId = ed.id; // a journal entry saved after this uses the new edition too
      meta.save(current.path, m);
      tracking.tracker.forget(current.path);
    },
    // The selection read when hardcover-select was pressed ('' if none or not opened from that button).
    async passage() {
      const p = session.selection;
      session.selection = null;
      return p ? p.catch(() => '') : '';
    },
    // One reading-journal entry for the book the page was loaded on, at the page the button was pressed on.
    async saveJournal({event, passage, text, privacy}) {
      const c = current;
      const ed = c?.detail.editions.find(e => e.id === c.editionId);
      const entry = journalEntry(event, passage, text);
      if (!c || !entry) throw new Error('Nothing to save.');
      // Without read:journal the entry is posted but its read-back fails, and Retry would post a duplicate: sign in again first.
      if (!(await ensureScope('read:journal', 'Journal entries'))) {
        session.opened(); // reload shows Sign in
        throw new Error('Journal entries need a new sign-in.');
      }
      await grants.need();
      const position = ed ? journalPosition(c.sample.page, c.sample.total, ed.pages) : null;
      await hc.saveJournal(auth, {bookId: c.item.bookId, editionId: ed ? Number(ed.id) : null, event, entry, position: position ?? undefined, privacy});
      log('journal', event, 'saved for', c.item.title);
    },
    async setStatus(label) {
      const c = needLibraryBook(); // a newer load may replace `current` while we wait
      await grants.need();
      await hc.setStatus(auth, c.item.userBookId, STATUS_ID[label as keyof typeof STATUS_ID]);
      library.drop(); // the list is fetched again so the new status shows
      tracking.tracker.forget(c.path);
    },
    // Sign-ins stored before write:reviews was asked for cannot save a review: offer a new sign-in instead of failing at Save.
    async writeReview() {
      const c = needLibraryBook();
      if (await ensureScope('write:reviews', 'Writing reviews')) {
        const r = await hc.fetchReview(auth, c.item.userBookId);
        return {markdown: r.markdown, hasSpoilers: r.hasSpoilers, sponsored: false, notes: r.notes, ...(r.rating ? {rating: r.rating} : {})};
      }
      return false; // signed out to ask for the scope, reload shows Sign in
    },
    async saveReview(r) {
      const c = needLibraryBook();
      await grants.need();
      await hc.saveReview(auth, c.item.userBookId, r);
      log('review saved for', c.item.title);
    },
    async loadReviews(offset) {
      const c = needBook();
      await grants.need();
      return hc.fetchReviews(auth, c.item.bookId, offset);
    },
  };
}

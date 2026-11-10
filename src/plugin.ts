// The plugin's logic: SDK wiring, tracking and the functions the page calls. index.js (the entry point the build
// scripts bundle) only imports this file.

import {AppRegistry, Image, NativeModules} from 'react-native';
import App from '../App';
import {name as appName} from '../app.json';

import {PluginManager, PluginCommAPI, PluginDocAPI, NativeUIUtils} from 'sn-plugin-lib';
import TOKEN from './token.generated'; // written from the workspace .env by scripts/write-token.js
import {parseEpub} from './epub';
import {isbnsIn} from './match';
import {buildDetail, STATUS_ID, withEdition} from './detail';
import {session, type Sample, type SessionApi} from './session';
import {cleanQuote} from './quote';
import {catalogueBook, resolveBook} from './resolve';
import {createJsonFile, createMetaCache, type FileMeta, type NativeFs} from './store';
import {createTracker} from './tracker';
import {journalEntry, journalPosition} from './journal';
import {
  addOwned,
  bookIdsForIsbns,
  editionsForIsbns,
  fetchBookDetail,
  fetchUserBooks,
  saveJournal,
  saveProgress,
  searchBooks,
  setStatus,
  type ReadingItem,
} from './hardcover';
import type {BookDetail as PageBook} from './ui/DetailPage';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// Device facts this relies on (measured on the Nomad, see CLAUDE.md):
//  - Touch events (registerMotionListener) and SDK calls work in EVERY lifecycle state, including before any button
//    press (state 1) and after a view closed (state 3). setTimeout/setInterval only run in state 2.
//  - So tracking is driven by finger-down events, not a timer: it needs no button press and survives a view closing.
//    Everything that must happen later is decided from timestamps at the next touch (see src/tracker.ts).
//  - SDK calls can hang (not reject) when no document is in front, so a hung sample is detected by wall clock.
// Set true to log every touch event with the page seen at that moment (and keep tracking OFF so test page flipping
// never reaches Hardcover). Used to measure the gesture behaviour recorded in CLAUDE.md.
const DEBUG_GESTURES = false;
const READING_TTL_MS = 600_000;
const HUNG_MS = 10_000;
const PERMS: [string, string][] = [
  ['plugin.permission.FILE:READ', 'Read the title of the book you are reading from its file.'],
  ['plugin.permission.INTERNET', 'Send your reading progress to Hardcover.'],
];

// The SDK's calls resolve to a loose Object: {success, result} on success.
type Reply<T> = {success: boolean; result: T} | null | undefined;
const reply = <T>(r: unknown) => r as Reply<T>;

const log = (...a: unknown[]) => console.log('[hardcover]', ...a);
const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);
// The only native code in the plugin (android/app/src/main/java/com/hardcoversync): file read, atomic write, stat.
// null when the native part is missing; everything must keep working without it.
const native: NativeFs | null = NativeModules.HardcoverNative ?? null;
const dialog = (tip: string, left: string, right: string, ok: boolean) => NativeUIUtils.showRattaDialog(tip, left, right, ok);

// ---- permissions: asked once when first needed (already granted after the first run) ----
let permsOk: Promise<boolean> | null = null;
async function permissions(): Promise<boolean> {
  if (!permsOk) {
    permsOk = (async () => {
      for (const [perm, why] of PERMS) {
        if ((await PluginManager.hasPermission(perm)) === 1) continue;
        const r = await PluginManager.requestPermission(perm, why);
        if (r !== 1 && r !== 2) return false;
      }
      return true;
    })().then(ok => {
      if (!ok) permsOk = null; // denied: ask again next time
      return ok;
    });
  }
  return permsOk;
}
const needPermissions = async () => {
  if (!(await permissions())) throw new Error('permission for files and internet not granted');
  grantedFlag = true;
};
// For touch handlers: only checks, never asks, so a touch can never open a dialog. A true result is remembered.
let grantedFlag = false;
async function granted() {
  if (grantedFlag) return true;
  for (const [perm] of PERMS) if ((await PluginManager.hasPermission(perm)) !== 1) return false;
  return (grantedFlag = true);
}
const needGranted = async () => {
  if (!(await granted())) throw new Error('permissions not granted yet');
};

// ---- EPUB metadata: a few small range reads through fetch -> blob -> slice (the file is never read into JS) ----
const memMeta = new Map<string, FileMeta>(); // path -> metadata in memory (also the whole cache when the native module is missing)

// ---- persistence (native module). Tracking never depends on it: with no module or a failing call, everything below
// quietly falls back to memory. The EPUB metadata cache lives in the plugin's private directory (no permission needed,
// regenerable); a cached entry is valid only while the file keeps its size (see src/store.ts).
let persistentMeta: Promise<ReturnType<typeof createMetaCache>> | null = null;
function persistentMetaCache() {
  persistentMeta = persistentMeta || (async () => {
    let dir: string | null | undefined = null;
    try {
      dir = await PluginManager.getPluginDirPath();
    } catch {
      /* no private dir: memory only */
    }
    return createMetaCache(createJsonFile(native && dir ? native : null, `${dir}/meta-cache.json`), p => native!.stat(p));
  })();
  return persistentMeta;
}
async function metaFor(path: string): Promise<FileMeta> {
  let meta = memMeta.get(path);
  if (meta) return meta;
  const cache = await persistentMetaCache().catch(() => null);
  meta = (cache ? await cache.get(path).catch(() => null) : null) ?? undefined;
  if (meta) log('metadata from the saved cache');
  else {
    try {
      meta = await readMeta(path);
    } catch (e) {
      log('cannot read the EPUB, not trying again on touches', String(e));
      meta = {ids: [], failed: true}; // in memory only, so a restart (or a button press, see load) tries again
      memMeta.set(path, meta);
      return meta;
    }
    if (cache) cache.set(path, meta).catch(() => {});
  }
  memMeta.set(path, meta);
  return meta;
}

async function readMeta(path: string) {
  const blob = await (await fetch('file://' + path)).blob();
  const read = (o: number, l: number) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.onerror = () => reject(new Error('read error'));
      r.readAsArrayBuffer(blob.slice(o, o + l));
    });
  return parseEpub(read, blob.size);
}

// ---- Hardcover: the books in the library (cached) and which item a file is ----
let reading: {at: number; list: ReadingItem[]} = {at: 0, list: []};
let readingGen = 0; // bumped when the list is known stale; a fetch that started before that is not cached
function dropReadingList() {
  readingGen++;
  reading.at = 0;
}
async function readingList() {
  if (Date.now() - reading.at <= READING_TTL_MS) return reading.list;
  const gen = readingGen;
  const list = await fetchUserBooks(TOKEN);
  if (gen === readingGen) reading = {list, at: Date.now()};
  return list;
}
async function resolvePath(path: string) {
  const meta = await metaFor(path);
  const item = await resolveBook({meta, reading: await readingList(), bookIdsForIsbns: isbns => bookIdsForIsbns(TOKEN, isbns)});
  return withEdition(item, meta.edition); // the edition the reader picked for this file, if any
}

const saveMeta = async (path: string, meta: FileMeta) => (await persistentMetaCache().catch(() => null))?.set(path, meta).catch(() => {});

// The library entry for a catalogue book, from a freshly fetched list: a failed match (missing author, ambiguous title) or
// the cached list can hide an entry that exists, and an existing entry must never be written to here.
async function libraryItem(bookId: number) {
  dropReadingList();
  return (await readingList()).find(r => r.bookId === bookId) ?? null;
}

// Having the EPUB means owning the book: add the catalogue book `link` to the library (Want to Read) with its edition
// marked as owned, and return its library item. The edition (when it has pages) is saved for this file, so tracking
// has a page count without a manual edition change.
async function addToLibrary(path: string, meta: FileMeta, link: {bookId: number; editionId?: number}) {
  let item = await libraryItem(link.bookId);
  if (!item) {
    const ed = await withTimeout(addOwned(TOKEN, link.bookId, link.editionId), 20_000, 'add to library');
    if (ed.pages && !meta.edition) meta.edition = {id: ed.id, pages: ed.pages};
    item = await libraryItem(link.bookId);
  }
  delete meta.linked;
  await saveMeta(path, meta);
  return withEdition(item, meta.edition);
}

// A book that is in no library list: find it in the whole catalogue (like KOReader's link) and remember the link per file
// as `linked` in the metadata cache. The first time, ask whether to add it; on No the page still works for the linked
// book, without tracking and status (they need a library entry, see CLAUDE.md). Only from a button press: a touch never
// opens a dialog. Returns the new library item, a stub for the linked book (userBookId 0 = no library entry), or null.
async function linkFromCatalogue(path: string): Promise<ReadingItem | null> {
  const meta = await metaFor(path);
  if (meta.failed) return null;
  let link = meta.linked;
  if (!link) {
    const found = await withTimeout(
      catalogueBook({meta, editionsForIsbns: i => editionsForIsbns(TOKEN, i), searchBooks: t => searchBooks(TOKEN, t)}),
      20_000,
      'catalogue search',
    );
    if (!found) return null;
    link = found;
    const existing = await libraryItem(link.bookId);
    if (existing) return withEdition(existing, meta.edition); // it was on the shelves after all: nothing to ask or write
    const book = await withTimeout(fetchBookDetail(TOKEN, link.bookId), 20_000, 'book details');
    const yes = await dialog(`"${book.title}" is not in your Hardcover library. Add it as Want to Read and mark your copy as owned?`, 'No', 'Yes', false);
    if (yes) return addToLibrary(path, meta, link);
    meta.linked = link;
    await saveMeta(path, meta);
  }
  return withEdition(
    {userBookId: 0, bookId: link.bookId, statusId: 0, title: '', authors: [], editionId: link.editionId ?? null, editionPages: null, read: null},
    meta.edition,
  );
}

const tracker = createTracker({
  resolve: async path => {
    await needGranted();
    return resolvePath(path);
  },
  push: async (item, pages) => {
    await needGranted();
    log('push', item.title, pages);
    const hadRead = !!item.read;
    await saveProgress(TOKEN, item, pages).catch(e => {
      grantedFlag = false; // maybe the grant is gone: the next touch asks hasPermission again
      throw e;
    });
    if (!hadRead) dropReadingList(); // the cached list still says read: null; fetch it again so a forget cannot insert twice
  },
});

// ---- reader state ----
async function sample(): Promise<Sample | null> {
  const p = reply<string>(await PluginCommAPI.getCurrentFilePath());
  const [pgRaw, totRaw] = await Promise.all([PluginCommAPI.getCurrentPageNum(), PluginDocAPI.getCurrentTotalPages()]);
  const pg = reply<number>(pgRaw);
  const tot = reply<number>(totRaw);
  // The path can lag behind what is on screen (skill: it may be the last file the plugin touched) and the three
  // calls are separate, so a book switch in between could pair one book's path with another's page. Read the path
  // again and drop the sample if it moved; a wrong pair would push a wrong public progress entry.
  const again = reply<string>(await PluginCommAPI.getCurrentFilePath());
  // a note, no document in front, or the screen asleep: the total (a DOC call) fails
  if (!p?.success || !pg?.success || !tot?.success || !again?.success || again.result !== p.result) return null;
  if (!/\.epub$/i.test(p.result)) return null;
  return {path: p.result, page: pg.result, total: tot.result};
}
// A button press runs in state 2 where timers work; touch handlers may not, so this one has no setTimeout.
const safeSample = () => withTimeout(sample(), 8_000, 'reader state').catch(() => null);

// ---- tracking: per document, OFF by default (the page's toggle turns it on for the open book), driven by touches ----
let tokenOk = !DEBUG_GESTURES; // a rejected token (401) stops all tracking until the plugin restarts
let sampling = 0; // wall-clock start of the running touch handler, 0 when idle

function onTouch() {
  if (!tokenOk) return;
  const t = Date.now();
  if (sampling && t - sampling < HUNG_MS) return; // one at a time; a call hung longer than HUNG_MS is abandoned
  sampling = t;
  granted()
    .then(ok => (ok ? sample().catch(() => null) : null))
    .then(async s => {
      log('touch', s ? `${s.page}/${s.total}` : 'no sample'); // one line per finger-down, visible in logcat only
      // A book that tracking is not switched on for is ignored (null still lets a failed push of another book retry).
      const on = s && (await metaFor(s.path)).tracking === true;
      return tracker.tick(on ? s : null);
    })
    .then(stopIfTokenRejected)
    .catch(e => {
      grantedFlag = false; // maybe the grant is gone: the next touch asks hasPermission again
      log('touch error', String(e));
    })
    .finally(() => {
      if (sampling === t) sampling = 0;
    });
}
// Measured for tap, finger swipe and two-finger swipe: every gesture starts with one finger-down (action 0) and ends
// with a plain up (action 1), and the reader flips the page a few ms to ~1 s AFTER the up. A read at the up is often
// the old page, a read at the NEXT finger-down is always the new one, so react to finger-down. Pen strokes are not
// page turns and are ignored.
PluginManager.registerMotionListener(1, {
  onMsg(m) {
    if (DEBUG_GESTURES && m && m.action !== 2) {
      // 0 down, 1 up, 3 cancel, 5/6 extra pointer down/up; moves (2) are left out
      log('ev', 'a=' + m.action, 'tool=' + m.toolType, 'pc=' + m.pointerCount, 'x=' + Math.round(m.x), 'y=' + Math.round(m.y));
      sample().then(s => log('  page now', s ? s.page : 'none')).catch(() => log('  page now err'));
    }
    if (m?.action === 0 && m?.toolType === 1) onTouch();
  },
});

// A rejected token will not fix itself: stop instead of retrying on every touch.
function stopIfTokenRejected() {
  if (tokenOk && tracker.state.lastError?.status === 401) {
    tokenOk = false;
    log('token rejected: tracking stopped');
  }
}

// ---- the detail page: App.tsx calls these through src/session.ts (same JS runtime) ----
let current: {path: string; item: ReadingItem; detail: PageBook; sample: Sample; editionId: string} | null = null; // the book the page was opened on
// One line for the page: why tracking is not working, or the last push. lastPush and lastError are shared by all books,
// so they show only for the file that is open.
const syncNote = (path: string): string => {
  if (!tokenOk) return 'Token rejected, tracking stopped';
  const {lastError: e, lastPush: p} = tracker.state;
  if (e?.path === path) return e.message;
  return p?.path === path ? `Last sync: page ${p.pages}` : '';
};
let loadSeq = 0; // a slow load must not overwrite `current` after a newer one
const dialogOk = (tip: string) => dialog(tip, 'OK', 'Close', false).catch(() => {});
const api: SessionApi = {
  // -> {book} for DetailPage, or {message} when there is nothing to show
  async load() {
    const mine = ++loadSeq;
    const s = await (session.pending ?? safeSample());
    session.pending = null;
    if (!s) return {message: 'Open an EPUB in a document to see its Hardcover page.'};
    if (memMeta.get(s.path)?.failed) memMeta.delete(s.path); // a button press tries a failed read again
    await needPermissions();
    const found = await withTimeout(resolvePath(s.path), 20_000, 'book lookup');
    const meta = await metaFor(s.path);
    if (meta.failed) return {message: "Could not read this EPUB's title and author."};
    const item = found ?? (await linkFromCatalogue(s.path));
    if (!item) return {message: 'This book is not in your Hardcover library.'};
    // resolvePath applied the saved edition to item, so the reading entry's own edition comes from the cached list
    const entry = reading.list.find(r => r.userBookId === item.userBookId);
    const editionIds = [...new Set([entry?.editionId, meta.edition?.id].filter((id): id is number => !!id))];
    const book = await withTimeout(fetchBookDetail(TOKEN, item.bookId, editionIds), 20_000, 'book details');
    const detail = buildDetail({book, item, saved: meta.edition, sample: s, isbns: isbnsIn((meta.ids ?? []).join(' '))});
    if (!detail.editions.some(e => e.pages > 0)) return {message: 'Hardcover has no edition with a page count for this book.'};
    if (mine === loadSeq) current = {path: s.path, item, detail, sample: s, editionId: detail.editionId};
    if (!detail.inLibrary) return {book: detail, tracking: false, sync: 'Not in your library: tracking and status are off.'};
    return {book: detail, tracking: meta.tracking === true, sync: syncNote(s.path)};
  },
  // The linked book (not in the library) is added now: Want to Read, edition marked as owned. The page reloads after.
  async addToLibrary() {
    const c = current;
    if (!c || c.item.userBookId) return;
    await needPermissions();
    const meta = await metaFor(c.path);
    await addToLibrary(c.path, meta, meta.linked ?? {bookId: c.item.bookId});
    tracker.forget(c.path);
  },
  // Tracking is remembered per file like the edition. Turning it on starts from the page the book is at now (nothing is
  // sent for it); turning it off drops anything not yet sent.
  async setTracking(on) {
    if (!current) throw new Error('no book loaded');
    const meta = await metaFor(current.path);
    meta.tracking = on;
    (await persistentMetaCache().catch(() => null))?.set(current.path, meta).catch(() => {});
    tracker.forget(current.path);
    log(on ? 'tracking on for' : 'tracking off for', current.item.title);
  },
  // The edition is remembered per file in the metadata cache and used for the pages we compute from now on.
  async setEdition(editionId) {
    if (!current) return;
    const ed = current.detail.editions.find(e => e.id === editionId);
    if (!ed || !(ed.pages > 0)) return;
    const meta = await metaFor(current.path);
    meta.edition = {id: Number(ed.id), pages: ed.pages};
    current.editionId = ed.id; // a journal entry saved after this uses the new edition too
    (await persistentMetaCache().catch(() => null))?.set(current.path, meta).catch(() => {});
    tracker.forget(current.path);
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
    await needPermissions();
    const position = ed ? journalPosition(c.sample.page, c.sample.total, ed.pages) : null;
    await saveJournal(TOKEN, {bookId: c.item.bookId, editionId: ed ? Number(ed.id) : null, event, entry, position: position ?? undefined, privacy});
    log('journal', event, 'saved for', c.item.title);
  },
  async setStatus(label) {
    const c = current; // a newer load may replace `current` while we wait
    if (!c) throw new Error('no book loaded');
    if (!c.item.userBookId) throw new Error('add the book to your library first');
    await needPermissions();
    await setStatus(TOKEN, c.item.userBookId, STATUS_ID[label as keyof typeof STATUS_ID]);
    dropReadingList(); // the list is fetched again so the new status shows
    tracker.forget(c.path);
  },
  writeReview: () => dialogOk('Writing a review from the device is not available yet.').then(() => {}),
};

session.api = api;

const icon = Image.resolveAssetSource(require('../assets/icon.png')).uri;
PluginManager.registerButton(1, ['DOC'], {id: 100, name: 'Hardcover', icon, showType: 1});
// Selection toolbar: opens the journal entry page (quote or note) for the selected passage.
PluginManager.registerButton(3, ['DOC'], {id: 300, name: 'hardcover-select', icon, showType: 1});

const readSelection = (): Promise<string> =>
  withTimeout(PluginDocAPI.getLastSelectedText(), 8_000, 'selection').then(raw => {
    const r = reply<string>(raw);
    return cleanQuote(r?.success ? r.result : '');
  })
    .catch(() => ''); // no selection or a hung call: the page explains it and offers a note

PluginManager.registerButtonListener({
  onButtonPress(event) {
    if (event.id !== 100 && event.id !== 300) return;
    // Both open a view by themselves (showType 1); read the document (and the selection) now, before the view covers it.
    session.mode = event.id === 300 ? 'journal' : 'detail';
    session.selection = event.id === 300 ? readSelection() : null;
    session.pending = safeSample();
    session.opened(); // an already mounted page loads the book that is open now
  },
});
log('boot', tokenOk ? 'tracking per book (default off)' : 'debug gestures', native ? 'native module ok' : 'native module MISSING');

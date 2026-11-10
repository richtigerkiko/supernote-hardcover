/**
 * @format
 */

import {AppRegistry, Image, NativeModules} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager, PluginCommAPI, PluginDocAPI, NativeUIUtils} from 'sn-plugin-lib';
import TOKEN from './src/token.generated'; // written from the workspace .env by scripts/write-token.js
import {parseEpub} from './src/epub';
import {isbnsIn} from './src/match';
import {buildDetail, STATUS_ID, withEdition} from './src/detail';
import {session} from './src/session';
import {cleanQuote} from './src/quote';
import {resolveBook} from './src/resolve';
import {createJsonFile, createMetaCache, createSettings} from './src/store';
import {createTracker} from './src/tracker';
import {bookIdsForIsbns, fetchBookDetail, fetchCurrentlyReading, saveProgress, saveQuote, setStatus} from './src/hardcover';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// Device facts this relies on (measured on the Nomad, see CLAUDE.md):
//  - Touch events (registerMotionListener) and SDK calls work in EVERY lifecycle state, including before any button
//    press (state 1) and after a view closed (state 3). setTimeout/setInterval only run in state 2.
//  - So tracking is driven by finger-down events, not a timer: it needs no button press and survives a view closing.
//    Everything that must happen later is decided from timestamps at the next touch (see src/tracker.js).
//  - SDK calls can hang (not reject) when no document is in front, so a hung sample is detected by wall clock.
// Set true to log every touch event with the page seen at that moment (and keep tracking OFF so test page flipping
// never reaches Hardcover). Used to measure the gesture behaviour recorded in CLAUDE.md.
const DEBUG_GESTURES = false;
const QUOTES_ENABLED = false; // flip after a controlled test confirms the journal event/metadata (see hardcover.js)
const READING_TTL_MS = 600_000;
const HUNG_MS = 10_000;
const PERMS = [
  ['plugin.permission.FILE:READ', 'Read the title of the book you are reading from its file.'],
  ['plugin.permission.INTERNET', 'Send your reading progress to Hardcover.'],
];

const log = (...a) => console.log('[hardcover]', ...a);
const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);
// The only native code in the plugin (android/app/src/main/java/com/hardcoversync): file read, atomic write, stat.
// null when the native part is missing; everything must keep working without it.
const native = NativeModules.HardcoverNative ?? null;
const dialog = (tip, left, right, ok) => NativeUIUtils.showRattaDialog(tip, left, right, ok);

// ---- permissions: asked once when first needed (already granted after the first run) ----
let permsOk = null;
async function permissions() {
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
const memMeta = new Map(); // path -> metadata in memory (also the whole cache when the native module is missing)

// ---- persistence (native module). Tracking never depends on it: with no module or a failing call, everything below
// quietly falls back to memory. The EPUB metadata cache lives in the plugin's private directory (no permission needed,
// regenerable); a cached entry is valid only while the file keeps its size (see src/store.js).
let persistentMeta = null;
function persistentMetaCache() {
  persistentMeta = persistentMeta || (async () => {
    let dir = null;
    try {
      dir = await PluginManager.getPluginDirPath();
    } catch {
      /* no private dir: memory only */
    }
    return createMetaCache(createJsonFile(native && dir ? native : null, `${dir}/meta-cache.json`), p => native.stat(p));
  })();
  return persistentMeta;
}
async function metaFor(path) {
  let meta = memMeta.get(path);
  if (meta) return meta;
  const cache = await persistentMetaCache().catch(() => null);
  meta = cache ? await cache.get(path).catch(() => null) : null;
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

// Settings that must survive a reinstall live in MyStyle, which needs the FILE:WRITE grant before the first access.
// The grant dialog needs a screen, so this is only called from a button press, never from a touch handler. The file
// is written once with the defaults so it exists and can be edited.
const SETTINGS_PATH = '/storage/emulated/0/MyStyle/Plugins/HardcoverSync/settings.json';
const SETTING_DEFAULTS = {quotePrivacy: 3}; // Hardcover privacy ids: 1 public, 2 followers only, 3 private
let settingsPromise = null;
function settings() {
  settingsPromise = settingsPromise || (async () => {
    const perm = 'plugin.permission.FILE:WRITE';
    let granted = (await PluginManager.hasPermission(perm)) === 1;
    if (!granted) {
      const r = await PluginManager.requestPermission(perm, 'Keep your settings when the plugin is updated.');
      granted = r === 1 || r === 2;
    }
    const s = createSettings(createJsonFile(granted ? native : null, SETTINGS_PATH, SETTING_DEFAULTS), SETTING_DEFAULTS);
    await s.set('quotePrivacy', await s.get('quotePrivacy')); // creates the file with the defaults when missing
    return s;
  })().catch(e => {
    settingsPromise = null;
    throw e;
  });
  return settingsPromise;
}
async function readMeta(path) {
  const blob = await (await fetch('file://' + path)).blob();
  const read = (o, l) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(new Error('read error'));
      r.readAsArrayBuffer(blob.slice(o, o + l));
    });
  return parseEpub(read, blob.size);
}

// ---- Hardcover: the Currently Reading list (cached) and which item a file is ----
let reading = {at: 0, list: []};
let readingGen = 0; // bumped when the list is known stale; a fetch that started before that is not cached
function dropReadingList() {
  readingGen++;
  reading.at = 0;
}
async function readingList() {
  if (Date.now() - reading.at <= READING_TTL_MS) return reading.list;
  const gen = readingGen;
  const list = await fetchCurrentlyReading(TOKEN);
  if (gen === readingGen) reading = {list, at: Date.now()};
  return list;
}
async function resolvePath(path) {
  const meta = await metaFor(path);
  const item = await resolveBook({meta, reading: await readingList(), bookIdsForIsbns: isbns => bookIdsForIsbns(TOKEN, isbns)});
  return withEdition(item, meta.edition); // the edition the reader picked for this file, if any
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
async function sample() {
  const p = await PluginCommAPI.getCurrentFilePath();
  const [pg, tot] = await Promise.all([PluginCommAPI.getCurrentPageNum(), PluginDocAPI.getCurrentTotalPages()]);
  // The path can lag behind what is on screen (skill: it may be the last file the plugin touched) and the three
  // calls are separate, so a book switch in between could pair one book's path with another's page. Read the path
  // again and drop the sample if it moved; a wrong pair would push a wrong public progress entry.
  const again = await PluginCommAPI.getCurrentFilePath();
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

// ---- the detail page: App.tsx calls these through src/session.js (same JS runtime) ----
let current = null; // {path, item, detail} of the book the page was opened on
// One line for the page: why tracking is not working, or the last push. lastPush and lastError are shared by all books,
// so they show only for the file that is open.
const syncNote = path => {
  if (!tokenOk) return 'Token rejected, tracking stopped';
  const {lastError: e, lastPush: p} = tracker.state;
  if (e?.path === path) return e.message;
  return p?.path === path ? `Last sync: page ${p.pages}` : '';
};
let loadSeq = 0; // a slow load must not overwrite `current` after a newer one
const dialogOk = tip => dialog(tip, 'OK', 'Close', false).catch(() => {});
session.api = {
  // -> {book} for DetailPage, or {message} when there is nothing to show
  async load() {
    const mine = ++loadSeq;
    const s = await (session.pending ?? safeSample());
    session.pending = null;
    if (!s) return {message: 'Open an EPUB in a document to see its Hardcover page.'};
    if (memMeta.get(s.path)?.failed) memMeta.delete(s.path); // a button press tries a failed read again
    await needPermissions();
    const item = await withTimeout(resolvePath(s.path), 20_000, 'book lookup');
    const meta = await metaFor(s.path);
    if (meta.failed) return {message: "Could not read this EPUB's title and author."};
    if (!item) return {message: 'This book is not on your Hardcover Currently Reading list.'};
    // resolvePath applied the saved edition to item, so the reading entry's own edition comes from the cached list
    const entry = reading.list.find(r => r.userBookId === item.userBookId);
    const editionIds = [...new Set([entry?.editionId, meta.edition?.id].filter(Boolean))];
    const book = await withTimeout(fetchBookDetail(TOKEN, item.bookId, editionIds), 20_000, 'book details');
    const detail = buildDetail({book, item, saved: meta.edition, sample: s, isbns: isbnsIn((meta.ids ?? []).join(' '))});
    if (!detail.editions.some(e => e.pages > 0)) return {message: 'Hardcover has no edition with a page count for this book.'};
    if (mine === loadSeq) current = {path: s.path, item, detail};
    return {book: detail, tracking: meta.tracking === true, sync: syncNote(s.path)};
  },
  // Tracking is remembered per file like the edition. Turning it on starts from the page the book is at now (nothing is
  // sent for it); turning it off drops anything not yet sent.
  async setTracking(on) {
    const meta = await metaFor(current.path);
    meta.tracking = on;
    (await persistentMetaCache().catch(() => null))?.set(current.path, meta).catch(() => {});
    tracker.forget(current.path);
    log(on ? 'tracking on for' : 'tracking off for', current.item.title);
  },
  // The edition is remembered per file in the metadata cache and used for the pages we compute from now on.
  async setEdition(editionId) {
    const ed = current?.detail.editions.find(e => e.id === editionId);
    if (!ed || !(ed.pages > 0)) return;
    const meta = await metaFor(current.path);
    meta.edition = {id: Number(ed.id), pages: ed.pages};
    (await persistentMetaCache().catch(() => null))?.set(current.path, meta).catch(() => {});
    tracker.forget(current.path);
  },
  async setStatus(label) {
    const c = current; // a newer load may replace `current` while we wait
    // Paused, Did not finish and Finished take the book off the list the plugin works from, and only hardcover.app undoes that.
    if (label !== 'Currently reading' && !(await dialog('This takes the book off your Currently Reading list. You can only undo it on hardcover.app.', 'Cancel', 'Change', false))) {
      throw new Error('status change cancelled');
    }
    await needPermissions();
    await setStatus(TOKEN, c.item.userBookId, STATUS_ID[label]);
    dropReadingList(); // the list is fetched again, so a book that left Currently Reading stops being tracked
    tracker.forget(c.path);
  },
  writeReview: () => dialogOk('Writing a review from the device is not available yet.'),
};

// ---- selection button: save the selected passage as a quote ----
async function onQuote() {
  const say = (tip, ok) => dialog(tip, 'OK', 'Close', ok);
  if (!QUOTES_ENABLED) return say('Saving quotes is not switched on yet.', false);
  const sel = await withTimeout(PluginDocAPI.getLastSelectedText(), 8_000, 'selection');
  const text = cleanQuote(sel?.success ? sel.result : '');
  if (!text) return say('Select some text first.', false);
  const s = await safeSample();
  if (!s) return say('Open an EPUB to save a quote.', false);
  await needPermissions();
  const item = await resolvePath(s.path).catch(() => null);
  if (!item) return say('This book is not on your Hardcover Currently Reading list.', false);
  await saveQuote(TOKEN, item, text, s.page + 1, await (await settings()).get('quotePrivacy'));
  return say(`Quote saved (page ${s.page + 1}).`, true);
}

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;
PluginManager.registerButton(1, ['DOC'], {id: 100, name: 'Hardcover', icon, showType: 1});
if (QUOTES_ENABLED) PluginManager.registerButton(3, ['DOC'], {id: 300, name: 'Save quote', icon, showType: 0});

PluginManager.registerButtonListener({
  onButtonPress(event) {
    // The page (id 100) opens by itself (showType 1); read the document now, before the view is in front of it.
    if (event.id === 100) {
      session.pending = safeSample();
      session.opened(); // an already mounted page loads the book that is open now
    }
    const job = event.id === 300 ? onQuote() : null;
    job?.catch(e => {
      log('button error', event.id, String(e));
      dialog(`Hardcover: ${String(e.message ?? e)}`.slice(0, 300), 'OK', 'Close', false).catch(() => {});
    });
  },
});
log('boot', tokenOk ? 'tracking per book (default off)' : 'debug gestures', native ? 'native module ok' : 'native module MISSING');

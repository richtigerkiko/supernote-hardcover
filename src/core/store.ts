import type {EpubMeta} from './epub';

const MAX_CACHE_ENTRIES = 300;

/** The native module (android/.../HardcoverNativeModule). readTextFile and deleteFile are only used by the one-time JSON import. */
export interface NativeFs {
  readTextFile(path: string): Promise<string>;
  deleteFile(path: string): Promise<unknown>;
  stat(path: string): Promise<{exists: boolean; size: number}>;
}

/** The SQLite database as the store sees it: one statement in, its rows out. Built in src/device/files.ts. */
export interface Db {
  exec(sql: string, params?: (string | number)[]): Promise<Record<string, unknown>[]>;
}

/** Where a JsonFile keeps its text. */
export interface TextSlot {
  read(): Promise<string>;
  write(text: string): Promise<unknown>;
}

export interface JsonFile<T> {
  load(): Promise<T>;
  save(): Promise<void>;
}

/** What is remembered about one file besides what its EPUB says. */
export interface FileMeta extends EpubMeta {
  failed?: boolean; // memory only: the EPUB could not be read
  edition?: {id: number; pages: number}; // the edition the reader picked for this file
  tracking?: boolean; // tracking is switched on for this file
  book?: {bookId: number; userBookId: number; title: string}; // the library entry, saved when tracking is switched on
  linked?: {bookId: number; editionId?: number}; // the catalogue book this file is (found, or picked in the book search); kept when it is added
}

// The tables, then the one-time import of the two JSON files the plugin used before SQLite (tokens.json and
// meta-cache.json in the private directory). A file is removed only after its rows are in the database (the tokens are
// read back first), so a failed import is tried again at the next start instead of signing the reader out. Rows that
// already exist win, so an import that runs twice changes nothing. A failing CREATE throws: the caller falls back to
// memory.
export async function prepareDb(db: Db, legacy: {read(name: string): Promise<string>; remove(name: string): Promise<unknown>} | null): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)');
  await db.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, size INTEGER NOT NULL, meta TEXT NOT NULL)');
  if (!legacy) return;
  const move = async (name: string, insert: (data: Record<string, unknown>) => Promise<boolean>) => {
    try {
      const text = await legacy.read(name);
      if (!text) return; // no such file: already imported, or a fresh install
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        /* corrupt: nothing to keep */
      }
      const usable = data && typeof data === 'object' && !Array.isArray(data);
      if (!usable || (await insert(data as Record<string, unknown>))) await legacy.remove(name);
    } catch {
      /* the file stays; the next start tries again */
    }
  };
  await move('tokens.json', async tokens => {
    await db.exec('INSERT OR IGNORE INTO tokens (id, json) VALUES (1, ?)', [JSON.stringify(tokens)]);
    return (await db.exec('SELECT json FROM tokens WHERE id = 1')).length === 1;
  });
  await move('meta-cache.json', async entries => {
    for (const [path, e] of Object.entries(entries as Record<string, {size?: unknown; meta?: unknown} | null>)) {
      if (e && typeof e.size === 'number' && e.meta && typeof e.meta === 'object') {
        await db.exec('INSERT OR IGNORE INTO files (path, size, meta) VALUES (?, ?, ?)', [path, e.size, JSON.stringify(e.meta)]);
      }
    }
    return true;
  });
}

/** The one row of the tokens table as the text of a JsonFile. Signing out writes "{}"; the row is never deleted. */
export const tokenSlot = (db: Db): TextSlot => ({
  read: async () => String((await db.exec('SELECT json FROM tokens WHERE id = 1'))[0]?.json ?? ''),
  write: text => db.exec('INSERT OR REPLACE INTO tokens (id, json) VALUES (1, ?)', [text]),
});

// A JSON object in a text slot (the tokens row), with an in-memory copy. It never throws: no slot (the database is
// missing), no text, corrupt JSON or a failed write all leave the in-memory copy working, because the plugin must keep
// tracking without persistence. There are no timers (they do not run in some lifecycle states): a change is written at
// once, one write at a time, a write requested during another is coalesced into one more write of the latest data.
// `strict` makes save() reject when a write fails, for data that must not silently stay stale (the OAuth tokens: a
// rotated refresh token that was not written would be sent again after a restart, which revokes the sign-in).
// shortcut: a write that never settles (a wedged native call) leaves save() pending, as with the JSON file before;
// add a watchdog on touch timestamps if that is ever seen on a device.
export function createJsonFile<T extends object>(slot: TextSlot | null, defaults: Partial<T> = {}, strict = false): JsonFile<T> {
  let data: T | null = null;
  let loading: Promise<T> | null = null;
  let writing: Promise<void> | null = null;
  let dirty = false;

  // Keep the promise, not the data: a second load() during the first read must wait for it, or it gets the empty
  // defaults and its change is lost when the read finishes.
  const load = () => (loading = loading || readOnce());

  async function readOnce(): Promise<T> {
    data = {...defaults} as T;
    if (slot) {
      try {
        const text = await slot.read();
        const parsed = text ? JSON.parse(text) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = {...defaults, ...parsed} as T;
      } catch {
        /* corrupt or unreadable: start from the defaults; the next save replaces it */
      }
    }
    return data;
  }

  async function flush(): Promise<void> {
    try {
      while (dirty) {
        dirty = false;
        await slot!.write(JSON.stringify(data));
      }
    } catch (e) {
      if (strict) throw e;
      /* keep the in-memory copy; the next change tries again */
    } finally {
      writing = null;
    }
  }

  async function save(): Promise<void> {
    if (!slot || !data) return;
    dirty = true;
    if (!writing) writing = flush();
    await writing;
  }

  return {load, save};
}

// EPUB metadata by path: one row per file in the files table, with an in-memory copy of all rows. An entry is valid
// only while the file has the same size, so replacing a book under the same name re-reads it. The modification time is
// not used: the document app updates it every time a book is opened. Like the JsonFile it never throws and has no
// timers: no database, a failed read or a failed write leave the in-memory copy working. A set writes only its own row;
// INSERT OR REPLACE gives the row a new rowid, so rowid order is "least recently set first", which the cap relies on.
type Entry = {size: number; meta: FileMeta};

export function createMetaCache(db: Db | null, stat: NativeFs['stat']) {
  const sizeOf = async (path: string): Promise<number | null> => {
    try {
      const s = await stat(path);
      return s && s.exists ? s.size : null;
    } catch {
      return null;
    }
  };
  // Keep the promise, not the data: a set() during the first read must wait for it (see createJsonFile).
  let loading: Promise<Map<string, Entry>> | null = null;
  const load = () =>
    (loading ??= (async () => {
      const data = new Map<string, Entry>();
      try {
        for (const r of db ? await db.exec('SELECT path, size, meta FROM files ORDER BY rowid') : []) {
          try {
            data.set(String(r.path), {size: Number(r.size), meta: JSON.parse(String(r.meta))});
          } catch {
            /* one corrupt row: that file is read again */
          }
        }
      } catch {
        /* unreadable: start empty */
      }
      return data;
    })());
  const write = async (sql: string, params: (string | number)[]) => {
    try {
      await db?.exec(sql, params);
    } catch {
      /* keep the in-memory copy; the next set of this file tries again */
    }
  };
  return {
    async get(path: string): Promise<FileMeta | null> {
      const entry = (await load()).get(path);
      if (!entry) return null;
      return (await sizeOf(path)) === entry.size ? entry.meta : null;
    },
    async set(path: string, meta: FileMeta): Promise<void> {
      const data = await load();
      const size = await sizeOf(path);
      if (size === null) return; // cannot validate it later, so do not keep it
      data.delete(path); // re-insert at the end: the oldest entries go first
      data.set(path, {size, meta});
      const old = [...data.keys()].slice(0, Math.max(0, data.size - MAX_CACHE_ENTRIES));
      for (const p of old) data.delete(p);
      await write('INSERT OR REPLACE INTO files (path, size, meta) VALUES (?, ?, ?)', [path, size, JSON.stringify(meta)]);
      for (const p of old) await write('DELETE FROM files WHERE path = ?', [p]);
    },
    /** Paths whose entry has tracking on (the size is not checked: get() does that). */
    async tracked(): Promise<string[]> {
      return [...(await load())].filter(([, e]) => e.meta?.tracking).map(([p]) => p);
    },
  };
}

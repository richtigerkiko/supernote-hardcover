import type {EpubMeta} from './epub';

const MAX_CACHE_ENTRIES = 300;

/** The native module (android/.../HardcoverNativeModule). */
export interface NativeFs {
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<unknown>;
  stat(path: string): Promise<{exists: boolean; size: number}>;
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
  linked?: {bookId: number; editionId?: number}; // the reader said No to adding it: the catalogue book this file is
}

// A JSON file behind the native adapter {readTextFile, writeFile, stat}, with an in-memory copy. It never throws:
// no adapter (the native part is missing), a missing file, corrupt JSON or a failed write all leave the in-memory
// copy working, because the plugin must keep tracking without persistence. There are no timers (they do not run in
// some lifecycle states): a change is written at once, one write at a time, a write requested during another is
// coalesced into one more write of the latest data.
// `strict` makes save() reject when a write fails, for data that must not silently stay stale (the OAuth tokens: a
// rotated refresh token that was not written would be sent again after a restart, which revokes the sign-in).
export function createJsonFile<T extends object>(native: NativeFs | null, path: string, defaults: Partial<T> = {}, strict = false): JsonFile<T> {
  let data: T | null = null;
  let loading: Promise<T> | null = null;
  let writing: Promise<void> | null = null;
  let dirty = false;

  // Keep the promise, not the data: a second load() during the first read must wait for it, or it gets the empty
  // defaults and its change is lost when the read finishes.
  const load = () => (loading = loading || readOnce());

  async function readOnce(): Promise<T> {
    data = {...defaults} as T;
    if (native) {
      try {
        const text = await native.readTextFile(path);
        const parsed = text ? JSON.parse(text) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = {...defaults, ...parsed} as T;
      } catch {
        /* corrupt or unreadable: start from the defaults; the next save replaces the file */
      }
    }
    return data;
  }

  async function flush(): Promise<void> {
    try {
      while (dirty) {
        dirty = false;
        await native!.writeFile(path, JSON.stringify(data));
      }
    } catch (e) {
      if (strict) throw e;
      /* keep the in-memory copy; the next change tries again */
    } finally {
      writing = null;
    }
  }

  async function save(): Promise<void> {
    if (!native || !data) return;
    dirty = true;
    if (!writing) writing = flush();
    await writing;
  }

  return {load, save};
}

// EPUB metadata by path. An entry is valid only while the file has the same size, so replacing a book under the same
// name re-reads it. The modification time is not used: the document app updates it every time a book is opened.
type MetaStore = Record<string, {size: number; meta: FileMeta}>;

export function createMetaCache(file: JsonFile<MetaStore>, stat: NativeFs['stat']) {
  const sizeOf = async (path: string): Promise<number | null> => {
    try {
      const s = await stat(path);
      return s && s.exists ? s.size : null;
    } catch {
      return null;
    }
  };
  return {
    async get(path: string): Promise<FileMeta | null> {
      const entry = (await file.load())[path];
      if (!entry || typeof entry.size !== 'number') return null;
      return (await sizeOf(path)) === entry.size ? entry.meta : null;
    },
    async set(path: string, meta: FileMeta): Promise<void> {
      const data = await file.load();
      const size = await sizeOf(path);
      if (size === null) return; // cannot validate it later, so do not keep it
      delete data[path]; // re-insert at the end: the oldest entries go first
      data[path] = {size, meta};
      for (const old of Object.keys(data)) {
        if (Object.keys(data).length <= MAX_CACHE_ENTRIES) break;
        delete data[old];
      }
      await file.save();
    },
    /** Paths whose entry has tracking on (the size is not checked: get() does that). */
    async tracked(): Promise<string[]> {
      const data = await file.load();
      return Object.keys(data).filter(p => data[p].meta?.tracking);
    },
  };
}

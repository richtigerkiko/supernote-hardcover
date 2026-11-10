const MAX_CACHE_ENTRIES = 300;

// A JSON file behind the native adapter {readTextFile, writeFile, stat}, with an in-memory copy. It never throws:
// no adapter (the native part is missing), a missing file, corrupt JSON or a failed write all leave the in-memory
// copy working, because the plugin must keep tracking without persistence. There are no timers (they do not run in
// some lifecycle states): a change is written at once, one write at a time, a write requested during another is
// coalesced into one more write of the latest data.
export function createJsonFile(native, path, defaults = {}) {
  let data = null;
  let writing = null;
  let dirty = false;

  async function load() {
    if (data) return data;
    data = {...defaults};
    if (native) {
      try {
        const text = await native.readTextFile(path);
        const parsed = text ? JSON.parse(text) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = {...defaults, ...parsed};
      } catch {
        /* corrupt or unreadable: start from the defaults; the next save replaces the file */
      }
    }
    return data;
  }

  async function flush() {
    try {
      while (dirty) {
        dirty = false;
        await native.writeFile(path, JSON.stringify(data));
      }
    } catch {
      /* keep the in-memory copy; the next change tries again */
    } finally {
      writing = null;
    }
  }

  async function save() {
    if (!native || !data) return;
    dirty = true;
    if (!writing) writing = flush();
    await writing;
  }

  return {load, save};
}

// EPUB metadata by path. An entry is valid only while the file has the same size, so replacing a book under the same
// name re-reads it. The modification time is not used: the document app updates it every time a book is opened.
export function createMetaCache(file, stat) {
  const sizeOf = async path => {
    try {
      const s = await stat(path);
      return s && s.exists ? s.size : null;
    } catch {
      return null;
    }
  };
  return {
    async get(path) {
      const entry = (await file.load())[path];
      if (!entry || typeof entry.size !== 'number') return null;
      return (await sizeOf(path)) === entry.size ? entry.meta : null;
    },
    async set(path, meta) {
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
  };
}

// Small user settings that must survive a reinstall (kept in MyStyle, which needs the FILE:WRITE grant before the
// first access: ask for it before calling load()).
export function createSettings(file, defaults) {
  return {
    async get(key) {
      return (await file.load())[key] ?? defaults[key];
    },
    async set(key, value) {
      (await file.load())[key] = value;
      await file.save();
    },
  };
}

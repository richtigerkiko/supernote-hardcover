import type {EpubMeta} from '../core/epub';
import type {createMetaCache, FileMeta} from '../core/store';
import {isPdf, log} from '../core/util';

type Cache = ReturnType<typeof createMetaCache>;

// A PDF is never opened and has no metadata, so nothing matches it automatically (the reader picks book and edition).
// What is known about a file: the saved cache first, then the EPUB itself. `mem` is also the whole cache when the native
// module is missing.
export function createMeta({read, cache}: {read: (path: string) => Promise<EpubMeta>; cache: () => Promise<Cache>}) {
  const mem = new Map<string, FileMeta>();
  const persistent = () => cache().catch(() => null);
  // The files with tracking on, so a touch can skip the SDK when there are none. Starts from the saved cache.
  let on: Promise<Set<string>> | null = null;
  const tracked = () => (on ??= persistent().then(async c => new Set(c ? await c.tracked().catch(() => []) : [])));

  async function get(path: string): Promise<FileMeta> {
    let meta = mem.get(path);
    if (meta) return meta;
    const c = await persistent();
    meta = (c ? await c.get(path).catch(() => null) : null) ?? undefined;
    if (meta) log('metadata from the saved cache');
    else {
      try {
        meta = isPdf(path) ? {ids: []} : await read(path);
      } catch (e) {
        log('cannot read the file, not trying again on touches', String(e));
        meta = {ids: [], failed: true}; // in memory only, so a restart (or a button press, see retry) tries again
        mem.set(path, meta);
        return meta;
      }
      if (c) c.set(path, meta).catch(() => {});
      (await tracked()).delete(path); // a new or replaced file starts with tracking off
    }
    mem.set(path, meta);
    return meta;
  }

  return {
    get,
    save: async (path: string, meta: FileMeta) => {
      (await tracked())[meta.tracking ? 'add' : 'delete'](path);
      await (await persistent())?.set(path, meta).catch(() => {});
    },
    anyTracked: async () => (await tracked()).size > 0,
    /** A button press tries a failed read again. */
    retry: (path: string) => {
      if (mem.get(path)?.failed) mem.delete(path);
    },
  };
}
export type Meta = ReturnType<typeof createMeta>;

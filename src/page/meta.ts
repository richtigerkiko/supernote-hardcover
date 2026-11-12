import type {EpubMeta} from '../core/epub';
import type {createMetaCache, FileMeta} from '../core/store';
import {log} from '../core/util';

type Cache = ReturnType<typeof createMetaCache>;

// What is known about a file: the saved cache first, then the EPUB itself. `mem` is also the whole cache when the native
// module is missing.
export function createMeta({read, cache}: {read: (path: string) => Promise<EpubMeta>; cache: () => Promise<Cache>}) {
  const mem = new Map<string, FileMeta>();
  const persistent = () => cache().catch(() => null);

  async function get(path: string): Promise<FileMeta> {
    let meta = mem.get(path);
    if (meta) return meta;
    const c = await persistent();
    meta = (c ? await c.get(path).catch(() => null) : null) ?? undefined;
    if (meta) log('metadata from the saved cache');
    else {
      try {
        meta = await read(path);
      } catch (e) {
        log('cannot read the EPUB, not trying again on touches', String(e));
        meta = {ids: [], failed: true}; // in memory only, so a restart (or a button press, see retry) tries again
        mem.set(path, meta);
        return meta;
      }
      if (c) c.set(path, meta).catch(() => {});
    }
    mem.set(path, meta);
    return meta;
  }

  return {
    get,
    save: async (path: string, meta: FileMeta) => (await persistent())?.set(path, meta).catch(() => {}),
    /** A button press tries a failed read again. */
    retry: (path: string) => {
      if (mem.get(path)?.failed) mem.delete(path);
    },
  };
}
export type Meta = ReturnType<typeof createMeta>;

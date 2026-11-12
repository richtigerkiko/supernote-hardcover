import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import type {TokenSet} from '@hardcover/sdk/oauth';
import {parseEpub} from '../core/epub';
import {createJsonFile, createMetaCache, type NativeFs} from '../core/store';

// The only native code in the plugin (android/app/src/main/java/com/hardcoversync): file read, atomic write, stat.
// null when the native part is missing; everything must keep working without it.
export const native: NativeFs | null = NativeModules.HardcoverNative ?? null;

// The plugin's private directory (no permission needed); null: memory only.
const privateDir = async () => {
  try {
    return await PluginManager.getPluginDirPath();
  } catch {
    return null;
  }
};

// EPUB metadata: a few small range reads through fetch -> blob -> slice (the file is never read into JS).
export async function readEpubMeta(path: string) {
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

// Persistence never decides tracking: with no module or a failing call, everything falls back to memory. A cached entry
// is valid only while the file keeps its size (see src/core/store.ts).
let cache: Promise<ReturnType<typeof createMetaCache>> | null = null;
export function metaCache() {
  cache ??= (async () => {
    const dir = await privateDir();
    return createMetaCache(createJsonFile(native && dir ? native : null, `${dir}/meta-cache.json`), p => native!.stat(p));
  })();
  return cache;
}

let tokens: ReturnType<typeof createJsonFile<Partial<TokenSet>>> | null = null;
export async function tokenFile() {
  if (!tokens) {
    const dir = await privateDir();
    tokens = createJsonFile<Partial<TokenSet>>(native && dir ? native : null, `${dir}/tokens.json`, {}, true);
  }
  return tokens;
}

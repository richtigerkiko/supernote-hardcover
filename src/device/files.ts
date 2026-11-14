import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import type {TokenSet} from '@hardcover/sdk/oauth';
import {parseEpub} from '../core/epub';
import {createJsonFile, createMetaCache, prepareDb, tokenSlot, type Db, type JsonFile, type NativeFs} from '../core/store';
import {log} from '../core/util';

// The plugin's own native code (android/app/src/main/java/com/hardcoversync): file read, delete, stat.
// null when the native part is missing; everything must keep working without it.
export const native: NativeFs | null = NativeModules.HardcoverNative ?? null;

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

// All persistent data is one SQLite database in the private directory: `tokens` (one row) and `files` (one row per
// document). Persistence never decides tracking: with no module or a failing call the result is null and everything
// falls back to memory. op-sqlite is required lazily because importing it installs its JSI bindings and throws without
// the native module. Measured on the Nomad 2026-11-14 (#101): open, write and read work in every lifecycle state,
// and rows survive switching the plugin off and on.
let db: Promise<Db | null> | null = null;
const database = () =>
  (db ??= (async () => {
    try {
      const dir = await PluginManager.getPluginDirPath();
      if (!dir || !NativeModules.OPSQLite) {
        log('no database (OPSQLite module or private directory missing), memory only');
        return null;
      }
      const {open} = require('@op-engineering/op-sqlite') as typeof import('@op-engineering/op-sqlite');
      const handle = open({name: 'hardcover.db', location: dir}); // an absolute location: the private directory
      const d: Db = {exec: (sql, params = []) => handle.execute(sql, params).then(r => r.rows)};
      // tokens.json and meta-cache.json from before SQLite are imported once, then deleted
      await prepareDb(d, native && {read: name => native.readTextFile(`${dir}/${name}`), remove: name => native.deleteFile(`${dir}/${name}`)});
      log('database ok');
      return d;
    } catch (e) {
      log('no database, memory only', String(e));
      return null;
    }
  })());

// A cached entry is valid only while the file keeps its size (see src/core/store.ts).
let cache: Promise<ReturnType<typeof createMetaCache>> | null = null;
export const metaCache = () => (cache ??= database().then(d => createMetaCache(d, p => native!.stat(p))));

let tokens: Promise<JsonFile<Partial<TokenSet>>> | null = null;
export const tokenFile = () => (tokens ??= database().then(d => createJsonFile<Partial<TokenSet>>(d && tokenSlot(d), {}, true)));

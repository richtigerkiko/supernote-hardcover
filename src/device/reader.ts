import {PluginCommAPI, PluginDocAPI} from 'sn-plugin-lib';
import {cleanQuote} from '../core/quote';
import type {Sample} from '../core/types';
import {withTimeout} from '../core/util';

// The SDK's calls resolve to a loose Object: {success, result} on success.
type Reply<T> = {success: boolean; result: T} | null | undefined;
const reply = <T>(r: unknown) => r as Reply<T>;

export async function sample(): Promise<Sample | null> {
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

// A button press runs in state 2 where timers work; touch handlers may not, so they call sample() without a timeout.
export const safeSample = () => withTimeout(sample(), 8_000, 'reader state').catch(() => null);

export const readSelection = (): Promise<string> =>
  withTimeout(PluginDocAPI.getLastSelectedText(), 8_000, 'selection')
    .then(raw => {
      const r = reply<string>(raw);
      return cleanQuote(r?.success ? r.result : '');
    })
    .catch(() => ''); // no selection or a hung call: the page explains it and offers a note

// Sign-in state for the OAuth device grant: which scopes to ask for and where the tokens are kept. The SDK's OAuthSession
// does the rest (polling, refresh from the next call, rotation, one refresh at a time, the retry after a 401).
import type {TokenSet, TokenStore} from '@hardcover/sdk/oauth';
import type {JsonFile} from './store';

// What the plugin's calls need (scopes per SDK resource): library and reads, marking an edition owned, catalogue lookups, journal.
// Review writes (write:reviews) are not used yet.
export const SCOPES = ['read:me:content', 'read:library', 'write:library', 'read:catalog'] as const;

// Tokens in a JsonFile (the plugin's private directory). Reads hand out copies so the session never sees a stored
// object change under it. Without the native module the tokens live in memory and a restart signs out.
export function fileTokenStore(file: () => Promise<JsonFile<Partial<TokenSet>>>): TokenStore {
  return {
    async get() {
      const data = await (await file()).load();
      return typeof data.accessToken === 'string' ? ({...data} as TokenSet) : null;
    },
    async set(tokens) {
      const f = await file();
      const data = await f.load();
      for (const k of Object.keys(data)) delete data[k as keyof TokenSet];
      Object.assign(data, tokens);
      await f.save();
    },
  };
}

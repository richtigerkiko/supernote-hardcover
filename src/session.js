// The detail page (App.tsx) and the tracking code (index.js) run in one JS runtime, so index.js hands the page its
// functions through this object instead of the page importing the SDK or the token. Null until index.js has run;
// `pending` is the reader sample taken when the button was pressed.
// The view stays mounted after it is closed (measured: "Running" is logged once), so a later press of the button
// does not remount the page: index.js calls opened() on every press and the page reloads its book from it.
const listeners = new Set();
/** @type {{api: any, pending: Promise<any> | null, opened: () => void, onOpen: (f: () => void) => () => void}} */
export const session = {
  api: null,
  pending: null,
  opened: () => listeners.forEach(f => f()),
  onOpen: f => {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

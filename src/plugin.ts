// Boot and wiring: builds the page's modules (src/page) from the device (src/device) and the Hardcover client, and
// registers the buttons. index.js (the entry point the build scripts bundle) only imports this file.
import {AppRegistry, Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {OAuthSession} from '@hardcover/sdk/oauth';
import {name as appName} from '../app.json';
import CLIENT_ID from './clientId.generated'; // written from the workspace .env by scripts/write-client-id.js
import {log} from './core/util';
import {closeView, deviceType, dialog, isFakeSdk} from './device/host';
import {metaCache, native, readEpubMeta, tokenFile} from './device/files';
import {grants} from './device/permissions';
import {readSelection, safeSample, sample} from './device/reader';
import {fileTokenStore} from './hardcover/auth';
import * as hc from './hardcover/client';
import {createApi} from './page/api';
import {createLibrary} from './page/library';
import {createMeta} from './page/meta';
import {session} from './page/session';
import {createTracking} from './page/tracking';
import App from './ui/App';

AppRegistry.registerComponent(appName, () => App);
PluginManager.init();

// Set true to log every touch event with the page seen at that moment (and keep tracking OFF so test page flipping
// never reaches Hardcover). Used to measure the gesture behaviour recorded in CLAUDE.md.
const DEBUG_GESTURES = false;

// Sign-in: OAuth device grant, public client (the id is all the package holds). The session keeps the tokens in
// the tokens table of the SQLite database in the private directory, refreshes from the next call after expiry (no timer) and replays a 401 once.
const auth = new OAuthSession({clientId: CLIENT_ID, store: fileTokenStore(tokenFile), onSignedOut: () => tracking.stop()});
const meta = createMeta({read: readEpubMeta, cache: metaCache});
const library = createLibrary({auth, hc, meta, dialog});
const tracking = createTracking({auth, hc, meta, library, grants, dialog, sample, enabled: !DEBUG_GESTURES});

session.api = createApi({auth, hc, meta, library, tracking, grants, dialog, session, sample: safeSample});
session.close = closeView;
session.isFakeSdk = isFakeSdk;
session.deviceType = deviceType;

// Every gesture starts with one finger-down (action 0) and ends with a plain up (action 1), and the reader flips the page
// a few ms to ~1 s AFTER the up (measured for tap, finger swipe and two-finger swipe). A read at the up is often the old
// page, a read at the NEXT finger-down is always the new one, so react to finger-down. Pen strokes are not page turns.
PluginManager.registerMotionListener(1, {
  onMsg(m) {
    if (DEBUG_GESTURES && m && m.action !== 2) {
      // 0 down, 1 up, 3 cancel, 5/6 extra pointer down/up; moves (2) are left out
      log('ev', 'a=' + m.action, 'tool=' + m.toolType, 'pc=' + m.pointerCount, 'x=' + Math.round(m.x), 'y=' + Math.round(m.y));
      sample().then(s => log('  page now', s ? s.page : 'none')).catch(() => log('  page now err'));
    }
    if (m?.action === 0 && m?.toolType === 1) tracking.onTouch();
  },
});

const icon = Image.resolveAssetSource(require('../assets/icon.png')).uri;
PluginManager.registerButton(1, ['DOC'], {id: 100, name: 'Hardcover', icon, showType: 1});
// Selection toolbar: opens the journal entry page (quote or note) for the selected passage.
PluginManager.registerButton(3, ['DOC'], {id: 300, name: 'hardcover-select', icon, showType: 1});

PluginManager.registerButtonListener({
  onButtonPress(event) {
    if (event.id !== 100 && event.id !== 300) return;
    // Both open a view by themselves (showType 1); read the document (and the selection) now, before the view covers it.
    session.mode = event.id === 300 ? 'journal' : 'detail';
    session.selection = event.id === 300 ? readSelection() : null;
    session.pending = safeSample();
    session.opened(); // an already mounted page loads the book that is open now
  },
});
log('boot', DEBUG_GESTURES ? 'debug gestures' : 'tracking per book (default off)', native ? 'native module ok' : 'native module MISSING');

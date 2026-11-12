import {NativeUIUtils, PluginManager} from 'sn-plugin-lib';

export const dialog = (tip: string, left: string, right: string, ok: boolean) => NativeUIUtils.showRattaDialog(tip, left, right, ok);
export const closeView = () => PluginManager.closePluginView();
export const deviceType = () => PluginManager.getDeviceType();
// The fake SDK (emulator preview) reports this plugin name; the real host reports the real one.
export const isFakeSdk = async () => (await PluginManager.getPluginName()) === 'sn-fake';

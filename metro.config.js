const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// Emulator only: SN_FAKE_SDK=1 swaps in a fake SDK (the file named by SN_FAKE_SDK_PATH), as the emulator has no PluginHost.
const useFakeSdk = process.env.SN_FAKE_SDK === '1';
if (useFakeSdk && !process.env.SN_FAKE_SDK_PATH) {
    throw new Error('SN_FAKE_SDK=1 needs SN_FAKE_SDK_PATH, the path of the fake sn-plugin-lib index.js');
}
const fakeSdk = useFakeSdk ? path.resolve(process.env.SN_FAKE_SDK_PATH) : '';

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    watchFolders: useFakeSdk ? [path.dirname(fakeSdk)] : [],
    resolver: {
        useWatchman: !process.env.CI,
        ...(useFakeSdk && {
            nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
            resolveRequest: (context, moduleName, platform) =>
                moduleName === 'sn-plugin-lib'
                    ? {type: 'sourceFile', filePath: fakeSdk}
                    : context.resolveRequest(context, moduleName, platform),
        }),
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

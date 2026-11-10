const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// Emulator only: SN_FAKE_SDK=1 swaps in the workspace's fake SDK, as the emulator has no PluginHost.
const fakeSdk = path.resolve(__dirname, '../../tools/sn-plugin-lib-fake/index.js');
const useFakeSdk = process.env.SN_FAKE_SDK === '1';

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

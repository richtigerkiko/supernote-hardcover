module.exports = {
  preset: 'react-native',
  // @hardcover/sdk is ESM only: let babel transform it like the RN preset does for react-native.
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@hardcover/sdk)/)'],
};

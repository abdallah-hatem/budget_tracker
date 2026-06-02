module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated v4 bundles its own worklets plugin; this must be LAST
      // and we must NOT also add 'react-native-worklets/plugin'.
      'react-native-reanimated/plugin',
    ],
  };
};

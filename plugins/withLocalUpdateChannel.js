// Sets the EAS Update channel for a LOCAL (non-EAS) build, gated on the
// LOCAL_UPDATE_CHANNEL env var. It writes config.updates.requestHeaders
// ["expo-channel-name"] — exactly what `eas build` does per profile — so the
// expo-updates plugin bakes EXUpdatesRequestHeaders into Expo.plist and the
// installed app pulls OTA updates from that channel.
//
// When LOCAL_UPDATE_CHANNEL is unset (normal dev, and every EAS build) this is a
// pure no-op, so it can never affect production / App Store builds.
module.exports = function withLocalUpdateChannel(config) {
  const channel = process.env.LOCAL_UPDATE_CHANNEL;
  if (!channel) return config;
  config.updates = config.updates || {};
  config.updates.requestHeaders = {
    ...(config.updates.requestHeaders || {}),
    'expo-channel-name': channel,
  };
  return config;
};

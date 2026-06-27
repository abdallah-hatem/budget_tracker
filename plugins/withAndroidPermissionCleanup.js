const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Remove Android permissions that get merged in by dependencies but we don't
 * use — they only add Play-Store review friction.
 *
 * react-native-android-notification-listener declares READ_PHONE_STATE (a Play
 * "sensitive" permission) which we never use; only the NotificationListener
 * (BIND_NOTIFICATION_LISTENER_SERVICE) + boot/headless permissions are needed.
 * We drop it via `tools:node="remove"` so the manifest merger strips it.
 */
const REMOVE = ['android.permission.READ_PHONE_STATE'];

module.exports = function withAndroidPermissionCleanup(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] =
      manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const name of REMOVE) {
      // Drop any direct declaration…
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (p) => p.$?.['android:name'] !== name,
      );
      // …and add a remove marker so merged (library) declarations are stripped too.
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }
    return cfg;
  });
};

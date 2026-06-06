// Expo config plugin: add the Masareef App Intent (MasareefSmsIntent.swift) to
// the iOS app target so the "Log SMS to Masareef" App Shortcut auto-appears in
// the Shortcuts app after install. ios/ is regenerated on every prebuild/EAS
// build, so this must run as a plugin (don't hand-edit ios/).
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FILENAME = 'MasareefSmsIntent.swift';

// 1) Copy the Swift source into ios/<ProjectName>/ during prebuild.
const copySwiftFile = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
      const src = path.join(projectRoot, 'plugins', SWIFT_FILENAME);
      const dest = path.join(platformProjectRoot, projectName, SWIFT_FILENAME);
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);

// 2) Register the file with the app target's Sources build phase.
const addSwiftToTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const filePath = `${projectName}/${SWIFT_FILENAME}`;
    if (proj.hasFile(filePath)) return cfg;
    const groupKey =
      proj.findPBXGroupKey({ name: projectName }) ||
      proj.findPBXGroupKey({ path: projectName });
    proj.addSourceFile(filePath, { target: proj.getFirstTarget().uuid }, groupKey);
    return cfg;
  });

module.exports = (config) => addSwiftToTarget(copySwiftFile(config));

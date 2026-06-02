// src/lib/__tests__/edgeConfig.test.ts
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(__dirname, '../../../supabase/config.toml');
const toml = fs.readFileSync(configPath, 'utf8');

describe('supabase/config.toml edge function settings', () => {
  it('[functions.categorize] section exists', () => {
    expect(toml).toMatch(/\[functions\.categorize\]/);
  });

  it('[functions.categorize] has verify_jwt = true', () => {
    // Find the section and check it contains verify_jwt = true before the next section
    const sectionStart = toml.indexOf('[functions.categorize]');
    expect(sectionStart).toBeGreaterThan(-1);
    // Find the next section header after [functions.categorize]
    const afterSection = toml.slice(sectionStart);
    const nextSection = afterSection.search(/\n\[(?!functions\.categorize)/);
    const section = nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);
    expect(section).toMatch(/verify_jwt\s*=\s*true/);
  });
});

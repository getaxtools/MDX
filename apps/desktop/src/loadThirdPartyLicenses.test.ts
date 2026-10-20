import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadThirdPartyLicenses } from './loadThirdPartyLicenses';

const isGenerated = existsSync(join(import.meta.dirname, 'generated', 'third-party-licenses.json'));

describe('loadThirdPartyLicenses', () => {
  it.runIf(isGenerated)('lists the packages built into the app with a license for each', async () => {
    const licenses = await loadThirdPartyLicenses();
    const names = licenses?.packages.map((thirdPartyPackage) => thirdPartyPackage.name) ?? [];

    expect(names).toEqual(
      expect.arrayContaining(['dompurify', 'markdown-it', '@codemirror/view', 'tauri', 'serde']),
    );
    expect(names.some((name) => name.startsWith('@mdx/') || name === 'mdx-desktop')).toBe(false);
    for (const thirdPartyPackage of licenses?.packages ?? []) {
      expect(thirdPartyPackage.license, thirdPartyPackage.name).not.toBe('');
      if (thirdPartyPackage.textIndex !== null) {
        expect(licenses?.texts[thirdPartyPackage.textIndex], thirdPartyPackage.name).toBeTruthy();
      }
    }
  });

  it.runIf(isGenerated)('leaves out build-only tools such as the Tauri CLI', async () => {
    const licenses = await loadThirdPartyLicenses();
    const names = licenses?.packages.map((thirdPartyPackage) => thirdPartyPackage.name) ?? [];

    expect(names).not.toContain('tauri-build');
    expect(names).not.toContain('vite');
  });
});

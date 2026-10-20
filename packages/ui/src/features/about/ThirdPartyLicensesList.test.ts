import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ThirdPartyLicenses } from './ThirdPartyLicenses';
import ThirdPartyLicensesList from './ThirdPartyLicensesList.svelte';

const LICENSES: ThirdPartyLicenses = {
  packages: [
    {
      ecosystem: 'npm',
      name: 'dompurify',
      version: '3.4.17',
      license: '(MPL-2.0 OR Apache-2.0)',
      textIndex: 0,
    },
    { ecosystem: 'cargo', name: 'serde', version: '1.0.0', license: 'MIT OR Apache-2.0', textIndex: 1 },
    { ecosystem: 'cargo', name: 'webview2-com', version: '0.39.1', license: 'MIT', textIndex: null },
  ],
  texts: ['DOMPurify license text', 'Serde license text'],
};

function renderList(licenses?: ThirdPartyLicenses) {
  render(ThirdPartyLicensesList, {
    translator: createTranslator(),
    loadLicenses: () => Promise.resolve(licenses),
  });
}

describe('ThirdPartyLicensesList', () => {
  it('lists every package with its version and license', async () => {
    renderList(LICENSES);

    expect(await screen.findByText('MDX is built with 3 open-source packages.')).toBeTruthy();
    expect(screen.getByText('dompurify')).toBeTruthy();
    expect(screen.getByText('MIT OR Apache-2.0')).toBeTruthy();
  });

  it('shows a package’s license text when opened', async () => {
    renderList(LICENSES);

    await userEvent.click(await screen.findByText('serde'));

    expect(screen.getByText('Serde license text')).toBeTruthy();
  });

  it('names the license of a package that ships no license file', async () => {
    renderList(LICENSES);

    await userEvent.click(await screen.findByText('webview2-com'));

    expect(screen.getByText('This package ships no license file; it is licensed under MIT.')).toBeTruthy();
  });

  it('filters packages by name', async () => {
    renderList(LICENSES);

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Filter packages by name' }), 'SER');

    expect(screen.getByText('serde')).toBeTruthy();
    expect(screen.queryByText('dompurify')).toBeNull();
  });

  it('says when the build has no license list', async () => {
    renderList();

    expect(
      await screen.findByText('This build does not include the list of third-party licenses.'),
    ).toBeTruthy();
  });
});

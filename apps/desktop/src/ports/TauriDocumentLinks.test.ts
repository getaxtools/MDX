import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriDocumentLinks } from './TauriDocumentLinks';

const GUIDE = 'C:\\Docs\\guide.md';

afterEach(() => clearMocks());

describe('TauriDocumentLinks', () => {
  it('inspects a link, then opens the document it was asked about', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return command === 'inspect_document_link'
        ? { path: 'D:\\Shared\\plan.md', isGranted: false }
        : 'D:\\Shared\\plan.md';
    });
    const links = new TauriDocumentLinks();

    const inspected = await links.inspectDocumentLink(GUIDE, 'shared/plan.md');
    await links.resolveDocumentLink(GUIDE, 'shared/plan.md', inspected.path);

    expect(inspected).toEqual({ path: 'D:\\Shared\\plan.md', isGranted: false });
    expect(calls).toEqual([
      { command: 'inspect_document_link', args: { document: GUIDE, href: 'shared/plan.md' } },
      {
        command: 'resolve_document_link',
        args: { document: GUIDE, href: 'shared/plan.md', expectedTarget: 'D:\\Shared\\plan.md' },
      },
    ]);
  });
});

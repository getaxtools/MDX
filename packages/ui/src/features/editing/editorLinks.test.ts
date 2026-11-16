import type { OutlineEntry } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { editorLinkTarget, linkedOutlineEntry, openLinkFromEditor } from './editorLinks';

const OUTLINE: readonly OutlineEntry[] = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Install', id: 'mdx-install', line: 4 },
];

describe('links opened from the editor', () => {
  it('a relative address opens a document and a web address an external link, as in the preview', () => {
    expect(editorLinkTarget('notes/plan.md#next')).toEqual({
      kind: 'document',
      link: { kind: 'document', href: 'notes/plan.md#next' },
    });
    expect(editorLinkTarget('https://example.com')).toEqual({
      kind: 'external',
      link: { kind: 'external', href: 'https://example.com' },
    });
    expect(editorLinkTarget('mailto:someone@example.com')?.kind).toBe('external');
  });

  it('an address the preview refuses opens nothing', () => {
    expect(editorLinkTarget('javascript:alert(1)')).toBeUndefined();
    expect(editorLinkTarget('//example.com/file.md')).toBeUndefined();
  });

  it('a fragment goes to the heading the preview would scroll to', () => {
    const target = editorLinkTarget('#Install');

    expect(target).toEqual({ kind: 'heading', fragment: 'Install' });
    expect(linkedOutlineEntry(OUTLINE, 'Install')?.line).toBe(4);
    expect(linkedOutlineEntry(OUTLINE, 'missing')).toBeUndefined();
  });

  it('opens documents and web addresses through the app, and goes to headings of this document', () => {
    const actions = { openLink: vi.fn(), goToHeading: vi.fn() };

    openLinkFromEditor('plan.md', OUTLINE, actions);
    openLinkFromEditor('#install', OUTLINE, actions);
    openLinkFromEditor('#missing', OUTLINE, actions);
    openLinkFromEditor('javascript:alert(1)', OUTLINE, actions);

    expect(actions.openLink.mock.calls).toEqual([[{ kind: 'document', href: 'plan.md' }]]);
    expect(actions.goToHeading.mock.calls).toEqual([[OUTLINE[1]]]);
  });
});

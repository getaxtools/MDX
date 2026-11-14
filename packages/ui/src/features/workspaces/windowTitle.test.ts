import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { windowTitleFor } from './windowTitle';

const translator = createTranslator();

describe('windowTitleFor', () => {
  it('the title contains the document and workspace names', () => {
    expect(windowTitleFor({ documentName: 'guide.md', workspaceName: 'Handbook' }, translator)).toBe(
      'guide.md - Handbook - MDX',
    );
  });

  it('names the workspace when no document is shown', () => {
    expect(windowTitleFor({ workspaceName: 'Handbook' }, translator)).toBe('Handbook - MDX');
  });

  it('names only the document without workspaces', () => {
    expect(windowTitleFor({ documentName: 'guide.md' }, translator)).toBe('guide.md - MDX');
  });

  it('uses the full app name when there is nothing to name', () => {
    expect(windowTitleFor({}, translator)).toBe('MDX - Markdown Explorer');
  });
});

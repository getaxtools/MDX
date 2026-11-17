import { createTranslator } from '@mdx/i18n';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { createRichTextRendering } from '../editing/richTextRendering';
import SourceEditorPane from '../editing/SourceEditorPane.svelte';
import { noteEmbedResolver, type NoteEmbedSources } from './noteEmbeds';

const LOCATION = String.raw`E:\Notes`;
const EDITOR_LOAD_WAIT = { timeout: 5_000 };

function resolverWith(texts: Readonly<Record<string, string>>, overrides: Partial<NoteEmbedSources> = {}) {
  const openNote = vi.fn();
  const offerNote = vi.fn();
  const readNote = vi.fn((path: string) => {
    const text = texts[path];
    return text === undefined ? Promise.reject(new Error('missing')) : Promise.resolve(text);
  });
  const resolver = noteEmbedResolver({
    location: LOCATION,
    fromNote: 'Daily/Today.md',
    notes: [{ path: 'Daily/Today.md' }, { path: 'Projects/Plan.md' }, { path: 'Private/Salary.md' }],
    excludedPaths: ['Private'],
    readNote,
    openNote,
    offerNote,
    translator: createTranslator(),
    ...overrides,
  });
  return { resolver, readNote, openNote, offerNote };
}

describe('note embeds', () => {
  it('a line that is only an embed names its target', () => {
    const { resolver } = resolverWith({});

    expect(resolver.targetOf('![[Plan]]')).toBe('Plan');
    expect(resolver.targetOf('  ![[Projects/Plan#Venue|the plan]]  ')).toBe('Projects/Plan');
    expect(resolver.targetOf('See ![[Plan]] here')).toBeUndefined();
    expect(resolver.targetOf('[[Plan]]')).toBeUndefined();
  });

  it('shows the note its wiki-link would open', async () => {
    const { resolver, readNote } = resolverWith({ [String.raw`E:\Notes\Projects\Plan.md`]: '# Plan' });

    await expect(resolver.resolve('Plan')).resolves.toBe('# Plan');
    expect(readNote).toHaveBeenCalledWith(String.raw`E:\Notes\Projects\Plan.md`);
  });

  it('a target that names no note resolves to nothing', async () => {
    const { resolver, readNote } = resolverWith({});

    await expect(resolver.resolve('Missing')).resolves.toBeUndefined();
    expect(readNote).not.toHaveBeenCalled();
  });

  it('a note under an excluded path is never read', async () => {
    const { resolver, readNote } = resolverWith({ [String.raw`E:\Notes\Private\Salary.md`]: 'secret' });

    await expect(resolver.resolve('Salary')).resolves.toBeUndefined();
    expect(readNote).not.toHaveBeenCalled();
  });

  it('opens the embedded note, and offers to create a missing one', () => {
    const { resolver, openNote, offerNote } = resolverWith({});

    resolver.open('Plan');
    resolver.open('Missing');

    expect(openNote).toHaveBeenCalledWith(String.raw`E:\Notes\Projects\Plan.md`);
    expect(offerNote).toHaveBeenCalledWith('Missing');
  });

  it('names the region and the not found state in the app language', () => {
    const { resolver } = resolverWith({});

    expect(resolver.labels.region('Plan')).toBe('Embedded note Plan');
    expect(resolver.labels.notFound('Plan')).toBe('Not found: Plan');
  });
});

describe('note embeds in Rich text', () => {
  it('embedded content is sanitized like the preview', async () => {
    const preview = createMarkdownRenderer({ window });
    const translator = createTranslator();
    const hostile =
      'Hello <script>window.hacked = true</script>\n\n<img src="x" onerror="window.hacked = true">';
    const { resolver } = resolverWith({ [String.raw`E:\Notes\Projects\Plan.md`]: hostile });
    const rendering = createRichTextRendering({
      documentKey: 'today',
      renderMarkdown: (markdown: string) => preview.render(markdown).html,
      richBlocks: undefined,
      translator,
    });

    render(SourceEditorPane, {
      canonicalKey: String.raw`e:\notes\daily\today.md`,
      fileName: 'Today.md',
      text: 'Intro\n\n![[Plan]]\n\nEnd',
      zoomPercent: 100,
      editingMode: 'richText',
      translator,
      onChange: vi.fn(),
      embedResolver: resolver,
      richTextRendering: rendering,
    });
    await screen.findByRole('textbox', { name: 'Source of Today.md' }, EDITOR_LOAD_WAIT);
    const region = await screen.findByRole('region', { name: 'Embedded note Plan' }, EDITOR_LOAD_WAIT);
    await waitFor(() => expect(region.textContent).toContain('Hello'));

    expect(region.querySelector('script')).toBeNull();
    expect(region.querySelector('[onerror]')).toBeNull();
    expect(region.querySelector('.cm-rich-embed-content')?.innerHTML).toBe(rendering.renderBlock(hostile));
  });
});

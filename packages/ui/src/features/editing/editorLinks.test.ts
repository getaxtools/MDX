import type { WrittenLink } from '@mdx/editor';
import { createMarkdownRenderer, type OutlineEntry } from '@mdx/renderer';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { editorLinkTarget, linkedOutlineEntry, openLinkFromEditor } from './editorLinks';

const OUTLINE: readonly OutlineEntry[] = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Install', id: 'mdx-install', line: 4 },
];

const preview = createMarkdownRenderer({ window });

/** What the preview's link would open for this Markdown: its kind and href, or nothing. */
function previewTarget(markdown: string): { kind: string; href: string } | undefined {
  const holder = document.createElement('div');
  holder.innerHTML = preview.render(markdown).html;
  const link = holder.querySelector('a[href][data-mdx-link]');
  const href = link?.getAttribute('href');
  const kind = link?.getAttribute('data-mdx-link');
  return href && kind ? { kind, href } : undefined;
}

/** What the editor opens for the same link, in the same shape. */
function editorTarget(written: WrittenLink): { kind: string; href: string } | undefined {
  const target = editorLinkTarget(written);
  if (!target) return undefined;
  return target.kind === 'heading'
    ? { kind: 'anchor', href: `#${target.fragment}` }
    : { kind: target.kind, href: target.link.href };
}

const DESTINATION_CORPUS = [
  'guide.md',
  '<my guide.md>',
  'a.md?x=1&amp;y=2',
  'caf&eacute;.md',
  '< https://evil.com>',
  '<https://a.com/" -new-window "C:/x>',
  'https://аpple.com/login',
  'https://example.com/\u202Egpj.exe',
  'https&#58;//example.com',
  'notes/plan.md#next-steps',
  '#Install',
  'javascript:alert(1)',
  '//example.com/file.md',
  'mailto:someone@example.com',
  '<a(b).md>',
];

describe('links opened from the editor', () => {
  it.each(DESTINATION_CORPUS)('the editor opens what the preview opens for [x](%s)', (destination) => {
    expect(editorTarget({ destination, form: 'destination' })).toEqual(previewTarget(`[x](${destination})`));
  });

  it.each(['someone@example.com', 'https://example.com/a b', 'https://example.com/path'])(
    'the editor opens what the preview opens for the autolink <%s>',
    (destination) => {
      expect(editorTarget({ destination, form: 'autolink' })).toEqual(previewTarget(`<${destination}>`));
    },
  );

  it.each(['www.medium.com/@author', 'www.example.com', 'someone@example.com', 'https://example.com'])(
    'the editor opens what the preview links in the text %s',
    (destination) => {
      expect(editorTarget({ destination, form: 'text' })).toEqual(previewTarget(destination));
    },
  );

  it('quotes and spaces reach the opener encoded', () => {
    const target = editorLinkTarget({
      destination: '<https://a.com/" -new-window "C:/x>',
      form: 'destination',
    });

    expect(target).toEqual({
      kind: 'external',
      link: { kind: 'external', href: 'https://a.com/%22%20-new-window%20%22C:/x' },
    });
  });

  it('an international address opens with its host in punycode', () => {
    const target = editorLinkTarget({ destination: 'https://аpple.com/login', form: 'destination' });

    expect(target?.kind === 'external' ? target.link.href : undefined).toBe('https://xn--pple-43d.com/login');
  });

  it('a web address in text with an @ in its path never opens as mail', () => {
    const withoutScheme = editorLinkTarget({ destination: 'www.medium.com/@author', form: 'text' });
    const withScheme = editorLinkTarget({ destination: 'https://medium.com/@author', form: 'text' });

    expect(withoutScheme).toBeUndefined();
    expect(withScheme?.kind === 'external' ? withScheme.link.href : undefined).toBe(
      'https://medium.com/@author',
    );
  });

  it('for any destination, the editor opens what the preview opens', () => {
    const character = fc.constantFrom(
      ...Array.from('ab:/.#?&;%"\' ()-_=+@!~*$,[]{}|^`'),
      'é',
      'а',
      '\u202E',
      '\u00A0',
      '😀',
      '&amp;',
      '&#58;',
      '&eacute;',
    );
    const destination = fc.array(character, { maxLength: 24 }).map((characters) => characters.join(''));

    fc.assert(
      fc.property(destination, (written) => {
        const bracketed = `<${written}>`;

        expect(editorTarget({ destination: bracketed, form: 'destination' })).toEqual(
          previewTarget(`[x](${bracketed})`),
        );
      }),
    );
  });

  it('opens documents and web addresses through the app, and goes to headings of this document', () => {
    const actions = { openLink: vi.fn(), goToHeading: vi.fn() };

    openLinkFromEditor({ destination: 'plan.md', form: 'destination' }, OUTLINE, actions);
    openLinkFromEditor({ destination: '#install', form: 'destination' }, OUTLINE, actions);
    openLinkFromEditor({ destination: '#missing', form: 'destination' }, OUTLINE, actions);
    openLinkFromEditor({ destination: 'javascript:alert(1)', form: 'destination' }, OUTLINE, actions);

    expect(actions.openLink.mock.calls).toEqual([[{ kind: 'document', href: 'plan.md' }]]);
    expect(actions.goToHeading.mock.calls).toEqual([[OUTLINE[1]]]);
  });

  it('a fragment goes to the heading the preview would scroll to', () => {
    expect(linkedOutlineEntry(OUTLINE, 'Install')?.line).toBe(4);
    expect(linkedOutlineEntry(OUTLINE, 'missing')).toBeUndefined();
  });
});

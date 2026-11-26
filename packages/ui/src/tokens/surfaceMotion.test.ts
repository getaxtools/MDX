import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_SOURCES = join(import.meta.dirname, '..');

interface Surface {
  readonly kind: string;
  readonly file: string;
  readonly selector: string;
  readonly token: string;
}

const SURFACES: readonly Surface[] = [
  { kind: 'menu', file: 'components/ContextMenu.svelte', selector: '.context-menu', token: '--motion-fast' },
  {
    kind: 'command palette and quick open',
    file: 'features/command-palette/CommandPalette.svelte',
    selector: '.palette',
    token: '--motion-fast',
  },
  {
    kind: 'popover',
    file: 'features/workspaces/WorkspaceSwitcher.svelte',
    selector: '.switcher',
    token: '--motion-fast',
  },
  {
    kind: 'popover',
    file: 'features/control-wheel/KindSettingsPopup.svelte',
    selector: '.kind-settings',
    token: '--motion-fast',
  },
  {
    kind: 'sheet opening',
    file: 'components/Dialog.svelte',
    selector: '.dialog.shared-frame',
    token: '--motion-slow',
  },
  {
    kind: 'dialog closing',
    file: 'components/Dialog.svelte',
    selector: '.backdrop.closing',
    token: '--motion-medium',
  },
];

function styleOf(component: string): string {
  return /<style[^>]*>([\s\S]*?)<\/style>/.exec(component)?.[1] ?? '';
}

function animationValuesFor(css: string, selector: string): string[] {
  const values: string[] = [];
  const openBlocks: string[] = [];
  for (const [, text = '', brace] of css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)([{}])/g)) {
    if (brace === '{') {
      openBlocks.push(text.trim());
      continue;
    }
    if (openBlocks.at(-1) === selector) values.push(...animationValuesIn(text));
    openBlocks.pop();
  }
  return values;
}

function animationValuesIn(declarations: string): string[] {
  return declarations
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter(([property = '']) => /^animation(-duration)?$/.test(property.trim()))
    .map(([, ...value]) => value.join(':').trim());
}

function expectSurfaceToUseOnly({ file, selector, token }: Surface): void {
  const css = styleOf(readFileSync(join(UI_SOURCES, file), 'utf8'));

  const values = animationValuesFor(css, selector);

  expect(values.length, `${selector} has an animation`).toBeGreaterThan(0);
  expect(values.filter((value) => !value.includes(`var(${token})`))).toEqual([]);
}

const QUICK_SURFACES = SURFACES.filter(({ token }) => token === '--motion-fast');
const DIALOG_SURFACES = SURFACES.filter(({ token }) => token !== '--motion-fast');

describe('surface motion', () => {
  it('menus are quick: the fast motion token is 120 ms', () => {
    const tokens = readFileSync(join(UI_SOURCES, 'tokens/tokens.css'), 'utf8');

    expect(/--motion-fast:\s*([^;]+);/.exec(tokens)?.[1]).toBe('120ms');
  });

  it.each(QUICK_SURFACES)(
    'menus are quick: surface motion uses the token for its kind, $kind in $file',
    (surface) => {
      expectSurfaceToUseOnly(surface);
    },
  );

  it.each(DIALOG_SURFACES)('surface motion uses the token for its kind: $kind in $file', (surface) => {
    expectSurfaceToUseOnly(surface);
  });

  it('reads every animation of a selector, including one inside a media query, and no other selector', () => {
    const css = `
      .menu { animation: fade-in var(--motion-fast) ease; color: red; }
      @media (prefers-reduced-motion: no-preference) { .menu { animation: rise-in var(--motion-slow); } }
      .menu-item { animation: fade-in var(--motion-medium); }
    `;

    expect(animationValuesFor(css, '.menu')).toEqual([
      'fade-in var(--motion-fast) ease',
      'rise-in var(--motion-slow)',
    ]);
  });
});

import { WORKSPACE_KINDS } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { KIND_ICONS, kindNameOf } from './kindPresentation';

describe('kind presentation', () => {
  const translator = createTranslator();

  it('gives every registered kind a name in the English catalog', () => {
    const names = WORKSPACE_KINDS.map((kind) => kindNameOf(kind.id, translator));

    expect(names).toEqual(['Markdown viewer', 'Notes', 'Spec viewer']);
  });

  it('gives every registered kind an icon', () => {
    for (const kind of WORKSPACE_KINDS) expect(KIND_ICONS[kind.id].length).toBeGreaterThan(0);
  });
});

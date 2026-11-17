import { texWithFields } from '@mdx/editor';
import { createRichBlockRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { EQUATION_TEMPLATE_GROUPS, templatePreviewSource } from './equationTemplates';

const TEMPLATES = EQUATION_TEMPLATE_GROUPS.flatMap((group) => group.templates);
/** Typesetting and sanitizing every template twice takes a few seconds in jsdom. */
const ALL_TEMPLATES_TIMEOUT_MS = 30_000;

describe('equation templates', () => {
  it(
    'every template typesets with the preview options, as shown and as written',
    async () => {
      const renderer = createRichBlockRenderer({ window });

      const failing: string[] = [];
      for (const { nameKey, source } of TEMPLATES) {
        const shown = await renderer.previewFormula(templatePreviewSource(source), true);
        const written = await renderer.previewFormula(texWithFields(source).text, true);
        if (shown.kind !== 'typeset' || written.kind !== 'typeset') failing.push(nameKey);
      }

      expect(failing).toEqual([]);
    },
    ALL_TEMPLATES_TIMEOUT_MS,
  );

  it('the quadratic formula starts at its first placeholder, b', () => {
    const quadratic = TEMPLATES.find(({ nameKey }) => nameKey === 'equation.template.quadraticFormula');
    const { text, fields } = texWithFields(quadratic?.source ?? '');

    expect(text).toBe(String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`);
    expect(fields[0] && text.slice(fields[0].from, fields[0].to)).toBe('b');
  });

  it('an empty placeholder shows as a box', () => {
    expect(templatePreviewSource(String.raw`\frac{#{}}{#{n}}`)).toBe(String.raw`\frac{\square}{n}`);
  });
});

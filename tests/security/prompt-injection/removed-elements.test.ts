import { Ruleset } from '@mdx/core';
import { createHtmlSanitizer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';

const CANDIDATE_ELEMENTS = [
  'script',
  'style',
  'template',
  'textarea',
  'iframe',
  'noscript',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'title',
  'select',
  'option',
  'object',
  'embed',
  'form',
  'button',
  'dialog',
  'svg',
  'math',
  'audio',
  'video',
  'desc',
  'annotation-xml',
  'foreignobject',
  'mi',
  'mtext',
  'details',
  'span',
];
const CANARY = 'CANARY-7F3';

describe('hidden-removed-element', () => {
  it('lists exactly the elements whose content the sanitizer drops', () => {
    const sanitize = createHtmlSanitizer(window);
    const droppedBySanitizer = CANDIDATE_ELEMENTS.filter(
      (name) => !sanitize(`<p>a<${name}>${CANARY}</${name}>b</p>`).includes(CANARY),
    );

    const listedByRule = Ruleset.bundled().list('removedContentElements');

    expect([...listedByRule].sort()).toEqual(droppedBySanitizer.sort());
  });
});

import type { MarkdownIt, RendererRule } from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import { HEADING_ID_PREFIX } from './headingAnchorsPlugin';

const FOOTNOTE_ID_OR_LINK = /(id="|href="#)(fn)/g;
const RULES_WITH_FOOTNOTE_IDS = ['footnote_ref', 'footnote_open', 'footnote_anchor'] as const;

/** Footnotes whose ids carry the prefix that the sanitizer keeps, so their links keep working. */
export function footnotesPlugin(markdown: MarkdownIt): void {
  markdown.use(footnotes);
  for (const ruleName of RULES_WITH_FOOTNOTE_IDS) {
    const render = markdown.renderer.rules[ruleName];
    if (render) markdown.renderer.rules[ruleName] = withPrefixedIds(render);
  }
}

function withPrefixedIds(render: RendererRule): RendererRule {
  return (...ruleArguments) =>
    render(...ruleArguments).replace(FOOTNOTE_ID_OR_LINK, `$1${HEADING_ID_PREFIX}$2`);
}

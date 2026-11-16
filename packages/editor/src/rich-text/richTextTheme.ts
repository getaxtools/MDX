import { EditorView } from '@codemirror/view';
import {
  BULLET_CLASS,
  CODE_LINE_CLASS,
  DEEPEST_HEADING_LEVEL,
  DEEPEST_QUOTE_STYLE,
  HEADING_CLASS,
  INLINE_CODE_CLASS,
  LINK_TEXT_CLASS,
  LIST_NUMBER_CLASS,
  QUOTE_CLASS,
  RICH_TEXT_CLASS,
  TASK_CHECKBOX_CLASS,
  headingClassOf,
  quoteDepthClassOf,
} from './richTextClasses';
import { TYPOGRAPHY_ATTRIBUTE } from './typography';

const RICH = `&.${RICH_TEXT_CLASS}`;
const QUOTE_LINE = `.cm-line.${QUOTE_CLASS}`;
const CHECKED = `.${TASK_CHECKBOX_CLASS}[aria-checked="true"]`;

/** The preview's heading sizes from `document.css`, so Rich text and the preview match. */
const HEADING_SIZES = ['2em', '1.625em', '1.375em', '1.125em', '1em', '1em'];

const headingRules = Object.fromEntries(
  HEADING_SIZES.map((fontSize, index) => [`.${headingClassOf(index + 1)}`, { fontSize }]),
);

/** Each nested quote moves its bar by one bar and its gap, like the preview's nested quotes. */
function quoteIndent(depth: number): string {
  return `calc(var(--space-6) + ${String(depth - 1)} * (3px + var(--space-4)))`;
}

const nestedQuoteRules = Object.fromEntries(
  Array.from({ length: DEEPEST_QUOTE_STYLE - 1 }, (_, index) => {
    const depth = index + 2;
    return [`${QUOTE_LINE}.${quoteDepthClassOf(depth)}`, { marginInlineStart: quoteIndent(depth) }];
  }),
);

const documentStyleRules = {
  [`${RICH} .cm-content`]: { fontFamily: 'var(--font-reading)', lineHeight: 'var(--line-height-reading)' },
  [`${RICH}[${TYPOGRAPHY_ATTRIBUTE}="book"] .cm-content`]: {
    fontFamily: 'var(--font-serif)',
    fontSize: '1.125em',
    lineHeight: '1.75',
    hyphens: 'auto',
  },
  [`${RICH}[${TYPOGRAPHY_ATTRIBUTE}="academic"] .cm-content`]: {
    fontFamily: 'var(--font-serif)',
    lineHeight: '1.5',
  },
};

const textRules = {
  [`.${HEADING_CLASS}`]: { fontWeight: '600', lineHeight: '1.3', color: 'var(--color-text)' },
  // The Markdown highlighter colours heading text; Rich text shows it in the text colour, like the preview.
  [`.${HEADING_CLASS} span`]: { color: 'inherit' },
  [`.${headingClassOf(DEEPEST_HEADING_LEVEL)}`]: { color: 'var(--color-text-secondary)' },
  ...headingRules,
  [`.${LINK_TEXT_CLASS}, .${HEADING_CLASS} .${LINK_TEXT_CLASS}`]: {
    color: 'var(--color-accent)',
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.2em',
  },
  [`.cm-line.${CODE_LINE_CLASS}`]: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    lineHeight: '1.5',
    backgroundColor: 'var(--color-code-background)',
  },
  [`.${INLINE_CODE_CLASS}`]: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    backgroundColor: 'var(--color-code-background)',
    borderRadius: 'var(--radius-xsmall)',
  },
};

const blockMarkerRules = {
  [QUOTE_LINE]: {
    borderInlineStart: '3px solid var(--color-border-strong)',
    paddingInlineStart: 'var(--space-4)',
    marginInlineStart: quoteIndent(1),
    color: 'var(--color-text-secondary)',
  },
  ...nestedQuoteRules,
  [`.${BULLET_CLASS}, .${LIST_NUMBER_CLASS}`]: { color: 'var(--color-text)' },
  [`.${TASK_CHECKBOX_CLASS}`]: {
    display: 'inline-block',
    boxSizing: 'border-box',
    inlineSize: '1em',
    blockSize: '1em',
    verticalAlign: '-0.15em',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-xsmall)',
    backgroundColor: 'var(--color-background)',
    cursor: 'pointer',
  },
  [CHECKED]: { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' },
  [`${CHECKED}::after`]: {
    content: '"✓"',
    display: 'block',
    color: 'var(--color-accent-text)',
    fontSize: '0.8em',
    lineHeight: '1.2',
    textAlign: 'center',
  },
};

/** System colours are kept under forced colours, so links stay links and headings stay text. */
const forcedColourRules = {
  '@media (forced-colors: active)': {
    [`.${HEADING_CLASS}, .${HEADING_CLASS} span`]: { color: 'CanvasText' },
    [`.${LINK_TEXT_CLASS}, .${LINK_TEXT_CLASS} *, .${HEADING_CLASS} .${LINK_TEXT_CLASS}, .${HEADING_CLASS} .${LINK_TEXT_CLASS} *`]:
      { color: 'LinkText' },
    [QUOTE_LINE]: { borderInlineStartColor: 'CanvasText', color: 'CanvasText' },
    [`.${TASK_CHECKBOX_CLASS}`]: { borderColor: 'CanvasText' },
    [CHECKED]: { backgroundColor: 'Highlight', borderColor: 'Highlight' },
    [`${CHECKED}::after`]: { color: 'HighlightText' },
  },
};

/** Rich text in the preview's fonts, sizes and colours, from the app's design tokens. */
export const richTextTheme = EditorView.theme({
  ...documentStyleRules,
  ...textRules,
  ...blockMarkerRules,
  ...forcedColourRules,
});

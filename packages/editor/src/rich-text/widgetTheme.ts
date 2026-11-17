import { EditorView } from '@codemirror/view';
import {
  CALLOUT_CLASS,
  CALLOUT_TITLE_CLASS,
  DIAGRAM_CLASS,
  FORMULA_CLASS,
  IMAGE_CLASS,
  PROPERTIES_CLASS,
  RENDERED_BLOCK_CLASS,
  RULE_CLASS,
  TABLE_CLASS,
} from './richTextClasses';

/** The preview's five callout looks, each with its colour token. */
const CALLOUT_LOOKS = ['note', 'tip', 'important', 'warning', 'caution'];
const CALLOUT_LINE = `.cm-line.${CALLOUT_CLASS}`;

const calloutLookRules = Object.fromEntries(
  CALLOUT_LOOKS.map((look) => [
    `${CALLOUT_LINE}.${CALLOUT_CLASS}-${look}`,
    { '--callout-color': `var(--color-alert-${look})` },
  ]),
);

const calloutRules = {
  [CALLOUT_LINE]: {
    '--callout-color': 'var(--color-alert-note)',
    borderInlineStart: '3px solid var(--callout-color)',
    backgroundColor: 'color-mix(in srgb, var(--callout-color) 8%, transparent)',
    color: 'var(--color-text)',
  },
  ...calloutLookRules,
  [`.${CALLOUT_TITLE_CLASS}`]: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    // The look's colour is too light for text on its own tint, so it marks the icons only.
    color: 'var(--color-text)',
    fontWeight: '600',
  },
  [`.${CALLOUT_TITLE_CLASS} button`]: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    minWidth: '24px',
    minHeight: '24px',
    padding: '0 2px',
    border: '0',
    borderRadius: 'var(--radius-small)',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  },
  [`.${CALLOUT_TITLE_CLASS} button:hover`]: { background: 'var(--color-surface-hover)' },
  [`.${CALLOUT_TITLE_CLASS} button:focus-visible`]: { outline: '2px solid var(--color-focus)' },
  [`.${CALLOUT_TITLE_CLASS} svg`]: {
    width: '16px',
    height: '16px',
    fill: 'none',
    stroke: 'var(--callout-color)',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  [`.${CALLOUT_TITLE_CLASS} [aria-expanded='true'] svg`]: { transform: 'rotate(90deg)' },
};

const renderedBlockRules = {
  [`.${RENDERED_BLOCK_CLASS}`]: { fontFamily: 'var(--font-reading)', whiteSpace: 'normal' },
  [`div.${FORMULA_CLASS}`]: { display: 'block', textAlign: 'center', overflowX: 'auto' },
  [`.${TABLE_CLASS}`]: { overflowX: 'auto' },
  [`.${TABLE_CLASS} table`]: { borderCollapse: 'collapse' },
  [`.${TABLE_CLASS} :is(th, td)`]: { border: '1px solid var(--color-border)', padding: '6px var(--space-3)' },
  [`.${TABLE_CLASS} th`]: { backgroundColor: 'var(--color-surface)', fontWeight: '600', textAlign: 'start' },
  [`.${IMAGE_CLASS} img`]: { maxWidth: '100%', verticalAlign: 'bottom' },
  [`.${IMAGE_CLASS} img[data-mdx-blocked-src]`]: { display: 'none' },
  [`.${RENDERED_BLOCK_CLASS} .blocked-remote-image`]: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    padding: 'var(--space-3) var(--space-4)',
    border: '1px dashed var(--color-border-strong)',
    borderRadius: 'var(--radius-medium)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-size-small)',
    overflowWrap: 'anywhere',
  },
  [`.${RULE_CLASS}`]: {
    display: 'inline-block',
    inlineSize: '100%',
    verticalAlign: 'middle',
    borderBlockStart: '1px solid var(--color-border)',
  },
  [`.${PROPERTIES_CLASS}`]: {
    display: 'inline-block',
    padding: '0 var(--space-2)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-medium)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-size-small)',
  },
  [`.${DIAGRAM_CLASS}`]: { textAlign: 'center' },
};

const forcedColourRules = {
  '@media (forced-colors: active)': {
    [CALLOUT_LINE]: { borderInlineStartColor: 'CanvasText' },
    [`.${CALLOUT_TITLE_CLASS}`]: { color: 'CanvasText' },
    [`.${CALLOUT_TITLE_CLASS} svg`]: { stroke: 'CanvasText' },
    [`.${RULE_CLASS}`]: { borderBlockStartColor: 'CanvasText' },
    [`.${PROPERTIES_CLASS}`]: { borderColor: 'CanvasText', color: 'CanvasText' },
  },
};

/** Rendered blocks and callouts with the preview's look, from the app's design tokens. */
export const widgetTheme = EditorView.theme({ ...calloutRules, ...renderedBlockRules, ...forcedColourRules });

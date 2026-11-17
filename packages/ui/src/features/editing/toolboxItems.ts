import { EDITOR_SHORTCUTS } from '@mdx/editor/shortcuts';
import type { FormattingState, ToolboxAction } from '@mdx/editor';
import type { MessageKey, Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { describeCombination } from '../shortcuts/describeCombination';
import { tooltipWithShortcut } from '../shortcuts/commandShortcuts';

/**
 * A button of the Formatting toolbar, a menu button, or the Rich text switch. The Math split button
 * is the `formula` button, which starts a formula of the kind chosen last, and the `mathMenu` beside it.
 */
export type ToolboxControl =
  | { readonly kind: 'button'; readonly action: ToolboxAction; readonly labelKey: MessageKey }
  | { readonly kind: 'headingMenu' }
  | { readonly kind: 'mathMenu' }
  | { readonly kind: 'richText' };

const button = (action: ToolboxAction, labelKey: MessageKey): ToolboxControl => ({
  kind: 'button',
  action,
  labelKey,
});

/** The toolbox's groups in order; narrow windows move whole groups, from the right, into More formatting. */
export const TOOLBOX_GROUPS: readonly (readonly ToolboxControl[])[] = [
  [{ kind: 'headingMenu' }],
  [
    button('bold', 'editor.action.bold'),
    button('italic', 'editor.action.italic'),
    button('strikethrough', 'editor.action.strikethrough'),
    button('inlineCode', 'editor.action.inlineCode'),
    button('link', 'editor.action.link'),
  ],
  [
    button('bulletList', 'editor.action.bulletList'),
    button('numberedList', 'editor.action.numberedList'),
    button('taskList', 'editor.action.taskList'),
  ],
  [
    button('quote', 'editor.action.quote'),
    button('callout', 'editor.toolbox.callout'),
    button('codeBlock', 'editor.action.codeBlock'),
    button('table', 'editor.toolbox.table'),
    button('horizontalRule', 'editor.action.horizontalRule'),
    button('insertImage', 'editor.action.insertImage'),
    button('formula', 'editor.toolbox.math'),
    { kind: 'mathMenu' },
  ],
  [{ kind: 'richText' }],
];

const HEADING_CHOICES: readonly ToolboxAction[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
];

export function shortcutOf(action: ToolboxAction, translator: Translator): string | undefined {
  const shortcut = EDITOR_SHORTCUTS.find((candidate) => candidate.action === action);
  return shortcut ? describeCombination(shortcut.combination, translator) : undefined;
}

/** `Control+B` and so on, as `aria-keyshortcuts` names keys. */
export function ariaShortcutOf(action: ToolboxAction): string | undefined {
  const shortcut = EDITOR_SHORTCUTS.find((candidate) => candidate.action === action);
  return shortcut?.combination
    .map((part) => ({ ctrl: 'Control', alt: 'Alt', shift: 'Shift' })[part] ?? part)
    .join('+');
}

export function tooltipOf(action: ToolboxAction, translator: Translator, labelKey: MessageKey): string {
  return tooltipWithShortcut(translator.translate(labelKey), shortcutOf(action, translator));
}

const PRESSABLE_ACTIONS: ReadonlySet<ToolboxAction> = new Set<ToolboxAction>([
  'bold',
  'italic',
  'strikethrough',
  'inlineCode',
  'link',
  'bulletList',
  'numberedList',
  'taskList',
  'quote',
]);

/** Toggle buttons report whether the selection has their formatting; the others only act. */
export function isPressable(action: ToolboxAction): boolean {
  return PRESSABLE_ACTIONS.has(action);
}

export function isPressed(action: ToolboxAction, formatting: FormattingState | undefined): boolean {
  return formatting?.pressed.some((format) => format === action) ?? false;
}

const HEADING_LABEL_KEYS: readonly MessageKey[] = [
  'editor.toolbox.paragraph',
  'editor.action.heading1',
  'editor.action.heading2',
  'editor.action.heading3',
  'editor.action.heading4',
  'editor.action.heading5',
  'editor.action.heading6',
];

function headingLabelKey(level: number): MessageKey {
  return HEADING_LABEL_KEYS[level] ?? 'editor.toolbox.paragraph';
}

/** The heading menu button says the level of the caret's line, Paragraph included. */
export function headingMenuLabel(formatting: FormattingState | undefined, translator: Translator): string {
  const level = translator.translate(headingLabelKey(formatting?.headingLevel ?? 0));
  return translator.translate('editor.toolbox.headingMenu', { level });
}

export function headingMenuItems(translator: Translator): ContextMenuItem<ToolboxAction>[] {
  return HEADING_CHOICES.map((action, level) => ({
    id: action,
    label: translator.translate(headingLabelKey(level)),
    shortcut: shortcutOf(action, translator),
  }));
}

export function mathMenuItems(translator: Translator): ContextMenuItem<ToolboxAction>[] {
  return (['inlineMath', 'displayMath'] as const).map((action) => ({
    id: action,
    label: translator.translate(`editor.action.${action}`),
    shortcut: shortcutOf(action, translator),
  }));
}

/** What More formatting needs to show the same states as the buttons it stands in for. */
export interface ToolboxStates {
  readonly formatting: FormattingState | undefined;
  readonly isRichText: boolean;
}

/** More formatting offers the hidden groups' commands with the same names, states and shortcuts. */
export function overflowMenuItems(
  hiddenGroups: readonly (readonly ToolboxControl[])[],
  translator: Translator,
  states: ToolboxStates,
): ContextMenuItem<ToolboxAction | 'richText'>[] {
  return hiddenGroups.flatMap((group, index) =>
    group.flatMap((control, position) => {
      const items = itemsOf(control, translator, states);
      return items.map((item, itemIndex) => ({
        ...item,
        hasSeparatorBefore: index > 0 && position === 0 && itemIndex === 0,
      }));
    }),
  );
}

function itemsOf(
  control: ToolboxControl,
  translator: Translator,
  { formatting, isRichText }: ToolboxStates,
): ContextMenuItem<ToolboxAction | 'richText'>[] {
  if (control.kind === 'button') {
    const { action } = control;
    const shortcut = shortcutOf(action, translator);
    const isChecked = isPressable(action) ? isPressed(action, formatting) : undefined;
    return [{ id: action, label: translator.translate(control.labelKey), shortcut, isChecked }];
  }
  if (control.kind === 'headingMenu') return headingMenuItems(translator);
  if (control.kind === 'mathMenu') return mathMenuItems(translator);
  return [{ id: 'richText', label: translator.translate('editor.toolbox.richText'), isChecked: isRichText }];
}

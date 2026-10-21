import type { MessageKey, Translator } from '@mdx/i18n';

/** Modifier names followed by one key, for example `['ctrl', 'shift', 'S']`. */
export type KeyCombination = readonly string[];

type Modifier = 'ctrl' | 'shift' | 'alt';

const MODIFIER_LABELS: Readonly<Record<Modifier, MessageKey>> = {
  ctrl: 'keys.ctrl',
  shift: 'keys.shift',
  alt: 'keys.alt',
};

const TRANSLATED_KEY_LABELS: Readonly<Record<string, MessageKey>> = {
  ...MODIFIER_LABELS,
  wheel: 'keys.mouseWheel',
};

const KEY_SYMBOLS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

export function isModifier(part: string): part is Modifier {
  return Object.hasOwn(MODIFIER_LABELS, part);
}

export function describeCombination(combination: KeyCombination, translator: Translator): string {
  return combination
    .map((part) => {
      const labelKey = Object.hasOwn(TRANSLATED_KEY_LABELS, part) ? TRANSLATED_KEY_LABELS[part] : undefined;
      if (labelKey) return translator.translate(labelKey);
      return Object.hasOwn(KEY_SYMBOLS, part) ? KEY_SYMBOLS[part] : part;
    })
    .join('+');
}

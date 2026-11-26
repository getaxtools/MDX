import { loadMathFonts } from '@mdx/renderer';
import { MathfieldElement, type Keybinding } from 'mathlive';

export interface VisualFormulaEditorOptions {
  readonly parent: HTMLElement;
  readonly tex: string;
  readonly label: string;
  /** The formula's TeX after the user changed it in the visual editor. */
  readonly onChange: (tex: string) => void;
}

/** The equation editor's Visual tab: a visual formula editor kept to the TeX it is given. */
export interface VisualFormulaEditor {
  /** Shows a source written elsewhere, such as in the TeX field, without reporting it back. */
  setTex(tex: string): void;
  focus(): void;
  showKeyboard(): void;
  destroy(): void;
}

export type CreateVisualFormulaEditor = (options: VisualFormulaEditorOptions) => Promise<VisualFormulaEditor>;

/** Keys the equation dialog keeps for itself: Escape cancels and Ctrl+Enter inserts. */
const DIALOG_KEYS = new Set(['[Escape]', 'ctrl+[Enter]', 'ctrl+[Return]']);

let isConfigured = false;

/**
 * The visual editor uses only what the app ships and makes no request: no sounds, nothing spoken,
 * no compute engine, and the font faces of KaTeX's stylesheet, which it finds already declared, so
 * it neither looks for its own font folder nor probes its script address.
 */
function configureMathfields(): void {
  if (isConfigured) return;
  isConfigured = true;
  MathfieldElement.soundsDirectory = null;
  MathfieldElement.keypressSound = null;
  MathfieldElement.plonkSound = null;
  MathfieldElement.speakHook = () => undefined;
  MathfieldElement.readAloudHook = () => undefined;
  MathfieldElement.computeEngine = null;
  MathfieldElement.fontsDirectory = null;
}

function isKeptBinding(binding: Keybinding): boolean {
  const command = Array.isArray(binding.command) ? binding.command[0] : binding.command;
  return !DIALOG_KEYS.has(binding.key) && command !== 'speak';
}

export const createVisualFormulaEditor: CreateVisualFormulaEditor = async ({
  parent,
  tex,
  label,
  onChange,
}) => {
  await loadMathFonts();
  configureMathfields();
  const field = new MathfieldElement();
  field.mathVirtualKeyboardPolicy = 'manual';
  field.setAttribute('aria-label', label);
  field.addEventListener('input', () => onChange(field.getValue('latex')));
  const isMounted = new Promise((resolve) => field.addEventListener('mount', resolve, { once: true }));
  parent.append(field);
  await isMounted;
  field.keybindings = field.keybindings.filter(isKeptBinding);
  // Its menu offers speech and computing, which the app leaves out.
  field.menuItems = [];
  field.setValue(tex, { silenceNotifications: true });
  return {
    setTex: (source) => {
      if (field.getValue('latex') !== source) field.setValue(source, { silenceNotifications: true });
    },
    focus: () => field.focus(),
    showKeyboard: () => {
      field.focus();
      window.mathVirtualKeyboard.show();
    },
    destroy: () => {
      window.mathVirtualKeyboard.hide();
      field.remove();
    },
  };
};

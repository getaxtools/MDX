import { MATH_DISPLAY_CLASS, MATH_INLINE_CLASS } from '../plugins/mathPlugin';
import type { BrowserWindow } from '../sanitize/createHtmlSanitizer';
import { createGeneratedContentSanitizer } from '../sanitize/createGeneratedContentSanitizer';

export const MAX_MATH_SOURCE_LENGTH = 10_000;
const RENDERED_CLASS = 'mdx-rendered';

export interface MathTypesetter {
  renderToString(tex: string, options: Record<string, unknown>): string;
}

export interface RichBlockRendererOptions {
  readonly window: BrowserWindow;
  /** Loads KaTeX and its style sheet; only called for documents that contain math. */
  readonly loadMathTypesetter?: () => Promise<MathTypesetter>;
}

/** What the equation editor shows for its source: the typeset formula, or why there is none. */
export type FormulaPreview =
  | { readonly kind: 'typeset'; readonly html: string }
  | { readonly kind: 'error'; readonly message: string; readonly position: number | undefined }
  | { readonly kind: 'tooLong'; readonly limit: number }
  | { readonly kind: 'unavailable' };

export interface RichBlockRenderOptions {
  readonly isStillShown: () => boolean;
}

export interface RichBlockRenderer {
  /** Typesets the math placeholders inside `root`, loading KaTeX only when there are some. */
  renderInto(root: HTMLElement, options: RichBlockRenderOptions): Promise<void>;
  /**
   * Sanitized HTML for one formula with the preview's options; undefined when it is too long, does
   * not typeset, or KaTeX cannot load, so the caller can show the source instead.
   */
  typesetMath(tex: string, isDisplay: boolean): Promise<string | undefined>;
  /** Like `typesetMath`, but says why a formula does not typeset and where in its source. */
  previewFormula(tex: string, isDisplay: boolean): Promise<FormulaPreview>;
}

// Security limits from the KaTeX documentation: no \href or \url, and caps on size and macro expansion.
const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  maxSize: 50,
  maxExpand: 1000,
  output: 'htmlAndMathml',
} as const;

export function createRichBlockRenderer({
  window,
  loadMathTypesetter = loadKatex,
}: RichBlockRendererOptions): RichBlockRenderer {
  const { sanitizeMath } = createGeneratedContentSanitizer(window);
  const previewFormula = formulaPreviewWith(loadMathTypesetter, sanitizeMath);
  return {
    async renderInto(root, { isStillShown }) {
      const placeholders = [
        ...root.querySelectorAll<HTMLElement>(`.${MATH_INLINE_CLASS}, .${MATH_DISPLAY_CLASS}`),
      ].filter((element) => !element.classList.contains(RENDERED_CLASS));
      if (placeholders.length === 0) return;
      const typesetter = await loadedOrUndefined(loadMathTypesetter);
      for (const placeholder of placeholders) {
        if (!typesetter || !isStillShown()) return;
        typeset(placeholder, typesetter, sanitizeMath);
      }
    },
    async typesetMath(tex, isDisplay) {
      const preview = await previewFormula(tex, isDisplay);
      return preview.kind === 'typeset' ? preview.html : undefined;
    },
    previewFormula,
  };
}

function formulaPreviewWith(
  loadMathTypesetter: () => Promise<MathTypesetter>,
  sanitizeMath: (html: string) => string,
): RichBlockRenderer['previewFormula'] {
  return async (tex, isDisplay) => {
    if (tex.length > MAX_MATH_SOURCE_LENGTH) return { kind: 'tooLong', limit: MAX_MATH_SOURCE_LENGTH };
    const typesetter = await loadedOrUndefined(loadMathTypesetter);
    if (!typesetter) return { kind: 'unavailable' };
    try {
      const options = { ...KATEX_OPTIONS, throwOnError: true, displayMode: isDisplay };
      return { kind: 'typeset', html: sanitizeMath(typesetter.renderToString(tex, options)) };
    } catch (error) {
      return typesettingErrorOf(error);
    }
  };
}

/** KaTeX's ParseError names the problem and the character it is at; any other failure has neither. */
function typesettingErrorOf(error: unknown): FormulaPreview {
  if (typeof error !== 'object' || error === null) return { kind: 'unavailable' };
  const { rawMessage, message, position } = error as {
    rawMessage?: unknown;
    message?: unknown;
    position?: unknown;
  };
  const text = [rawMessage, message].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate !== '',
  );
  if (text === undefined) return { kind: 'unavailable' };
  return { kind: 'error', message: text, position: typeof position === 'number' ? position : undefined };
}

function typeset(
  placeholder: HTMLElement,
  typesetter: MathTypesetter,
  sanitizeMath: (html: string) => string,
): void {
  const tex = placeholder.textContent;
  if (tex.length > MAX_MATH_SOURCE_LENGTH) return;
  const isDisplayMode = placeholder.classList.contains(MATH_DISPLAY_CLASS);
  placeholder.innerHTML = sanitizeMath(
    typesetter.renderToString(tex, { ...KATEX_OPTIONS, displayMode: isDisplayMode }),
  );
  placeholder.classList.add(RENDERED_CLASS);
  placeholder.setAttribute('aria-label', tex);
}

/** A library that fails to load leaves its placeholders showing their readable source. */
async function loadedOrUndefined<Library>(load: () => Promise<Library>): Promise<Library | undefined> {
  try {
    return await load();
  } catch {
    return undefined;
  }
}

/**
 * Loads KaTeX's stylesheet, whose font faces the visual formula editor uses too, so both draw
 * formulas with the same font files the app ships.
 */
export async function loadMathFonts(): Promise<void> {
  await import('katex/dist/katex.min.css');
}

async function loadKatex(): Promise<MathTypesetter> {
  const [katex] = await Promise.all([import('katex'), loadMathFonts()]);
  return katex.default;
}

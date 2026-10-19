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

export interface RichBlockRenderOptions {
  readonly isStillShown: () => boolean;
}

export interface RichBlockRenderer {
  /** Typesets the math placeholders inside `root`, loading KaTeX only when there are some. */
  renderInto(root: HTMLElement, options: RichBlockRenderOptions): Promise<void>;
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
  };
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

async function loadKatex(): Promise<MathTypesetter> {
  const [katex] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  return katex.default;
}

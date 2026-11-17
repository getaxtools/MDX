/** Where a pasted formula's TeX comes from: written out, or MathML still to be converted. */
export type FormulaSource =
  { readonly kind: 'tex'; readonly tex: string } | { readonly kind: 'mathml'; readonly mathml: string };

export interface FoundFormula {
  readonly kind: 'formula';
  readonly source: FormulaSource;
  readonly isDisplay: boolean;
}

/** A line break between pieces of pasted HTML; a blank one separates paragraphs. */
export interface PastedBreak {
  readonly kind: 'break';
  readonly isBlank: boolean;
}

export type PastePiece = string | FoundFormula | PastedBreak;

/**
 * What a clipboard holds for formula conversion: formulas among text, nothing to convert (the paste
 * goes on as usual), or content refused as too large, too deep or malformed, which pastes as text.
 */
export type ClipboardFormulas =
  | { readonly kind: 'formulas'; readonly pieces: readonly PastePiece[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'refused' };

export const NO_FORMULAS: ClipboardFormulas = { kind: 'none' };
export const REFUSED: ClipboardFormulas = { kind: 'refused' };

export function texFormula(tex: string, isDisplay: boolean): FoundFormula {
  return { kind: 'formula', source: { kind: 'tex', tex }, isDisplay };
}

export function isFormula(piece: PastePiece): piece is FoundFormula {
  return typeof piece !== 'string' && piece.kind === 'formula';
}

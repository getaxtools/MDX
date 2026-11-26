/**
 * TeX for MathML, or undefined when the converter gives nothing or fails. The converter is its own
 * chunk, loaded only when a paste holds MathML without TeX.
 */
export async function texOfMathml(mathml: string): Promise<string | undefined> {
  const { MathMLToLaTeX } = await import('mathml-to-latex');
  try {
    return MathMLToLaTeX.convert(mathml).trim() || undefined;
  } catch {
    return undefined;
  }
}

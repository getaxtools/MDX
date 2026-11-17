import { describe, expect, it } from 'vitest';
import { formulaOfMath, withoutStyleWrapper } from './mathFormulas';
import { texDelimitedPieces } from './texDelimiters';

function mathElement(markup: string): Element {
  const math = new DOMParser().parseFromString(markup, 'text/html').querySelector('math');
  if (!math) throw new Error('No math element');
  return math;
}

describe('formula sources', () => {
  it('displaystyle wrapper removed', () => {
    expect(withoutStyleWrapper('{\\displaystyle a^{2}+b^{2}=c^{2}}')).toBe('a^{2}+b^{2}=c^{2}');
    expect(withoutStyleWrapper(' {\\textstyle \\frac{1}{2}} ')).toBe('\\frac{1}{2}');
  });

  it('keeps braces that do not enclose the whole source', () => {
    expect(withoutStyleWrapper('{\\displaystyle a}{b}')).toBe('{\\displaystyle a}{b}');
    expect(withoutStyleWrapper('{\\displaystyles x}')).toBe('{\\displaystyles x}');
  });

  it('a TeX annotation comes before alternative text, which comes before MathML', () => {
    const annotated = mathElement(
      '<math alttext="alt"><semantics><mi>m</mi><annotation encoding="application/x-tex">tex</annotation></semantics></math>',
    );
    const withAltText = mathElement('<math alttext="alt"><mi>m</mi></math>');
    const mathmlOnly = mathElement('<math display="block"><mi>m</mi></math>');

    expect(formulaOfMath(annotated)?.source).toEqual({ kind: 'tex', tex: 'tex' });
    expect(formulaOfMath(withAltText)?.source).toEqual({ kind: 'tex', tex: 'alt' });
    expect(formulaOfMath(mathmlOnly)).toEqual({
      kind: 'formula',
      source: { kind: 'mathml', mathml: '<math display="block"><mi>m</mi></math>' },
      isDisplay: true,
    });
  });

  it('MathML for the converter keeps only element names, attributes and text', () => {
    const math = mathElement(
      '<math><semantics><mrow><mi mathvariant="bold">x</mi><!-- note --><mo>&lt;</mo></mrow><annotation-xml encoding="MathML-Content"><ci>x</ci></annotation-xml></semantics></math>',
    );

    expect(formulaOfMath(math)?.source).toEqual({
      kind: 'mathml',
      mathml: '<math><mrow><mi mathvariant="bold">x</mi><mo>&lt;</mo></mrow></math>',
    });
  });
});

describe('TeX delimiters in plain text', () => {
  it('an escaped backslash before a parenthesis is not a delimiter', () => {
    expect(texDelimitedPieces('Line \\\\(not math)')).toBeUndefined();
  });

  it('an opening delimiter without its closing one stays text', () => {
    expect(texDelimitedPieces('Open \\( and never closed')).toBeUndefined();
  });

  it('an inline formula does not run across paragraphs', () => {
    expect(texDelimitedPieces('One \\(x\n\ny\\)')).toBeUndefined();
  });
});

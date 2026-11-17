import { texFormula, type FoundFormula } from './pastePieces';

const TEX_ENCODINGS = new Set(['application/x-tex', 'text/x-tex', 'tex', 'application/x-latex', 'latex']);

/** Elements whose children are a fixed number of arguments, such as a fraction's two. */
const ARGUMENT_COUNTS: Readonly<Record<string, number>> = {
  mfrac: 2,
  mroot: 2,
  msub: 2,
  msup: 2,
  munder: 2,
  mover: 2,
  msubsup: 3,
  munderover: 3,
};

/** The braces of `{\displaystyle …}` enclose the whole source only if they pair with each other. */
function isEnclosedByOneBracePair(tex: string): boolean {
  let depth = 0;
  for (let index = 0; index < tex.length; index += 1) {
    const character = tex[index];
    if (character === '\\') index += 1;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0 && index < tex.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Web pages wrap formula sources in `{\displaystyle …}` or `{\textstyle …}`, which the dollar
 * delimiters already say; the wrapper is removed.
 */
export function withoutStyleWrapper(tex: string): string {
  const source = tex.trim();
  const wrapped = /^\{\\(?:displaystyle|textstyle)(?![a-zA-Z])([\s\S]*)\}$/.exec(source);
  if (!wrapped || !isEnclosedByOneBracePair(source)) return source;
  return (wrapped[1] ?? '').trim();
}

function escapedXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function childElementsOf(element: Element): Element[] {
  return [...element.children];
}

/**
 * MathML written again from its elements' local names, attributes and text only, so prefixes,
 * comments and other annotations do not reach the converter; undefined when an element has the
 * wrong number of arguments, as in a fraction with one part.
 */
function cleanMathml(element: Element): string | undefined {
  const name = element.localName;
  if (name === 'semantics') {
    const [presentation] = childElementsOf(element);
    return presentation ? cleanMathml(presentation) : undefined;
  }
  const argumentCount = ARGUMENT_COUNTS[name];
  if (argumentCount !== undefined && element.children.length !== argumentCount) return undefined;
  const attributes = [...element.attributes]
    .filter((attribute) => !attribute.name.startsWith('xmlns'))
    .map((attribute) => ` ${attribute.localName}="${escapedXml(attribute.value)}"`)
    .join('');
  if (element.children.length === 0)
    return `<${name}${attributes}>${escapedXml(element.textContent)}</${name}>`;
  const children = childElementsOf(element).map(cleanMathml);
  if (children.some((child) => child === undefined)) return undefined;
  return `<${name}${attributes}>${children.join('')}</${name}>`;
}

function nonEmpty(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function texAnnotationOf(math: Element): string | undefined {
  const annotation = [...math.getElementsByTagName('annotation')].find((candidate) =>
    TEX_ENCODINGS.has((candidate.getAttribute('encoding') ?? '').trim().toLowerCase()),
  );
  return nonEmpty(annotation?.textContent);
}

export function isDisplayMath(math: Element): boolean {
  return math.getAttribute('display') === 'block' || math.getAttribute('mode') === 'display';
}

/**
 * A `<math>` element's formula, from its TeX annotation, else its alternative text, else its
 * MathML; undefined when only malformed MathML is left.
 */
export function formulaOfMath(math: Element): FoundFormula | undefined {
  const isDisplay = isDisplayMath(math);
  const tex = texAnnotationOf(math) ?? nonEmpty(math.getAttribute('alttext') ?? undefined);
  if (tex !== undefined) return texFormula(withoutStyleWrapper(tex), isDisplay);
  const mathml = cleanMathml(math);
  return mathml === undefined
    ? undefined
    : { kind: 'formula', source: { kind: 'mathml', mathml }, isDisplay };
}

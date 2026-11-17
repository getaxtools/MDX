import type { MessageKey } from '@mdx/i18n';

/** A formula offered in the template gallery; placeholders are written `#{}`, or `#{a}` with a start. */
export interface EquationTemplate {
  readonly nameKey: MessageKey;
  readonly source: string;
}

export interface EquationTemplateGroup {
  readonly nameKey: MessageKey;
  readonly templates: readonly EquationTemplate[];
}

function template(nameKey: MessageKey, source: string): EquationTemplate {
  return { nameKey, source };
}

function group(nameKey: MessageKey, templates: readonly EquationTemplate[]): EquationTemplateGroup {
  return { nameKey, templates };
}

export const EQUATION_TEMPLATE_GROUPS: readonly EquationTemplateGroup[] = [
  group('equation.templateGroup.structures', [
    template('equation.template.fraction', String.raw`\frac{#{}}{#{}}`),
    template('equation.template.squareRoot', String.raw`\sqrt{#{}}`),
    template('equation.template.nthRoot', String.raw`\sqrt[#{n}]{#{}}`),
    template('equation.template.superscript', String.raw`#{x}^{#{}}`),
    template('equation.template.subscript', String.raw`#{x}_{#{}}`),
  ]),
  group('equation.templateGroup.bigOperators', [
    template('equation.template.sum', String.raw`\sum_{#{i=1}}^{#{n}} #{}`),
    template('equation.template.product', String.raw`\prod_{#{i=1}}^{#{n}} #{}`),
    template('equation.template.integral', String.raw`\int_{#{a}}^{#{b}} #{} \, d#{x}`),
    template('equation.template.limit', String.raw`\lim_{#{x} \to #{\infty}} #{}`),
  ]),
  group('equation.templateGroup.brackets', [
    template('equation.template.parentheses', String.raw`\left( #{} \right)`),
    template('equation.template.squareBrackets', String.raw`\left[ #{} \right]`),
    template('equation.template.braces', String.raw`\left\{ #{} \right\}`),
    template('equation.template.absoluteValue', String.raw`\left| #{} \right|`),
    template('equation.template.angleBrackets', String.raw`\left\langle #{} \right\rangle`),
  ]),
  group('equation.templateGroup.matrices', [
    template('equation.template.matrix2', String.raw`\begin{pmatrix} #{} & #{} \\ #{} & #{} \end{pmatrix}`),
    template(
      'equation.template.matrix3',
      String.raw`\begin{pmatrix} #{} & #{} & #{} \\ #{} & #{} & #{} \\ #{} & #{} & #{} \end{pmatrix}`,
    ),
    template(
      'equation.template.determinant',
      String.raw`\begin{vmatrix} #{} & #{} \\ #{} & #{} \end{vmatrix}`,
    ),
    template(
      'equation.template.cases',
      String.raw`\begin{cases} #{} & \text{if } #{} \\ #{} & \text{otherwise} \end{cases}`,
    ),
  ]),
  group('equation.templateGroup.greekLetters', [
    template('equation.template.alpha', String.raw`\alpha`),
    template('equation.template.beta', String.raw`\beta`),
    template('equation.template.gamma', String.raw`\gamma`),
    template('equation.template.delta', String.raw`\delta`),
    template('equation.template.epsilon', String.raw`\epsilon`),
    template('equation.template.theta', String.raw`\theta`),
    template('equation.template.lambda', String.raw`\lambda`),
    template('equation.template.mu', String.raw`\mu`),
    template('equation.template.pi', String.raw`\pi`),
    template('equation.template.sigma', String.raw`\sigma`),
    template('equation.template.phi', String.raw`\phi`),
    template('equation.template.omega', String.raw`\omega`),
  ]),
  group('equation.templateGroup.relationsAndArrows', [
    template('equation.template.lessOrEqual', String.raw`\le`),
    template('equation.template.greaterOrEqual', String.raw`\ge`),
    template('equation.template.notEqual', String.raw`\ne`),
    template('equation.template.approximately', String.raw`\approx`),
    template('equation.template.equivalent', String.raw`\equiv`),
    template('equation.template.elementOf', String.raw`\in`),
    template('equation.template.rightArrow', String.raw`\to`),
    template('equation.template.implies', String.raw`\Rightarrow`),
    template('equation.template.ifAndOnlyIf', String.raw`\iff`),
  ]),
  group('equation.templateGroup.commonFormulas', [
    template(
      'equation.template.quadraticFormula',
      String.raw`x = \frac{-#{b} \pm \sqrt{#{b}^2 - 4#{a}#{c}}}{2#{a}}`,
    ),
    template('equation.template.pythagoreanTheorem', String.raw`#{a}^2 + #{b}^2 = #{c}^2`),
    template('equation.template.binomialCoefficient', String.raw`\binom{#{n}}{#{k}}`),
    template('equation.template.derivative', String.raw`\frac{d#{y}}{d#{x}}`),
    template('equation.template.circleArea', String.raw`A = \pi #{r}^2`),
    template('equation.template.eulersIdentity', String.raw`e^{i\pi} + 1 = 0`),
  ]),
];

/** What a template looks like typeset: empty placeholders as boxes, the others with their text. */
export function templatePreviewSource(source: string): string {
  return source.replaceAll('#{}', String.raw`\square`).replaceAll(/#\{([^{}]*)\}/g, '$1');
}

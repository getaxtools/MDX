import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../createMarkdownRenderer';

const renderer = createMarkdownRenderer({ window });

function render(source: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderer.render(source).html;
  return container;
}

const inlineMath = (container: HTMLElement) =>
  [...container.querySelectorAll('.mdx-math-inline')].map((element) => element.textContent);
const displayMath = (container: HTMLElement) =>
  [...container.querySelectorAll('.mdx-math-display')].map((element) => element.textContent);

describe('math', () => {
  it('marks inline math between single dollars', () => {
    expect(inlineMath(render('Euler: $e^{i\\pi} + 1 = 0$ is neat.'))).toEqual(['e^{i\\pi} + 1 = 0']);
  });

  it('marks display math between double dollars inside a paragraph', () => {
    expect(displayMath(render('Sum $$\\sum_{n=1}^{\\infty} n$$ here'))).toEqual(['\\sum_{n=1}^{\\infty} n']);
  });

  it('marks a display math block over several lines', () => {
    const container = render('Before\n\n$$\na^2 + b^2\n= c^2\n$$\n\nAfter');

    expect(displayMath(container)).toEqual(['a^2 + b^2\n= c^2']);
    expect(container.querySelector('div.mdx-math-display')).not.toBeNull();
    expect(container.textContent).toContain('After');
  });

  it('marks a display math block written on one line', () => {
    expect(displayMath(render('$$ x = 1 $$'))).toEqual(['x = 1']);
  });

  it.each([
    ['prices', 'It costs $5 and $10 today.'],
    ['a dollar followed by a space', 'Pay $ 5 now$'],
    ['an escaped dollar', 'Use \\$x\\$ for money.'],
    ['an unclosed dollar', 'Only $one here'],
  ])('leaves %s as text', (_case, source) => {
    const container = render(source);

    expect(inlineMath(container)).toEqual([]);
    expect(displayMath(container)).toEqual([]);
  });

  it('leaves dollars in code alone', () => {
    const container = render('Run `echo $HOME$` and\n\n```sh\necho $PATH$\n```');

    expect(inlineMath(container)).toEqual([]);
  });

  it('leaves an unclosed display block as text', () => {
    const container = render('$$\nnever closed');

    expect(displayMath(container)).toEqual([]);
    expect(container.textContent).toContain('never closed');
  });

  it('keeps markup inside math as text', () => {
    const container = render('$<img src=x onerror=alert(1)>$');

    expect(container.querySelector('img')).toBeNull();
    expect(inlineMath(container)).toEqual(['<img src=x onerror=alert(1)>']);
  });
});

describe('mermaid fences', () => {
  it('stay readable code blocks until diagrams are supported', () => {
    const container = render('```mermaid\ngraph TD\n  A --> B\n```');

    expect(container.querySelector('code.language-mermaid')?.textContent).toBe('graph TD\n  A --> B\n');
  });
});

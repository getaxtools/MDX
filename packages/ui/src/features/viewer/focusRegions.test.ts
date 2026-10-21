import { afterEach, describe, expect, it } from 'vitest';
import { moveFocusBetweenRegions } from './focusRegions';

function windowWithRegions(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <nav data-focus-region><button>Section</button><div role="treeitem" tabindex="0">Guide.md</div></nav>
    <div data-focus-region role="tablist">
      <div role="tab" tabindex="-1">One<button>Close One</button></div>
      <div role="tab" tabindex="0">Two</div>
    </div>
    <div data-focus-region><main tabindex="0">Document</main></div>
    <div data-focus-region><p>Nothing to focus</p></div>
    <footer data-focus-region><button>Encoding</button></footer>`;
  document.body.append(root);
  return root;
}

const focusedText = () => document.activeElement?.textContent;

describe('moveFocusBetweenRegions', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('moves to the tab stop of the next region and wraps around at the end', () => {
    const root = windowWithRegions();
    const order: (string | null | undefined)[] = [];

    for (let press = 0; press < 5; press += 1) {
      moveFocusBetweenRegions(root, 1, document.activeElement);
      order.push(focusedText());
    }

    expect(order).toEqual(['Guide.md', 'Two', 'Document', 'Encoding', 'Guide.md']);
  });

  it('moves backwards with Shift+F6, starting from the last region', () => {
    const root = windowWithRegions();

    moveFocusBetweenRegions(root, -1, document.activeElement);
    expect(focusedText()).toBe('Encoding');
    moveFocusBetweenRegions(root, -1, document.activeElement);

    expect(focusedText()).toBe('Document');
  });

  it('keeps focus inside an open dialog', () => {
    const root = windowWithRegions();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<button>Close</button>';
    document.body.append(dialog);
    dialog.querySelector('button')?.focus();

    const hasMoved = moveFocusBetweenRegions(root, 1, document.activeElement);

    expect(hasMoved).toBe(false);
    expect(focusedText()).toBe('Close');
  });
});

import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PanelResizer from './PanelResizer.svelte';

interface ResizerSetup {
  readonly size?: number;
  readonly growDirection?: 1 | -1;
  readonly pixelsPerUnit?: () => number;
}

function renderResizer({ size = 260, growDirection = 1, pixelsPerUnit = () => 1 }: ResizerSetup = {}) {
  const onPreview = vi.fn();
  const onResize = vi.fn();
  const onReset = vi.fn();
  render(PanelResizer, {
    label: 'Resize Explorer',
    size,
    growDirection,
    minSize: 160,
    maxSize: 800,
    pixelsPerUnit,
    onPreview,
    onResize,
    onReset,
  });
  const separator = screen.getByRole('separator', { name: 'Resize Explorer' });
  separator.setPointerCapture = vi.fn();
  return { onPreview, onResize, onReset, separator };
}

describe('PanelResizer', () => {
  it('is a focusable vertical splitter that reports the panel width', () => {
    const { separator } = renderResizer();

    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator.getAttribute('aria-valuenow')).toBe('260');
    expect(separator.tabIndex).toBe(0);
  });

  it('widens and narrows a panel on its left with the arrow keys', async () => {
    const { onResize, separator } = renderResizer();

    separator.focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowLeft}');

    expect(onResize.mock.calls).toEqual([[276], [244]]);
  });

  it('widens a panel on its right when the splitter moves left', async () => {
    const { onResize, separator } = renderResizer({ growDirection: -1 });

    separator.focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(onResize).toHaveBeenCalledWith(276);
  });

  it('mirrors the arrow keys and the pointer in a right-to-left layout, where the panel sits on the right', async () => {
    document.documentElement.dir = 'rtl';
    const { onPreview, onResize, separator } = renderResizer();

    separator.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await fireEvent.pointerDown(separator, { clientX: 300, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(separator, { clientX: 220, pointerId: 1 });
    document.documentElement.removeAttribute('dir');

    expect(onResize).toHaveBeenCalledWith(276);
    expect(onPreview).toHaveBeenCalledWith(340);
  });

  it('follows the pointer while dragging and remembers the width on release', async () => {
    const { onPreview, onResize, separator } = renderResizer();

    await fireEvent.pointerDown(separator, { clientX: 300, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(separator, { clientX: 380, pointerId: 1 });
    await fireEvent.pointerUp(separator, { clientX: 380, pointerId: 1 });

    expect(onPreview).toHaveBeenCalledWith(340);
    expect(onResize).toHaveBeenCalledWith(340);
  });

  it('keeps the panel between its smallest and largest widths', async () => {
    const { onPreview, separator } = renderResizer();

    await fireEvent.pointerDown(separator, { clientX: 300, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(separator, { clientX: 0, pointerId: 1 });
    await fireEvent.pointerMove(separator, { clientX: 2000, pointerId: 1 });

    expect(onPreview.mock.calls).toEqual([[160], [800]]);
  });

  it('converts the pointer movement into units such as percentages', async () => {
    const { onPreview, separator } = renderResizer({ size: 300, pixelsPerUnit: () => 10 });

    await fireEvent.pointerDown(separator, { clientX: 500, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(separator, { clientX: 600, pointerId: 1 });

    expect(onPreview).toHaveBeenCalledWith(310);
  });

  it('returns the panel to its default width on double-click', async () => {
    const { onReset, separator } = renderResizer();

    await fireEvent.dblClick(separator);

    expect(onReset).toHaveBeenCalledOnce();
  });
});

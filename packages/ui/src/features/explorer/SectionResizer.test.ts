import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SectionResizer from './SectionResizer.svelte';

function renderResizer(currentHeightPx = 200) {
  const onPreview = vi.fn();
  const onResize = vi.fn();
  render(SectionResizer, {
    label: 'Resize Favourites',
    measureHeight: () => currentHeightPx,
    onPreview,
    onResize,
  });
  return { onPreview, onResize, separator: screen.getByRole('separator', { name: 'Resize Favourites' }) };
}

describe('SectionResizer', () => {
  it('grows and shrinks the section with the arrow keys', async () => {
    const { onResize, separator } = renderResizer();

    separator.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}');

    expect(onResize.mock.calls).toEqual([[216], [184]]);
  });

  it('follows the pointer while dragging and remembers the height on release', async () => {
    const { onPreview, onResize, separator } = renderResizer();
    separator.setPointerCapture = vi.fn();

    await fireEvent.pointerDown(separator, { clientY: 100, pointerId: 1 });
    await fireEvent.pointerMove(separator, { clientY: 160, pointerId: 1 });
    await fireEvent.pointerUp(separator, { clientY: 160, pointerId: 1 });

    expect(onPreview).toHaveBeenCalledWith(260);
    expect(onResize).toHaveBeenCalledWith(260);
  });

  it('never makes a section smaller than its header', async () => {
    const { onResize, separator } = renderResizer(50);

    separator.focus();
    await userEvent.keyboard('{ArrowUp}');

    expect(onResize).toHaveBeenCalledWith(48);
  });

  it('ignores pointer moves that are not part of a drag', async () => {
    const { onPreview, separator } = renderResizer();

    await fireEvent.pointerMove(separator, { clientY: 300, pointerId: 1 });

    expect(onPreview).not.toHaveBeenCalled();
  });
});

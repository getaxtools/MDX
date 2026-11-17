import { describe, expect, it, vi } from 'vitest';
import { listenToFileArcGesture } from './fileArcGesture';

function listen() {
  const target = new EventTarget();
  const handlers = { onWheel: vi.fn(), onChoose: vi.fn(), onCancel: vi.fn() };
  const stop = listenToFileArcGesture(target, handlers);
  return { target, handlers, stop };
}

function keyEvent(type: 'keydown' | 'keyup', key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent(type, { key, cancelable: true, ...init });
}

describe('listenToFileArcGesture', () => {
  it('letting go of Ctrl chooses', () => {
    const { target, handlers } = listen();

    target.dispatchEvent(keyEvent('keyup', 'ArrowDown', { ctrlKey: true }));
    target.dispatchEvent(keyEvent('keyup', 'Control'));

    expect(handlers.onChoose).toHaveBeenCalledOnce();
  });

  it('enter chooses and esc cancels, and neither reaches anything else', () => {
    const { target, handlers } = listen();
    const enter = keyEvent('keydown', 'Enter', { ctrlKey: true });
    const escape = keyEvent('keydown', 'Escape', { ctrlKey: true });

    target.dispatchEvent(enter);
    target.dispatchEvent(escape);

    expect(handlers.onChoose).toHaveBeenCalledOnce();
    expect(handlers.onCancel).toHaveBeenCalledOnce();
    expect([enter.defaultPrevented, escape.defaultPrevented]).toEqual([true, true]);
  });

  it('keys typed into an input method are left alone', () => {
    const { target, handlers } = listen();

    target.dispatchEvent(keyEvent('keydown', 'Enter', { isComposing: true }));
    target.dispatchEvent(keyEvent('keyup', 'Control', { isComposing: true }));

    expect(handlers.onChoose).not.toHaveBeenCalled();
  });

  it('a missed key release still chooses on the next pointer or wheel event without Ctrl', () => {
    const { target, handlers } = listen();

    target.dispatchEvent(new MouseEvent('pointermove', { ctrlKey: true, movementX: 4 }));
    expect(handlers.onChoose).not.toHaveBeenCalled();
    target.dispatchEvent(new MouseEvent('pointermove', { movementY: 2 }));
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));

    expect(handlers.onChoose).toHaveBeenCalledTimes(2);
  });

  it('a pointer that did not move, as when the arc appears under it, chooses nothing', () => {
    const { target, handlers } = listen();

    target.dispatchEvent(new MouseEvent('pointermove'));

    expect(handlers.onChoose).not.toHaveBeenCalled();
  });

  it('the wheel with Ctrl moves the arc and never scrolls or zooms the page', () => {
    const { target, handlers } = listen();
    const wheel = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true });

    target.dispatchEvent(wheel);

    expect(handlers.onWheel).toHaveBeenCalledWith(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('switching away from the window cancels', () => {
    const { target, handlers } = listen();

    target.dispatchEvent(new Event('blur'));

    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });

  it('listens to nothing once stopped', () => {
    const { target, handlers, stop } = listen();

    stop();
    target.dispatchEvent(keyEvent('keyup', 'Control'));
    target.dispatchEvent(new Event('blur'));

    expect(handlers.onChoose).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });
});

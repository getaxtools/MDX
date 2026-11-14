import { describe, expect, it } from 'vitest';
import { wheelKeyAction, type WheelKeyContext } from './wheelKeyboard';

const THREE_SEGMENTS: WheelKeyContext = { segmentCount: 3, focusedIndex: 0, direction: 1 };

function press(key: string, context: Partial<WheelKeyContext> = {}, modifiers = {}) {
  const event = { key, isComposing: false, ctrlKey: false, altKey: false, metaKey: false, ...modifiers };
  return wheelKeyAction(event, { ...THREE_SEGMENTS, ...context });
}

describe('control wheel keyboard', () => {
  it('moves down and up through the segments and wraps round', () => {
    expect(press('ArrowDown', { focusedIndex: 2 })).toEqual({ action: 'focus', index: 0 });
    expect(press('ArrowUp', { focusedIndex: 0 })).toEqual({ action: 'focus', index: 2 });
    expect(press('ArrowDown', { focusedIndex: 0 })).toEqual({ action: 'focus', index: 1 });
  });

  it('moves to the next segment with Right in left-to-right layouts', () => {
    expect(press('ArrowRight')).toEqual({ action: 'focus', index: 1 });
    expect(press('ArrowLeft')).toEqual({ action: 'focus', index: 2 });
  });

  it('moves to the next segment with Left in right-to-left layouts', () => {
    expect(press('ArrowLeft', { direction: -1 })).toEqual({ action: 'focus', index: 1 });
    expect(press('ArrowRight', { direction: -1 })).toEqual({ action: 'focus', index: 2 });
  });

  it('goes to the first and last segment with Home and End', () => {
    expect(press('Home', { focusedIndex: 2 })).toEqual({ action: 'focus', index: 0 });
    expect(press('End')).toEqual({ action: 'focus', index: 2 });
  });

  it('chooses a segment by its number and closes', () => {
    expect(press('2')).toEqual({ action: 'chooseAndClose', index: 1 });
  });

  it('ignores a number without a segment', () => {
    expect(press('5')).toEqual({ action: 'none' });
    expect(press('0')).toEqual({ action: 'none' });
  });

  it('chooses the focused segment and closes with Enter', () => {
    expect(press('Enter', { focusedIndex: 1 })).toEqual({ action: 'chooseAndClose', index: 1 });
  });

  it('chooses the focused segment and stays open with Space', () => {
    expect(press(' ', { focusedIndex: 1 })).toEqual({ action: 'chooseAndStay', index: 1 });
  });

  it('moves between the segments and the gear with Tab and Shift+Tab', () => {
    expect(press('Tab')).toEqual({ action: 'switchFocusArea' });
    expect(press('Tab', {}, { shiftKey: true })).toEqual({ action: 'switchFocusArea' });
  });

  it('closes with Esc', () => {
    expect(press('Escape')).toEqual({ action: 'close' });
  });

  it('ignores keys during input method composition', () => {
    expect(press('Enter', {}, { isComposing: true })).toEqual({ action: 'none' });
  });

  it('leaves combinations with Ctrl, Alt or the Windows key to other shortcuts', () => {
    expect(press('2', {}, { ctrlKey: true })).toEqual({ action: 'none' });
    expect(press('ArrowDown', {}, { altKey: true })).toEqual({ action: 'none' });
  });
});

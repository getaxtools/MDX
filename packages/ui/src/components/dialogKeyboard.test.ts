import { describe, expect, it } from 'vitest';
import { activatesPrimary, firstFieldIn, wrappedFocusTarget, type DialogKeyEvent } from './dialogKeyboard';

function enterOn(target: Element, keys: Partial<DialogKeyEvent> = {}): DialogKeyEvent {
  return {
    key: 'Enter',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    target,
    ...keys,
  };
}

function elementFrom(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('activatesPrimary', () => {
  it('activates from a single-line field', () => {
    expect(activatesPrimary(enterOn(document.createElement('input')))).toBe(true);
  });

  it('leaves Enter to a focused button, link, list option, submit input or switch', () => {
    const controls = elementFrom(
      '<button></button><a href="#x">x</a><div role="option"><span></span></div><input type="submit"><div role="switch"></div>',
    );

    const results = [...controls.querySelectorAll('button, a, span, input, [role="switch"]')].map((target) =>
      activatesPrimary(enterOn(target)),
    );

    expect(results).toEqual([false, false, false, false, false]);
  });

  it('needs Ctrl+Enter in a multi-line field or an editable area', () => {
    const fields = elementFrom('<textarea></textarea><div contenteditable="true"><p></p></div>');
    const [notes, paragraph] = [...fields.querySelectorAll('textarea, p')];

    expect([notes, paragraph].map((target) => target && activatesPrimary(enterOn(target)))).toEqual([
      false,
      false,
    ]);
    expect(notes && activatesPrimary(enterOn(notes, { ctrlKey: true }))).toBe(true);
  });

  it('ignores Enter while an input method is composing, after another handler, held down, or with Shift or Alt', () => {
    const field = document.createElement('input');

    const results = [
      { isComposing: true },
      { defaultPrevented: true },
      { repeat: true },
      { shiftKey: true },
      { altKey: true },
    ].map((keys) => activatesPrimary(enterOn(field, keys)));

    expect(results).toEqual([false, false, false, false, false]);
  });

  it('ignores other keys', () => {
    expect(activatesPrimary(enterOn(document.createElement('input'), { key: 'a' }))).toBe(false);
  });
});

describe('wrappedFocusTarget', () => {
  const dialog = elementFrom(
    '<button id="close"></button><input type="hidden"><input id="name"><button disabled></button><button id="save"></button>',
  );
  const byId = (id: string) => dialog.querySelector(`#${id}`);

  it('moves from the last control to the first and back', () => {
    expect(wrappedFocusTarget(dialog, byId('save'), 'forward')?.id).toBe('close');
    expect(wrappedFocusTarget(dialog, byId('close'), 'backward')?.id).toBe('save');
  });

  it('leaves a move between inner controls to the browser', () => {
    expect(wrappedFocusTarget(dialog, byId('name'), 'forward')).toBeUndefined();
    expect(wrappedFocusTarget(dialog, byId('name'), 'backward')).toBeUndefined();
  });

  it('brings focus from outside back to the edge it enters', () => {
    expect(wrappedFocusTarget(dialog, document.body, 'forward')?.id).toBe('close');
    expect(wrappedFocusTarget(dialog, null, 'backward')?.id).toBe('save');
  });
});

describe('firstFieldIn', () => {
  it('finds the first field that takes text, skipping hidden and disabled ones', () => {
    const form = elementFrom(
      '<input type="hidden"><input disabled><button></button><select id="kind"></select>',
    );

    expect(firstFieldIn(form)?.id).toBe('kind');
  });
});

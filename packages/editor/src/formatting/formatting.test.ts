import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { insertCodeBlock, insertHorizontalRule, insertLink } from './insertBlocks';
import { toggleHeading, toggleLinePrefix } from './lineFormatting';
import { toggleInlineMarker } from './toggleInlineMarker';

/** Runs a command on text where `[` and `]` mark the selection, and returns the result marked the same way. */
function run(command: StateCommand, markedText: string): string {
  const from = markedText.indexOf('[');
  const to = markedText.indexOf(']') - 1;
  const doc = markedText.replace('[', '').replace(']', '');
  let state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
  command({ state, dispatch: (transaction: Transaction) => (state = transaction.state) });
  const { from: newFrom, to: newTo } = state.selection.main;
  const text = state.doc.toString();
  return `${text.slice(0, newFrom)}[${text.slice(newFrom, newTo)}]${text.slice(newTo)}`;
}

describe('inline formatting', () => {
  it('wraps the selection in a marker and keeps it selected', () => {
    expect(run(toggleInlineMarker('**'), 'a [word] here')).toBe('a **[word]** here');
  });

  it('unwraps a selection that is already wrapped, inside or outside the selection', () => {
    expect(run(toggleInlineMarker('**'), 'a **[word]** here')).toBe('a [word] here');
    expect(run(toggleInlineMarker('**'), 'a [**word**] here')).toBe('a [word] here');
  });

  it('inserts a pair of markers with the cursor between them when nothing is selected', () => {
    expect(run(toggleInlineMarker('`'), 'say []')).toBe('say `[]`');
  });
});

describe('links', () => {
  it('makes selected text the link text and puts the cursor in the address', () => {
    expect(run(insertLink, 'see [the guide]')).toBe('see [the guide]([])');
  });

  it('makes a selected address the target and puts the cursor in the text', () => {
    expect(run(insertLink, 'see [https://example.com]')).toBe('see [[]](https://example.com)');
  });
});

describe('line formatting', () => {
  it('turns lines into a bullet list and back', () => {
    const listed = run(toggleLinePrefix('bulletList'), '[one\ntwo]');

    expect(listed).toBe('- [one\n- two]');
    expect(run(toggleLinePrefix('bulletList'), listed)).toBe('[one\ntwo]');
  });

  it('numbers lines in order and replaces another list marker', () => {
    expect(run(toggleLinePrefix('numberedList'), '[- one\n- two]')).toBe('[1. one\n2. two]');
  });

  it('turns lines into tasks and quotes', () => {
    expect(run(toggleLinePrefix('taskList'), '[buy milk]')).toBe('- [ ] [buy milk]');
    expect(run(toggleLinePrefix('quote'), '[said so]')).toBe('> [said so]');
  });

  it('keeps indentation when making a nested list item', () => {
    expect(run(toggleLinePrefix('bulletList'), '  [nested]')).toBe('  - [nested]');
  });

  it('does nothing on blank lines', () => {
    expect(run(toggleLinePrefix('quote'), '[]')).toBe('[]');
  });

  it('sets a heading level, changes it, and removes it when pressed again', () => {
    const heading = run(toggleHeading(2), '[Title]');

    expect(heading).toBe('## [Title]');
    expect(run(toggleHeading(3), heading)).toBe('### [Title]');
    expect(run(toggleHeading(2), heading)).toBe('[Title]');
  });
});

describe('blocks', () => {
  it('fences the selected lines as a code block', () => {
    expect(run(insertCodeBlock, '[let a = 1;]')).toBe('```[]\nlet a = 1;\n```');
  });

  it('opens an empty code block on an empty line', () => {
    expect(run(insertCodeBlock, '[]')).toBe('```\n[]\n```');
  });

  it('adds a horizontal rule after the current line', () => {
    expect(run(insertHorizontalRule, 'text[]')).toBe('text\n\n---\n[]');
    expect(run(insertHorizontalRule, '[]')).toBe('---\n[]');
  });
});

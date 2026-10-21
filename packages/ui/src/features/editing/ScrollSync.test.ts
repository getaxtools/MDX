import { describe, expect, it } from 'vitest';
import { ScrollSync, type LineScrollingEditor } from './ScrollSync';

const ANCHORS = [
  { line: 0, top: 0 },
  { line: 10, top: 400 },
  { line: 20, top: 500 },
];

class FakeEditor implements LineScrollingEditor {
  line = 0;

  topLine(): number {
    return this.line;
  }

  scrollToLine(line: number): void {
    this.line = line;
  }
}

function createSync() {
  let time = 0;
  const sync = new ScrollSync({ now: () => time, readAnchors: () => ANCHORS });
  const editor = new FakeEditor();
  const preview = document.createElement('main');
  sync.attachEditor(editor);
  sync.attachPreview(preview);
  return {
    sync,
    editor,
    preview,
    waitForLeadToEnd: () => {
      time += 1000;
    },
  };
}

describe('ScrollSync', () => {
  it('moves the preview to the line at the top of the editor', () => {
    const { sync, editor, preview } = createSync();

    editor.line = 15;
    sync.editorScrolled();

    expect(preview.scrollTop).toBe(450);
  });

  it('moves the editor to the line at the top of the preview', () => {
    const { sync, editor, preview, waitForLeadToEnd } = createSync();
    waitForLeadToEnd();

    preview.scrollTop = 400;
    sync.previewScrolled();

    expect(editor.line).toBe(10);
  });

  it('ignores the preview scrolling that following the editor caused', () => {
    const { sync, editor, preview } = createSync();
    editor.line = 15;
    sync.editorScrolled();

    preview.scrollTop = 0;
    sync.previewScrolled();

    expect(editor.line).toBe(15);
  });

  it('puts the preview back where the editor is after the preview shows new text', () => {
    const { sync, editor, preview } = createSync();
    editor.line = 10;
    preview.scrollTop = 0;

    sync.alignPreviewWithEditor();

    expect(preview.scrollTop).toBe(400);
  });

  it('does nothing until both sides are shown', () => {
    const sync = new ScrollSync({ readAnchors: () => ANCHORS });

    expect(() => {
      sync.editorScrolled();
      sync.previewScrolled();
    }).not.toThrow();
  });
});

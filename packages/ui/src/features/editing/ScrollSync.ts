import {
  lineForPreviewTop,
  previewTopForLine,
  readSourceLineAnchors,
  type SourceLineAnchor,
} from './sourceLineScroll';

export interface LineScrollingEditor {
  topLine(): number;
  scrollToLine(line: number): void;
}

export interface ScrollSyncOptions {
  readonly now?: () => number;
  readonly readAnchors?: (preview: HTMLElement, lineCount: number) => readonly SourceLineAnchor[];
}

type ScrollingSide = 'editor' | 'preview';

/** Scrolling one side moves the other to the same place; the side that moved last leads for a moment. */
const LEAD_DURATION_MS = 120;

/** Keeps the source editor and the preview beside it showing the same part of the document. */
export class ScrollSync {
  private editor: LineScrollingEditor | undefined;
  private preview: HTMLElement | undefined;
  private lineCount = 1;
  private leader: ScrollingSide | undefined;
  private leadEndsAt = 0;
  private readonly now: () => number;
  private readonly readAnchors: (preview: HTMLElement, lineCount: number) => readonly SourceLineAnchor[];

  constructor(options: ScrollSyncOptions = {}) {
    this.now = options.now ?? (() => globalThis.performance.now());
    this.readAnchors = options.readAnchors ?? readSourceLineAnchors;
  }

  attachEditor(editor: LineScrollingEditor | undefined): void {
    this.editor = editor;
    this.alignPreviewWithEditor();
  }

  attachPreview(preview: HTMLElement | undefined): void {
    this.preview = preview;
    this.alignPreviewWithEditor();
  }

  setLineCount(lineCount: number): void {
    this.lineCount = Math.max(lineCount, 1);
  }

  editorScrolled(): void {
    if (this.isFollowing('editor')) return;
    this.lead('editor');
    this.movePreview();
  }

  previewScrolled(): void {
    if (this.isFollowing('preview') || !this.editor || !this.preview) return;
    this.lead('preview');
    this.editor.scrollToLine(lineForPreviewTop(this.anchors(this.preview), this.preview.scrollTop));
  }

  /** After the preview shows new text, its blocks moved; put it back where the editor is. */
  alignPreviewWithEditor(): void {
    this.lead('editor');
    this.movePreview();
  }

  private movePreview(): void {
    if (!this.editor || !this.preview) return;
    this.preview.scrollTop = previewTopForLine(this.anchors(this.preview), this.editor.topLine());
  }

  private anchors(preview: HTMLElement): readonly SourceLineAnchor[] {
    return this.readAnchors(preview, this.lineCount);
  }

  private lead(side: ScrollingSide): void {
    this.leader = side;
    this.leadEndsAt = this.now() + LEAD_DURATION_MS;
  }

  /** True while the other side leads, so the scroll this side reports was caused by following it. */
  private isFollowing(side: ScrollingSide): boolean {
    return this.leader !== undefined && this.leader !== side && this.now() < this.leadEndsAt;
  }
}

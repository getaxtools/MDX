import { Facet, type EditorState, type Extension } from '@codemirror/state';
import { Direction, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { isComposing } from '../rich-text/compositionHold';
import { blockMoveToGap, nearestGapIndex, type BlockBox } from './blockDrag';
import { blockAt, siblingBlocksAt, type MarkdownBlock } from './markdownBlocks';
import { BLOCK_HANDLE_PHRASE, BLOCK_KIND_PHRASES, BLOCK_MOVE_PHRASES } from '../plain/blockPhrases';

export { BLOCK_HANDLE_PHRASE } from '../plain/blockPhrases';

/** Opens the block menu at a point on screen, for the block at the caret. */
export const blockMenuOpener = Facet.define<
  (point: { readonly x: number; readonly y: number }) => void,
  ((point: { readonly x: number; readonly y: number }) => void) | undefined
>({ combine: (openers) => openers[0] });

const HANDLE_CLASS = 'cm-block-handle';
const DROP_LINE_CLASS = 'cm-block-drop-line';
const HANDLE_SIZE_PX = 24;
const HANDLE_GAP_PX = 4;
/** A press that moves less than this is a click that opens the menu, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const FIRST_WORDS = 4;
const MAX_NAME_CHARACTERS = 40;
/** Markdown that starts a block's first line and is not its words. */
const LEADING_MARKUP = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|```+\S*|~~~+\S*|\$\$|\|)+/;
/** Six dots, two columns of three, drawn as round strokes of no length. */
const DOTS_PATH = 'M9 6h0M15 6h0M9 12h0M15 12h0M9 18h0M15 18h0';

/** The first words of a block, without the Markdown that starts its first line. */
export function firstWordsOf(state: EditorState, block: MarkdownBlock): string {
  const firstLine = state.doc.lineAt(block.from).text;
  const words = firstLine.replace(LEADING_MARKUP, '').trim().split(/\s+/).slice(0, FIRST_WORDS).join(' ');
  return words.length > MAX_NAME_CHARACTERS ? `${words.slice(0, MAX_NAME_CHARACTERS)}…` : words;
}

export function blockHandleName(state: EditorState, block: MarkdownBlock): string {
  return state.phrase(
    BLOCK_HANDLE_PHRASE,
    state.phrase(BLOCK_KIND_PHRASES[block.kind]),
    firstWordsOf(state, block),
  );
}

interface Drag {
  readonly pointerId: number;
  readonly startY: number;
  readonly block: MarkdownBlock;
  isMoving: boolean;
  gapIndex: number | undefined;
}

function createHandle(view: EditorView): HTMLButtonElement {
  const handle = view.dom.ownerDocument.createElement('button');
  handle.type = 'button';
  handle.className = HANDLE_CLASS;
  // The block menu is on Shift+F10 in the text, so the handle adds no Tab stop of its own.
  handle.tabIndex = -1;
  handle.hidden = true;
  const svg = view.dom.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const dots = view.dom.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  dots.setAttribute('d', DOTS_PATH);
  svg.append(dots);
  handle.append(svg);
  return handle;
}

class BlockHandleView {
  private readonly handle: HTMLButtonElement;
  private readonly dropLine: HTMLElement;
  private shownBlock: MarkdownBlock | undefined;
  private hoveredBlock: MarkdownBlock | undefined;
  private isHiddenWhileTyping = false;
  private drag: Drag | undefined;
  private wasDragged = false;

  constructor(private readonly view: EditorView) {
    this.handle = createHandle(view);
    this.dropLine = view.dom.ownerDocument.createElement('div');
    this.dropLine.className = DROP_LINE_CLASS;
    this.dropLine.hidden = true;
    view.scrollDOM.append(this.handle, this.dropLine);
    this.listen();
    this.place();
  }

  update(update: ViewUpdate): void {
    if (update.transactions.some((transaction) => transaction.isUserEvent('input')))
      this.isHiddenWhileTyping = true;
    else if (update.selectionSet) this.isHiddenWhileTyping = false;
    if (update.docChanged || update.selectionSet || update.geometryChanged || update.viewportChanged)
      this.place();
  }

  destroy(): void {
    this.cancelDrag();
    this.handle.remove();
    this.dropLine.remove();
    this.view.scrollDOM.removeEventListener('mousemove', this.followPointer);
    this.view.scrollDOM.removeEventListener('mouseleave', this.forgetPointer);
  }

  private listen(): void {
    this.view.scrollDOM.addEventListener('mousemove', this.followPointer);
    this.view.scrollDOM.addEventListener('mouseleave', this.forgetPointer);
    this.handle.addEventListener('pointerdown', this.startDrag);
    this.handle.addEventListener('pointermove', this.moveDrag);
    this.handle.addEventListener('pointerup', this.endDrag);
    this.handle.addEventListener('pointercancel', this.cancelDrag);
    this.handle.addEventListener('lostpointercapture', this.cancelDrag);
    this.handle.addEventListener('click', this.openMenu);
  }

  private readonly followPointer = (event: MouseEvent): void => {
    if (this.drag || (event.target instanceof Node && this.handle.contains(event.target))) return;
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    this.hoveredBlock = position === null ? undefined : blockAt(this.view.state, position);
    this.isHiddenWhileTyping = false;
    this.place();
  };

  private readonly forgetPointer = (event: MouseEvent): void => {
    if (this.drag || (event.relatedTarget instanceof Node && this.handle.contains(event.relatedTarget)))
      return;
    this.hoveredBlock = undefined;
    this.place();
  };

  /** Beside the block under the pointer, or else the block at the caret. */
  private place(): void {
    if (this.drag) return;
    const { state } = this.view;
    const block = this.isHiddenWhileTyping
      ? undefined
      : (this.hoveredBlock ?? blockAt(state, state.selection.main.head));
    this.shownBlock = block;
    if (!block) {
      this.handle.hidden = true;
      return;
    }
    this.handle.setAttribute('aria-label', blockHandleName(state, block));
    this.handle.title = this.handle.getAttribute('aria-label') ?? '';
    this.view.requestMeasure({ read: () => this.handlePlace(block), write: (place) => this.show(place) });
  }

  /** Where the handle goes, in the scroller's coordinates: level with the block's first line, in its margin. */
  private handlePlace(block: MarkdownBlock): { readonly top: number; readonly left: number } {
    const { view } = this;
    const scroller = view.scrollDOM.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const top = view.documentTop - scroller.top + view.scrollDOM.scrollTop + view.lineBlockAt(block.from).top;
    const isRightToLeft = view.textDirection === Direction.RTL;
    const edge = isRightToLeft
      ? content.right + HANDLE_GAP_PX
      : content.left - HANDLE_SIZE_PX - HANDLE_GAP_PX;
    return { top, left: Math.max(edge - scroller.left + view.scrollDOM.scrollLeft, 0) };
  }

  private show({ top, left }: { readonly top: number; readonly left: number }): void {
    this.handle.hidden = false;
    this.handle.style.top = `${String(top)}px`;
    this.handle.style.left = `${String(left)}px`;
  }

  private readonly startDrag = (event: PointerEvent): void => {
    const block = this.shownBlock;
    if (event.button !== 0 || !block || isComposing(this.view)) return;
    // The editor keeps its focus and selection while the handle is pressed.
    event.preventDefault();
    this.handle.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      block,
      isMoving: false,
      gapIndex: undefined,
    };
    this.wasDragged = false;
    this.view.dom.ownerDocument.addEventListener('keydown', this.cancelOnEscape, true);
  };

  private readonly moveDrag = (event: PointerEvent): void => {
    const { drag } = this;
    if (drag?.pointerId !== event.pointerId) return;
    if (!drag.isMoving && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    drag.isMoving = true;
    const boxes = this.siblingBoxes(drag.block);
    drag.gapIndex = nearestGapIndex(boxes, event.clientY);
    this.showDropLine(boxes, drag.gapIndex);
  };

  private readonly endDrag = (event: PointerEvent): void => {
    const { drag } = this;
    if (drag?.pointerId !== event.pointerId) return;
    const isDropped = drag.isMoving && drag.gapIndex !== undefined && this.isInsideEditor(event);
    this.wasDragged = drag.isMoving;
    this.finishDrag();
    if (isDropped && drag.gapIndex !== undefined) this.drop(drag.block, drag.gapIndex);
  };

  private readonly cancelDrag = (): void => {
    if (!this.drag) return;
    this.wasDragged = this.drag.isMoving;
    this.finishDrag();
  };

  private readonly cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.drag) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelDrag();
  };

  private finishDrag(): void {
    const { drag } = this;
    this.drag = undefined;
    this.dropLine.hidden = true;
    this.view.dom.ownerDocument.removeEventListener('keydown', this.cancelOnEscape, true);
    if (drag && this.handle.hasPointerCapture(drag.pointerId))
      this.handle.releasePointerCapture(drag.pointerId);
    this.place();
  }

  private drop(block: MarkdownBlock, gapIndex: number): void {
    const { state } = this.view;
    const spec = blockMoveToGap(state, block.from, gapIndex);
    if (!spec) return;
    const siblings = siblingBlocksAt(state, block.from);
    const isUp = siblings !== undefined && gapIndex <= siblings.index;
    const kind = state.phrase(BLOCK_KIND_PHRASES[block.kind]);
    const announcement = state.phrase(isUp ? BLOCK_MOVE_PHRASES.movedUp : BLOCK_MOVE_PHRASES.movedDown, kind);
    this.view.dispatch({ ...spec, effects: EditorView.announce.of(announcement) });
    this.view.focus();
  }

  /** The block and its siblings on screen, in client coordinates like the pointer. */
  private siblingBoxes(block: MarkdownBlock): BlockBox[] {
    const siblings = siblingBlocksAt(this.view.state, block.from);
    const documentTop = this.view.documentTop;
    return (siblings?.blocks ?? []).map((sibling) => ({
      top: documentTop + this.view.lineBlockAt(sibling.from).top,
      bottom: documentTop + this.view.lineBlockAt(sibling.to).bottom,
    }));
  }

  private showDropLine(boxes: readonly BlockBox[], gapIndex: number): void {
    const above = boxes[gapIndex - 1];
    const below = boxes[gapIndex];
    const clientY = above && below ? (above.bottom + below.top) / 2 : (above?.bottom ?? below?.top ?? 0);
    const scroller = this.view.scrollDOM.getBoundingClientRect();
    const content = this.view.contentDOM.getBoundingClientRect();
    this.dropLine.hidden = false;
    this.dropLine.style.top = `${String(clientY - scroller.top + this.view.scrollDOM.scrollTop)}px`;
    this.dropLine.style.left = `${String(content.left - scroller.left + this.view.scrollDOM.scrollLeft)}px`;
    this.dropLine.style.width = `${String(content.width)}px`;
  }

  private isInsideEditor(event: PointerEvent): boolean {
    const bounds = this.view.scrollDOM.getBoundingClientRect();
    const isInsideX = event.clientX >= bounds.left && event.clientX <= bounds.right;
    return isInsideX && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  }

  /** A click without a drag puts the caret in the block and opens the block menu beside the handle. */
  private readonly openMenu = (): void => {
    const block = this.shownBlock;
    const open = this.view.state.facet(blockMenuOpener);
    if (this.wasDragged || !block || !open) {
      this.wasDragged = false;
      return;
    }
    if (!(
      this.view.state.selection.main.head >= block.from && this.view.state.selection.main.head <= block.to
    ))
      this.view.dispatch({ selection: { anchor: block.from } });
    this.view.focus();
    const bounds = this.handle.getBoundingClientRect();
    open({ x: bounds.left, y: bounds.bottom });
  };
}

const blockHandleTheme = EditorView.theme({
  '.cm-scroller': { position: 'relative' },
  [`.${HANDLE_CLASS}`]: {
    position: 'absolute',
    zIndex: '2',
    display: 'grid',
    placeItems: 'center',
    width: `${String(HANDLE_SIZE_PX)}px`,
    height: `${String(HANDLE_SIZE_PX)}px`,
    padding: '0',
    border: '0',
    borderRadius: 'var(--radius-xsmall)',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    cursor: 'grab',
    touchAction: 'none',
  },
  [`.${HANDLE_CLASS}[hidden]`]: { display: 'none' },
  [`.${HANDLE_CLASS}:hover`]: { background: 'var(--color-surface-hover)', color: 'var(--color-text)' },
  [`.${HANDLE_CLASS} svg`]: {
    width: '16px',
    height: '16px',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '3',
    strokeLinecap: 'round',
  },
  [`.${DROP_LINE_CLASS}`]: {
    position: 'absolute',
    zIndex: '2',
    height: '2px',
    background: 'var(--color-focus)',
    pointerEvents: 'none',
  },
  '@media (forced-colors: active)': {
    [`.${HANDLE_CLASS}`]: { color: 'ButtonText' },
    [`.${DROP_LINE_CLASS}`]: { background: 'Highlight' },
  },
});

/** Rich text's block handle: one element beside the hovered or caret block, dragged to move it. */
export function blockHandle(): Extension {
  return [ViewPlugin.fromClass(BlockHandleView), blockHandleTheme];
}

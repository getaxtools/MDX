import { WidgetType, type EditorView } from '@codemirror/view';
import { settleRenderedHtml, showRenderedHtml, renderingOf } from '../../rich-text/renderedWidgets';

export const GRID_CELL_CLASS = 'cm-table-grid-cell';
export const LIVE_CELL_CLASS = 'cm-table-live-cell';
export const GRID_ROW_CLASS = 'cm-table-grid-row';
export const GRID_CLASS = 'cm-table-grid';

export type CellAlignment = 'left' | 'center' | 'right' | undefined;

/** Where a cell sits in the grid, which a click on it is read back from. */
export interface CellPlace {
  readonly row: number;
  readonly column: number;
  readonly isHeader: boolean;
  readonly alignment: CellAlignment;
}

export function cellAttributes(place: CellPlace): Record<string, string> {
  return {
    role: place.isHeader ? 'columnheader' : 'gridcell',
    'data-table-row': String(place.row),
    'data-table-column': String(place.column),
    style: `grid-column: ${String(place.column + 1)};${place.alignment ? ` text-align: ${place.alignment};` : ''}`,
  };
}

function applyAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
}

/** Rendered Markdown of one cell, without the paragraph the renderer wraps it in. */
function cellHtml(view: EditorView, markdown: string): string | undefined {
  const rendering = renderingOf(view);
  if (!rendering) return undefined;
  const container = view.dom.ownerDocument.createElement('div');
  showRenderedHtml(container, `table-cell:${rendering.documentKey}:${markdown}`, () =>
    rendering.renderBlock(markdown),
  );
  const paragraph = container.children.length === 1 ? container.querySelector(':scope > p') : null;
  return paragraph ? paragraph.innerHTML : container.innerHTML;
}

/** A cell of the grid shown rendered, as the preview shows it; the live cell is editor text instead. */
export class GridCellWidget extends WidgetType {
  constructor(
    readonly markdown: string,
    readonly place: CellPlace,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof GridCellWidget &&
      other.markdown === this.markdown &&
      other.place.row === this.place.row &&
      other.place.column === this.place.column &&
      other.place.isHeader === this.place.isHeader &&
      other.place.alignment === this.place.alignment
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement('span');
    element.className = GRID_CELL_CLASS;
    applyAttributes(element, cellAttributes(this.place));
    const html = cellHtml(view, this.markdown);
    if (html === undefined) element.textContent = this.markdown;
    else element.innerHTML = html;
    settleRenderedHtml(element, view);
    return element;
  }

  /** The grid handles presses on its cells itself, moving the caret into the cell. */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}

/** The live cell while it is empty, so the caret has a cell to stand in. */
export class EmptyLiveCellWidget extends WidgetType {
  constructor(readonly place: CellPlace) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof EmptyLiveCellWidget &&
      other.place.row === this.place.row &&
      other.place.column === this.place.column
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement('span');
    element.className = `${GRID_CELL_CLASS} ${LIVE_CELL_CLASS}`;
    applyAttributes(element, cellAttributes(this.place));
    return element;
  }
}

/**
 * The grid itself: the table's rows are editor lines, so this element holds the grid role, names the
 * table and owns the rows by their ids.
 */
export class GridWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly rowIds: readonly string[],
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof GridWidget && other.label === this.label && other.rowIds.join() === this.rowIds.join()
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement('div');
    element.className = GRID_CLASS;
    applyAttributes(element, { role: 'grid', 'aria-label': this.label, 'aria-owns': this.rowIds.join(' ') });
    return element;
  }
}

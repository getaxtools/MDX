<script lang="ts">
  import { horizontalDirectionOf } from './textDirection';
  interface Props {
    label: string;
    /** The panel's current size, in pixels unless `pixelsPerUnit` says otherwise. */
    size: number;
    /** 1 when the panel is left of the splitter and grows as it moves right, -1 when it is right of it. */
    growDirection: 1 | -1;
    minSize: number;
    maxSize: number;
    /** How many pixels one unit of size is, measured when a drag starts; for sizes given as percentages. */
    pixelsPerUnit?: () => number;
    /** How far one arrow key press moves the splitter, in units of size. */
    keyboardStep?: number;
    /** Called while dragging, so the panel follows the pointer. */
    onPreview: (size: number) => void;
    /** Called once the new size is final, to remember it. */
    onResize: (size: number) => void;
    /** Called on double-click, to return the panel to its default size. */
    onReset: () => void;
  }

  const {
    label,
    size,
    growDirection,
    minSize,
    maxSize,
    pixelsPerUnit = () => 1,
    keyboardStep = 16,
    onPreview,
    onResize,
    onReset,
  }: Props = $props();

  interface DragStart {
    readonly pointerX: number;
    readonly size: number;
    readonly unitPx: number;
    /** -1 in a right-to-left layout, where the panels swap sides. */
    readonly direction: 1 | -1;
  }

  let dragStart: DragStart | undefined;
  let currentSize = 0;

  function clamp(candidate: number): number {
    return Math.min(Math.max(candidate, minSize), maxSize);
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    currentSize = size;
    dragStart = {
      pointerX: event.clientX,
      size,
      unitPx: pixelsPerUnit() || 1,
      direction: horizontalDirectionOf(event.currentTarget),
    };
  }

  function drag(event: PointerEvent) {
    if (!dragStart) return;
    const movedUnits = (event.clientX - dragStart.pointerX) / dragStart.unitPx;
    currentSize = clamp(dragStart.size + movedUnits * growDirection * dragStart.direction);
    onPreview(currentSize);
  }

  function finishDrag() {
    if (!dragStart) return;
    dragStart = undefined;
    onResize(currentSize);
  }

  function handleKeydown(event: KeyboardEvent) {
    const movement = { ArrowLeft: -keyboardStep, ArrowRight: keyboardStep }[event.key];
    if (movement === undefined || !(event.currentTarget instanceof Element)) return;
    event.preventDefault();
    onResize(clamp(size + movement * growDirection * horizontalDirectionOf(event.currentTarget)));
  }
</script>

<!-- A focusable separator is the WAI-ARIA window splitter, an interactive widget Svelte does not know. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="panel-resizer"
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={Math.round(size)}
  aria-valuemin={minSize}
  aria-valuemax={maxSize}
  tabindex="0"
  onpointerdown={startDrag}
  onpointermove={drag}
  onpointerup={finishDrag}
  onpointercancel={finishDrag}
  ondblclick={onReset}
  onkeydown={handleKeydown}
></div>

<style>
  .panel-resizer {
    flex: none;
    width: 5px;
    margin-inline: -2px;
    position: relative;
    z-index: 1;
    cursor: col-resize;
    touch-action: none;
  }

  .panel-resizer:hover,
  .panel-resizer:active {
    background: var(--color-focus);
  }

  .panel-resizer:focus-visible {
    background: var(--color-focus);
    outline: 2px solid var(--color-focus);
  }
</style>

<script lang="ts">
  import { MIN_EXPLORER_SECTION_HEIGHT_PX } from '@mdx/core';

  interface Props {
    label: string;
    /** The section's current height, measured when a drag or key press starts. */
    measureHeight: () => number;
    /** Called while dragging, so the section follows the pointer. */
    onPreview: (heightPx: number) => void;
    /** Called once the new height is final, to remember it. */
    onResize: (heightPx: number) => void;
  }

  const { label, measureHeight, onPreview, onResize }: Props = $props();

  const KEYBOARD_STEP_PX = 16;
  let dragStart: { readonly pointerY: number; readonly heightPx: number } | undefined;
  let currentHeight = $state(0);

  function startDrag(event: PointerEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart = { pointerY: event.clientY, heightPx: measureHeight() };
  }

  function drag(event: PointerEvent) {
    if (!dragStart) return;
    currentHeight = Math.max(
      dragStart.heightPx + event.clientY - dragStart.pointerY,
      MIN_EXPLORER_SECTION_HEIGHT_PX,
    );
    onPreview(currentHeight);
  }

  function finishDrag() {
    if (!dragStart) return;
    dragStart = undefined;
    onResize(currentHeight);
  }

  function handleKeydown(event: KeyboardEvent) {
    const step = { ArrowUp: -KEYBOARD_STEP_PX, ArrowDown: KEYBOARD_STEP_PX }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    currentHeight = Math.max(measureHeight() + step, MIN_EXPLORER_SECTION_HEIGHT_PX);
    onResize(currentHeight);
  }
</script>

<!-- A focusable separator is the WAI-ARIA window splitter, an interactive widget Svelte does not know. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="section-resizer"
  role="separator"
  aria-orientation="horizontal"
  aria-label={label}
  aria-valuenow={Math.round(currentHeight)}
  tabindex="0"
  onpointerdown={startDrag}
  onpointermove={drag}
  onpointerup={finishDrag}
  onpointercancel={finishDrag}
  onkeydown={handleKeydown}
></div>

<style>
  .section-resizer {
    flex: none;
    height: 6px;
    margin: 0 var(--space-2);
    border-radius: var(--radius-small);
    cursor: row-resize;
    touch-action: none;
  }

  .section-resizer:hover,
  .section-resizer:focus-visible {
    background: var(--color-border);
    outline: none;
  }

  .section-resizer:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>

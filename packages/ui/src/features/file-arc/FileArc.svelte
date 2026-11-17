<script lang="ts">
  import { fileArcLayout, type FileArcEntry, type WorkspaceKindId } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import { horizontalDirectionOf } from '../../components/textDirection';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { KIND_ICONS, kindColourOf } from '../control-wheel/kindPresentation';
  import { readWheelMediaPreferences } from '../control-wheel/wheelMediaPreferences';
  import { fileArcMotion } from './fileArcMotion';
  import {
    cardAccessibleName,
    cardDetailsText,
    entryAccessibleName,
    fileArcLabel,
    positionText,
    type FileArcWording,
  } from './fileArcText';

  interface Props {
    entries: readonly FileArcEntry[];
    highlighted: number;
    kindId: WorkspaceKindId;
    wording: FileArcWording;
    /** `yesterday`, once the highlighted file's time has been read. */
    lastEdited?: string | undefined;
    /** The arc was closed and is fading out: it ignores input, and calls onClosed once it has gone. */
    isClosing?: boolean;
    translator: Translator;
    onChoose: (index: number) => void;
    onClosed?: () => void;
  }

  const {
    entries,
    highlighted,
    kindId,
    wording,
    lastEdited,
    isClosing = false,
    translator,
    onChoose,
    onClosed = () => undefined,
  }: Props = $props();

  const preferences = readWheelMediaPreferences(globalThis.document.documentElement);
  const motion = fileArcMotion(preferences.isMotionReduced);
  /** Longer than the close motion, in case its end is never reported. */
  const CLOSE_SAFETY_MS = 200;

  let layer: HTMLElement | undefined = $state();
  let areaWidth = $state(0);
  let areaHeight = $state(0);
  let direction: 'ltr' | 'rtl' = $state('ltr');

  const layout = $derived(
    fileArcLayout({ listLength: entries.length, highlighted, areaWidth, areaHeight, direction }),
  );
  const card = $derived(entries[highlighted]);
  const cardDetails = $derived(card ? cardDetailsText(card, lastEdited, translator) : '');
  const optionId = (index: number) => `file-arc-option-${String(index)}`;
  const nameOf = (index: number) => {
    const entry = entries[index];
    return entry ? entryAccessibleName(entry, { index, count: entries.length }, translator) : '';
  };

  $effect(() => {
    const shown = layer;
    if (!shown) return;
    direction = horizontalDirectionOf(shown) === -1 ? 'rtl' : 'ltr';
    measure();
    untrack(() => shown.focus({ preventScroll: true }));
  });

  // Measured while open only, so nothing listens while the arc is closed.
  function measure() {
    const bounds = layer?.getBoundingClientRect();
    areaWidth = bounds?.width ?? 0;
    areaHeight = bounds?.height ?? 0;
  }

  $effect(() => {
    if (!isClosing) return;
    const timer = globalThis.setTimeout(onClosed, motion.closeMs + CLOSE_SAFETY_MS);
    return () => globalThis.clearTimeout(timer);
  });
</script>

<svelte:window onresize={measure} />

<div
  bind:this={layer}
  class="file-arc"
  class:opaque={preferences.isSurfaceOpaque}
  class:closing={isClosing}
  class:rtl={direction === 'rtl'}
  role="listbox"
  tabindex="-1"
  aria-label={fileArcLabel(wording, translator)}
  aria-activedescendant={card ? optionId(highlighted) : undefined}
  style:--kind={kindColourOf(kindId)}
  style:--arc-open-ms="{motion.openMs}ms"
  style:--arc-open-slide="{motion.openSlidePx}px"
  style:--arc-step-ms="{motion.stepMs}ms"
  style:--arc-close-ms="{motion.closeMs}ms"
  inert={isClosing}
>
  <div
    class="dial"
    style:left="{layout.dial.centreLeft - layout.dial.radius}px"
    style:width="{2 * layout.dial.radius}px"
    style:height="{2 * layout.dial.radius}px"
    style:top="calc(50% - {layout.dial.radius}px)"
  ></div>
  {#each layout.dots as dot (dot.distance)}
    <span
      class="dot"
      class:here={dot.distance === 0}
      style:left="{dot.left}px"
      style:top="calc(50% + {dot.top}px)"
      style:opacity={dot.opacity}
    ></span>
  {/each}
  {#each layout.names as name (name.distance)}
    {@const entry = entries[name.index]}
    {#if entry}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        id={optionId(name.index)}
        class="name"
        class:near={Math.abs(name.distance) === 1}
        role="option"
        tabindex="-1"
        aria-selected="false"
        aria-label={nameOf(name.index)}
        title={entry.isOpenInTab ? translator.translate('fileArc.openInTab') : undefined}
        style:left="{name.left}px"
        style:top="calc(50% + {name.top}px)"
        style:--scale={name.scale}
        style:opacity={name.opacity}
        onclick={() => onChoose(name.index)}
      >
        {#if entry.isOpenInTab}<span class="open-dot" aria-hidden="true"></span>{/if}
        <span class="name-text">{entry.name}</span>
      </div>
    {/if}
  {/each}
  {#if card}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      id={optionId(highlighted)}
      class="card"
      role="option"
      tabindex="-1"
      aria-selected="true"
      aria-label={cardAccessibleName(
        card,
        { index: highlighted, count: entries.length, details: cardDetails },
        translator,
      )}
      style:left="{layout.card.left}px"
      style:top="calc(50% + {layout.card.top}px)"
      onclick={() => onChoose(highlighted)}
    >
      <span class="card-icon" aria-hidden="true"><KindIcon paths={KIND_ICONS[kindId]} /></span>
      <span class="card-text">
        <span class="card-line">
          {#if card.isOpenInTab}<span class="open-dot" aria-hidden="true"></span>{/if}
          <span class="card-name">{card.name}</span>
          <span class="card-position">{positionText(highlighted, entries.length, translator)}</span>
        </span>
        <span class="card-details">{cardDetails}</span>
      </span>
    </div>
  {/if}
  <p class="hint" aria-hidden="true">
    <span>{translator.translate('fileArc.hint.turn', { ctrl: translator.translate('keys.ctrl') })}</span>
    <span>{translator.translate('fileArc.hint.choose', { ctrl: translator.translate('keys.ctrl') })}</span>
  </p>
</div>

<style>
  .file-arc {
    position: absolute;
    inset: 0;
    z-index: 15;
    overflow: hidden;
    outline: none;
    animation: arc-open var(--arc-open-ms) var(--easing-standard);
    pointer-events: none;
  }

  .file-arc.closing {
    opacity: 0;
    transition: opacity var(--arc-close-ms) var(--easing-standard);
  }

  .file-arc > * {
    pointer-events: auto;
  }

  @keyframes arc-open {
    from {
      opacity: 0;
      translate: calc(-1 * var(--arc-open-slide)) 0;
    }
  }

  .file-arc.rtl {
    animation-name: arc-open-rtl;
  }

  @keyframes arc-open-rtl {
    from {
      opacity: 0;
      translate: var(--arc-open-slide) 0;
    }
  }

  .dial {
    position: absolute;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-wheel-surface) var(--wheel-surface-opacity), transparent);
    backdrop-filter: var(--wheel-surface-backdrop);
    box-shadow:
      var(--shadow-wheel),
      inset 0 0 0 1px var(--color-border);
    pointer-events: none;
  }

  .opaque .dial {
    background: var(--color-wheel-surface);
    backdrop-filter: none;
  }

  .dot {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    translate: -50% -50%;
    background: var(--color-text);
    transition:
      left var(--arc-step-ms) var(--easing-standard),
      top var(--arc-step-ms) var(--easing-standard);
  }

  /* The kind colour alone may be too light on the dial, so the dots carry an outline in the text colour. */
  .dot.here {
    width: 10px;
    height: 10px;
    background: var(--kind);
    box-shadow: 0 0 0 1.5px var(--color-text);
  }

  .name {
    position: absolute;
    display: flex;
    gap: var(--space-2);
    align-items: center;
    max-width: 260px;
    padding: 6px 12px;
    border-radius: var(--radius-medium);
    translate: -100% -50%;
    scale: var(--scale);
    transform-origin: right center;
    color: var(--color-text);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      left var(--arc-step-ms) var(--easing-standard),
      top var(--arc-step-ms) var(--easing-standard),
      opacity var(--arc-step-ms) var(--easing-standard);
  }

  .rtl .name,
  .rtl .card {
    translate: 0 -50%;
    transform-origin: left center;
  }

  .name.near {
    font-size: 15px;
  }

  .name:hover {
    background: var(--color-surface-hover);
  }

  .name-text,
  .card-name,
  .card-details {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .open-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--kind);
    box-shadow: 0 0 0 1px var(--color-text);
  }

  .card {
    position: absolute;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    box-sizing: border-box;
    max-width: 284px;
    padding: 10px 16px 10px 10px;
    border-radius: 16px;
    translate: -100% -50%;
    background: var(--color-wheel-tile);
    box-shadow:
      var(--shadow-wheel),
      inset 0 0 0 1.5px var(--kind);
    color: var(--color-text);
    white-space: nowrap;
    cursor: pointer;
  }

  .card-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-medium);
    background: color-mix(in srgb, var(--kind) 14%, var(--color-wheel-tile));
    color: var(--kind);
  }

  .card-icon :global(svg) {
    width: 22px;
    height: 22px;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .card-line {
    display: flex;
    gap: 10px;
    align-items: baseline;
    min-width: 0;
  }

  .card-name {
    font-size: 1rem;
    font-weight: 600;
  }

  .card-position {
    flex: none;
    margin-inline-start: auto;
    color: var(--color-text);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  .card-details {
    color: var(--color-text);
    font-size: var(--text-size-small);
  }

  .hint {
    position: absolute;
    inset-block-end: 20px;
    inset-inline-start: 24px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 300px;
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-size-small);
    pointer-events: none;
  }

  @media (forced-colors: active) {
    .dial {
      background: Canvas;
      backdrop-filter: none;
      box-shadow: inset 0 0 0 2px CanvasText;
    }

    .card {
      background: Canvas;
      box-shadow: none;
      outline: 3px solid Highlight;
    }

    .dot,
    .dot.here,
    .open-dot {
      background: CanvasText;
      forced-color-adjust: none;
    }
  }
</style>

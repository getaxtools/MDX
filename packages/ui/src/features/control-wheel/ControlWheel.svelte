<script lang="ts">
  import {
    hitTestRing,
    ringLayout,
    sectorPath,
    type RingPoint,
    type WheelDock,
    type WorkspaceKindsState,
  } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { onMount } from 'svelte';
  import { horizontalDirectionOf } from '../../components/textDirection';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import KindIcon from './KindIcon.svelte';
  import KindSettingsPopup from './KindSettingsPopup.svelte';
  import { CHECK_ICON, GEAR_ICON, KIND_ICONS, kindNameOf } from './kindPresentation';
  import { wheelKeyAction, type WheelKeyAction } from './wheelKeyboard';
  import { wheelPlacement } from './wheelPlacement';

  interface Props {
    kinds: WorkspaceKindsState;
    dock: WheelDock;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { kinds, dock, translator, onCommand, onClose }: Props = $props();

  const RING_RADII = { outer: 96, inner: 40 };
  const VIEW_BOX_SIZE = 200;
  const SECTOR_GAP_RADIANS = 0.035;
  const DEFAULT_ROOT_FONT_SIZE_PX = 16;
  const CAPTION_HEIGHT_REM = 2;
  const STATUS_BAR_ALLOWANCE_REM = 2;

  let wheel: HTMLElement | undefined = $state();
  let gearButton: HTMLButtonElement | undefined = $state();
  const segmentElements: HTMLElement[] = $state([]);
  let direction: 1 | -1 = $state(1);
  let windowWidth = $state(globalThis.innerWidth);
  let windowHeight = $state(globalThis.innerHeight);
  let focusedIndex = $state(activeIndex());
  let pointedIndex: number | undefined = $state();
  let isKindSettingsOpen = $state(false);

  const rootFontSizePx =
    Number.parseFloat(globalThis.getComputedStyle(globalThis.document.documentElement).fontSize) ||
    DEFAULT_ROOT_FONT_SIZE_PX;
  const enabledKindIds = $derived(kinds.enabledKindIds());
  const layout = $derived(ringLayout(enabledKindIds.length, RING_RADII, direction));
  const currentIndex = $derived(Math.min(focusedIndex, enabledKindIds.length - 1));
  const captionKindId = $derived(enabledKindIds[pointedIndex ?? currentIndex]);
  const placement = $derived(
    wheelPlacement({
      dock,
      direction,
      windowWidthPx: windowWidth,
      windowHeightPx: windowHeight,
      rootFontSizePx,
      bottomInsetPx: STATUS_BAR_ALLOWANCE_REM * rootFontSizePx,
      captionHeightPx: CAPTION_HEIGHT_REM * rootFontSizePx,
    }),
  );

  function activeIndex(): number {
    return Math.max(kinds.enabledKindIds().indexOf(kinds.activeKindId()), 0);
  }

  onMount(() => {
    const previouslyFocused = globalThis.document.activeElement;
    if (wheel) direction = horizontalDirectionOf(wheel);
    segmentElements[currentIndex]?.focus();
    function closeOnPressOutside(event: PointerEvent) {
      if (event.target instanceof Node && !wheel?.contains(event.target)) onClose();
    }
    globalThis.addEventListener('pointerdown', closeOnPressOutside, true);
    return () => {
      globalThis.removeEventListener('pointerdown', closeOnPressOutside, true);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected)
        previouslyFocused.focus();
    };
  });

  function chooseAndStay(index: number) {
    const kindId = enabledKindIds[index];
    if (kindId) onCommand({ kind: 'switchWorkspaceKind', kindId });
  }

  function chooseAndClose(index: number) {
    chooseAndStay(index);
    onClose();
  }

  function focusSegment(index: number) {
    focusedIndex = index;
    segmentElements[index]?.focus();
  }

  function runKeyAction(action: WheelKeyAction) {
    if (action.action === 'focus') focusSegment(action.index);
    else if (action.action === 'chooseAndClose') chooseAndClose(action.index);
    else if (action.action === 'chooseAndStay') chooseAndStay(action.index);
    else if (action.action === 'switchFocusArea') gearButton?.focus();
    else if (action.action === 'close') onClose();
  }

  function handleSegmentKeydown(event: KeyboardEvent) {
    const segmentCount = enabledKindIds.length;
    const action = wheelKeyAction(event, { segmentCount, focusedIndex: currentIndex, direction });
    if (action.action === 'none') return;
    event.preventDefault();
    runKeyAction(action);
  }

  function handleGearKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      focusSegment(currentIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function pointInRing(event: MouseEvent): RingPoint | undefined {
    if (!(event.currentTarget instanceof HTMLElement)) return undefined;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return undefined;
    const scale = VIEW_BOX_SIZE / bounds.width;
    return {
      x: (event.clientX - bounds.left - bounds.width / 2) * scale,
      y: (event.clientY - bounds.top - bounds.height / 2) * scale,
    };
  }

  /** Screen readers activate an item without a pointer position, so the item clicked comes first. */
  function chooseFromClick(event: MouseEvent) {
    const segment =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-segment]') : null;
    if (segment) {
      chooseAndClose(Number(segment.dataset.segment));
      return;
    }
    const point = pointInRing(event);
    const hit = point ? hitTestRing(point, layout) : undefined;
    if (hit?.area === 'segment') chooseAndClose(hit.index);
    else if (hit?.area === 'gear') openKindSettings();
    else if (hit?.area === 'outside') onClose();
  }

  function showPointedSegment(event: PointerEvent) {
    const point = pointInRing(event);
    const hit = point ? hitTestRing(point, layout) : undefined;
    pointedIndex = hit?.area === 'segment' ? hit.index : undefined;
  }

  function openKindSettings() {
    isKindSettingsOpen = true;
  }

  function closeKindSettings() {
    isKindSettingsOpen = false;
    gearButton?.focus();
  }
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} onblur={onClose} />

<!-- Placement and segment positions are screen coordinates already mirrored for right-to-left, so they use left. -->
<div
  bind:this={wheel}
  class="control-wheel"
  role="dialog"
  aria-label={translator.translate('controlWheel.label')}
  style:left="{placement.centerX - placement.diameterPx / 2}px"
  style:top="{placement.centerY - placement.diameterPx / 2}px"
  style:width="{placement.diameterPx}px"
  style:height="{placement.diameterPx}px"
>
  {#if captionKindId && !isKindSettingsOpen}
    <p class="caption" aria-hidden="true">
      {translator.translate('controlWheel.caption', {
        kind: kindNameOf(captionKindId, translator),
        number: enabledKindIds.indexOf(captionKindId) + 1,
      })}
    </p>
  {/if}
  <svg class="ring" viewBox="-100 -100 200 200" aria-hidden="true">
    {#each layout.sectors as sector (sector.index)}
      <path
        class="sector"
        class:active={enabledKindIds[sector.index] === kinds.activeKindId()}
        class:focused={sector.index === currentIndex}
        class:pointed={sector.index === pointedIndex}
        d={sectorPath(sector, layout, SECTOR_GAP_RADIANS)}
      />
    {/each}
  </svg>
  <div
    class="segments"
    role="menu"
    tabindex="-1"
    aria-label={translator.translate('controlWheel.kinds.label')}
    onclick={chooseFromClick}
    onkeydown={handleSegmentKeydown}
    onpointermove={showPointedSegment}
    onpointerleave={() => (pointedIndex = undefined)}
  >
    {#each layout.sectors as sector (sector.index)}
      {@const kindId = enabledKindIds[sector.index]}
      {#if kindId}
        {@const name = kindNameOf(kindId, translator)}
        <div
          bind:this={segmentElements[sector.index]}
          class="segment"
          role="menuitemradio"
          tabindex={sector.index === currentIndex ? 0 : -1}
          aria-label={name}
          aria-checked={kindId === kinds.activeKindId()}
          aria-keyshortcuts={String(sector.index + 1)}
          title={translator.translate('controlWheel.segment.tooltip', {
            kind: name,
            number: sector.index + 1,
          })}
          data-segment={sector.index}
          style:left="calc(50% + {sector.iconCenter.x / 2}%)"
          style:top="calc(50% + {sector.iconCenter.y / 2}%)"
          onfocus={() => (focusedIndex = sector.index)}
        >
          <KindIcon paths={KIND_ICONS[kindId]} />
          {#if kindId === kinds.activeKindId()}
            <span class="check"><KindIcon paths={CHECK_ICON} /></span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  <button
    bind:this={gearButton}
    class="gear"
    aria-label={translator.translate('controlWheel.gear.label')}
    title={translator.translate('controlWheel.gear.label')}
    aria-haspopup="dialog"
    aria-expanded={isKindSettingsOpen}
    onclick={() => (isKindSettingsOpen ? closeKindSettings() : openKindSettings())}
    onkeydown={handleGearKeydown}
  >
    <KindIcon paths={GEAR_ICON} />
  </button>
  {#if isKindSettingsOpen}
    <KindSettingsPopup {kinds} {translator} {onCommand} onClose={closeKindSettings} />
  {/if}
</div>

<style>
  .control-wheel {
    position: fixed;
    z-index: 25;
    animation: wheel-in var(--motion-fast) var(--easing-standard);
  }

  @keyframes wheel-in {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  .caption {
    position: absolute;
    inset-block-end: 100%;
    inset-inline: 0;
    width: max-content;
    max-width: 16rem;
    margin: 0 auto var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-small);
    color: var(--color-text);
    font-size: var(--text-size-small);
  }

  .ring {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 12px rgb(0 0 0 / 18%));
  }

  .sector {
    fill: var(--color-surface-raised);
    fill-rule: evenodd;
    stroke: var(--color-border);
    stroke-width: 1;
  }

  .sector.pointed {
    fill: var(--color-surface-hover);
  }

  .sector.active {
    fill: var(--color-surface-selected);
    stroke: var(--color-accent);
    stroke-width: 2;
  }

  .sector.focused {
    stroke: var(--color-focus);
    stroke-width: 3;
  }

  .segments {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    outline: none;
  }

  .segment {
    position: absolute;
    display: grid;
    place-items: center;
    width: 22%;
    height: 22%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    color: var(--color-text-secondary);
    outline: none;
  }

  .segment[aria-checked='true'] {
    color: var(--color-accent);
  }

  .check {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .check :global(svg) {
    width: 0.75rem;
    height: 0.75rem;
    stroke-width: 2.4;
  }

  .gear {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    place-items: center;
    width: 24%;
    height: 24%;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    transform: translate(-50%, -50%);
  }

  .gear:hover,
  .gear[aria-expanded='true'] {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .gear:focus-visible {
    outline: 3px solid var(--color-focus);
  }

  @media (forced-colors: active) {
    .ring {
      forced-color-adjust: none;
      filter: none;
    }

    .sector,
    .sector.pointed {
      fill: Canvas;
      stroke: CanvasText;
    }

    .sector.active {
      stroke: Highlight;
      stroke-width: 3;
    }

    .sector.focused {
      stroke: Highlight;
      stroke-width: 5;
    }

    .segment,
    .segment[aria-checked='true'] {
      color: CanvasText;
    }

    .check {
      background: Highlight;
      color: HighlightText;
    }
  }
</style>

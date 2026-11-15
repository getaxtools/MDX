<script lang="ts">
  import {
    hitTestRing,
    ringLayout,
    type RingHit,
    type RingPoint,
    type RingSector,
    type WheelDock,
    type WorkspaceKindsState,
  } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import { horizontalDirectionOf } from '../../components/textDirection';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import KindIcon from './KindIcon.svelte';
  import KindSettingsPopup from './KindSettingsPopup.svelte';
  import { GEAR_ICON } from './kindPresentation';
  import WheelCaption from './WheelCaption.svelte';
  import {
    EDGE_BAND_REM,
    insetForRadius,
    liftTranslation,
    percentPositionOf,
    RING_RADII,
    SURFACE_RADIUS,
    VIEW_BOX_SIZE,
  } from './wheelDimensions';
  import { isKeyboardMovement, wheelKeyAction, type WheelKeyAction } from './wheelKeyboard';
  import { readWheelMediaPreferences } from './wheelMediaPreferences';
  import { wheelMotion, type WheelPhase } from './wheelMotion';
  import { wheelPlacement } from './wheelPlacement';
  import WheelKeyCaps from './WheelKeyCaps.svelte';
  import WheelRing from './WheelRing.svelte';
  import WheelSegment from './WheelSegment.svelte';

  interface Props {
    kinds: WorkspaceKindsState;
    dock: WheelDock;
    /** Where the pointer was when the wheel was asked for, when it opens at the pointer. */
    pointer?: RingPoint | undefined;
    /** Opens with the kind choices shown, as Choose Workspace Kinds does. */
    shouldShowKindSettings?: boolean;
    /** The wheel was closed and is fading out: it ignores input, and calls onClosed once it has gone. */
    isClosing?: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
    onClosed?: () => void;
  }

  const {
    kinds,
    dock,
    pointer,
    shouldShowKindSettings = false,
    isClosing = false,
    translator,
    onCommand,
    onClose,
    onClosed = () => undefined,
  }: Props = $props();

  const DEFAULT_ROOT_FONT_SIZE_PX = 16;
  const CAPTION_HEIGHT_REM = 3.75;
  const STATUS_BAR_ALLOWANCE_REM = 2;
  /** Longer than the close motion, in case its end is never reported. */
  const CLOSE_SAFETY_MS = 150;
  const ICON_SIZE_PX = 22;
  const LIT_ICON_SIZE_PX = 26;
  const LIT_ICON_SCALE = LIT_ICON_SIZE_PX / ICON_SIZE_PX;

  let wheel: HTMLElement | undefined = $state();
  let gearButton: HTMLButtonElement | undefined = $state();
  const segmentElements: HTMLElement[] = $state([]);
  let direction: 1 | -1 = $state(1);
  let windowWidth = $state(globalThis.innerWidth);
  let windowHeight = $state(globalThis.innerHeight);
  let focusedIndex = $state(activeIndex());
  let pointedIndex: number | undefined = $state();
  let confirmedIndex: number | undefined = $state();
  let isKeyboardInUse = $state(false);
  let isFocusInMenu = $state(false);
  let isKindSettingsOpen = $state(untrack(() => shouldShowKindSettings));
  let openedAtPointer = $state(untrack(() => pointer));
  let preferences = $state(readWheelMediaPreferences(globalThis.document.documentElement));
  let hasBeenShownAgain = $state(false);
  let hasOpened = false;

  const rootFontSizePx =
    Number.parseFloat(globalThis.getComputedStyle(globalThis.document.documentElement).fontSize) ||
    DEFAULT_ROOT_FONT_SIZE_PX;
  const enabledKindIds = $derived(kinds.enabledKindIds());
  const layout = $derived(ringLayout(enabledKindIds.length, RING_RADII, direction));
  const currentIndex = $derived(Math.min(focusedIndex, enabledKindIds.length - 1));
  const litIndex = $derived(pointedIndex ?? currentIndex);
  const captionKindId = $derived(enabledKindIds[litIndex]);
  const motion = $derived(
    wheelMotion({ segmentCount: enabledKindIds.length, isMotionReduced: preferences.isMotionReduced }),
  );
  const phase: WheelPhase = $derived.by(() => {
    if (isClosing) return 'closing';
    return hasBeenShownAgain ? 'reopened' : 'opening';
  });
  const placement = $derived(
    wheelPlacement({
      dock,
      direction,
      windowWidthPx: windowWidth,
      windowHeightPx: windowHeight,
      rootFontSizePx,
      bottomInsetPx: STATUS_BAR_ALLOWANCE_REM * rootFontSizePx,
      captionHeightPx: CAPTION_HEIGHT_REM * rootFontSizePx,
      pointer: openedAtPointer,
    }),
  );
  const pixelsPerUnit = $derived(placement.diameterPx / VIEW_BOX_SIZE || 1);
  const edgeBand = $derived((EDGE_BAND_REM * rootFontSizePx) / pixelsPerUnit);
  const edgeBandInset = $derived(insetForRadius(RING_RADII.outer + edgeBand));
  const surfaceInset = insetForRadius(SURFACE_RADIUS);

  function activeIndex(): number {
    return Math.max(kinds.enabledKindIds().indexOf(kinds.activeKindId()), 0);
  }

  // Open and closing are one effect, so its cleanup (listeners off, focus back) runs the moment the
  // wheel starts closing, and again on removal if it never closed.
  $effect(() => {
    if (isClosing) return untrack(startClosing);
    return untrack(startOpen);
  });

  function startOpen() {
    if (hasOpened) showAgain();
    hasOpened = true;
    const previouslyFocused = globalThis.document.activeElement;
    if (wheel) direction = horizontalDirectionOf(wheel);
    if (!isKindSettingsOpen) segmentElements[currentIndex]?.focus();
    globalThis.addEventListener('pointerdown', closeOnPressOutside, true);
    return () => {
      globalThis.removeEventListener('pointerdown', closeOnPressOutside, true);
      returnFocus(previouslyFocused);
    };
  }

  function showAgain() {
    hasBeenShownAgain = true;
    focusedIndex = activeIndex();
    pointedIndex = undefined;
    confirmedIndex = undefined;
    isKeyboardInUse = false;
    isKindSettingsOpen = shouldShowKindSettings;
    openedAtPointer = pointer;
    preferences = readWheelMediaPreferences(globalThis.document.documentElement);
  }

  function startClosing() {
    if (preferences.isMotionReduced) {
      onClosed();
      return undefined;
    }
    const safetyTimer = globalThis.setTimeout(onClosed, CLOSE_SAFETY_MS);
    return () => globalThis.clearTimeout(safetyTimer);
  }

  function finishClosing(event: AnimationEvent) {
    if (isClosing && event.target === event.currentTarget) onClosed();
  }

  /** Focus that moved on to something else, such as another dialog, stays there. */
  function returnFocus(target: Element | null) {
    const focused = globalThis.document.activeElement;
    const isFocusOnWheel = !focused || focused === globalThis.document.body || wheel?.contains(focused);
    if (isFocusOnWheel && target instanceof HTMLElement && target.isConnected) target.focus();
  }

  function closeOnPressOutside(event: PointerEvent) {
    if (event.target instanceof Node && !wheel?.contains(event.target)) onClose();
  }

  function closeOnWindowBlur() {
    if (!isClosing) onClose();
  }

  function chooseAndStay(index: number) {
    const kindId = enabledKindIds[index];
    if (kindId) onCommand({ kind: 'switchWorkspaceKind', kindId });
  }

  function chooseAndClose(index: number) {
    confirmedIndex = index;
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
    if (isKeyboardMovement(action)) isKeyboardInUse = true;
    runKeyAction(action);
  }

  function handleGearKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      isKeyboardInUse = true;
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

  /** The same test decides what lights up and what a click chooses. */
  function ringHitAt(event: MouseEvent): RingHit | undefined {
    const point = pointInRing(event);
    return point ? hitTestRing(point, layout, edgeBand) : undefined;
  }

  /** Screen readers activate an item without a pointer position, so the item clicked comes first. */
  function chooseFromClick(event: MouseEvent) {
    if (isClosing) return;
    const segment =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-segment]') : null;
    if (segment) {
      chooseAndClose(Number(segment.dataset.segment));
      return;
    }
    const hit = ringHitAt(event);
    if (hit?.area === 'segment') chooseAndClose(hit.index);
    else if (hit?.area === 'gear') openKindSettings();
    else if (hit?.area === 'outside') onClose();
  }

  function lightPointedSegment(event: PointerEvent) {
    if (isClosing) return;
    const hit = ringHitAt(event);
    pointedIndex = hit?.area === 'segment' ? hit.index : undefined;
  }

  function liftValue(sector: RingSector): string | undefined {
    if (sector.index !== litIndex || preferences.isMotionReduced) return undefined;
    return liftTranslation(sector, layout, pixelsPerUnit);
  }

  function iconScale(sector: RingSector): number | undefined {
    return sector.index === litIndex && !preferences.isMotionReduced ? LIT_ICON_SCALE : undefined;
  }

  function openKindSettings() {
    isKindSettingsOpen = true;
  }

  function closeKindSettings() {
    isKindSettingsOpen = false;
    gearButton?.focus();
  }
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} onblur={closeOnWindowBlur} />

<!-- Placement and segment positions are screen coordinates already mirrored for right-to-left, so they use left. -->
<div
  bind:this={wheel}
  class="control-wheel"
  class:is-reopened={phase === 'reopened'}
  class:is-closing={phase === 'closing'}
  role="dialog"
  aria-label={translator.translate('controlWheel.label')}
  inert={isClosing}
  style:left="{placement.centerX - placement.diameterPx / 2}px"
  style:top="{placement.centerY - placement.diameterPx / 2}px"
  style:width="{placement.diameterPx}px"
  style:height="{placement.diameterPx}px"
  style:--surface-duration="{motion.surface.durationMs}ms"
  style:--close-duration="{motion.close.durationMs}ms"
  style:--confirm-duration="{motion.confirm.durationMs}ms"
>
  <div
    class="surface"
    data-testid="wheel-surface"
    data-surface={preferences.isSurfaceOpaque ? 'opaque' : 'frosted'}
    style:inset={surfaceInset}
    aria-hidden="true"
    onanimationend={finishClosing}
  ></div>
  {#if captionKindId && !isKindSettingsOpen}
    <WheelCaption
      kindId={captionKindId}
      number={litIndex + 1}
      side={placement.captionSide}
      isSurfaceOpaque={preferences.isSurfaceOpaque}
      {phase}
      {translator}
    />
  {/if}
  <div class="wheel-content">
    <WheelRing
      {layout}
      kindIds={enabledKindIds}
      activeKindId={kinds.activeKindId()}
      {litIndex}
      focusOutlineIndex={isKeyboardInUse && isFocusInMenu ? currentIndex : undefined}
      {confirmedIndex}
      {motion}
      {phase}
      isMotionReduced={preferences.isMotionReduced}
    />
    <div
      class="segments"
      role="menu"
      tabindex="-1"
      aria-label={translator.translate('controlWheel.kinds.label')}
      onclick={chooseFromClick}
      onkeydown={handleSegmentKeydown}
      onpointermove={lightPointedSegment}
      onpointerleave={() => (pointedIndex = undefined)}
      onfocusin={() => (isFocusInMenu = true)}
      onfocusout={() => (isFocusInMenu = false)}
    >
      <div class="edge-band" style:inset={edgeBandInset} aria-hidden="true"></div>
      {#each layout.sectors as sector (sector.index)}
        {@const kindId = enabledKindIds[sector.index]}
        {#if kindId}
          <WheelSegment
            bind:element={segmentElements[sector.index]}
            {kindId}
            index={sector.index}
            position={percentPositionOf(sector.iconCenter)}
            isActive={kindId === kinds.activeKindId()}
            isLit={sector.index === litIndex}
            isFocusable={sector.index === currentIndex}
            step={motion.segments[sector.index]}
            lift={liftValue(sector)}
            iconScale={iconScale(sector)}
            {phase}
            {translator}
            onFocus={() => (focusedIndex = sector.index)}
          />
        {/if}
      {/each}
      {#if isKeyboardInUse}
        <WheelKeyCaps {layout} />
      {/if}
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
  </div>
  {#if isKindSettingsOpen}
    <KindSettingsPopup {kinds} {translator} {onCommand} onClose={closeKindSettings} />
  {/if}
</div>

<style>
  .control-wheel {
    position: fixed;
    z-index: 25;
  }

  .control-wheel.is-closing {
    pointer-events: none;
  }

  .surface {
    position: absolute;
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-wheel-surface) var(--wheel-surface-opacity), transparent);
    backdrop-filter: var(--wheel-surface-backdrop);
    box-shadow: var(--shadow-wheel);
  }

  .surface[data-surface='opaque'] {
    background: var(--color-wheel-surface);
    backdrop-filter: none;
  }

  .wheel-content {
    position: absolute;
    inset: 0;
  }

  .segments {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    outline: none;
  }

  .edge-band {
    position: absolute;
    border-radius: 50%;
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
    background: var(--color-wheel-tile);
    color: var(--color-text-secondary);
    transform: translate(-50%, -50%);
  }

  .gear:hover,
  .gear[aria-expanded='true'] {
    background: color-mix(in srgb, var(--color-text) 8%, var(--color-wheel-tile));
    color: var(--color-text);
  }

  .gear:focus-visible {
    outline: 3px solid var(--color-focus);
  }

  @media (prefers-reduced-motion: no-preference) {
    .surface,
    .gear {
      animation: surface-in var(--surface-duration) var(--easing-emphasized) both;
    }

    .is-reopened .surface,
    .is-reopened .gear {
      animation: none;
    }

    .is-closing .surface,
    .is-closing .wheel-content {
      animation: surface-out var(--close-duration) ease-in both;
    }
  }

  @keyframes surface-in {
    from {
      opacity: 0;
      scale: 0.92;
    }
  }

  @keyframes surface-out {
    to {
      opacity: 0;
      scale: 0.96;
    }
  }

  @media (forced-colors: active) {
    .surface {
      border-color: CanvasText;
      box-shadow: none;
    }
  }
</style>

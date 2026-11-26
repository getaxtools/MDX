<script lang="ts">
  import { flushSync, onMount, type Snippet } from 'svelte';
  import { animationsEnded } from './dialogClosing';
  import { activatesPrimary, firstFieldIn, isAppShortcut, wrappedFocusTarget } from './dialogKeyboard';

  interface PrimaryAction {
    label: string;
    onActivate: () => void;
    isDisabled?: boolean;
  }

  interface Props {
    title: string;
    closeLabel: string;
    onClose: () => void;
    children: Snippet;
    /** More controls for the fixed footer, shown before the close button. */
    footer?: Snippet | undefined;
    /** False while the dialog must be finished, not closed: it then has no close button and ignores Escape. */
    canClose?: boolean;
    /** Giving a Cancel label turns on the shared frame: header Close, quiet Cancel, one primary. */
    cancelLabel?: string | undefined;
    purpose?: string;
    primary?: PrimaryAction | undefined;
    closeTooltip?: string;
    /**
     * For a warning: focus starts on Cancel, or moves there when the dialog turns into one, even from a
     * field, and only pressing the primary takes the step, never Enter elsewhere.
     */
    shouldStartOnCancel?: boolean;
    /** A dialog with nothing to apply: the shared frame with only the header Close. */
    isInformational?: boolean;
    /** A question that interrupts: announced as an alert dialog and described by its body. */
    isAlert?: boolean;
  }

  const {
    title,
    closeLabel,
    onClose,
    children,
    footer,
    canClose = true,
    cancelLabel,
    purpose,
    primary,
    closeTooltip,
    shouldStartOnCancel = false,
    isInformational = false,
    isAlert = false,
  }: Props = $props();

  const frameId = $props.id();
  const titleId = `${frameId}-title`;
  const purposeId = `${frameId}-purpose`;
  const contentId = `${frameId}-content`;
  const isSharedFrame = $derived(cancelLabel !== undefined || isInformational);
  const hasActions = $derived(
    !isSharedFrame || footer !== undefined || cancelLabel !== undefined || primary !== undefined,
  );
  const descriptionId = $derived.by(() => {
    if (isSharedFrame && purpose) return purposeId;
    return isAlert ? contentId : undefined;
  });
  const opener = globalThis.document.activeElement;

  let backdropElement: HTMLDivElement | undefined = $state();
  let dialogElement: HTMLDivElement | undefined = $state();
  let contentElement: HTMLDivElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();
  let headerCloseButton: HTMLButtonElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let primaryButton: HTMLButtonElement | undefined = $state();
  let isClosing = $state(false);
  let isMounted = false;
  let wasWarning: boolean | undefined;

  $effect(() => {
    if (!isSharedFrame) closeButton?.focus();
  });

  $effect(() => {
    const isWarning = shouldStartOnCancel;
    if (isWarning && wasWarning === false) (cancelButton ?? headerCloseButton ?? dialogElement)?.focus();
    wasWarning = isWarning;
  });

  onMount(() => {
    isMounted = true;
    const removalWatcher = new MutationObserver(refocusIfLost);
    if (isSharedFrame && dialogElement) {
      focusInitialControl();
      removalWatcher.observe(dialogElement, { childList: true, subtree: true });
    }
    return () => {
      isMounted = false;
      removalWatcher.disconnect();
      if (isSharedFrame) returnFocusToOpener();
    };
  });

  function close() {
    if (isClosing) return;
    if (!isSharedFrame || !backdropElement) {
      onClose();
      return;
    }
    isClosing = true;
    flushSync();
    const exitFade = animationsEnded(backdropElement);
    if (!exitFade) {
      finishClose();
      return;
    }
    void exitFade.then(() => {
      if (isMounted) finishClose();
    });
  }

  function finishClose() {
    try {
      onClose();
    } finally {
      isClosing = false;
    }
  }

  function activatePrimary() {
    if (!primary || primary.isDisabled || isClosing) return;
    primary.onActivate();
  }

  function focusInitialControl() {
    const field = contentElement ? firstFieldIn(contentElement) : undefined;
    const enabledPrimary = primary?.isDisabled ? undefined : primaryButton;
    const initial = shouldStartOnCancel ? cancelButton : (field ?? enabledPrimary ?? cancelButton);
    (initial ?? headerCloseButton ?? dialogElement)?.focus();
  }

  // A focused control that is removed leaves focus on the page, where Escape no longer reaches the dialog.
  function refocusIfLost() {
    const active = globalThis.document.activeElement;
    if (active && active !== globalThis.document.body) return;
    (cancelButton ?? headerCloseButton ?? dialogElement)?.focus();
  }

  function returnFocusToOpener() {
    if (!(opener instanceof HTMLElement) || !opener.isConnected) return;
    const active = globalThis.document.activeElement;
    const isFocusLeftBehind =
      !active || active === globalThis.document.body || dialogElement?.contains(active);
    if (isFocusLeftBehind) opener.focus();
  }

  function keepTabInside(event: KeyboardEvent) {
    if (!dialogElement || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const direction = event.shiftKey ? 'backward' : 'forward';
    const target = wrappedFocusTarget(dialogElement, globalThis.document.activeElement, direction);
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  function activatePrimaryOnEnter(event: KeyboardEvent) {
    if (!primary || primary.isDisabled || shouldStartOnCancel || !activatesPrimary(event)) return;
    event.preventDefault();
    activatePrimary();
  }

  function ignoreKeyPressWhileClosing(event: KeyboardEvent) {
    if (!isClosing || isAppShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // The release still bubbles, so the app's held-modifier tracking sees it.
  function ignoreKeyReleaseWhileClosing(event: KeyboardEvent) {
    if (isClosing) event.preventDefault();
  }

  // A click on the faded dialog lands on the backdrop, which would move focus to the page.
  function keepFocusWhileClosing(event: MouseEvent) {
    if (isClosing) event.preventDefault();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (!canClose || event.defaultPrevented || event.isComposing) return;
      event.stopPropagation();
      close();
      return;
    }
    if (!isSharedFrame) return;
    if (event.key === 'Tab') keepTabInside(event);
    else activatePrimaryOnEnter(event);
  }
</script>

<div
  bind:this={backdropElement}
  class="backdrop"
  class:shared-frame={isSharedFrame}
  class:closing={isClosing}
  role="presentation"
  onmousedown={keepFocusWhileClosing}
>
  <div
    bind:this={dialogElement}
    class="dialog"
    class:shared-frame={isSharedFrame}
    class:closing={isClosing}
    role={isAlert ? 'alertdialog' : 'dialog'}
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    tabindex="-1"
    onkeydowncapture={ignoreKeyPressWhileClosing}
    onkeyupcapture={ignoreKeyReleaseWhileClosing}
    onkeydown={handleKeydown}
  >
    {#if isSharedFrame}
      <header>
        <div class="heading">
          <h2 id={titleId}>{title}</h2>
          {#if purpose}<p id={purposeId} class="purpose">{purpose}</p>{/if}
        </div>
        {#if canClose}
          <button
            bind:this={headerCloseButton}
            class="close"
            aria-label={closeLabel}
            title={closeTooltip ?? closeLabel}
            onclick={close}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        {/if}
      </header>
    {:else}
      <h2 id={titleId}>{title}</h2>
    {/if}
    <!-- Long content scrolls, so keyboard users must be able to focus it to scroll it (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={contentElement}
      id={contentId}
      class="content"
      role="region"
      aria-labelledby={titleId}
      tabindex="0"
    >
      {@render children()}
    </div>
    {#if hasActions}
      <div class="actions">
        {@render footer?.()}
        {#if isSharedFrame}
          {#if canClose && cancelLabel !== undefined}
            <button bind:this={cancelButton} class="quiet" onclick={close}>{cancelLabel}</button>
          {/if}
          {#if primary}
            <button
              bind:this={primaryButton}
              class="primary"
              disabled={primary.isDisabled}
              onclick={activatePrimary}>{primary.label}</button
            >
          {/if}
        {:else if canClose}
          <button bind:this={closeButton} onclick={onClose}>{closeLabel}</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: var(--color-overlay);
  }

  .dialog {
    animation: fade-in var(--motion-fast) var(--easing-standard);
    display: flex;
    flex-direction: column;
    max-width: 34rem;
    max-height: 85vh;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xlarge);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-medium);
    color: var(--color-text);
    font-size: var(--text-size-body);
    line-height: 1.5;
  }

  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1rem;
    font-weight: 600;
  }

  .content {
    overflow-y: auto;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 500;
    transition: background-color var(--motion-fast) ease-out;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  button:focus-visible,
  .content:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .backdrop.shared-frame {
    backdrop-filter: blur(6px);
  }

  .dialog.shared-frame {
    animation-duration: var(--motion-slow);
  }

  .backdrop.closing {
    animation: fade-out var(--motion-medium) var(--easing-exit) forwards;
  }

  .dialog.shared-frame.closing {
    pointer-events: none;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    margin-block-end: var(--space-3);
  }

  .heading {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  header h2 {
    margin: 0;
  }

  .purpose {
    margin: var(--space-1) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  button.close {
    display: grid;
    place-items: center;
    width: 32px;
    padding: 0;
    border-color: transparent;
    background: transparent;
  }

  .close svg {
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  button.quiet {
    border-color: transparent;
    background: transparent;
  }

  button.primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  button.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  button.primary:active:not(:disabled) {
    background: var(--color-accent-pressed);
  }

  button:disabled {
    opacity: 0.5;
  }

  @media (forced-colors: active) {
    .backdrop.shared-frame {
      backdrop-filter: none;
      background: Canvas;
    }

    .dialog.shared-frame {
      border-color: CanvasText;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .dialog {
      animation: rise-in var(--motion-fast) var(--easing-standard);
    }

    .dialog.shared-frame {
      animation: sheet-in var(--motion-slow) var(--easing-emphasized);
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }

  @keyframes sheet-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>

<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { activatesPrimary, firstFieldIn, wrappedFocusTarget } from './dialogKeyboard';

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
    footer?: Snippet;
    /** False while the dialog must be finished, not closed: it then has no close button and ignores Escape. */
    canClose?: boolean;
    /** Giving a Cancel label turns on the shared frame: header Close, quiet Cancel, one primary. */
    cancelLabel?: string;
    purpose?: string;
    primary?: PrimaryAction;
    closeTooltip?: string;
    /** For a warning, so a stray Enter cannot take the step. */
    shouldStartOnCancel?: boolean;
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
  }: Props = $props();

  const isSharedFrame = $derived(cancelLabel !== undefined);
  const opener = globalThis.document.activeElement;

  let dialogElement: HTMLDivElement | undefined = $state();
  let contentElement: HTMLDivElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let primaryButton: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (!isSharedFrame) closeButton?.focus();
  });

  onMount(() => {
    if (!isSharedFrame) return;
    focusInitialControl();
    return returnFocusToOpener;
  });

  function focusInitialControl() {
    const field = contentElement ? firstFieldIn(contentElement) : undefined;
    const enabledPrimary = primary?.isDisabled ? undefined : primaryButton;
    const initial = shouldStartOnCancel ? cancelButton : (field ?? enabledPrimary ?? cancelButton);
    (initial ?? dialogElement)?.focus();
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
    if (!primary || primary.isDisabled || !activatesPrimary(event)) return;
    event.preventDefault();
    primary.onActivate();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (!canClose || event.defaultPrevented || event.isComposing) return;
      event.stopPropagation();
      onClose();
      return;
    }
    if (!isSharedFrame) return;
    if (event.key === 'Tab') keepTabInside(event);
    else activatePrimaryOnEnter(event);
  }
</script>

<div class="backdrop" class:shared-frame={isSharedFrame}>
  <div
    bind:this={dialogElement}
    class="dialog"
    class:shared-frame={isSharedFrame}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby={isSharedFrame && purpose ? 'dialog-purpose' : undefined}
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    {#if isSharedFrame}
      <header>
        <div class="heading">
          <h2 id="dialog-title">{title}</h2>
          {#if purpose}<p id="dialog-purpose" class="purpose">{purpose}</p>{/if}
        </div>
        {#if canClose}
          <button class="close" aria-label={closeLabel} title={closeTooltip ?? closeLabel} onclick={onClose}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        {/if}
      </header>
    {:else}
      <h2 id="dialog-title">{title}</h2>
    {/if}
    <!-- Long content scrolls, so keyboard users must be able to focus it to scroll it (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div bind:this={contentElement} class="content" role="region" aria-labelledby="dialog-title" tabindex="0">
      {@render children()}
    </div>
    <div class="actions">
      {@render footer?.()}
      {#if isSharedFrame}
        {#if canClose}
          <button bind:this={cancelButton} class="quiet" onclick={onClose}>{cancelLabel}</button>
        {/if}
        {#if primary}
          <button
            bind:this={primaryButton}
            class="primary"
            disabled={primary.isDisabled}
            onclick={primary.onActivate}>{primary.label}</button
          >
        {/if}
      {:else if canClose}
        <button bind:this={closeButton} onclick={onClose}>{closeLabel}</button>
      {/if}
    </div>
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

  header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    margin-block-end: var(--space-3);
  }

  .heading {
    flex: 1;
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

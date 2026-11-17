<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { shortcutLabelFor, tooltipWithShortcut } from '../shortcuts/commandShortcuts';

  interface Props {
    /** Hide in the side bar header, Show at the start of the tab strip. */
    action: 'hide' | 'show';
    translator: Translator;
    /** `isFromKeyboard` is true for Enter or Space, so hiding can move the focus to the document. */
    onToggle: (isFromKeyboard: boolean) => void;
  }

  const { action, translator, onToggle }: Props = $props();

  const label = $derived(translator.translate(action === 'hide' ? 'sidebar.hide' : 'sidebar.show'));
  const shortcut = $derived(
    shortcutLabelFor({ kind: 'toggleSidebarView', sidebarView: 'explorer' }, translator),
  );

  // A click from Enter or Space reports no pointer position and a detail of zero.
  function toggle(event: MouseEvent) {
    onToggle(event.detail === 0);
  }
</script>

<button
  class="sidebar-toggle"
  class:show={action === 'show'}
  aria-label={label}
  title={tooltipWithShortcut(label, shortcut)}
  onclick={toggle}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </svg>
</button>

<style>
  .sidebar-toggle {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--radius-medium);
    background: none;
    color: var(--color-text-secondary);
  }

  .sidebar-toggle.show {
    align-self: stretch;
    width: 32px;
    height: auto;
    border-radius: 0;
    border-inline-end: 1px solid var(--color-border);
  }

  .sidebar-toggle:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .sidebar-toggle:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }

  @media (forced-colors: active) {
    .sidebar-toggle {
      color: ButtonText;
    }
  }
</style>

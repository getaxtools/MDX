<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    isSidebarVisible: boolean;
    isOutlineVisible: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { isSidebarVisible, isOutlineVisible, translator, onCommand }: Props = $props();

  function labelOf(labelKey: MessageKey, command: ViewerCommand): string {
    const label = translator.translate(labelKey);
    const shortcut = shortcutLabelFor(command, translator);
    return shortcut ? `${label} (${shortcut})` : label;
  }
</script>

<nav class="activity-bar" aria-label={translator.translate('activityBar.label')}>
  <button
    aria-label={translator.translate('activityBar.sidebar')}
    title={labelOf('activityBar.sidebar', { kind: 'toggleSidebar' })}
    aria-pressed={isSidebarVisible}
    onclick={() => onCommand({ kind: 'toggleSidebar' })}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  </button>
  <button
    aria-label={translator.translate('activityBar.outline')}
    title={labelOf('activityBar.outline', { kind: 'toggleOutline' })}
    aria-pressed={isOutlineVisible}
    onclick={() => onCommand({ kind: 'toggleOutline' })}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h2M9 6h11M4 12h2M11 12h9M4 18h2M13 18h7" />
    </svg>
  </button>
  <button
    class="bottom"
    aria-label={translator.translate('menu.help.keyboardShortcuts')}
    title={labelOf('menu.help.keyboardShortcuts', { kind: 'showKeyboardShortcuts' })}
    onclick={() => onCommand({ kind: 'showKeyboardShortcuts' })}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h1M11 10h1M15 10h2M7 14h10" />
    </svg>
  </button>
</nav>

<style>
  .activity-bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: center;
    width: 2.75rem;
    padding: var(--space-2) 0;
    border-inline-end: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  button {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-inline-start: 2px solid transparent;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
  }

  button:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  button[aria-pressed='true'] {
    border-inline-start-color: var(--color-focus);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .bottom {
    margin-top: auto;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
</style>

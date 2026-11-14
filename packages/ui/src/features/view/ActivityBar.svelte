<script lang="ts">
  import type { KindSwitcher, SidebarView, WorkspaceKindsState } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import KindBar from '../control-wheel/KindBar.svelte';
  import { shortcutLabelFor, tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    isSidebarVisible: boolean;
    sidebarView?: SidebarView;
    /** The workspace kinds for the kind group at the top; without them the group is left out. */
    kinds?: WorkspaceKindsState | undefined;
    kindSwitcher?: KindSwitcher;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const {
    isSidebarVisible,
    sidebarView = 'explorer',
    kinds,
    kindSwitcher = 'both',
    translator,
    onCommand,
  }: Props = $props();

  const explorerCommand: ViewerCommand = { kind: 'toggleSidebarView', sidebarView: 'explorer' };
  const searchCommand: ViewerCommand = { kind: 'showFolderSearch' };

  function labelOf(labelKey: MessageKey, command: ViewerCommand): string {
    return tooltipWithShortcut(translator.translate(labelKey), shortcutLabelFor(command, translator));
  }
</script>

<nav class="activity-bar" data-focus-region aria-label={translator.translate('activityBar.label')}>
  {#if kinds}
    <KindBar {kinds} {kindSwitcher} {translator} {onCommand} />
  {/if}
  <button
    aria-label={translator.translate('activityBar.sidebar')}
    title={labelOf('activityBar.sidebar', explorerCommand)}
    aria-pressed={isSidebarVisible && sidebarView === 'explorer'}
    onclick={() => onCommand(explorerCommand)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3.5h7l4 4v10H8z" />
      <path d="M15 3.5v4h4M5 7v13.5h11" />
    </svg>
  </button>
  <button
    aria-label={translator.translate('activityBar.search')}
    title={labelOf('activityBar.search', searchCommand)}
    aria-pressed={isSidebarVisible && sidebarView === 'search'}
    onclick={() =>
      onCommand(
        isSidebarVisible && sidebarView === 'search'
          ? { kind: 'toggleSidebarView', sidebarView: 'search' }
          : searchCommand,
      )}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </svg>
  </button>
  <button
    aria-label={translator.translate('activityBar.outline')}
    title={labelOf('activityBar.outline', { kind: 'toggleOutline' })}
    aria-pressed={isSidebarVisible && sidebarView === 'outline'}
    onclick={() => onCommand({ kind: 'toggleOutline' })}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h2M9 6h11M4 12h2M11 12h9M4 18h2M13 18h7" />
    </svg>
  </button>
  <button
    class="bottom"
    aria-label={translator.translate('settings.title')}
    title={labelOf('settings.title', { kind: 'showSettings' })}
    onclick={() => onCommand({ kind: 'showSettings' })}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
      />
    </svg>
  </button>
  <button
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
    width: 44px;
    padding: var(--space-2) 0;
    border-inline-end: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-medium);
    background: none;
    color: var(--color-text-secondary);
    transition:
      background-color var(--motion-fast) ease-out,
      color var(--motion-fast) ease-out;
  }

  button:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  button[aria-pressed='true'] {
    color: var(--color-accent);
    background: var(--color-surface-selected);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .bottom {
    margin-top: auto;
  }

  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
</style>

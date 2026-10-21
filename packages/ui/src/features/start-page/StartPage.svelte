<script lang="ts">
  import type { RecentFile } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    recentFiles: readonly RecentFile[];
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onOpenRecentFile: (recentFile: RecentFile) => void;
  }

  const { recentFiles, translator, onCommand, onOpenRecentFile }: Props = $props();

  const MAX_START_PAGE_RECENT_FILES = 10;

  const STARTING_ACTIONS: readonly { readonly labelKey: MessageKey; readonly command: ViewerCommand }[] = [
    { labelKey: 'menu.file.newDocument', command: { kind: 'newDocument' } },
    { labelKey: 'menu.file.open', command: { kind: 'openDocuments' } },
    { labelKey: 'menu.file.openFolder', command: { kind: 'openFolder' } },
    { labelKey: 'menu.view.commandPalette', command: { kind: 'showCommandPalette' } },
  ];

  const shownRecentFiles = $derived(recentFiles.slice(0, MAX_START_PAGE_RECENT_FILES));

  function folderOf(displayPath: string, fileName: string): string {
    return displayPath.endsWith(fileName) ? displayPath.slice(0, -fileName.length) : displayPath;
  }
</script>

<main class="start-page" aria-labelledby="start-page-heading">
  <h1 id="start-page-heading">{translator.translate('startPage.title')}</h1>
  <p class="introduction">{translator.translate('document.emptyState')}</p>
  <div class="columns">
    <section aria-labelledby="start-page-start">
      <h2 id="start-page-start">{translator.translate('startPage.start')}</h2>
      <ul>
        {#each STARTING_ACTIONS as action (action.labelKey)}
          {@const shortcut = shortcutLabelFor(action.command, translator)}
          <li>
            <button class="link-button" onclick={() => onCommand(action.command)}>
              {translator.translate(action.labelKey)}
            </button>
            {#if shortcut}<kbd>{shortcut}</kbd>{/if}
          </li>
        {/each}
      </ul>
    </section>
    <section aria-labelledby="start-page-recent">
      <h2 id="start-page-recent">{translator.translate('recentFiles.title')}</h2>
      {#if shownRecentFiles.length === 0}
        <p class="no-recent-files">{translator.translate('recentFiles.emptyState')}</p>
      {:else}
        <ul>
          {#each shownRecentFiles as recentFile (recentFile.location.canonicalKey)}
            {@const { displayPath, fileName } = recentFile.location}
            <li>
              <button class="link-button" title={displayPath} onclick={() => onOpenRecentFile(recentFile)}>
                {fileName}
              </button>
              <span class="folder">{folderOf(displayPath, fileName)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</main>

<style>
  .start-page {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: var(--space-8) var(--space-6);
    background: var(--color-background);
  }

  h1 {
    margin: 0 0 var(--space-2);
    font-size: 1.75rem;
    font-weight: 400;
  }

  .introduction {
    margin: 0 0 var(--space-6);
    color: var(--color-text-secondary);
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
  }

  section {
    flex: 1 1 16rem;
    min-width: 0;
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-size-body);
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    min-width: 0;
    padding: var(--space-1) 0;
  }

  .link-button {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    cursor: pointer;
  }

  .link-button:hover {
    text-decoration: underline;
  }

  .link-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  kbd,
  .folder,
  .no-recent-files {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  kbd {
    font-family: inherit;
  }

  .folder {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

<script lang="ts">
  import { DEFAULT_WORKSPACE_KIND_ID, type RecentFile, type WorkspaceKindId } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { kindNameOf } from '../control-wheel/kindPresentation';
  import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    recentFiles: readonly RecentFile[];
    /** A kind other than the Markdown viewer shows a placeholder until its own start page is built. */
    activeKindId?: WorkspaceKindId;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onOpenRecentFile: (recentFile: RecentFile) => void;
  }

  const {
    recentFiles,
    activeKindId = DEFAULT_WORKSPACE_KIND_ID,
    translator,
    onCommand,
    onOpenRecentFile,
  }: Props = $props();

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

{#if activeKindId !== DEFAULT_WORKSPACE_KIND_ID}
  {@const kind = kindNameOf(activeKindId, translator)}
  <main class="start-page" aria-labelledby="start-page-heading">
    <h1 id="start-page-heading">{kind}</h1>
    <p class="introduction">{translator.translate('workspaceKinds.notBuiltYet', { kind })}</p>
  </main>
{:else}
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
{/if}

<style>
  .start-page {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 12vh max(var(--space-6), calc((100% - 52rem) / 2)) var(--space-8);
    background: var(--color-background);
  }

  h1 {
    margin: 0 0 var(--space-2);
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .introduction {
    margin: 0 0 var(--space-6);
    color: var(--color-text-secondary);
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  section {
    flex: 1 1 16rem;
    min-width: 0;
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
    background: var(--color-surface);
  }

  h2 {
    margin: 0 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
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

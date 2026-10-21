<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { OutlineEntry } from '@mdx/renderer';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, type ContextMenuRequest } from '../../components/ContextMenuItem';
  import { scrollToHeading } from '../document-view/scrollToHeading';
  import { breadcrumbFolders } from './breadcrumbFolders';

  interface Props {
    displayPath: string;
    fileName: string;
    /** False for a new document, which has no folder yet. */
    hasFolder: boolean;
    outline: readonly OutlineEntry[];
    currentHeadingId?: string | undefined;
    translator: Translator;
    onRevealInExplorer: () => void;
  }

  const {
    displayPath,
    fileName,
    hasFolder,
    outline,
    currentHeadingId,
    translator,
    onRevealInExplorer,
  }: Props = $props();

  let headingsMenu: ContextMenuRequest | undefined = $state();

  const folders = $derived(hasFolder ? breadcrumbFolders(displayPath) : { names: [], isShortened: false });
  const currentHeading = $derived(outline.find((entry) => entry.id === currentHeadingId));
  const headingItems = $derived(
    outline.map((entry) => ({ id: entry.id, label: `${'  '.repeat(entry.level - 1)}${entry.text}` })),
  );

  function openHeadings(event: MouseEvent) {
    headingsMenu = contextMenuPosition(event);
  }
</script>

<nav class="breadcrumbs" aria-label={translator.translate('breadcrumbs.label')}>
  <ol>
    {#if folders.isShortened}
      <li aria-hidden="true">…</li>
    {/if}
    {#each folders.names as folder, index (index)}
      <li>
        <button title={translator.translate('breadcrumbs.revealInExplorer')} onclick={onRevealInExplorer}>
          {folder}
        </button>
      </li>
    {/each}
    <li><span class="file" aria-current="page">{fileName}</span></li>
    {#if outline.length > 0}
      <li>
        <button
          aria-haspopup="menu"
          title={translator.translate('breadcrumbs.headings')}
          onclick={openHeadings}
        >
          {currentHeading?.text ?? translator.translate('breadcrumbs.headings')}
        </button>
      </li>
    {/if}
  </ol>
</nav>
{#if headingsMenu}
  <ContextMenu
    label={translator.translate('breadcrumbs.headings')}
    items={headingItems}
    position={headingsMenu}
    onChoose={(headingId: string) => scrollToHeading(globalThis.document, headingId)}
    onClose={() => (headingsMenu = undefined)}
  />
{/if}

<style>
  .breadcrumbs {
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }

  ol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
  }

  li + li::before {
    content: '›';
    padding: 0 var(--space-1);
  }

  :global([dir='rtl']) li + li::before {
    content: '‹';
  }

  button,
  .file {
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: inherit;
    font: inherit;
  }

  .file {
    color: var(--color-text);
  }

  button:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>

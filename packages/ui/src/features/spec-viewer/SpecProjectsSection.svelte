<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';
  import { activateWithKeyboard, treeKeyboard } from '../folder-tree/treeKeyboard';
  import { specProjectTree, type ScannedSpecRoot, type SpecTreeNode } from './specProjectTree';

  interface Props {
    /** Undefined while the workspace's folders are being scanned. */
    roots: readonly ScannedSpecRoot[] | undefined;
    /** Folders of the workspace that could not be scanned, by their shown path. */
    unreadableFolders?: readonly string[];
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onOpenDocument: (documentPath: string) => void;
    activeDocumentKey?: string | undefined;
  }

  const {
    roots,
    unreadableFolders = [],
    translator,
    isExpanded,
    onToggleExpanded,
    onOpenDocument,
    activeDocumentKey,
  }: Props = $props();

  const HEADING_ID = 'spec-projects-heading';
  const tree = $derived(specProjectTree(roots ?? [], translator));
  const partlyReadRoots = $derived((roots ?? []).filter((scanned) => scanned.isIncomplete));
  const storeNotices = $derived(
    (roots ?? []).flatMap((scanned) =>
      scanned.projects.flatMap((project) =>
        project.planningStore === undefined ? [] : [{ folder: project.name, name: project.planningStore }],
      ),
    ),
  );
  const toggledRows = new SvelteSet<string>();

  function isOpen(node: SpecTreeNode): boolean {
    return node.isInitiallyExpanded !== toggledRows.has(node.id);
  }

  function toggleRow(node: SpecTreeNode) {
    if (toggledRows.has(node.id)) toggledRows.delete(node.id);
    else toggledRows.add(node.id);
  }

  function chooseRow(node: SpecTreeNode) {
    if (node.documentPath !== undefined) onOpenDocument(node.documentPath);
    else if (node.children.length > 0) toggleRow(node);
  }

  function isActive(node: SpecTreeNode): boolean {
    return (
      node.documentPath?.toLowerCase() === activeDocumentKey?.toLowerCase() && activeDocumentKey !== undefined
    );
  }
</script>

{#snippet rows(nodes: readonly SpecTreeNode[], level: number)}
  {#each nodes as node (node.id)}
    {@const hasChildren = node.children.length > 0}
    {@const isNodeOpen = isOpen(node)}
    <li role="none">
      <div
        role="treeitem"
        tabindex="-1"
        class:selected={isActive(node)}
        class:unavailable={node.isUnavailable}
        aria-level={level}
        aria-selected={isActive(node)}
        aria-expanded={hasChildren ? isNodeOpen : undefined}
        aria-label={node.accessibleName}
        onclick={() => chooseRow(node)}
        onkeydown={activateWithKeyboard}
      >
        {#if hasChildren}
          <span
            class="toggle"
            data-tree-toggle
            aria-hidden="true"
            onclick={(event) => {
              event.stopPropagation();
              toggleRow(node);
            }}
          >
            <TreeChevron isExpanded={isNodeOpen} />
          </span>
        {:else}
          <span class="chevron-space" aria-hidden="true"></span>
        {/if}
        <span class="name" aria-hidden="true">{node.label}</span>
        {#if node.detail}<span class="detail" aria-hidden="true">{node.detail}</span>{/if}
      </div>
      {#if hasChildren && isNodeOpen}
        <ul class="nested" role="group">
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
          {@render rows(node.children, level + 1)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<section aria-labelledby={HEADING_ID}>
  <ExplorerSectionHeader
    section="folders"
    headingId={HEADING_ID}
    title={translator.translate('specViewer.sidebar.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  />
  {#if isExpanded}
    {#each partlyReadRoots as scanned (scanned.root.canonicalKey)}
      <p class="notice" role="status">
        {translator.translate('specViewer.sidebar.partlyRead', { folder: scanned.root.displayPath })}
      </p>
    {/each}
    {#each unreadableFolders as folder (folder)}
      <p class="notice">{translator.translate('specViewer.sidebar.unreadable', { folder })}</p>
    {/each}
    {#each storeNotices as notice (notice.folder)}
      <p class="notice">{translator.translate('specViewer.sidebar.planningStore', notice)}</p>
    {/each}
    {#if roots === undefined}
      <p class="empty-state">{translator.translate('specViewer.sidebar.loading')}</p>
    {:else if tree.length === 0}
      <p class="empty-state">{translator.translate('specViewer.sidebar.empty')}</p>
    {:else}
      <ul role="tree" aria-labelledby={HEADING_ID} use:treeKeyboard>
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
        {@render rows(tree, 1)}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .nested {
    margin-inline-start: calc(var(--space-2) + 8px) !important;
    padding-inline-start: var(--space-1) !important;
    border-inline-start: 1px solid var(--color-border);
  }

  .toggle {
    display: inline-flex;
    flex: none;
  }

  .chevron-space {
    flex: none;
    width: 16px;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail {
    flex: none;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .notice {
    margin: 0 var(--space-2) var(--space-1);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>

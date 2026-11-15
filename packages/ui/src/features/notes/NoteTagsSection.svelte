<script lang="ts">
  import { tagTree, type TagNode } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { TagCount } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import { activateWithKeyboard, treeKeyboard } from '../folder-tree/treeKeyboard';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import type { NotesLinkCommand } from './NotesIndexActions';

  interface Props {
    /** Undefined until the index has listed the tags. */
    tags: readonly TagCount[] | undefined;
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onCommand: (command: NotesLinkCommand) => void;
  }

  const { tags, translator, isExpanded, onToggleExpanded, onCommand }: Props = $props();

  const tree = $derived(tagTree(tags ?? [], translator.locale));
  const expandedTags = new SvelteSet<string>();

  function toggle(tag: string) {
    if (expandedTags.has(tag)) expandedTags.delete(tag);
    else expandedTags.add(tag);
  }

  function countLabel(node: TagNode): string {
    return translator.translate('notes.tags.count', { count: node.notes });
  }
</script>

{#snippet tagRows(nodes: readonly TagNode[], level: number)}
  {#each nodes as node (node.tag)}
    {@const hasChildren = node.children.length > 0}
    {@const isOpen = expandedTags.has(node.tag)}
    <li role="none">
      <div
        role="treeitem"
        tabindex="-1"
        aria-level={level}
        aria-selected="false"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-label={node.notes > 0 ? `${node.name}, ${countLabel(node)}` : node.name}
        onclick={() => onCommand({ kind: 'showNotesWithTag', tag: node.tag })}
        onkeydown={activateWithKeyboard}
      >
        {#if hasChildren}
          <span
            class="toggle"
            data-tree-toggle
            aria-hidden="true"
            onclick={(event) => {
              event.stopPropagation();
              toggle(node.tag);
            }}
          >
            <TreeChevron isExpanded={isOpen} />
          </span>
        {:else}
          <span class="chevron-space" aria-hidden="true"></span>
        {/if}
        <span class="name" aria-hidden="true">#{node.name}</span>
        {#if node.notes > 0}<span class="count" aria-hidden="true">{node.notes}</span>{/if}
      </div>
      {#if hasChildren && isOpen}
        <ul class="nested" role="group">
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
          {@render tagRows(node.children, level + 1)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<section aria-labelledby="notes-tags-heading">
  <ExplorerSectionHeader
    section="tags"
    headingId="notes-tags-heading"
    title={translator.translate('notes.tags.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  />
  {#if isExpanded}
    {#if tags === undefined}
      <p class="empty-state">{translator.translate('notes.tree.loading')}</p>
    {:else if tree.length === 0}
      <p class="empty-state">{translator.translate('notes.tags.empty')}</p>
    {:else}
      <ul role="tree" aria-labelledby="notes-tags-heading" use:treeKeyboard>
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
        {@render tagRows(tree, 1)}
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

  .count {
    flex: none;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>

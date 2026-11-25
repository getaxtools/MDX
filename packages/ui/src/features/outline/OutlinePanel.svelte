<script lang="ts">
  import type { SectionAction } from '@mdx/editor';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { OutlineEntry, OutlineRole } from '@mdx/renderer';
  import { logicalArrowKey } from '../../components/textDirection';
  import { hasRoles, markedHeadingId, shownOutlineEntries } from './outlineRoles';

  interface Props {
    /** Undefined while no document is open. */
    outline: readonly OutlineEntry[] | undefined;
    currentHeadingId?: string | undefined;
    translator: Translator;
    onSelectHeading: (entry: OutlineEntry) => void;
    /** Moves, promotes or demotes the section of a heading, from Alt+Shift and an arrow key. */
    onChangeSection?: (entry: OutlineEntry, action: SectionAction) => void;
  }

  const { outline, currentHeadingId, translator, onSelectHeading, onChangeSection }: Props = $props();

  const SECTION_ACTIONS_BY_KEY: Readonly<Record<string, SectionAction>> = {
    ArrowUp: 'moveUp',
    ArrowDown: 'moveDown',
    ArrowLeft: 'promote',
    ArrowRight: 'demote',
  };

  function changeSectionWithKeys(event: KeyboardEvent, entry: OutlineEntry) {
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (!(event.currentTarget instanceof Element)) return;
    const key = logicalArrowKey(event.key, event.currentTarget);
    const action = Object.hasOwn(SECTION_ACTIONS_BY_KEY, key) ? SECTION_ACTIONS_BY_KEY[key] : undefined;
    if (!action || !onChangeSection) return;
    event.preventDefault();
    onChangeSection(entry, action);
  }

  const ROLE_KEYS: Readonly<Record<OutlineRole, MessageKey>> = {
    deltaSection: 'specViewer.outline.role.deltaSection',
    requirement: 'specViewer.outline.role.requirement',
    scenario: 'specViewer.outline.role.scenario',
  };
  const INDENT_PER_LEVEL_REM = 0.75;
  let isRequirementsOnly = $state(false);
  const isSpecOutline = $derived(hasRoles(outline ?? []));
  const shownEntries = $derived(shownOutlineEntries(outline ?? [], isSpecOutline && isRequirementsOnly));
  const markedId = $derived(
    markedHeadingId(outline ?? [], currentHeadingId, isSpecOutline && isRequirementsOnly),
  );
  const shallowestLevel = $derived(Math.min(...shownEntries.map((entry) => entry.level)));
</script>

<nav class="outline" data-focus-region aria-labelledby="outline-heading">
  <h2 id="outline-heading">{translator.translate('outline.title')}</h2>
  {#if isSpecOutline}
    <label class="filter">
      <input type="checkbox" bind:checked={isRequirementsOnly} />
      {translator.translate('specViewer.outline.requirementsOnly')}
    </label>
  {/if}
  {#if outline === undefined}
    <p class="empty-state">{translator.translate('outline.noDocument')}</p>
  {:else if outline.length === 0}
    <p class="empty-state">{translator.translate('outline.emptyState')}</p>
  {:else}
    <ul>
      {#each shownEntries as entry (entry.id)}
        <li style:padding-inline-start="{(entry.level - shallowestLevel) * INDENT_PER_LEVEL_REM}rem">
          <button
            title={entry.text}
            aria-current={entry.id === markedId ? 'location' : undefined}
            aria-keyshortcuts="Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
            onclick={() => onSelectHeading(entry)}
            onkeydown={(event) => changeSectionWithKeys(event, entry)}
          >
            {#if entry.role}<span class="role" aria-hidden="true"
                >{translator.translate(ROLE_KEYS[entry.role])}</span
              >{/if}
            {entry.text}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .filter {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0 var(--space-2) var(--space-2);
    font-size: var(--text-size-small);
  }

  .role {
    margin-inline-end: 0.4em;
    padding: 0 0.3em;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xsmall);
    color: var(--color-text-secondary);
    font-size: 0.8em;
  }

  .outline {
    min-height: 0;
    padding: var(--space-2);
    background: var(--color-surface);
    overflow-y: auto;
  }

  h2 {
    margin: var(--space-1) var(--space-2) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: block;
    width: 100%;
    min-height: 28px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-xsmall);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button[aria-current='location'] {
    background: var(--color-surface-selected);
    color: var(--color-accent);
    font-weight: 500;
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .empty-state {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>

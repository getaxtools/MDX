<script lang="ts">
  import { wordGoalProgress } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import KindIcon from '../control-wheel/KindIcon.svelte';
  import { KIND_ICONS, kindNameOf } from '../control-wheel/kindPresentation';
  import { tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import { contextMenuPosition, type ContextMenuRequest } from '../../components/ContextMenuItem';
  import {
    DETECT_ENCODING_ITEM,
    encodingMenuItems,
    type EncodingMenuItemId,
  } from '../encodings/reopenEncodings';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';
  import type { ControlWheelButton } from './ControlWheelButton';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    isSourceView: boolean;
    isEditing?: boolean;
    hasUnsavedChanges?: boolean;
    translator: Translator;
    controlWheelButton?: ControlWheelButton | undefined;
    /** Cursors in the editor; more than one is shown and announced. */
    cursorCount?: number;
    /** The active document's word goal, if it has one. */
    wordGoal?: number | undefined;
    /** Words added (or, when negative, removed) since the document was first shown in this session. */
    wordsThisSession?: number;
    /** Words in the selection, shown while text is selected. */
    selectedWords?: number;
    onShowWordGoal?: () => void;
    onResetZoom: () => void;
    onReopenWithEncoding?: (encoding: string | undefined) => void;
  }

  const {
    document,
    zoomPercent,
    isSourceView,
    isEditing = false,
    hasUnsavedChanges = false,
    translator,
    controlWheelButton,
    cursorCount = 1,
    wordGoal,
    wordsThisSession = 0,
    selectedWords = 0,
    onShowWordGoal = () => undefined,
    onResetZoom,
    onReopenWithEncoding = () => undefined,
  }: Props = $props();

  let encodingMenuRequest: ContextMenuRequest | undefined = $state();

  function chooseEncoding(itemId: EncodingMenuItemId) {
    onReopenWithEncoding(itemId === DETECT_ENCODING_ITEM ? undefined : itemId);
  }

  const modeKey = $derived.by(() => {
    if (isEditing) return 'statusBar.mode.editing';
    return isSourceView ? 'statusBar.mode.source' : 'statusBar.mode.preview';
  });

  const details = $derived(
    document
      ? [
          translator.translate(modeKey),
          ...(hasUnsavedChanges ? [translator.translate('statusBar.unsaved')] : []),
          ...(selectedWords > 0
            ? [translator.translate('statusBar.selectedWords', { count: selectedWords })]
            : []),
          translator.translate('statusBar.characters', { count: document.statistics.characters }),
          translator.translate('statusBar.readingTime', { minutes: document.statistics.readingMinutes }),
        ]
      : [],
  );
  const progress = $derived(
    document && wordGoal !== undefined ? wordGoalProgress(document.statistics.words, wordGoal) : undefined,
  );
  const sessionTooltip = $derived(
    wordsThisSession < 0
      ? translator.translate('statusBar.wordsRemovedThisSession', { count: -wordsThisSession })
      : translator.translate('statusBar.wordsThisSession', { count: wordsThisSession }),
  );
  const announcement = $derived(
    [
      cursorCount > 1 ? translator.translate('statusBar.cursors', { count: cursorCount }) : '',
      progress?.isReached ? translator.translate('statusBar.wordGoal.reached') : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const encodingName = $derived(document?.encoding.toUpperCase() ?? '');
  const location = $derived(
    document?.isUntitled
      ? translator.translate('statusBar.notSaved', { fileName: document.fileName })
      : document?.displayPath,
  );
</script>

<footer class="status-bar" data-focus-region aria-label={translator.translate('statusBar.label')}>
  <span class="location" title={location}>{location ?? ''}</span>
  <div class="details">
    <span role="status">{announcement}</span>
    {#each details as detail (detail)}
      <span>{detail}</span>
    {/each}
    {#if document}
      <button class="words" title={sessionTooltip} aria-haspopup="dialog" onclick={onShowWordGoal}>
        {#if progress}
          {translator.translate('statusBar.wordGoal', { words: progress.words, goal: progress.goal })}
          <span
            class="goal-progress"
            role="progressbar"
            aria-label={translator.translate('wordGoal.title')}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress.percent}
          >
            <span class="goal-fill" style:width="{progress.percent}%"></span>
          </span>
        {:else}
          {translator.translate('statusBar.words', { count: document.statistics.words })}
        {/if}
      </button>
      <button
        title={translator.translate('statusBar.chooseEncoding', { encoding: encodingName })}
        aria-haspopup="menu"
        disabled={document.isUntitled}
        onclick={(event) => (encodingMenuRequest = contextMenuPosition(event))}
      >
        {translator.translate('statusBar.encoding', { encoding: encodingName })}
      </button>
      <span>
        {translator.translate('statusBar.lineEnding', {
          lineEnding: translator.translate(`statusBar.lineEnding.${document.lineEnding}`),
        })}
      </span>
    {/if}
    <button
      title={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      aria-label={translator.translate('statusBar.resetZoom', { percent: zoomPercent })}
      onclick={onResetZoom}
    >
      {translator.translate('statusBar.zoom', { percent: zoomPercent })}
    </button>
    {#if controlWheelButton}
      {@const kind = kindNameOf(controlWheelButton.activeKindId, translator)}
      <button
        class="control-wheel"
        title={tooltipWithShortcut(translator.translate('controlWheel.show'), controlWheelButton.shortcut)}
        aria-label={translator.translate('statusBar.controlWheel', { kind })}
        aria-haspopup="dialog"
        onclick={controlWheelButton.onShowControlWheel}
      >
        <KindIcon paths={KIND_ICONS[controlWheelButton.activeKindId]} />
        {kind}
      </button>
    {/if}
  </div>
</footer>
{#if encodingMenuRequest}
  <ContextMenu
    label={translator.translate('encoding.menu.label')}
    items={encodingMenuItems(translator)}
    position={encodingMenuRequest}
    onChoose={chooseEncoding}
    onClose={() => (encodingMenuRequest = undefined)}
  />
{/if}

<style>
  .status-bar {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    justify-content: space-between;
    min-height: 1.5rem;
    padding: 0 var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
  }

  .location {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-4);
    align-items: center;
  }

  button {
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: inherit;
    font: inherit;
  }

  .control-wheel {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
  }

  .control-wheel :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .words {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
  }

  .goal-progress {
    display: inline-block;
    width: 3rem;
    height: 0.375rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    overflow: hidden;
  }

  .goal-fill {
    display: block;
    height: 100%;
    background: var(--color-accent);
  }

  @media (forced-colors: active) {
    .goal-fill {
      background: Highlight;
    }
  }

  button:disabled {
    color: inherit;
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>

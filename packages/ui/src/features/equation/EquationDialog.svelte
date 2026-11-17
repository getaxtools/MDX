<script lang="ts">
  import {
    createFormulaField,
    type FormulaEditRequest,
    type FormulaField,
    type FormulaKind,
    type FormulaWriteOutcome,
  } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import { editorPhrases } from '../editing/editorPhrases';
  import { equationDialogPlacement } from './equationPlacement';
  import { EQUATION_TEMPLATE_GROUPS, type EquationTemplate } from './equationTemplates';
  import { FormulaPreviewer, type PreviewFormula, type ShownFormulaPreview } from './FormulaPreviewer';
  import {
    formulaProblemAnnouncement,
    formulaProblemText,
    isRefusalOfTheSource,
    sourceRefusalText,
    type SourceRefusal,
  } from './formulaProblemText';
  import { SUPPORTED_TEX_COMMANDS } from './supportedTexCommands';
  import TemplateGallery from './TemplateGallery.svelte';

  interface Props {
    request: FormulaEditRequest;
    /** The kind a new formula starts with when the request names none. */
    lastKind: FormulaKind;
    translator: Translator;
    previewFormula: PreviewFormula;
    /** The user chose Inline or Display for a new formula. */
    onKindChange: (kind: FormulaKind) => void;
    /** Whether a slash after a term makes a fraction, as the user last set it. */
    isAutomaticFractionOn: boolean;
    onAutomaticFractionChange: (isOn: boolean) => void;
    /** Writes the formula, or says why the source could not be written. */
    onInsert: (formula: { readonly tex: string; readonly kind: FormulaKind }) => FormulaWriteOutcome;
    onCancel: () => void;
  }

  const {
    request,
    lastKind,
    translator,
    previewFormula,
    onKindChange,
    isAutomaticFractionOn,
    onAutomaticFractionChange,
    onInsert,
    onCancel,
  }: Props = $props();

  const TITLE_ID = 'equation-dialog-title';
  const PROBLEM_ID = 'equation-dialog-problem';
  const HINT_ID = 'equation-dialog-hint';
  const GALLERY_ID = 'equation-dialog-templates';

  let kind: FormulaKind = $state(untrack(() => request.kind ?? lastKind));
  let tex = $state(untrack(() => request.source));
  let shown: ShownFormulaPreview = $state({ html: undefined, problem: undefined });
  let placement = $state({ top: 0, left: 0 });
  let dialogElement: HTMLElement | undefined = $state();
  let fieldParent: HTMLElement | undefined = $state();
  let field: FormulaField | undefined;
  let isGalleryShown = $state(false);
  let isFractionOn = $state(untrack(() => isAutomaticFractionOn));

  const previewer = new FormulaPreviewer(
    (source, isDisplay) => previewFormula(source, isDisplay),
    (preview) => (shown = preview),
  );
  /** Why the editor refused the source last time; cleared as soon as the source or kind changes. */
  let refusal: SourceRefusal | undefined = $state();
  const problemText = $derived(
    refusal ? sourceRefusalText(refusal, translator) : formulaProblemText(shown.problem, translator),
  );
  const announcement = $derived(
    refusal ? sourceRefusalText(refusal, translator) : formulaProblemAnnouncement(shown.problem, translator),
  );

  function insert() {
    if (tex.trim() === '') return;
    const outcome = onInsert({ tex, kind });
    refusal = isRefusalOfTheSource(outcome) ? outcome : undefined;
  }

  function chooseTemplate(template: EquationTemplate) {
    field?.insertTemplate(template.source);
  }

  function typesetSuggestion(source: string): Promise<string | undefined> {
    return previewFormula(source, false).then((preview) =>
      preview.kind === 'typeset' ? preview.html : undefined,
    );
  }

  function chooseKind(chosen: FormulaKind) {
    kind = chosen;
    refusal = undefined;
    onKindChange(chosen);
    previewer.request(tex, chosen === 'display');
  }

  function focusables(): HTMLElement[] {
    const selector =
      'button:not(:disabled), input:not(:disabled), [contenteditable="true"], [role="gridcell"][tabindex="0"]';
    return dialogElement ? [...dialogElement.querySelectorAll<HTMLElement>(selector)] : [];
  }

  /** Tab stays inside the dialog, from the last control back to the first and the other way round. */
  function keepTabInside(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const all = focusables();
    const edge = event.shiftKey ? all[0] : all.at(-1);
    if (globalThis.document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? all.at(-1) : all[0])?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Tab') keepTabInside(event);
    if (event.key !== 'Escape' && !(event.key === 'Enter' && event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') onCancel();
    else insert();
  }

  $effect(() => {
    const parent = fieldParent;
    if (!parent) return;
    field = createFormulaField({
      parent,
      text: untrack(() => tex),
      label: translator.translate('equation.source'),
      describedBy: `${PROBLEM_ID} ${HINT_ID}`,
      onChange: (text) => {
        tex = text;
        refusal = undefined;
        previewer.request(text, kind === 'display');
      },
      onInsert: insert,
      isEnterInserting: () => kind === 'inline',
      phrases: editorPhrases(translator),
      suggestions: { commands: SUPPORTED_TEX_COMMANDS, typeset: typesetSuggestion },
      isAutomaticFractionOn: () => isFractionOn,
    });
    field.focus();
    void previewer.renderNow(
      untrack(() => tex),
      untrack(() => kind) === 'display',
    );
    return () => {
      previewer.stop();
      field?.destroy();
    };
  });

  $effect(() => {
    field?.markError(shown.problem?.kind === 'error' ? shown.problem.position : undefined);
  });

  $effect(() => {
    const bounds = dialogElement?.getBoundingClientRect();
    if (!bounds) return;
    placement = equationDialogPlacement(
      request.editedLines,
      { width: bounds.width, height: bounds.height },
      { width: globalThis.innerWidth, height: globalThis.innerHeight },
    );
  });
</script>

<div
  bind:this={dialogElement}
  class="equation-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby={TITLE_ID}
  tabindex="-1"
  style:top="{placement.top}px"
  style:left="{placement.left}px"
  onkeydown={handleKeydown}
>
  <h2 id={TITLE_ID}>{translator.translate('equation.title')}</h2>
  <div class="kinds" role="radiogroup" aria-label={translator.translate('equation.kind')}>
    {#each ['inline', 'display'] as const as choice (choice)}
      <label>
        <input
          type="radio"
          name="equation-kind"
          checked={kind === choice}
          disabled={request.isExisting}
          onchange={() => chooseKind(choice)}
        />
        {translator.translate(choice === 'inline' ? 'equation.inline' : 'equation.display')}
      </label>
    {/each}
  </div>
  <div class="source" bind:this={fieldParent}></div>
  <div class="preview" role="group" aria-label={translator.translate('equation.preview')}>
    {#if shown.html}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- the renderer typeset and sanitized it -->
      {@html shown.html}
    {/if}
  </div>
  <div class="tools">
    <label>
      <input
        type="checkbox"
        bind:checked={isFractionOn}
        onchange={() => onAutomaticFractionChange(isFractionOn)}
      />
      {translator.translate('equation.automaticFractions')}
    </label>
    <button
      aria-expanded={isGalleryShown}
      aria-controls={GALLERY_ID}
      onclick={() => (isGalleryShown = !isGalleryShown)}
    >
      {translator.translate('equation.templates')}
    </button>
  </div>
  {#if isGalleryShown}
    <div id={GALLERY_ID}>
      <TemplateGallery
        groups={EQUATION_TEMPLATE_GROUPS}
        {translator}
        {previewFormula}
        onChoose={chooseTemplate}
      />
    </div>
  {/if}
  <p class="problem" id={PROBLEM_ID}>{problemText}</p>
  <p class="announcement" role="status">{announcement}</p>
  <p class="hint" id={HINT_ID}>
    {translator.translate(kind === 'inline' ? 'equation.keysHintInline' : 'equation.keysHintDisplay')}
  </p>
  <div class="actions">
    <button class="primary" disabled={tex.trim() === ''} onclick={insert}>
      {translator.translate('equation.insert')}
    </button>
    <button onclick={onCancel}>{translator.translate('equation.cancel')}</button>
  </div>
</div>

<style>
  .equation-dialog {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(32rem, calc(100vw - 2 * var(--space-2)));
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-large);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-medium);
    color: var(--color-text);
    font-size: var(--text-size-body);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .kinds,
  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .tools button {
    margin-inline-start: auto;
  }

  .source {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
  }

  .source:focus-within {
    outline: 2px solid var(--color-focus);
  }

  .preview {
    min-height: 2.5rem;
    overflow-x: auto;
  }

  .problem {
    min-height: 1.25rem;
    margin: 0;
    color: var(--color-alert-caution);
  }

  .hint {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .announcement {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  button.primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  button.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  @media (forced-colors: active) {
    .problem {
      color: CanvasText;
    }
  }
</style>

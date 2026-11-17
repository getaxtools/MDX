<script lang="ts">
  import {
    createFormulaField,
    type FormulaEditRequest,
    type FormulaField,
    type FormulaKind,
    type FormulaWriteOutcome,
  } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import { tick, untrack } from 'svelte';
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
  import type { CreateVisualFormulaEditor, VisualFormulaEditor } from './visual/visualFormulaEditor';

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
    /** Loads the visual formula editor, its own chunk, when the Visual tab first opens. */
    loadVisualEditor?: () => Promise<CreateVisualFormulaEditor>;
  }

  function loadVisualFormulaEditor(): Promise<CreateVisualFormulaEditor> {
    return import('./visual/visualFormulaEditor').then((module) => module.createVisualFormulaEditor);
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
    loadVisualEditor = loadVisualFormulaEditor,
  }: Props = $props();

  const TITLE_ID = 'equation-dialog-title';
  const PROBLEM_ID = 'equation-dialog-problem';
  const HINT_ID = 'equation-dialog-hint';
  const GALLERY_ID = 'equation-dialog-templates';
  const SOURCE_TABS = ['tex', 'visual'] as const;
  type SourceTab = (typeof SOURCE_TABS)[number];

  let kind: FormulaKind = $state(untrack(() => request.kind ?? lastKind));
  let tex = $state(untrack(() => request.source));
  let shown: ShownFormulaPreview = $state({ html: undefined, problem: undefined });
  let placement = $state({ top: 0, left: 0 });
  let dialogElement: HTMLElement | undefined = $state();
  let fieldParent: HTMLElement | undefined = $state();
  let field: FormulaField | undefined;
  let isGalleryShown = $state(false);
  let isFractionOn = $state(untrack(() => isAutomaticFractionOn));
  let activeTab: SourceTab = $state('tex');
  let visualParent: HTMLElement | undefined = $state();
  let visual: VisualFormulaEditor | undefined = $state();
  let visualState: 'notLoaded' | 'loading' | 'shown' | 'unavailable' = $state('notLoaded');
  let isDestroyed = false;

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

  /** An edit in the visual editor is written once into the TeX field, which does not report it back. */
  function changeFromVisual(source: string) {
    tex = source;
    refusal = undefined;
    field?.replaceText(source);
    previewer.request(source, kind === 'display');
  }

  async function openVisualEditor(parent: HTMLElement) {
    visualState = 'loading';
    try {
      const create = await loadVisualEditor();
      const opened = await create({
        parent,
        tex,
        label: translator.translate('equation.visual.label'),
        onChange: changeFromVisual,
      });
      if (isDestroyed) {
        opened.destroy();
        return;
      }
      opened.setTex(tex);
      visual = opened;
      visualState = 'shown';
      if (activeTab === 'visual') opened.focus();
    } catch {
      visualState = 'unavailable';
    }
  }

  /** The chosen tab's panel is shown first, as a hidden field cannot take the focus. */
  async function showTab(tab: SourceTab) {
    activeTab = tab;
    await tick();
    if (tab === 'tex') field?.focus();
    else if (visual) visual.focus();
    else if (visualState === 'notLoaded' && visualParent) await openVisualEditor(visualParent);
  }

  /** The arrow keys, Home and End move between the source tabs, as in any tab list. */
  function moveBetweenTabs(event: KeyboardEvent) {
    const index = SOURCE_TABS.indexOf(activeTab);
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: SOURCE_TABS.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const tab = SOURCE_TABS[(target + SOURCE_TABS.length) % SOURCE_TABS.length] ?? 'tex';
    dialogElement?.querySelector<HTMLElement>(`#equation-tab-${tab}`)?.focus();
    void showTab(tab);
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
        visual?.setTex(text);
        previewer.request(text, kind === 'display');
      },
      onInsert: insert,
      isEnterInserting: () => kind === 'inline',
      phrases: editorPhrases(translator),
      suggestions: { commands: SUPPORTED_TEX_COMMANDS, typeset: typesetSuggestion },
      isAutomaticFractionOn: () => isFractionOn,
      isFormulaTypeset: async (source, isDisplay) =>
        (await previewFormula(source, isDisplay)).kind === 'typeset',
    });
    field.focus();
    void previewer.renderNow(
      untrack(() => tex),
      untrack(() => kind) === 'display',
    );
    return () => {
      isDestroyed = true;
      previewer.stop();
      field?.destroy();
      visual?.destroy();
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
  <div class="tabs" role="tablist" aria-label={translator.translate('equation.sourceTabs')}>
    {#each SOURCE_TABS as tab (tab)}
      <button
        id="equation-tab-{tab}"
        role="tab"
        aria-selected={activeTab === tab}
        aria-controls="equation-panel-{tab}"
        tabindex={activeTab === tab ? 0 : -1}
        onclick={() => void showTab(tab)}
        onkeydown={moveBetweenTabs}
      >
        {translator.translate(tab === 'tex' ? 'equation.tab.tex' : 'equation.tab.visual')}
      </button>
    {/each}
  </div>
  <div
    id="equation-panel-tex"
    role="tabpanel"
    aria-labelledby="equation-tab-tex"
    hidden={activeTab !== 'tex'}
  >
    <div class="source" bind:this={fieldParent}></div>
  </div>
  <div
    id="equation-panel-visual"
    role="tabpanel"
    aria-labelledby="equation-tab-visual"
    aria-busy={visualState === 'loading'}
    hidden={activeTab !== 'visual'}
  >
    <div class="visual" bind:this={visualParent}></div>
    {#if visualState === 'unavailable'}
      <p class="problem">{translator.translate('equation.visual.unavailable')}</p>
    {/if}
    <button class="keyboard" disabled={!visual} onclick={() => visual?.showKeyboard()}>
      {translator.translate('equation.visual.keyboard')}
    </button>
  </div>
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

  .tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .tabs button {
    height: 28px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
  }

  .tabs button[aria-selected='true'] {
    border-bottom-color: var(--color-accent);
    font-weight: 600;
  }

  [role='tabpanel'] {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  [role='tabpanel'][hidden] {
    display: none;
  }

  .source,
  .visual {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
  }

  .source:focus-within,
  .visual:focus-within {
    outline: 2px solid var(--color-focus);
  }

  .visual :global(math-field) {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    background: var(--color-surface-raised);
    color: var(--color-text);
    font-size: 1.25rem;
  }

  .visual :global(math-field::part(virtual-keyboard-toggle)),
  .visual :global(math-field::part(menu-toggle)) {
    display: none;
  }

  .keyboard {
    align-self: flex-start;
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

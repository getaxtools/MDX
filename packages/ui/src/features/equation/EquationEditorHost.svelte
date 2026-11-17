<script lang="ts">
  import type { FormulaEditRequest, FormulaKind, FormulaTarget, FormulaWriteOutcome } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import type { PreviewFormula } from './FormulaPreviewer';

  interface Props {
    /** The formula being edited; the equation editor is closed without one. */
    request: FormulaEditRequest | undefined;
    translator: Translator;
    previewFormula: PreviewFormula;
    /** Writes the formula; a refusal of the source keeps the equation editor open to show why. */
    onInsert: (
      target: FormulaTarget,
      formula: { readonly tex: string; readonly kind: FormulaKind },
    ) => FormulaWriteOutcome;
    /** Closing without inserting; focus goes back to the editor. */
    onCancel: () => void;
  }

  const { request, translator, previewFormula, onInsert, onCancel }: Props = $props();

  /** The kind the user chose last, which a new formula from the Math button starts with. */
  let lastKind: FormulaKind = $state('inline');
  /** Automatic fractions stay as the user last set them, off until then. */
  let isAutomaticFractionOn = $state(false);

  function insert(formula: { readonly tex: string; readonly kind: FormulaKind }): FormulaWriteOutcome {
    // Writing closes the equation editor, which clears `request`, so it is read first.
    const edited = request;
    if (!edited) return 'textChanged';
    const outcome = onInsert(edited.target, formula);
    if (outcome === 'written' && !edited.isExisting) lastKind = formula.kind;
    return outcome;
  }
</script>

{#if request}
  {#await import('./EquationDialog.svelte') then { default: EquationDialog }}
    {#key request}
      <EquationDialog
        {request}
        {lastKind}
        {translator}
        {previewFormula}
        onKindChange={(kind: FormulaKind) => (lastKind = kind)}
        {isAutomaticFractionOn}
        onAutomaticFractionChange={(isOn: boolean) => (isAutomaticFractionOn = isOn)}
        onInsert={insert}
        {onCancel}
      />
    {/key}
  {/await}
{/if}

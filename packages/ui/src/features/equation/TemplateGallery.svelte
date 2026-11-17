<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import {
    templatePreviewSource,
    type EquationTemplate,
    type EquationTemplateGroup,
  } from './equationTemplates';
  import type { PreviewFormula } from './FormulaPreviewer';
  import { galleryPositionAfter, type GalleryPosition } from './templateGalleryKeyboard';

  interface Props {
    groups: readonly EquationTemplateGroup[];
    translator: Translator;
    previewFormula: PreviewFormula;
    onChoose: (template: EquationTemplate) => void;
  }

  const { groups, translator, previewFormula, onChoose }: Props = $props();

  let gallery: HTMLElement | undefined = $state();
  let current: GalleryPosition = $state({ row: 0, column: 0 });
  let previews: Readonly<Record<string, string>> = $state({});

  const rowLengths = $derived(groups.map((group) => group.templates.length));

  function isCurrent(row: number, column: number): boolean {
    return current.row === row && current.column === column;
  }

  function cellAt({ row, column }: GalleryPosition): HTMLElement | null | undefined {
    return gallery?.querySelector<HTMLElement>(`[data-template-cell="${String(row)}-${String(column)}"]`);
  }

  function chooseWithKey(event: KeyboardEvent, template: EquationTemplate) {
    if (event.isComposing || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onChoose(template);
  }

  function moveWithArrows(event: KeyboardEvent) {
    if (event.isComposing) return;
    const isRightToLeft = gallery ? globalThis.getComputedStyle(gallery).direction === 'rtl' : false;
    const next = galleryPositionAfter(event.key, current, { rowLengths, isRightToLeft });
    if (!next) return;
    event.preventDefault();
    current = next;
    cellAt(next)?.focus();
  }

  $effect(() => {
    let isShown = true;
    for (const template of groups.flatMap((group) => group.templates)) {
      void previewFormula(templatePreviewSource(template.source), false).then((preview) => {
        if (isShown && preview.kind === 'typeset')
          previews = { ...previews, [template.source]: preview.html };
      });
    }
    return () => {
      isShown = false;
    };
  });
</script>

<div
  class="template-gallery"
  role="grid"
  aria-label={translator.translate('equation.templateGallery')}
  tabindex="-1"
  bind:this={gallery}
  onkeydown={moveWithArrows}
>
  {#each groups as group, row (group.nameKey)}
    <div class="template-row" role="row">
      <div class="group-name" role="rowheader">{translator.translate(group.nameKey)}</div>
      {#each group.templates as template, column (template.nameKey)}
        <div
          class="template"
          role="gridcell"
          tabindex={isCurrent(row, column) ? 0 : -1}
          title={translator.translate(template.nameKey)}
          data-template-cell="{row}-{column}"
          onfocus={() => (current = { row, column })}
          onclick={() => onChoose(template)}
          onkeydown={(event: KeyboardEvent) => chooseWithKey(event, template)}
        >
          <!-- Named by its own text, so the typeset preview, which is only seen, need not match a label. -->
          <span class="template-name">{translator.translate(template.nameKey)}</span>
          <span class="typeset" aria-hidden="true">
            {#if previews[template.source]}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- the renderer typeset and sanitized it -->
              {@html previews[template.source]}
            {:else}
              {template.source}
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .template-gallery {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 14rem;
    overflow-y: auto;
  }

  .template-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  .group-name {
    flex-basis: 100%;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .template {
    position: relative;
    display: inline-grid;
    place-items: center;
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    cursor: pointer;
  }

  .template:hover {
    background: var(--color-surface-hover);
  }

  .template:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .template-name {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .typeset {
    overflow: hidden;
    max-width: 10rem;
    font-size: var(--text-size-small);
    pointer-events: none;
  }
</style>

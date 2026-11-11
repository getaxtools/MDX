<script lang="ts">
  import {
    READING_WIDTHS,
    THEME_PREFERENCES,
    TYPOGRAPHIES,
    type ReadingWidth,
    type ThemePreference,
    type Typography,
    type ViewSettings,
  } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    settings: ViewSettings;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { settings, translator, onCommand }: Props = $props();

  function chooseTheme(event: Event & { currentTarget: HTMLSelectElement }) {
    onCommand({ kind: 'setTheme', theme: event.currentTarget.value as ThemePreference });
  }

  function chooseReadingWidth(event: Event & { currentTarget: HTMLSelectElement }) {
    onCommand({ kind: 'setReadingWidth', readingWidth: event.currentTarget.value as ReadingWidth });
  }

  function chooseTypography(event: Event & { currentTarget: HTMLSelectElement }) {
    onCommand({ kind: 'setTypography', typography: event.currentTarget.value as Typography });
  }
</script>

<div class="view-options" role="group" aria-label={translator.translate('view.options.label')}>
  <button
    aria-label={translator.translate('menu.view.zoomOut')}
    title={translator.translate('menu.view.zoomOut')}
    onclick={() => onCommand({ kind: 'zoomOut' })}>−</button
  >
  <button
    class="zoom-level"
    title={translator.translate('menu.view.resetZoom')}
    onclick={() => onCommand({ kind: 'resetZoom' })}
  >
    {translator.translate('view.zoomLevel', { percent: settings.zoomPercent })}
  </button>
  <button
    aria-label={translator.translate('menu.view.zoomIn')}
    title={translator.translate('menu.view.zoomIn')}
    onclick={() => onCommand({ kind: 'zoomIn' })}>+</button
  >
  <select aria-label={translator.translate('menu.view.theme')} value={settings.theme} onchange={chooseTheme}>
    {#each THEME_PREFERENCES as theme (theme)}
      <option value={theme}>{translator.translate(`menu.view.theme.${theme}`)}</option>
    {/each}
  </select>
  <select
    aria-label={translator.translate('menu.view.readingWidth')}
    value={settings.readingWidth}
    onchange={chooseReadingWidth}
  >
    {#each READING_WIDTHS as readingWidth (readingWidth)}
      <option value={readingWidth}>{translator.translate(`menu.view.readingWidth.${readingWidth}`)}</option>
    {/each}
  </select>
  <select
    aria-label={translator.translate('menu.view.typography')}
    value={settings.typography}
    onchange={chooseTypography}
  >
    {#each TYPOGRAPHIES as typography (typography)}
      <option value={typography}>{translator.translate(`menu.view.typography.${typography}`)}</option>
    {/each}
  </select>
</div>

<style>
  .view-options {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
    justify-content: flex-end;
  }

  button,
  select {
    height: 28px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-size-body);
    transition:
      background-color var(--motion-fast) ease-out,
      color var(--motion-fast) ease-out;
  }

  select {
    max-width: 9rem;
  }

  :is(button, select):hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  option {
    background: var(--color-surface-raised);
    color: var(--color-text);
    font-family: var(--font-ui);
  }

  .zoom-level {
    min-width: 4.5em;
    font-variant-numeric: tabular-nums;
  }

  button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
</style>

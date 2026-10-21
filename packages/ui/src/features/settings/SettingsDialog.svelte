<script lang="ts">
  import type { ViewSettings } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import {
    SETTING_SECTIONS,
    matchesQuery,
    matchingSettings,
    type ChoiceSetting,
    type SettingDefinition,
  } from './settingDefinitions';

  interface Props {
    settings: ViewSettings;
    /** Where the app keeps its data, shown in the Privacy section. */
    dataFolder: string;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { settings, dataFolder, translator, onCommand, onClose }: Props = $props();

  let query = $state('');
  let searchInput: HTMLInputElement | undefined = $state();

  $effect(() => searchInput?.focus());

  const shownSettings = $derived(matchingSettings(query, translator));
  const shownSections = $derived(
    SETTING_SECTIONS.map((section) => ({
      section,
      settings: shownSettings.filter((setting) => setting.section === section),
    })).filter(({ settings: sectionSettings }) => sectionSettings.length > 0),
  );

  const privacyDescription = $derived(
    translator.translate('settings.privacy.description', { path: dataFolder }),
  );
  const isPrivacyShown = $derived(
    matchesQuery(
      query,
      [
        translator.translate('settings.section.privacy'),
        privacyDescription,
        translator.translate('privacy.clearAllData'),
      ].join(' '),
    ),
  );

  function choose(setting: ChoiceSetting, event: Event & { currentTarget: HTMLSelectElement }) {
    const command = setting.commandFor(event.currentTarget.value);
    if (command) onCommand(command);
  }

  function controlId(setting: SettingDefinition): string {
    return `setting-${setting.id}`;
  }
</script>

<Dialog
  title={translator.translate('settings.title')}
  closeLabel={translator.translate('about.close')}
  {onClose}
>
  <input
    bind:this={searchInput}
    bind:value={query}
    class="search"
    type="search"
    aria-label={translator.translate('settings.search.label')}
    placeholder={translator.translate('settings.search.label')}
  />
  {#each shownSections as { section, settings: sectionSettings } (section)}
    <section aria-labelledby="settings-section-{section}">
      <h3 id="settings-section-{section}">{translator.translate(`settings.section.${section}`)}</h3>
      {#each sectionSettings as setting (setting.id)}
        <div class="setting">
          {#if setting.kind === 'choice'}
            <label for={controlId(setting)}>{translator.translate(setting.labelKey).replace('…', '')}</label>
            <select
              id={controlId(setting)}
              aria-describedby="{controlId(setting)}-description"
              value={setting.valueIn(settings)}
              onchange={(event) => choose(setting, event)}
            >
              {#each setting.choices(translator) as choice (choice.value)}
                <option value={choice.value}>{choice.label}</option>
              {/each}
            </select>
          {:else}
            <label class="toggle">
              <input
                id={controlId(setting)}
                type="checkbox"
                aria-describedby="{controlId(setting)}-description"
                checked={setting.isOnIn(settings)}
                onchange={() => onCommand(setting.toggleCommand)}
              />
              {translator.translate(setting.labelKey)}
            </label>
          {/if}
          <p id="{controlId(setting)}-description" class="description">
            {translator.translate(setting.descriptionKey)}
          </p>
        </div>
      {/each}
    </section>
  {/each}
  {#if isPrivacyShown}
    <section aria-labelledby="settings-section-privacy">
      <h3 id="settings-section-privacy">{translator.translate('settings.section.privacy')}</h3>
      <div class="setting">
        <p id="settings-privacy-description" class="description">{privacyDescription}</p>
        <button
          aria-describedby="settings-privacy-description"
          onclick={() => onCommand({ kind: 'confirmClearAllData' })}
        >
          {translator.translate('privacy.clearAllData')}
        </button>
      </div>
    </section>
  {:else if shownSections.length === 0}
    <p class="no-matches" role="status">{translator.translate('settings.noMatches', { query })}</p>
  {/if}
</Dialog>

<style>
  .search {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .setting {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 var(--space-4);
    align-items: center;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .toggle {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    grid-column: 1 / -1;
  }

  .description {
    grid-column: 1 / -1;
    margin: var(--space-1) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .setting > button {
    justify-self: start;
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  select {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  .no-matches {
    color: var(--color-text-secondary);
  }

  :is(.search, select, input[type='checkbox'], .setting > button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>

<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { AppInfo } from './AppInfo';
  import { INSTALLED_FEATURE_GROUPS } from './featureRegistry';
  import type { ThirdPartyLicensesLoader } from './ThirdPartyLicenses';
  import ThirdPartyLicensesList from './ThirdPartyLicensesList.svelte';

  interface Props {
    appInfo: AppInfo;
    translator: Translator;
    onClose: () => void;
    loadThirdPartyLicenses?: ThirdPartyLicensesLoader | undefined;
  }

  const {
    appInfo,
    translator,
    onClose,
    loadThirdPartyLicenses = () => Promise.resolve(undefined),
  }: Props = $props();

  let isShowingLicenses = $state(false);

  const COPYRIGHT_YEAR = 2026;
  const PROJECT_ADDRESS = 'github.com/getaxtools/MDX';
</script>

<Dialog
  title={translator.translate('about.title')}
  closeLabel={translator.translate('about.close')}
  {onClose}
>
  <p>
    <strong>{translator.translate('app.name')}</strong><br />
    {translator.translate('about.version', { version: appInfo.version })}
  </p>
  <h3>{translator.translate('about.features')}</h3>
  {#each INSTALLED_FEATURE_GROUPS as group (group.id)}
    <h4 id="about-features-{group.id}">{translator.translate(group.labelKey)}</h4>
    <ul class="features" aria-labelledby="about-features-{group.id}">
      {#each group.features as feature (feature.id)}
        <li>{translator.translate(feature.labelKey, feature.labelValues)}</li>
      {/each}
    </ul>
  {/each}
  <p>{translator.translate('about.privacy')}</p>
  <p>{translator.translate('about.dataLocation', { path: appInfo.dataFolder })}</p>
  <p>{translator.translate('about.projectAddress', { address: PROJECT_ADDRESS })}</p>
  <p class="legal">
    {translator.translate('about.copyright', { year: String(COPYRIGHT_YEAR) })}<br />
    {translator.translate('about.license')}
  </p>
  <button
    class="licenses-toggle"
    aria-expanded={isShowingLicenses}
    onclick={() => (isShowingLicenses = !isShowingLicenses)}
  >
    {translator.translate('about.thirdPartyLicenses')}
  </button>
  {#if isShowingLicenses}
    <ThirdPartyLicensesList {translator} loadLicenses={loadThirdPartyLicenses} />
  {/if}
</Dialog>

<style>
  h3 {
    margin-bottom: var(--space-1);
    font-size: var(--text-size-body);
  }

  h4 {
    margin-block: var(--space-3) var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  .features {
    margin-top: 0;
    padding-inline-start: var(--space-6);
  }

  .licenses-toggle {
    margin-block-end: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  .licenses-toggle:hover {
    background: var(--color-surface-hover);
  }

  .licenses-toggle:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .legal {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>

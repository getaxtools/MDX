<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { AppInfo } from './AppInfo';
  import { INSTALLED_FEATURES } from './featureRegistry';
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
  <ul class="features">
    {#each INSTALLED_FEATURES as feature (feature.id)}
      <li>{translator.translate(feature.labelKey)}</li>
    {/each}
  </ul>
  <p>{translator.translate('about.privacy')}</p>
  <p>{translator.translate('about.dataLocation', { path: appInfo.dataFolder })}</p>
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

  .features {
    margin-top: 0;
    padding-inline-start: var(--space-6);
  }

  .licenses-toggle {
    margin-block-end: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  .licenses-toggle:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .legal {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>

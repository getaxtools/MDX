<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import {
    filterPackages,
    type ThirdPartyLicenses,
    type ThirdPartyLicensesLoader,
  } from './ThirdPartyLicenses';

  interface Props {
    translator: Translator;
    loadLicenses: ThirdPartyLicensesLoader;
  }

  const { translator, loadLicenses }: Props = $props();

  let licenses: ThirdPartyLicenses | undefined = $state();
  let isLoaded = $state(false);
  let filter = $state('');

  const shownPackages = $derived(licenses ? filterPackages(licenses.packages, filter) : []);

  $effect(() => {
    void loadLicenses().then((loaded) => {
      licenses = loaded;
      isLoaded = true;
    });
  });
</script>

{#if !isLoaded}
  <p>{translator.translate('about.licenses.loading')}</p>
{:else if !licenses}
  <p>{translator.translate('about.licenses.missing')}</p>
{:else}
  <p>{translator.translate('about.licenses.summary', { count: licenses.packages.length })}</p>
  <input
    type="search"
    aria-label={translator.translate('about.licenses.filter')}
    placeholder={translator.translate('about.licenses.filter')}
    bind:value={filter}
  />
  <ul class="packages">
    {#each shownPackages as thirdPartyPackage (`${thirdPartyPackage.ecosystem}:${thirdPartyPackage.name}@${thirdPartyPackage.version}`)}
      {@const text =
        thirdPartyPackage.textIndex === null ? undefined : licenses.texts[thirdPartyPackage.textIndex]}
      <li>
        <details>
          <summary>
            <span class="name">{thirdPartyPackage.name}</span>
            <span class="version">{thirdPartyPackage.version}</span>
            <span class="license">{thirdPartyPackage.license}</span>
          </summary>
          {#if text}
            <pre>{text}</pre>
          {:else}
            <p>{translator.translate('about.licenses.noText', { license: thirdPartyPackage.license })}</p>
          {/if}
        </details>
      </li>
    {/each}
  </ul>
{/if}

<style>
  input {
    width: 100%;
    box-sizing: border-box;
    margin-block-end: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .packages {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  summary {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    cursor: default;
  }

  .name {
    font-weight: 600;
  }

  .version,
  .license {
    color: var(--color-text-secondary);
  }

  .license {
    margin-inline-start: auto;
  }

  pre {
    max-height: 16rem;
    overflow: auto;
    padding: var(--space-2);
    border-radius: var(--radius-small);
    background: var(--color-code-background);
    font-size: var(--text-size-small);
    white-space: pre-wrap;
  }
</style>

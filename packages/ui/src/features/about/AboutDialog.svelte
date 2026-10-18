<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { AppInfo } from './AppInfo';

  interface Props {
    appInfo: AppInfo;
    translator: Translator;
    onClose: () => void;
  }

  const { appInfo, translator, onClose }: Props = $props();

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
  <p>{translator.translate('about.privacy')}</p>
  <p>{translator.translate('about.dataLocation', { path: appInfo.dataFolder })}</p>
  <p class="legal">
    {translator.translate('about.copyright', { year: String(COPYRIGHT_YEAR) })}<br />
    {translator.translate('about.license')}
  </p>
</Dialog>

<style>
  .legal {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>

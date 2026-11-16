<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { NotesMoveDialog } from './NotesMoveActions';
  import { notesMoveDialogText } from './notesMoveText';

  interface Props {
    dialog: NotesMoveDialog;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { dialog, translator, onCommand }: Props = $props();

  const text = $derived(notesMoveDialogText(dialog, translator));
</script>

{#key dialog.kind}
  <ConfirmDialog
    title={text.title}
    message={text.message}
    confirmLabel={text.confirm.label}
    cancelLabel={text.cancel.label}
    onConfirm={() => onCommand(text.confirm.command)}
    onCancel={() => onCommand(text.cancel.command)}
    alternative={text.alternative
      ? {
          label: text.alternative.label,
          onChoose: () => onCommand(text.alternative?.command ?? text.cancel.command),
        }
      : undefined}
  />
{/key}

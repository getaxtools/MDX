import type { WorkspaceKindId } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

export const KIND_NAME_KEYS: Readonly<Record<WorkspaceKindId, MessageKey>> = {
  markdownViewer: 'workspaceKinds.kind.markdownViewer',
  notes: 'workspaceKinds.kind.notes',
  specViewer: 'workspaceKinds.kind.specViewer',
};

export function kindNameOf(kindId: WorkspaceKindId, translator: Translator): string {
  return translator.translate(KIND_NAME_KEYS[kindId]);
}

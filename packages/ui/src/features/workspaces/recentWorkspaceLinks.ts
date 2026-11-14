import type { WorkspaceKindId } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import { kindNameOf } from '../control-wheel/kindPresentation';
import type { WorkspacesView } from '../viewer/ViewerController';
import type { WorkspaceKindsState } from '@mdx/core';
import { workspaceNameOf } from './workspaceCommands';

export interface RecentWorkspaceLink {
  readonly id: string;
  readonly name: string;
  readonly kindName: string;
}

/** The other workspaces of enabled kinds, most recently used first; disabled and unknown kinds are left out. */
export function recentWorkspaceLinks(
  { registry, shownWorkspaceId }: WorkspacesView,
  kinds: WorkspaceKindsState,
  translator: Translator,
): RecentWorkspaceLink[] {
  return registry
    .recentlyShown(kinds)
    .filter((workspace) => workspace.id !== shownWorkspaceId)
    .map((workspace) => ({
      id: workspace.id,
      name: workspaceNameOf(workspace, translator),
      kindName: kindNameOf(workspace.kindId as WorkspaceKindId, translator),
    }));
}

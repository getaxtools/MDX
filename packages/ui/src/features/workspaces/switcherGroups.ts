import {
  fuzzyMatch,
  type WorkspaceKindId,
  type WorkspaceKindsState,
  type WorkspaceRegistry,
} from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { StoredWorkspace } from '@mdx/platform';
import { kindNameOf } from '../control-wheel/kindPresentation';
import { workspaceNameOf } from './workspaceCommands';

export interface SwitcherEntry {
  readonly workspace: StoredWorkspace;
  readonly name: string;
  /** Positions in the name that matched the filter, for highlighting. */
  readonly matchedIndexes: readonly number[];
  readonly isShown: boolean;
}

export interface SwitcherGroup {
  readonly kindId: WorkspaceKindId;
  readonly kindName: string;
  readonly entries: readonly SwitcherEntry[];
}

export interface SwitcherSource {
  readonly registry: WorkspaceRegistry;
  readonly shownWorkspaceId: string;
  readonly kinds: WorkspaceKindsState;
}

/** Workspaces of enabled kinds, grouped in kind order, most recently used first, kept when the name matches. */
export function switcherGroups(
  { registry, shownWorkspaceId, kinds }: SwitcherSource,
  filter: string,
  translator: Translator,
): SwitcherGroup[] {
  const query = filter.trim();
  const recent = registry.recentlyShown(kinds);
  return kinds.enabledKindIds().flatMap((kindId) => {
    const entries = recent
      .filter((workspace) => workspace.kindId === kindId)
      .flatMap((workspace) => {
        const name = workspaceNameOf(workspace, translator);
        const match = query === '' ? { matchedIndexes: [] } : fuzzyMatch(query, name);
        if (!match) return [];
        return [
          {
            workspace,
            name,
            matchedIndexes: match.matchedIndexes,
            isShown: workspace.id === shownWorkspaceId,
          },
        ];
      });
    return entries.length === 0 ? [] : [{ kindId, kindName: kindNameOf(kindId, translator), entries }];
  });
}

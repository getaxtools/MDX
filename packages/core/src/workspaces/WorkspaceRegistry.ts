import type { StoredWorkspace } from '@mdx/platform';
import { DEFAULT_WORKSPACE_KIND_ID, isBuiltKind } from '../workspace-kinds/workspaceKinds';
import type { WorkspaceKindsState } from '../workspace-kinds/WorkspaceKindsState';

export const MAX_WORKSPACE_NAME_LENGTH = 100;

/** The fixed sets a workspace's icon and colour come from; the name is always shown with the colour. */
export const WORKSPACE_ICONS = ['book', 'notebook', 'folder', 'briefcase', 'flask', 'star'] as const;
export const WORKSPACE_COLOURS = ['blue', 'teal', 'green', 'amber', 'red', 'purple', 'grey'] as const;

export type WorkspaceIcon = (typeof WORKSPACE_ICONS)[number];
export type WorkspaceColour = (typeof WORKSPACE_COLOURS)[number];

export type WorkspaceNameProblem = 'empty' | 'tooLong' | 'duplicate';

/** Shown in the switcher and start page; unknown kinds only in Manage Workspaces, where they cannot be opened. */
export type WorkspaceVisibility = 'shown' | 'hiddenWithKind' | 'unavailable';

export interface NewWorkspace {
  readonly id: string;
  readonly name: string;
  readonly kindId: string;
  readonly icon?: WorkspaceIcon | undefined;
  readonly colour?: WorkspaceColour | undefined;
  /** The workspace file it is created from, so opening that file again switches to it. */
  readonly sourceFile?: string | undefined;
  /** What its kind keeps for it, such as a Notes workspace's location. */
  readonly kindData?: unknown;
  readonly nowMs: number;
}

export type WorkspaceChange =
  | { readonly outcome: 'changed'; readonly registry: WorkspaceRegistry; readonly workspace: StoredWorkspace }
  | {
      readonly outcome: 'refused';
      readonly problem: WorkspaceNameProblem | 'kindNotChoosable' | 'unknownWorkspace';
    };

export type WorkspaceRemoval =
  | { readonly outcome: 'removed'; readonly registry: WorkspaceRegistry }
  | { readonly outcome: 'refused'; readonly problem: 'lastMarkdownViewer' | 'unknownWorkspace' };

/** Every workspace in its order, including those of disabled or unknown kinds, which are kept unchanged. */
export class WorkspaceRegistry {
  private constructor(private readonly ordered: readonly StoredWorkspace[]) {}

  static fromStored(workspaces: readonly StoredWorkspace[]): WorkspaceRegistry {
    return new WorkspaceRegistry([...workspaces].sort((first, second) => first.position - second.position));
  }

  workspaces(): readonly StoredWorkspace[] {
    return this.ordered;
  }

  find(workspaceId: string): StoredWorkspace | undefined {
    return this.ordered.find((workspace) => workspace.id === workspaceId);
  }

  visibilityOf(workspace: StoredWorkspace, kinds: WorkspaceKindsState): WorkspaceVisibility {
    if (!isBuiltKind(kinds.kinds(), workspace.kindId)) return 'unavailable';
    return kinds.isEnabled(workspace.kindId) ? 'shown' : 'hiddenWithKind';
  }

  /** The workspaces of enabled kinds, most recently shown first, for the switcher and start page. */
  recentlyShown(kinds: WorkspaceKindsState): readonly StoredWorkspace[] {
    return this.ordered
      .filter((workspace) => this.visibilityOf(workspace, kinds) === 'shown')
      .toSorted((first, second) => (second.lastShownAtMs ?? 0) - (first.lastShownAtMs ?? 0));
  }

  /** The workspace of a kind shown last, or the first one of that kind when none was shown yet. */
  lastShownOfKind(kindId: string): StoredWorkspace | undefined {
    const ofKind = this.ordered.filter((workspace) => workspace.kindId === kindId);
    return ofKind.reduce<StoredWorkspace | undefined>(
      (latest, workspace) =>
        latest === undefined || (workspace.lastShownAtMs ?? 0) > (latest.lastShownAtMs ?? 0)
          ? workspace
          : latest,
      undefined,
    );
  }

  /** The workspace created from this workspace file, compared as Windows compares paths. */
  findBySourceFile(path: string): StoredWorkspace | undefined {
    const key = path.toLowerCase();
    return this.ordered.find((workspace) => workspace.sourceFile?.toLowerCase() === key);
  }

  /** The name, or the name with the first free number after it, such as "Handbook 2". */
  freeNameFor(name: string, kindId: string): string {
    const trimmed = name.trim().slice(0, MAX_WORKSPACE_NAME_LENGTH);
    if (this.checkName(trimmed, kindId) !== 'duplicate') return trimmed;
    for (let number = 2; ; number += 1) {
      const suffix = ` ${String(number)}`;
      const numbered = `${trimmed.slice(0, MAX_WORKSPACE_NAME_LENGTH - suffix.length)}${suffix}`;
      if (this.checkName(numbered, kindId) === undefined) return numbered;
    }
  }

  /** Names are 1 to 100 characters after trimming and differ, ignoring case, within a kind. */
  checkName(name: string, kindId: string, exceptWorkspaceId?: string): WorkspaceNameProblem | undefined {
    const trimmed = name.trim();
    if (trimmed.length === 0) return 'empty';
    if (trimmed.length > MAX_WORKSPACE_NAME_LENGTH) return 'tooLong';
    const isTaken = this.ordered.some(
      (workspace) =>
        workspace.kindId === kindId &&
        workspace.id !== exceptWorkspaceId &&
        workspace.name?.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    return isTaken ? 'duplicate' : undefined;
  }

  /** Only enabled kinds that are built can be chosen for a new workspace. */
  create(newWorkspace: NewWorkspace, kinds: WorkspaceKindsState): WorkspaceChange {
    if (!kinds.isEnabled(newWorkspace.kindId) || !isBuiltKind(kinds.kinds(), newWorkspace.kindId))
      return { outcome: 'refused', problem: 'kindNotChoosable' };
    const problem = this.checkName(newWorkspace.name, newWorkspace.kindId);
    if (problem) return { outcome: 'refused', problem };
    const workspace: StoredWorkspace = {
      id: newWorkspace.id,
      kindId: newWorkspace.kindId,
      name: newWorkspace.name.trim(),
      icon: newWorkspace.icon ?? null,
      colour: newWorkspace.colour ?? null,
      position: this.nextPosition(),
      lastShownAtMs: newWorkspace.nowMs,
      ...(newWorkspace.sourceFile === undefined ? {} : { sourceFile: newWorkspace.sourceFile }),
      ...(newWorkspace.kindData === undefined ? {} : { kindData: newWorkspace.kindData }),
    };
    return { outcome: 'changed', registry: new WorkspaceRegistry([...this.ordered, workspace]), workspace };
  }

  rename(workspaceId: string, name: string): WorkspaceChange {
    const existing = this.find(workspaceId);
    if (!existing) return { outcome: 'refused', problem: 'unknownWorkspace' };
    const problem = this.checkName(name, existing.kindId, workspaceId);
    if (problem) return { outcome: 'refused', problem };
    return this.replaced({ ...existing, name: name.trim() });
  }

  /** Replaces what a workspace's kind keeps for it, such as a Notes workspace's new location. */
  setKindData(workspaceId: string, kindData: unknown): WorkspaceChange | undefined {
    const existing = this.find(workspaceId);
    return existing ? this.replaced({ ...existing, kindData }) : undefined;
  }

  markShown(workspaceId: string, nowMs: number): WorkspaceChange | undefined {
    const existing = this.find(workspaceId);
    return existing ? this.replaced({ ...existing, lastShownAtMs: nowMs }) : undefined;
  }

  canRemove(workspaceId: string): boolean {
    const workspace = this.find(workspaceId);
    if (workspace?.kindId !== DEFAULT_WORKSPACE_KIND_ID) return workspace !== undefined;
    return this.ordered.filter((other) => other.kindId === DEFAULT_WORKSPACE_KIND_ID).length > 1;
  }

  /** Forgets the workspace's lists and sessions; files and folders on disk are never touched. */
  remove(workspaceId: string): WorkspaceRemoval {
    if (!this.find(workspaceId)) return { outcome: 'refused', problem: 'unknownWorkspace' };
    if (!this.canRemove(workspaceId)) return { outcome: 'refused', problem: 'lastMarkdownViewer' };
    return {
      outcome: 'removed',
      registry: new WorkspaceRegistry(this.ordered.filter((workspace) => workspace.id !== workspaceId)),
    };
  }

  private replaced(workspace: StoredWorkspace): WorkspaceChange {
    const ordered = this.ordered.map((existing) => (existing.id === workspace.id ? workspace : existing));
    return { outcome: 'changed', registry: new WorkspaceRegistry(ordered), workspace };
  }

  private nextPosition(): number {
    return Math.max(-1, ...this.ordered.map((workspace) => workspace.position)) + 1;
  }
}

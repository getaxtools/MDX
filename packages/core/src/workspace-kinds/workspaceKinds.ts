export type WorkspaceKindId = 'markdownViewer' | 'notes' | 'specViewer';

/** A built kind can be turned on and chosen; a planned kind is only listed as coming later. */
export type WorkspaceKindAvailability = 'built' | 'planned';

export interface WorkspaceKind {
  readonly id: WorkspaceKindId;
  readonly availability: WorkspaceKindAvailability;
}

/** Every kind in its fixed order; later kinds are added at the end. */
export const WORKSPACE_KINDS: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'planned' },
  { id: 'specViewer', availability: 'planned' },
];

export const DEFAULT_WORKSPACE_KIND_ID: WorkspaceKindId = 'markdownViewer';

export function isBuiltKind(kinds: readonly WorkspaceKind[], kindId: string): boolean {
  return kinds.some((kind) => kind.id === kindId && kind.availability === 'built');
}

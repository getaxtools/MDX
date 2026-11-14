export type WorkspaceKindId = 'markdownViewer' | 'notes' | 'specViewer';

/** A built kind can be turned on and chosen; a planned kind is only listed as coming later. */
export type WorkspaceKindAvailability = 'built' | 'planned';

export interface WorkspaceKind {
  readonly id: WorkspaceKindId;
  readonly availability: WorkspaceKindAvailability;
  /** Where dropped and pasted pictures go, below the document's folder; `assets` when not given. */
  readonly attachmentFolder?: string;
}

export const DEFAULT_ATTACHMENT_FOLDER = 'assets';

export function attachmentFolderFor(kinds: readonly WorkspaceKind[], kindId: string): string {
  return kinds.find((kind) => kind.id === kindId)?.attachmentFolder ?? DEFAULT_ATTACHMENT_FOLDER;
}

/** Every kind in its fixed order; later kinds are added at the end. */
export const WORKSPACE_KINDS: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'planned' },
  { id: 'specViewer', availability: 'planned' },
];

/** The UI test build may choose planned kinds, so their switching can be tested before they are built. */
export function workspaceKindsFor({
  allowsPlannedKindPreview,
}: {
  allowsPlannedKindPreview: boolean;
}): readonly WorkspaceKind[] {
  if (!allowsPlannedKindPreview) return WORKSPACE_KINDS;
  return WORKSPACE_KINDS.map((kind) => ({ ...kind, availability: 'built' }));
}

export const DEFAULT_WORKSPACE_KIND_ID: WorkspaceKindId = 'markdownViewer';

export function isBuiltKind(kinds: readonly WorkspaceKind[], kindId: string): boolean {
  return kinds.some((kind) => kind.id === kindId && kind.availability === 'built');
}

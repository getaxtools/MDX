import type { StoredWorkspace } from '@mdx/platform';
import { isRecord } from '../session/savedValues';

/** At most this many removals are kept; the oldest go first. */
const MAX_REMOVALS = 50;

/**
 * Workspaces whose Jump List entry the user removed, with when the app learned of it. Windows asks a
 * program not to add a removed entry again, so a workspace stays out until it is shown again.
 */
export type JumpListRemovals = Readonly<Record<string, number>>;

export const NO_JUMP_LIST_REMOVALS: JumpListRemovals = {};

export function parseJumpListRemovals(saved: unknown): JumpListRemovals {
  if (!isRecord(saved)) return NO_JUMP_LIST_REMOVALS;
  const valid = Object.entries(saved).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(newestFirst(valid).slice(0, MAX_REMOVALS));
}

/** The removals with these workspaces added as removed now. */
export function withJumpListRemovals(
  removals: JumpListRemovals,
  workspaceIds: readonly string[],
  nowMs: number,
): JumpListRemovals {
  if (workspaceIds.length === 0) return removals;
  const added = workspaceIds.map((id): [string, number] => [id, nowMs]);
  return Object.fromEntries(newestFirst([...Object.entries(removals), ...added]).slice(0, MAX_REMOVALS));
}

/** A removed workspace comes back to the Jump List once it is shown after its removal. */
export function isRemovedFromJumpList(workspace: StoredWorkspace, removals: JumpListRemovals): boolean {
  const removedAtMs = removals[workspace.id];
  return removedAtMs !== undefined && (workspace.lastShownAtMs ?? 0) <= removedAtMs;
}

function newestFirst(entries: readonly (readonly [string, number])[]): [string, number][] {
  const latest = new Map<string, number>();
  for (const [id, atMs] of entries) latest.set(id, Math.max(atMs, latest.get(id) ?? atMs));
  return [...latest].toSorted((first, second) => second[1] - first[1]);
}

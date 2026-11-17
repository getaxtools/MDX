/** A recent workspace as the taskbar Jump List shows it: only its id and its name. */
export interface JumpListWorkspace {
  readonly id: string;
  readonly name: string;
}

/**
 * `refusedByPrivacySetting`: a privacy setting blocks custom lists, so the list keeps its tasks only.
 * `unavailable`: the system has no Jump List.
 */
export type JumpListOutcome = 'written' | 'refusedByPrivacySetting' | 'unavailable';

/** What an update did, and the workspaces whose entries the user removed from the Jump List. */
export interface JumpListUpdate {
  readonly outcome: JumpListOutcome;
  readonly removedWorkspaceIds: readonly string[];
}

/** The Windows taskbar Jump List of the app. */
export interface JumpListPort {
  /** Replaces the category of recent workspaces; each entry starts the app showing its workspace. */
  showRecentWorkspaces(category: string, workspaces: readonly JumpListWorkspace[]): Promise<JumpListUpdate>;
}

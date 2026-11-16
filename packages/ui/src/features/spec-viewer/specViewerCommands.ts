/** Opens the dashboard of a spec project in a tab. */
export interface OpenSpecDashboardCommand {
  readonly kind: 'openSpecDashboard';
  /** The canonical key of the scanned workspace folder. */
  readonly rootKey: string;
  /** The project folder relative to that root; empty for the root itself. */
  readonly folder: string;
}

/** Commands of the Spec viewer kind, sent by its sidebar and pages. */
export type SpecViewerCommand = OpenSpecDashboardCommand;

const SPEC_VIEWER_COMMAND_KINDS: ReadonlySet<string> = new Set(['openSpecDashboard']);

export function isSpecViewerCommand(command: { readonly kind: string }): command is SpecViewerCommand {
  return SPEC_VIEWER_COMMAND_KINDS.has(command.kind);
}

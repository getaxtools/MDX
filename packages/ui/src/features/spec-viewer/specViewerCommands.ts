/** Opens the dashboard of a spec project in a tab. */
export interface OpenSpecDashboardCommand {
  readonly kind: 'openSpecDashboard';
  /** The canonical key of the scanned workspace folder. */
  readonly rootKey: string;
  /** The project folder relative to that root; empty for the root itself. */
  readonly folder: string;
}

/** Opens the page of an active change in a tab. */
export interface OpenSpecChangeCommand {
  readonly kind: 'openSpecChange';
  readonly rootKey: string;
  /** The change folder relative to the root. */
  readonly changeFolder: string;
}

/** Opens the document of a structural finding at the heading that holds its line. */
export interface OpenSpecFindingCommand {
  readonly kind: 'openSpecFinding';
  readonly documentPath: string;
  /** Counted from 1. */
  readonly line?: number | undefined;
}

/** Commands of the Spec viewer kind, sent by its sidebar and pages. */
export type SpecViewerCommand = OpenSpecDashboardCommand | OpenSpecChangeCommand | OpenSpecFindingCommand;

const SPEC_VIEWER_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'openSpecDashboard',
  'openSpecChange',
  'openSpecFinding',
]);

export function isSpecViewerCommand(command: { readonly kind: string }): command is SpecViewerCommand {
  return SPEC_VIEWER_COMMAND_KINDS.has(command.kind);
}

/** Commands that would change a document, which a Spec viewer workspace refuses. */
const EDITING_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'toggleEditing',
  'togglePreviewBesideEditor',
  'newDocument',
  'runEditorCommand',
  'insertSnippet',
  'changeOutlineSection',
]);

export function isRefusedInReadOnlyWorkspace(command: { readonly kind: string }): boolean {
  return EDITING_COMMAND_KINDS.has(command.kind);
}

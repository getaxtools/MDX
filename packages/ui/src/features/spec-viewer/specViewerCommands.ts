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

/** Opens the page of a feature of a feature-numbered project in a tab. */
export interface OpenSpecFeatureCommand {
  readonly kind: 'openSpecFeature';
  readonly rootKey: string;
  /** The feature folder relative to the root. */
  readonly featureFolder: string;
}

/** Opens the document of a structural finding at the heading that holds its line. */
export interface OpenSpecFindingCommand {
  readonly kind: 'openSpecFinding';
  readonly documentPath: string;
  /** Counted from 1. */
  readonly line?: number | undefined;
}

/** Opens "Spec after this change" for one capability a change touches. */
export interface OpenSpecPreviewCommand {
  readonly kind: 'openSpecPreview';
  readonly rootKey: string;
  readonly changeFolder: string;
  readonly capability: string;
}

/** Commands of the Spec viewer kind, sent by its sidebar and pages. */
export type SpecViewerCommand =
  | OpenSpecDashboardCommand
  | OpenSpecChangeCommand
  | OpenSpecFeatureCommand
  | OpenSpecFindingCommand
  | OpenSpecPreviewCommand;

const SPEC_VIEWER_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'openSpecDashboard',
  'openSpecChange',
  'openSpecFeature',
  'openSpecFinding',
  'openSpecPreview',
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

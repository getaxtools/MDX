import type { WorkspaceKindId } from '@mdx/core';

/** The optional status bar button that shows the active kind and opens the control wheel. */
export interface ControlWheelButton {
  readonly activeKindId: WorkspaceKindId;
  /** The keys that open the wheel now, if it has any. */
  readonly shortcut?: string;
  readonly onShowControlWheel: () => void;
}

export interface AppInfo {
  readonly version: string;
  readonly dataFolder: string;
  /** True only in the UI test build, which lets planned workspace kinds be chosen. */
  readonly allowsPlannedKindPreview?: boolean;
}

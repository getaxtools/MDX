import { AppStateRefusedError, type AppStatePort } from '@mdx/platform';
import { APP_STATE_SCHEMA_VERSION, type PersistedAppState } from './persistedAppState';
import { VIEW_SETTING_FIELDS } from '../view/ViewSettings';
import { isRecord, unknownFieldsOf } from './savedValues';

const KNOWN_SAVED_FIELDS: ReadonlySet<string> = new Set(
  Object.keys({
    schemaVersion: true,
    tabs: true,
    recentFiles: true,
    favourites: true,
    favouriteGroups: true,
    explorerFolders: true,
    view: true,
    workspaceKinds: true,
    shortcutOverrides: true,
    wordGoals: true,
    snippetLibrary: true,
    injectionIgnoreEntries: true,
    jumpListRemovals: true,
    savedByAppVersion: true,
  } satisfies Record<keyof PersistedAppState, true>),
);

/**
 * The top-level fields and view settings a newer version added to the saved state, written back with
 * every save so going back to that version loses nothing.
 */
export class UnknownSavedFields {
  private fields: Readonly<Record<string, unknown>> = {};
  private unknownViewSettings: Readonly<Record<string, unknown>> = {};

  /** Remembers the fields of readable saved state that this version does not know. */
  rememberFrom(saved: unknown): void {
    const isReadable = isRecord(saved) && saved.schemaVersion === APP_STATE_SCHEMA_VERSION;
    this.fields = isReadable ? unknownFieldsOf(saved, KNOWN_SAVED_FIELDS) : {};
    this.unknownViewSettings = isReadable ? unknownFieldsOf(saved.view, VIEW_SETTING_FIELDS) : {};
  }

  forget(): void {
    this.fields = {};
    this.unknownViewSettings = {};
  }

  /**
   * Saves the state with the remembered fields and returns what was written. When the state with them
   * is refused, it is saved without them and they are forgotten, so they never block a save.
   */
  async saveWith(appState: AppStatePort, persisted: PersistedAppState): Promise<PersistedAppState> {
    if (Object.keys(this.fields).length === 0 && Object.keys(this.unknownViewSettings).length === 0) {
      await appState.save(persisted);
      return persisted;
    }
    const withFields = {
      ...this.fields,
      ...persisted,
      view: { ...this.unknownViewSettings, ...persisted.view },
    };
    try {
      await appState.save(withFields);
      return withFields;
    } catch (error) {
      if (!(error instanceof AppStateRefusedError)) throw error;
      await appState.save(persisted);
      this.forget();
      return persisted;
    }
  }
}

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const FIXTURE_DOCUMENTS_FOLDER = join(import.meta.dirname, '..', '..', 'fixtures', 'documents');
const SAVED_STATE_FILE_NAME = 'app-state.json';
const HOME_DOCUMENTS_FOLDER_NAME = 'home-documents';
const NEWER_VERSION_BACKUP_FILE_NAME = 'app-state.newer-version.json';
const WORKSPACE_DATABASE_FILE_NAME = 'mdx.db';
const SAVED_STATE_SCHEMA_VERSION = 1;

interface SavedLocation {
  readonly location: { readonly fileName: string; readonly canonicalKey: string };
  readonly scrollRatio?: number;
}

interface SavedFolderPlaces {
  readonly asFavourite?: boolean;
  readonly inExplorer?: boolean;
}

interface EarlierVersionState {
  readonly tabFileNames: readonly string[];
  readonly favouriteFileNames: readonly string[];
  readonly recentFileNames: readonly string[];
}

export interface SavedWorkspaceKinds {
  readonly enabledKindIds: readonly string[];
  readonly activeKindId: string;
}

interface SavedAppState {
  readonly tabs: { readonly tabs: readonly SavedLocation[]; readonly activeKey?: string };
  readonly favourites: readonly SavedLocation[];
  readonly view?: {
    readonly collapsedExplorerSections?: readonly string[];
    readonly explorerSectionHeights?: Readonly<Record<string, number>>;
    readonly panelWidths?: Readonly<Record<string, number>>;
    readonly wheelDock?: string;
    readonly isShowingHiddenCharacters?: boolean;
  };
  readonly workspaceKinds?: SavedWorkspaceKinds;
  readonly shortcutOverrides?: Readonly<Record<string, readonly string[]>>;
  readonly injectionIgnoreEntries?: readonly unknown[];
}

export class TestWorkspace {
  private constructor(
    private readonly rootFolder: string,
    readonly profileFolder: string,
    readonly documentsFolder: string,
  ) {}

  /** Stands in for the user's Documents folder, where Notes folders are made by default. */
  get homeDocumentsFolder(): string {
    return join(this.rootFolder, HOME_DOCUMENTS_FOLDER_NAME);
  }

  static create(): TestWorkspace {
    // The long form: CI's temp folder has a short name (RUNNER~1), and the app shows paths in full.
    const rootFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'mdx-ui-test-')));
    const profileFolder = join(rootFolder, 'profile');
    const documentsFolder = join(rootFolder, 'documents');
    mkdirSync(profileFolder);
    mkdirSync(join(rootFolder, HOME_DOCUMENTS_FOLDER_NAME));
    cpSync(FIXTURE_DOCUMENTS_FOLDER, documentsFolder, { recursive: true });
    return new TestWorkspace(rootFolder, profileFolder, documentsFolder);
  }

  documentPath(fileName: string): string {
    return join(this.documentsFolder, fileName);
  }

  /** Starts the next launch with the documents folder already added, as if the user had chosen it. */
  saveDocumentsFolder({ asFavourite = false, inExplorer = false }: SavedFolderPlaces): void {
    const displayPath = realpathSync.native(this.documentsFolder);
    const canonicalKey = process.platform === 'win32' ? displayPath.toLowerCase() : displayPath;
    const location = { canonicalKey, displayPath, fileName: basename(displayPath) };
    const state = {
      schemaVersion: SAVED_STATE_SCHEMA_VERSION,
      tabs: { tabs: [] },
      recentFiles: [],
      favourites: asFavourite ? [{ location, kind: 'folder' }] : [],
      favouriteGroups: [],
      explorerFolders: inExplorer ? [location] : [],
    };
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), JSON.stringify(state));
  }

  /** Starts the next launch in the given display language, as if it had been chosen in Settings. */
  saveDisplayLanguage(language: string): void {
    const state = {
      schemaVersion: SAVED_STATE_SCHEMA_VERSION,
      tabs: { tabs: [] },
      recentFiles: [],
      favourites: [],
      favouriteGroups: [],
      explorerFolders: [],
      view: { language },
    };
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), JSON.stringify(state));
  }

  /** Starts the next launch with a tab and a favourite saved by a version that had no workspace kinds. */
  saveStateWithoutKinds(fileName: string): void {
    const displayPath = realpathSync.native(this.documentPath(fileName));
    const canonicalKey = process.platform === 'win32' ? displayPath.toLowerCase() : displayPath;
    const location = { canonicalKey, displayPath, fileName };
    const state = {
      schemaVersion: SAVED_STATE_SCHEMA_VERSION,
      tabs: { tabs: [{ location, isPinned: false, scrollRatio: 0 }], activeKey: canonicalKey },
      recentFiles: [],
      favourites: [{ location, kind: 'file' }],
      favouriteGroups: [],
      explorerFolders: [],
    };
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), JSON.stringify(state));
  }

  /** Starts the next launch on the single state file of a version before workspaces. */
  saveEarlierVersionState({ tabFileNames, favouriteFileNames, recentFileNames }: EarlierVersionState): void {
    const locationOf = (fileName: string) => this.savedLocationOf(this.documentPath(fileName), fileName);
    const tabs = tabFileNames.map((fileName) => ({
      location: locationOf(fileName),
      isPinned: false,
      scrollRatio: 0,
    }));
    const folder = this.savedLocationOf(this.documentsFolder, basename(this.documentsFolder));
    const state = {
      schemaVersion: SAVED_STATE_SCHEMA_VERSION,
      tabs: { tabs, activeKey: tabs[0]?.location.canonicalKey },
      recentFiles: recentFileNames.map((fileName) => ({
        location: locationOf(fileName),
        isPinned: true,
        lastOpenedAtMs: 1,
      })),
      favourites: favouriteFileNames.map((fileName) => ({ location: locationOf(fileName), kind: 'file' })),
      favouriteGroups: [],
      explorerFolders: [folder],
    };
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), JSON.stringify(state));
  }

  /** Adds a favourite to the copy kept for earlier versions, as an earlier version would. */
  addFavouriteInEarlierVersionCopy(fileName: string): void {
    const stateFile = join(this.profileFolder, SAVED_STATE_FILE_NAME);
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as { favourites: unknown[] };
    const location = this.savedLocationOf(this.documentPath(fileName), fileName);
    state.favourites.push({ location, kind: 'file' });
    writeFileSync(stateFile, JSON.stringify(state));
  }

  hasWorkspaceDatabase(): boolean {
    return existsSync(join(this.profileFolder, WORKSPACE_DATABASE_FILE_NAME));
  }

  private savedLocationOf(path: string, fileName: string) {
    const displayPath = realpathSync.native(path);
    const canonicalKey = process.platform === 'win32' ? displayPath.toLowerCase() : displayPath;
    return { canonicalKey, displayPath, fileName };
  }

  /** Starts the next launch on state written by a newer MDX, and returns the exact text written. */
  saveStateFromNewerVersion(appVersion: string): string {
    const state = JSON.stringify({
      schemaVersion: SAVED_STATE_SCHEMA_VERSION + 1,
      savedByAppVersion: appVersion,
    });
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), state);
    return state;
  }

  newerVersionBackup(): string | undefined {
    const backupFile = join(this.profileFolder, NEWER_VERSION_BACKUP_FILE_NAME);
    return existsSync(backupFile) ? readFileSync(backupFile, 'utf8') : undefined;
  }

  savedWorkspaceKinds(): SavedWorkspaceKinds | undefined {
    return this.readSavedState()?.workspaceKinds;
  }

  savedWheelDock(): string | undefined {
    return this.readSavedState()?.view?.wheelDock;
  }

  isShowingHiddenCharactersInSavedState(): boolean {
    return this.readSavedState()?.view?.isShowingHiddenCharacters === true;
  }

  savedIgnoreEntryCount(): number {
    return this.readSavedState()?.injectionIgnoreEntries?.length ?? 0;
  }

  savedShortcutOverrides(): Readonly<Record<string, readonly string[]>> | undefined {
    return this.readSavedState()?.shortcutOverrides;
  }

  savedCollapsedExplorerSections(): readonly string[] | undefined {
    return this.readSavedState()?.view?.collapsedExplorerSections;
  }

  savedScrollRatioOf(fileName: string): number | undefined {
    return this.readSavedState()?.tabs.tabs.find((tab) => tab.location.fileName === fileName)?.scrollRatio;
  }

  savedSectionHeightOf(section: string): number | undefined {
    return this.readSavedState()?.view?.explorerSectionHeights?.[section];
  }

  savedPanelWidthOf(panel: string): number | undefined {
    return this.readSavedState()?.view?.panelWidths?.[panel];
  }

  savedTabFileNames(): string[] | undefined {
    return this.readSavedState()?.tabs.tabs.map((tab) => tab.location.fileName);
  }

  savedActiveTabFileName(): string | undefined {
    const tabs = this.readSavedState()?.tabs;
    return tabs?.tabs.find((tab) => tab.location.canonicalKey === tabs.activeKey)?.location.fileName;
  }

  savedFavouriteFileNames(): string[] | undefined {
    return this.readSavedState()?.favourites.map((favourite) => favourite.location.fileName);
  }

  private readSavedState(): SavedAppState | undefined {
    const stateFile = join(this.profileFolder, SAVED_STATE_FILE_NAME);
    if (!existsSync(stateFile)) return undefined;
    return JSON.parse(readFileSync(stateFile, 'utf8')) as SavedAppState;
  }

  remove(): void {
    rmSync(this.rootFolder, { recursive: true, force: true, maxRetries: 5 });
  }
}

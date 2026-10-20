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
const SAVED_STATE_SCHEMA_VERSION = 1;

interface SavedLocation {
  readonly location: { readonly fileName: string; readonly canonicalKey: string };
}

interface SavedAppState {
  readonly tabs: { readonly tabs: readonly SavedLocation[]; readonly activeKey?: string };
  readonly favourites: readonly SavedLocation[];
}

export class TestWorkspace {
  private constructor(
    private readonly rootFolder: string,
    readonly profileFolder: string,
    readonly documentsFolder: string,
  ) {}

  static create(): TestWorkspace {
    const rootFolder = mkdtempSync(join(tmpdir(), 'mdx-ui-test-'));
    const profileFolder = join(rootFolder, 'profile');
    const documentsFolder = join(rootFolder, 'documents');
    mkdirSync(profileFolder);
    cpSync(FIXTURE_DOCUMENTS_FOLDER, documentsFolder, { recursive: true });
    return new TestWorkspace(rootFolder, profileFolder, documentsFolder);
  }

  documentPath(fileName: string): string {
    return join(this.documentsFolder, fileName);
  }

  /** Starts the next launch with the documents folder as a folder favourite, as if the user had added it. */
  saveDocumentsFolderAsFavourite(): void {
    const displayPath = realpathSync.native(this.documentsFolder);
    const canonicalKey = process.platform === 'win32' ? displayPath.toLowerCase() : displayPath;
    const location = { canonicalKey, displayPath, fileName: basename(displayPath) };
    const state = {
      schemaVersion: SAVED_STATE_SCHEMA_VERSION,
      tabs: { tabs: [] },
      recentFiles: [],
      favourites: [{ location, kind: 'folder' }],
      favouriteGroups: [],
    };
    writeFileSync(join(this.profileFolder, SAVED_STATE_FILE_NAME), JSON.stringify(state));
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

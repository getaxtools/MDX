import { showExplorerSection, type ViewerSession } from '@mdx/core';
import {
  isUntitledLocation,
  type DocumentLocation,
  type FolderListing,
  type FolderPort,
} from '@mdx/platform';

const EMPTY_FOLDER_LISTING: FolderListing = { folders: [], documents: [] };
/** The app searches at most this many folders at once. */
const MAX_SEARCHED_FOLDERS = 100;

/** Folder actions behind the Explorer: choosing folders, adding them to favourites and listing them. */
export class ExplorerFolderActions {
  constructor(
    private readonly session: ViewerSession,
    private readonly folders: FolderPort | undefined,
  ) {}

  /** Lets the user choose a folder and shows it as a root in the Folders section. */
  async openFolder(): Promise<void> {
    const folder = await this.folders?.pickFolder();
    if (!folder) return;
    this.session.updateExplorerFolders((explorerFolders) => explorerFolders.add(folder));
    this.session.updateViewSettings((viewSettings) => showExplorerSection(viewSettings, 'folders'));
  }

  async addFolderFavourite(): Promise<void> {
    const folder = await this.folders?.pickFolder();
    if (!folder) return;
    this.session.updateFavourites((favourites) =>
      favourites.isFavourite(folder.canonicalKey) ? favourites : favourites.add(folder, 'folder'),
    );
    this.session.updateViewSettings((viewSettings) => showExplorerSection(viewSettings, 'favourites'));
  }

  addExplorerFolderToFavourites(canonicalKey: string): void {
    const folder = this.session
      .currentState()
      .explorerFolders.folders()
      .find((location) => location.canonicalKey === canonicalKey);
    if (!folder) return;
    this.session.updateFavourites((favourites) =>
      favourites.isFavourite(canonicalKey) ? favourites : favourites.add(folder, 'folder'),
    );
  }

  async quickOpenDocuments(): Promise<DocumentLocation[]> {
    const { tabStrip, recentFiles, favourites, explorerFolders } = this.session.currentState();
    const favouriteFiles = favourites.favourites().filter((favourite) => favourite.kind === 'file');
    const favouriteFolders = favourites.favourites().filter((favourite) => favourite.kind === 'folder');
    const known = [...tabStrip.tabs(), ...recentFiles.entries(), ...favouriteFiles].map(
      (entry) => entry.location,
    );
    const folderPaths = withoutDuplicates([
      ...explorerFolders.folders(),
      ...favouriteFolders.map((favourite) => favourite.location),
    ])
      .slice(0, MAX_SEARCHED_FOLDERS)
      .map((folder) => folder.displayPath);
    const inFolders = folderPaths.length === 0 ? [] : await this.findDocuments(folderPaths);
    return withoutDuplicates([...known, ...inFolders].filter((location) => !isUntitledLocation(location)));
  }

  /** The subfolders and Markdown documents in a folder; empty when the folder cannot be read. */
  async listFolderContents(folderPath: string): Promise<FolderListing> {
    try {
      return (await this.folders?.listFolderContents(folderPath)) ?? EMPTY_FOLDER_LISTING;
    } catch {
      return EMPTY_FOLDER_LISTING;
    }
  }

  private async findDocuments(folderPaths: readonly string[]): Promise<DocumentLocation[]> {
    try {
      return (await this.folders?.findDocuments(folderPaths)) ?? [];
    } catch {
      return [];
    }
  }
}

function withoutDuplicates(locations: readonly DocumentLocation[]): DocumentLocation[] {
  const seenKeys = new Set<string>();
  return locations.filter((location) => {
    if (seenKeys.has(location.canonicalKey)) return false;
    seenKeys.add(location.canonicalKey);
    return true;
  });
}

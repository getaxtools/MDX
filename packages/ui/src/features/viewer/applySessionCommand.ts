import type { ViewerSession } from '@mdx/core';
import {
  applyRemoveExplorerFolderCommand,
  isRemoveExplorerFolderCommand,
} from '../explorer/explorerCommands';
import { applyFavouriteCommand, isFavouriteCommand } from '../favourites/favouriteCommands';
import { applyRecentFileCommand, isRecentFileCommand } from '../recent-files/recentFileCommands';
import { applyTabCommand, isTabCommand } from '../tabs/tabCommands';
import { applyViewCommand, isViewCommand } from '../view/viewCommands';
import type { ViewerCommand } from './viewerCommands';

/** Applies a command that only changes session state; returns false for commands with other effects. */
export function applySessionCommand(session: ViewerSession, command: ViewerCommand): boolean {
  if (isViewCommand(command)) {
    session.updateViewSettings((viewSettings) => applyViewCommand(viewSettings, command));
    return true;
  }
  if (isTabCommand(command)) {
    session.updateTabs((tabStrip) => applyTabCommand(tabStrip, command));
    return true;
  }
  if (isFavouriteCommand(command)) {
    session.updateFavourites((favourites) => applyFavouriteCommand(favourites, command));
    return true;
  }
  if (isRemoveExplorerFolderCommand(command)) {
    session.updateExplorerFolders((explorerFolders) =>
      applyRemoveExplorerFolderCommand(explorerFolders, command),
    );
    return true;
  }
  if (isRecentFileCommand(command)) {
    session.updateRecentFiles((recentFiles) => applyRecentFileCommand(recentFiles, command));
    return true;
  }
  return false;
}

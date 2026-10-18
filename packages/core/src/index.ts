export {
  displayNameOf,
  FavouritesList,
  type Favourite,
  type FavouriteKind,
} from './favourites/FavouritesList';
export { MAX_RECENT_FILES, RecentFilesList, type RecentFile } from './recent-files/RecentFilesList';
export {
  APP_STATE_SCHEMA_VERSION,
  restoreAppState,
  toPersistedAppState,
  type PersistedAppState,
  type RestoredAppState,
} from './session/persistedAppState';
export { ViewerSession, type ViewerSessionDependencies, type ViewerState } from './session/ViewerSession';
export {
  LAST_TAB_NUMBER_KEY,
  MAX_REOPENABLE_TABS,
  TabStrip,
  type Tab,
  type TabStripSnapshot,
} from './tabs/TabStrip';

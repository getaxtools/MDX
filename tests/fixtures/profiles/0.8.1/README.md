# 0.8.1 data folder

Synthetic data as MDX 0.8.1 left it. That version kept everything in one file:

- `app-state.json` - schema version 1, with pinned and unpinned tabs and an
  active tab, recent files, favourites with labels, a folder and two groups,
  explorer folders and every view setting changed from its default.

The upgrade tests start the current build on this file and check that nothing
is lost when it moves into the default workspace. Never regenerate or edit a
released profile: when a new version changes what it stores, add a folder for
that version.

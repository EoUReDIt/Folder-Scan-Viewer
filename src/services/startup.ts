import { AppConfig, FavoriteFolder, SortField, SortOrder } from '../types/foldary';

export interface FolderSort {
  sortBy: SortField;
  sortOrder: SortOrder;
  foldersFirst: boolean;
}

/** The Default Folder, or the first favorite if the default id no longer exists. */
export function getInitialFolder(config: AppConfig): FavoriteFolder {
  return (
    config.favorites.find((f) => f.id === config.defaultFolderId) ?? config.favorites[0]
  );
}

/** The sort a folder opens with: its own saved sort, or the global one in `global` mode. */
export function getStartupSort(config: AppConfig, folder: FavoriteFolder): FolderSort {
  if (config.startupBehavior === 'global') {
    return {
      sortBy: config.globalSortBy,
      sortOrder: config.globalSortOrder,
      foldersFirst: folder.foldersFirst,
    };
  }
  return {
    sortBy: folder.sortBy,
    sortOrder: folder.sortOrder,
    foldersFirst: folder.foldersFirst,
  };
}

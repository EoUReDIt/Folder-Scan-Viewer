import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { AppConfig, FavoriteFolder, SortField, SortOrder } from '../types/foldary';
import { FolderSort, getInitialFolder, getStartupSort } from '../services/startup';

interface FolderNavigationOptions {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
}

/**
 * Which favorite is open, the subfolder shown inside it, and the sort in use.
 * Sort changes are saved to the open favorite so per-folder startup sorting remembers them.
 */
export function useFolderNavigation({ config, setConfig }: FolderNavigationOptions) {
  const [initial] = useState(() => {
    const folder = getInitialFolder(config);
    return { folderId: folder.id, sort: getStartupSort(config, folder) };
  });

  const [activeFolderId, setActiveFolderId] = useState<string>(initial.folderId);
  const [currentSubpath, setCurrentSubpath] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>(initial.sort.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initial.sort.sortOrder);
  const [foldersFirst, setFoldersFirst] = useState<boolean>(initial.sort.foldersFirst);

  const activeFolder = useMemo<FavoriteFolder>(
    () => config.favorites.find((f) => f.id === activeFolderId) ?? config.favorites[0],
    [config.favorites, activeFolderId]
  );

  /** Opens a favorite at its root with the given sort. */
  const goToFolder = useCallback((folderId: string, sort: FolderSort) => {
    setActiveFolderId(folderId);
    setCurrentSubpath('');
    setSortBy(sort.sortBy);
    setSortOrder(sort.sortOrder);
    setFoldersFirst(sort.foldersFirst);
  }, []);

  /** Opens a favorite at its root with the sort its startup rule gives under `cfg`. */
  const openFolder = useCallback(
    (folder: FavoriteFolder, cfg: AppConfig) => goToFolder(folder.id, getStartupSort(cfg, folder)),
    [goToFolder]
  );

  /** Opens a favorite by id; returns false if it no longer exists. */
  const selectFolder = useCallback(
    (folderId: string): boolean => {
      const target = config.favorites.find((f) => f.id === folderId);
      if (!target) return false;
      openFolder(target, config);
      return true;
    },
    [config, openFolder]
  );

  /** Switches folder but keeps the current sort (used when the open favorite is removed). */
  const switchFolderKeepingSort = useCallback((folderId: string) => {
    setActiveFolderId(folderId);
    setCurrentSubpath('');
  }, []);

  const navigateUp = useCallback(() => {
    if (!currentSubpath) return;
    const parts = currentSubpath.split('/').filter(Boolean);
    parts.pop();
    setCurrentSubpath(parts.join('/'));
  }, [currentSubpath]);

  // Persist sort changes to the active folder in config.favorites
  const updateActiveFolderSort = useCallback(
    (nextSortBy: SortField, nextSortOrder: SortOrder, nextFoldersFirst?: boolean) => {
      setSortBy(nextSortBy);
      setSortOrder(nextSortOrder);
      if (typeof nextFoldersFirst === 'boolean') {
        setFoldersFirst(nextFoldersFirst);
      }
      setConfig((prev) => ({
        ...prev,
        favorites: prev.favorites.map((fav) =>
          fav.id === activeFolder.id
            ? {
                ...fav,
                sortBy: nextSortBy,
                sortOrder: nextSortOrder,
                foldersFirst:
                  typeof nextFoldersFirst === 'boolean' ? nextFoldersFirst : fav.foldersFirst,
              }
            : fav
        ),
      }));
    },
    [activeFolder.id, setConfig]
  );

  const sortByColumn = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        updateActiveFolderSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        const defaultDir: SortOrder = field === 'dateModified' || field === 'size' ? 'desc' : 'asc';
        updateActiveFolderSort(field, defaultDir);
      }
    },
    [sortBy, sortOrder, updateActiveFolderSort]
  );

  const quickSort = useCallback(
    (field: SortField, defaultOrder: SortOrder) => {
      if (sortBy === field) {
        updateActiveFolderSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        updateActiveFolderSort(field, defaultOrder);
      }
    },
    [sortBy, sortOrder, updateActiveFolderSort]
  );

  const toggleFoldersFirst = useCallback(() => {
    updateActiveFolderSort(sortBy, sortOrder, !foldersFirst);
  }, [sortBy, sortOrder, foldersFirst, updateActiveFolderSort]);

  return {
    activeFolderId,
    activeFolder,
    currentSubpath,
    setCurrentSubpath,
    sortBy,
    sortOrder,
    foldersFirst,
    goToFolder,
    openFolder,
    selectFolder,
    switchFolderKeepingSort,
    navigateUp,
    sortByColumn,
    quickSort,
    toggleFoldersFirst,
  };
}

export type FolderNavigation = ReturnType<typeof useFolderNavigation>;

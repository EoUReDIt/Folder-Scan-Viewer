import { Dispatch, SetStateAction, useCallback, useMemo } from 'react';
import { AppConfig, FavoriteFolder, FileEntry } from '../types/foldary';
import { rebaseEntriesToSubpath, resolveSubdirectoryHandle } from '../services/fileProvider';
import { joinNativePath, syncNativeAccess } from '../services/nativeBridge';
import { FolderNavigation } from './useFolderNavigation';
import { LocalFolders } from './useLocalFolders';
import { Notify } from './useToasts';

interface FavoritesOptions {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  navigation: FolderNavigation;
  /** Entries of the open favorite, used to seed a pinned local subfolder. */
  activeRootEntries: FileEntry[];
  local: LocalFolders;
  notify: Notify;
}

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const leafOf = (subpath: string, fallback: string) => {
  const segments = subpath.split('/').filter(Boolean);
  return segments[segments.length - 1] || fallback;
};

/** Pinning subfolders, removing favorites, and choosing the Default Folder. */
export function useFavorites({
  config,
  setConfig,
  navigation,
  activeRootEntries,
  local,
  notify,
}: FavoritesOptions) {
  const {
    activeFolder,
    activeFolderId,
    currentSubpath,
    sortBy,
    sortOrder,
    foldersFirst,
    switchFolderKeepingSort,
  } = navigation;
  const { storeEntries, getHandle, rememberHandle, forget } = local;

  const pinSubfolderAsFavorite = useCallback(
    (entryPath: string, name: string, fullPath: string): FavoriteFolder => {
      const existing = config.favorites.find((f) => samePath(f.path, fullPath));
      if (existing) return existing;

      const id = `fav_pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let newFav: FavoriteFolder;
      if (activeFolder.sourceType === 'local') {
        storeEntries(id, rebaseEntriesToSubpath(activeRootEntries, entryPath));
        const rootHandle = getHandle(activeFolder.id);
        if (rootHandle) {
          void resolveSubdirectoryHandle(rootHandle, entryPath).then((subHandle) => {
            if (subHandle) rememberHandle(id, subHandle);
          });
        }
        newFav = {
          id,
          name,
          path: fullPath,
          sortBy,
          sortOrder,
          foldersFirst,
          sourceType: 'local',
          ...(activeFolder.nativePath
            ? { nativePath: joinNativePath(activeFolder.nativePath, entryPath) }
            : {}),
        };
      } else {
        newFav = {
          id,
          name,
          path: fullPath,
          sortBy,
          sortOrder,
          foldersFirst,
          sourceType: 'demo',
          baseDemoId: activeFolder.baseDemoId || activeFolder.id,
          subpath: activeFolder.subpath ? `${activeFolder.subpath}/${entryPath}` : entryPath,
        };
      }
      setConfig((prev) => ({ ...prev, favorites: [...prev.favorites, newFav] }));
      return newFav;
    },
    [
      activeFolder,
      activeRootEntries,
      config.favorites,
      foldersFirst,
      getHandle,
      rememberHandle,
      setConfig,
      sortBy,
      sortOrder,
      storeEntries,
    ]
  );

  const removeFavorite = useCallback(
    (folderId: string) => {
      if (folderId === config.defaultFolderId) {
        notify('Set another Default Folder before removing this one', 'info');
        return;
      }
      if (config.favorites.length <= 1) return;

      const remaining = config.favorites.filter((f) => f.id !== folderId);
      setConfig((prev) => ({
        ...prev,
        favorites: prev.favorites.filter((f) => f.id !== folderId),
      }));
      syncNativeAccess(remaining);
      forget([folderId]);

      if (activeFolderId === folderId && remaining.length > 0) {
        switchFolderKeepingSort(remaining[0].id);
      }
      notify('Removed from Favorites', 'info');
    },
    [
      activeFolderId,
      config.defaultFolderId,
      config.favorites,
      forget,
      notify,
      setConfig,
      switchFolderKeepingSort,
    ]
  );

  const toggleFavoriteSubfolder = useCallback(
    (entryPath: string, name: string, fullPath: string) => {
      const existing = config.favorites.find((f) => samePath(f.path, fullPath));
      if (existing) {
        removeFavorite(existing.id);
      } else {
        pinSubfolderAsFavorite(entryPath, name, fullPath);
        notify(`Pinned "${name}" to Favorites`, 'success');
      }
    },
    [config.favorites, notify, pinSubfolderAsFavorite, removeFavorite]
  );

  const setFolderAsDefault = useCallback(
    (entryPath: string, name: string, fullPath: string) => {
      const fav = pinSubfolderAsFavorite(entryPath, name, fullPath);
      setConfig((prev) => ({ ...prev, defaultFolderId: fav.id }));
      notify(`"${name}" is now your Default Startup Folder`, 'success');
    },
    [notify, pinSubfolderAsFavorite, setConfig]
  );

  // Whether the folder on screen (favorite root or a subfolder in it) is pinned / the Default
  const currentLocation = useMemo(() => {
    const cleanSub = currentSubpath.replace(/^\/+|\/+$/g, '');
    const fullPath = joinNativePath(activeFolder.path, cleanSub);
    const existing = config.favorites.find((f) => samePath(f.path, fullPath));
    return {
      fullPath,
      isFavorited: Boolean(existing),
      isDefault: Boolean(existing && existing.id === config.defaultFolderId),
    };
  }, [activeFolder.path, config.defaultFolderId, config.favorites, currentSubpath]);

  const toggleFavoriteCurrent = useCallback(() => {
    if (!currentSubpath) {
      if (activeFolder.id === config.defaultFolderId) {
        notify('Default folder stays pinned in Favorites', 'info');
        return;
      }
      removeFavorite(activeFolder.id);
      return;
    }
    toggleFavoriteSubfolder(
      currentSubpath,
      leafOf(currentSubpath, activeFolder.name),
      currentLocation.fullPath
    );
  }, [
    activeFolder.id,
    activeFolder.name,
    config.defaultFolderId,
    currentLocation.fullPath,
    currentSubpath,
    notify,
    removeFavorite,
    toggleFavoriteSubfolder,
  ]);

  const setCurrentAsDefault = useCallback(() => {
    if (!currentSubpath) {
      setConfig((prev) => ({ ...prev, defaultFolderId: activeFolder.id }));
      notify(`"${activeFolder.name}" set as Default Startup Folder`, 'success');
      return;
    }
    setFolderAsDefault(
      currentSubpath,
      leafOf(currentSubpath, activeFolder.name),
      currentLocation.fullPath
    );
  }, [
    activeFolder.id,
    activeFolder.name,
    currentLocation.fullPath,
    currentSubpath,
    notify,
    setConfig,
    setFolderAsDefault,
  ]);

  return {
    currentLocation,
    removeFavorite,
    toggleFavoriteSubfolder,
    setFolderAsDefault,
    toggleFavoriteCurrent,
    setCurrentAsDefault,
  };
}

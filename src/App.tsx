import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  ContextMenuState,
  FavoriteFolder,
  FileEntry,
  FilterType,
  LocalFolderStatus,
  RecencyFilter,
  SortField,
  SortOrder,
  ToastMessage,
} from './types/foldary';
import { buildDemoWorkspace, DEFAULT_APP_CONFIG } from './data/demoWorkspace';
import {
  clearSavedConfig,
  loadSavedConfig,
  saveConfig,
} from './services/configStorage';
import {
  computeCategoryCounts,
  convertFileListToEntries,
  filterAndSortEntriesWithInfo,
  getHandlePermission,
  LocalDirectoryHandle,
  resolveSubdirectoryHandle,
  scanDirectoryHandle,
  scopeEntriesToSubpath,
  tryPickDirectoryWithNativeApi,
} from './services/fileProvider';
import { clearHandles, deleteHandle, loadHandle, saveHandle } from './services/handleStore';
import {
  isNativeShell,
  joinNativePath,
  openNativePath,
  pickNativeFolder,
  revealNativePath,
  scanNativeFolder,
  syncNativeFolders,
} from './services/nativeBridge';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { SortToolbar } from './components/SortToolbar';
import { FileGrid } from './components/FileGrid';
import { PreviewPane } from './components/PreviewPane';
import { ContextMenu } from './components/ContextMenu';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer } from './components/ToastContainer';

// Running inside the Tauri desktop shell: folders come from Rust commands, not browser APIs
const NATIVE_SHELL = isNativeShell();

/** Tells the shell which picked folders favorites still use so it can forget the others. */
function syncNativeAccess(favorites: FavoriteFolder[]) {
  if (!NATIVE_SHELL) return;
  const keep = favorites.flatMap((f) => (f.nativePath ? [f.nativePath] : []));
  void syncNativeFolders(keep).catch(() => undefined);
}

function getInitialFolder(config: AppConfig): FavoriteFolder {
  return (
    config.favorites.find((f) => f.id === config.defaultFolderId) ?? config.favorites[0]
  );
}

function getStartupSort(
  config: AppConfig,
  folder: FavoriteFolder
): { sortBy: SortField; sortOrder: SortOrder; foldersFirst: boolean } {
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

export default function App() {
  const [demoWorkspace] = useState<Record<string, FileEntry[]>>(() =>
    buildDemoWorkspace()
  );
  const [localFolders, setLocalFolders] = useState<Record<string, FileEntry[]>>({});
  // Runtime-only availability of each local favorite (not persisted)
  const [localStatus, setLocalStatus] = useState<Record<string, LocalFolderStatus>>({});
  // Directory handles for local favorites mounted via the File System Access API
  const handlesRef = useRef<Record<string, LocalDirectoryHandle>>({});
  // Local favorites whose availability check has already started (guards StrictMode double effects)
  const checkedLocalIdsRef = useRef<Set<string>>(new Set());
  // Favorite id the <input webkitdirectory> fallback should refill instead of creating a new favorite
  const remountTargetRef = useRef<string | null>(null);

  const [config, setConfig] = useState<AppConfig>(() => loadSavedConfig());
  const initialFolder = getInitialFolder(config);
  const initialSort = getStartupSort(config, initialFolder);

  const [activeFolderId, setActiveFolderId] = useState<string>(initialFolder.id);
  const [currentSubpath, setCurrentSubpath] = useState<string>('');
  // Session-only "this folder only" scope set by Open Containing Folder. Never saved; it
  // ends as soon as the active folder or subpath changes.
  const [scopeOverride, setScopeOverride] = useState<{ folderId: string; subpath: string } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [recency, setRecency] = useState<RecencyFilter>('all');

  const [sortBy, setSortBy] = useState<SortField>(initialSort.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSort.sortOrder);
  const [foldersFirst, setFoldersFirst] = useState<boolean>(initialSort.foldersFirst);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const setFolderStatus = useCallback((id: string, status: LocalFolderStatus) => {
    setLocalStatus((prev) => ({ ...prev, [id]: status }));
  }, []);

  const notify = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    },
    []
  );

  // Warns when a scan stopped at SCAN_LIMITS.maxEntries (browser and desktop alike)
  const reportTruncatedScan = useCallback(
    (scan: { rootName: string; entries: FileEntry[]; truncated: boolean }) => {
      if (scan.truncated) {
        notify(`"${scan.rootName}" is large: only the first ${scan.entries.length} items are listed`, 'info');
      }
    },
    [notify]
  );

  // Rescan a local favorite from its stored handle. `request` asks the browser for
  // permission and must only be true inside a click handler.
  const restoreLocalFolder = useCallback(
    async (id: string, request: boolean, nativePath?: string): Promise<boolean> => {
      if (NATIVE_SHELL) {
        // Imported or browser-made favorites have no disk path: the folder must be picked again
        if (!nativePath) {
          setFolderStatus(id, 'needs-remount');
          return false;
        }
        try {
          const scanned = await scanNativeFolder(nativePath, id);
          setLocalFolders((prev) => ({ ...prev, [id]: scanned.entries }));
          reportTruncatedScan(scanned);
          setFolderStatus(id, 'ready');
          return true;
        } catch {
          // Moved, deleted, or never picked on this computer (outside the allowlist)
          setFolderStatus(id, 'needs-remount');
          return false;
        }
      }
      const handle = handlesRef.current[id] ?? (await loadHandle(id));
      if (!handle) {
        setFolderStatus(id, 'needs-remount');
        return false;
      }
      handlesRef.current[id] = handle;
      const permission = await getHandlePermission(handle, { request });
      if (permission !== 'granted') {
        setFolderStatus(id, 'needs-permission');
        return false;
      }
      try {
        const scanned = await scanDirectoryHandle(handle, id);
        setLocalFolders((prev) => ({ ...prev, [id]: scanned.entries }));
        reportTruncatedScan(scanned);
        setFolderStatus(id, 'ready');
        return true;
      } catch {
        // Folder was moved or deleted since it was mounted
        setFolderStatus(id, 'needs-remount');
        return false;
      }
    },
    [reportTruncatedScan, setFolderStatus]
  );

  // Sync Tailwind dark mode class with config.theme
  useEffect(() => {
    const root = document.documentElement;
    if (config.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [config.theme]);

  // Persist config changes to localStorage
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Restore local favorites that have no loaded contents yet (startup and config import).
  // Favorites mounted in this session are registered as checked before they reach config.
  useEffect(() => {
    config.favorites.forEach((fav) => {
      if (fav.sourceType !== 'local') return;
      if (checkedLocalIdsRef.current.has(fav.id)) return;
      checkedLocalIdsRef.current.add(fav.id);
      setFolderStatus(fav.id, 'loading');
      void restoreLocalFolder(fav.id, false, fav.nativePath);
    });
  }, [config.favorites, restoreLocalFolder, setFolderStatus]);

  const activeFolder = useMemo<FavoriteFolder>(() => {
    return (
      config.favorites.find((f) => f.id === activeFolderId) ?? config.favorites[0]
    );
  }, [config.favorites, activeFolderId]);

  // Resolve entries for the currently active root folder (including pinned subfolders)
  const activeRootEntries = useMemo<FileEntry[]>(() => {
    if (activeFolder.sourceType === 'local') {
      return localFolders[activeFolder.id] ?? [];
    }

    if (activeFolder.baseDemoId && activeFolder.subpath) {
      const baseEntries = demoWorkspace[activeFolder.baseDemoId] ?? [];
      const prefix = `${activeFolder.subpath}/`;
      return baseEntries
        .filter(
          (entry) =>
            entry.parentPath === activeFolder.subpath ||
            entry.parentPath.startsWith(prefix)
        )
        .map((entry) => {
          const newParent =
            entry.parentPath === activeFolder.subpath
              ? ''
              : entry.parentPath.slice(activeFolder.subpath!.length + 1);
          const newEntryPath = newParent ? `${newParent}/${entry.name}` : entry.name;
          return {
            ...entry,
            parentPath: newParent,
            entryPath: newEntryPath,
            relativePath: newParent
              ? `.\\${newParent.split('/').join('\\')}\\`
              : '.\\',
          };
        });
    }

    return demoWorkspace[activeFolder.id] ?? [];
  }, [activeFolder, demoWorkspace, localFolders]);

  const scopeOverrideActive =
    scopeOverride !== null &&
    scopeOverride.folderId === activeFolder.id &&
    scopeOverride.subpath === currentSubpath;
  const includeSubfolders = config.includeSubfolders && !scopeOverrideActive;

  // Drop the override once the user navigates away, so coming back does not revive it
  useEffect(() => {
    if (scopeOverride && !scopeOverrideActive) setScopeOverride(null);
  }, [scopeOverride, scopeOverrideActive]);

  // Flips the scope in use and saves it; also ends a temporary override
  const handleToggleIncludeSubfolders = useCallback(() => {
    const next = !includeSubfolders;
    setScopeOverride(null);
    setConfig((prev) => ({ ...prev, includeSubfolders: next }));
  }, [includeSubfolders]);

  const { entries: visibleEntries, closeMatches } = useMemo(
    () =>
      filterAndSortEntriesWithInfo({
        entries: activeRootEntries,
        currentSubpath,
        includeSubfolders,
        showHiddenFiles: config.showHiddenFiles,
        filterType,
        recency,
        query: searchQuery,
        sortBy,
        sortOrder,
        foldersFirst,
      }),
    [
      activeRootEntries,
      currentSubpath,
      includeSubfolders,
      config.showHiddenFiles,
      filterType,
      recency,
      searchQuery,
      sortBy,
      sortOrder,
      foldersFirst,
    ]
  );

  const categoryCounts = useMemo(
    () =>
      computeCategoryCounts(
        activeRootEntries,
        currentSubpath,
        includeSubfolders,
        config.showHiddenFiles,
        recency,
        searchQuery
      ),
    [
      activeRootEntries,
      currentSubpath,
      includeSubfolders,
      config.showHiddenFiles,
      recency,
      searchQuery,
    ]
  );

  // Keep selectedId valid when entries update
  useEffect(() => {
    if (visibleEntries.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleEntries.some((e) => e.id === selectedId)) {
      setSelectedId(visibleEntries[0].id);
    }
  }, [visibleEntries, selectedId]);

  // Typing a query selects the best match, so Enter opens it
  const lastQueryRef = useRef(searchQuery);
  useEffect(() => {
    if (searchQuery === lastQueryRef.current) return;
    lastQueryRef.current = searchQuery;
    if (searchQuery.trim() && visibleEntries.length > 0) setSelectedId(visibleEntries[0].id);
  }, [searchQuery, visibleEntries]);

  const selectedEntry = useMemo(
    () => visibleEntries.find((e) => e.id === selectedId) ?? null,
    [visibleEntries, selectedId]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || filterType !== 'all' || recency !== 'all';

  // Helper to persist sort changes to active folder in config.favorites
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
                  typeof nextFoldersFirst === 'boolean'
                    ? nextFoldersFirst
                    : fav.foldersFirst,
              }
            : fav
        ),
      }));
    },
    [activeFolder.id]
  );

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      const target = config.favorites.find((f) => f.id === folderId);
      if (!target) return;
      setActiveFolderId(target.id);
      setCurrentSubpath('');
      setContextMenu(null);
      const nextSort = getStartupSort(config, target);
      setSortBy(nextSort.sortBy);
      setSortOrder(nextSort.sortOrder);
      setFoldersFirst(nextSort.foldersFirst);
    },
    [config]
  );

  const handleSortColumn = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        updateActiveFolderSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        const defaultDir: SortOrder =
          field === 'dateModified' || field === 'size' ? 'desc' : 'asc';
        updateActiveFolderSort(field, defaultDir);
      }
    },
    [sortBy, sortOrder, updateActiveFolderSort]
  );

  const handleQuickSort = useCallback(
    (field: SortField, defaultOrder: SortOrder) => {
      if (sortBy === field) {
        updateActiveFolderSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        updateActiveFolderSort(field, defaultOrder);
      }
    },
    [sortBy, sortOrder, updateActiveFolderSort]
  );

  const handleToggleFoldersFirst = useCallback(() => {
    updateActiveFolderSort(sortBy, sortOrder, !foldersFirst);
  }, [sortBy, sortOrder, foldersFirst, updateActiveFolderSort]);

  const handleNavigateUp = useCallback(() => {
    if (!currentSubpath) return;
    const parts = currentSubpath.split('/').filter(Boolean);
    parts.pop();
    setCurrentSubpath(parts.join('/'));
  }, [currentSubpath]);

  const handleOpenFolderHere = useCallback((entryPath: string) => {
    setCurrentSubpath(entryPath);
    setSearchQuery('');
  }, []);

  // Build or find a FavoriteFolder for a subfolder path inside activeFolder
  const resolveSubfolderFavoritePath = useCallback(
    (subpath: string) => {
      const cleanSub = subpath.replace(/^\/+|\/+$/g, '');
      const fullPath = joinNativePath(activeFolder.path, cleanSub);
      const existing = config.favorites.find(
        (f) => f.path.toLowerCase() === fullPath.toLowerCase()
      );
      return { cleanSub, fullPath, existing };
    },
    [activeFolder.path, config.favorites]
  );

  const pinSubfolderAsFavorite = useCallback(
    (entryPath: string, name: string, fullPath: string): FavoriteFolder => {
      const existing = config.favorites.find(
        (f) => f.path.toLowerCase() === fullPath.toLowerCase()
      );
      if (existing) return existing;

      const id = `fav_pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (activeFolder.sourceType === 'local') {
        const scoped = scopeEntriesToSubpath(activeRootEntries, entryPath, true).map(
          (entry) => {
            const newParent =
              entry.parentPath === entryPath
                ? ''
                : entry.parentPath.slice(entryPath.length + 1);
            const newEntryPath = newParent ? `${newParent}/${entry.name}` : entry.name;
            return {
              ...entry,
              parentPath: newParent,
              entryPath: newEntryPath,
              relativePath: newParent ? `.\\${newParent.split('/').join('\\')}\\` : '.\\',
            };
          }
        );
        setLocalFolders((prev) => ({ ...prev, [id]: scoped }));
        setFolderStatus(id, 'ready');
        checkedLocalIdsRef.current.add(id);
        const rootHandle = handlesRef.current[activeFolder.id];
        if (rootHandle) {
          void resolveSubdirectoryHandle(rootHandle, entryPath).then((subHandle) => {
            if (!subHandle) return;
            handlesRef.current[id] = subHandle;
            void saveHandle(id, subHandle);
          });
        }
        const newFav: FavoriteFolder = {
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
        setConfig((prev) => ({ ...prev, favorites: [...prev.favorites, newFav] }));
        return newFav;
      }

      const baseDemoId = activeFolder.baseDemoId || activeFolder.id;
      const combinedSubpath = activeFolder.subpath
        ? `${activeFolder.subpath}/${entryPath}`
        : entryPath;

      const newFav: FavoriteFolder = {
        id,
        name,
        path: fullPath,
        sortBy,
        sortOrder,
        foldersFirst,
        sourceType: 'demo',
        baseDemoId,
        subpath: combinedSubpath,
      };
      setConfig((prev) => ({ ...prev, favorites: [...prev.favorites, newFav] }));
      return newFav;
    },
    [
      activeFolder,
      activeRootEntries,
      config.favorites,
      foldersFirst,
      setFolderStatus,
      sortBy,
      sortOrder,
    ]
  );

  const handleRemoveFavorite = useCallback(
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
      // Drop runtime data for local favorites so removed folders don't linger in memory or IndexedDB
      setLocalFolders((prev) => {
        if (!(folderId in prev)) return prev;
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
      setLocalStatus((prev) => {
        if (!(folderId in prev)) return prev;
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
      delete handlesRef.current[folderId];
      checkedLocalIdsRef.current.delete(folderId);
      void deleteHandle(folderId);

      if (activeFolderId === folderId) {
        const fallback = config.favorites.find((f) => f.id !== folderId);
        if (fallback) {
          setActiveFolderId(fallback.id);
          setCurrentSubpath('');
        }
      }
      notify('Removed from Favorites', 'info');
    },
    [activeFolderId, config.defaultFolderId, config.favorites, notify]
  );

  const handleToggleFavoriteSubfolder = useCallback(
    (entryPath: string, name: string, fullPath: string) => {
      const existing = config.favorites.find(
        (f) => f.path.toLowerCase() === fullPath.toLowerCase()
      );
      if (existing) {
        handleRemoveFavorite(existing.id);
      } else {
        pinSubfolderAsFavorite(entryPath, name, fullPath);
        notify(`Pinned "${name}" to Favorites`, 'success');
      }
    },
    [config.favorites, handleRemoveFavorite, notify, pinSubfolderAsFavorite]
  );

  const handleSetFolderAsDefault = useCallback(
    (entryPath: string, name: string, fullPath: string) => {
      const fav = pinSubfolderAsFavorite(entryPath, name, fullPath);
      setConfig((prev) => ({ ...prev, defaultFolderId: fav.id }));
      notify(`"${name}" is now your Default Startup Folder`, 'success');
    },
    [notify, pinSubfolderAsFavorite]
  );

  const currentLocationStatus = useMemo(() => {
    const { fullPath, existing } = resolveSubfolderFavoritePath(currentSubpath);
    const isFavorited = Boolean(existing);
    const isDefault = Boolean(existing && existing.id === config.defaultFolderId);
    return { fullPath, existing, isFavorited, isDefault };
  }, [config.defaultFolderId, currentSubpath, resolveSubfolderFavoritePath]);

  const handleToggleFavoriteCurrent = useCallback(() => {
    if (!currentSubpath) {
      if (activeFolder.id === config.defaultFolderId) {
        notify('Default folder stays pinned in Favorites', 'info');
        return;
      }
      handleRemoveFavorite(activeFolder.id);
      return;
    }
    const segments = currentSubpath.split('/').filter(Boolean);
    const leafName = segments[segments.length - 1] || activeFolder.name;
    handleToggleFavoriteSubfolder(
      currentSubpath,
      leafName,
      currentLocationStatus.fullPath
    );
  }, [
    activeFolder.id,
    activeFolder.name,
    config.defaultFolderId,
    currentLocationStatus.fullPath,
    currentSubpath,
    handleRemoveFavorite,
    handleToggleFavoriteSubfolder,
    notify,
  ]);

  const handleSetCurrentAsDefault = useCallback(() => {
    if (!currentSubpath) {
      setConfig((prev) => ({ ...prev, defaultFolderId: activeFolder.id }));
      notify(`"${activeFolder.name}" set as Default Startup Folder`, 'success');
      return;
    }
    const segments = currentSubpath.split('/').filter(Boolean);
    const leafName = segments[segments.length - 1] || activeFolder.name;
    handleSetFolderAsDefault(currentSubpath, leafName, currentLocationStatus.fullPath);
  }, [
    activeFolder.id,
    activeFolder.name,
    currentLocationStatus.fullPath,
    currentSubpath,
    handleSetFolderAsDefault,
    notify,
  ]);

  // Mount real local folder via File System Access API or fallback <input webkitdirectory>
  const mountEntriesAsLocalFavorite = useCallback(
    (
      id: string,
      rootName: string,
      rootPath: string,
      entries: FileEntry[],
      handle?: LocalDirectoryHandle,
      nativePath?: string
    ) => {
      setLocalFolders((prev) => ({ ...prev, [id]: entries }));
      setFolderStatus(id, 'ready');
      checkedLocalIdsRef.current.add(id);
      if (handle) {
        handlesRef.current[id] = handle;
        void saveHandle(id, handle);
      }

      const newFav: FavoriteFolder = {
        id,
        name: rootName,
        path: rootPath,
        sortBy: config.globalSortBy,
        sortOrder: config.globalSortOrder,
        foldersFirst: true,
        sourceType: 'local',
        ...(nativePath ? { nativePath } : {}),
      };

      setConfig((prev) => ({
        ...prev,
        favorites: [...prev.favorites, newFav],
      }));
      setActiveFolderId(id);
      setCurrentSubpath('');
      setSortBy(newFav.sortBy);
      setSortOrder(newFav.sortOrder);
      setFoldersFirst(newFav.foldersFirst);
      notify(
        `Mounted "${rootName}" (${entries.length} ${entries.length === 1 ? 'item' : 'items'})`,
        'success'
      );
    },
    [config.globalSortBy, config.globalSortOrder, notify, setFolderStatus]
  );

  // Refill an existing local favorite (same id, sort and Default status) after a reload
  const refillLocalFavorite = useCallback(
    (id: string, entries: FileEntry[], handle?: LocalDirectoryHandle) => {
      setLocalFolders((prev) => ({ ...prev, [id]: entries }));
      setFolderStatus(id, 'ready');
      if (handle) {
        handlesRef.current[id] = handle;
        void saveHandle(id, handle);
      }
      setCurrentSubpath('');
      const name = config.favorites.find((f) => f.id === id)?.name ?? 'folder';
      notify(
        `Reconnected "${name}" (${entries.length} ${entries.length === 1 ? 'item' : 'items'})`,
        'success'
      );
    },
    [config.favorites, notify, setFolderStatus]
  );

  const handleAddLocalFolder = useCallback(async () => {
    const id = `local_${Date.now()}`;
    if (NATIVE_SHELL) {
      try {
        const picked = await pickNativeFolder(id);
        if (!picked) return;
        mountEntriesAsLocalFavorite(id, picked.rootName, picked.rootPath, picked.entries, undefined, picked.rootPath);
        reportTruncatedScan(picked);
      } catch (err) {
        notify(`Could not open folder: ${String(err)}`, 'error');
      }
      return;
    }
    const result = await tryPickDirectoryWithNativeApi(id);
    if (result.status === 'picked') {
      mountEntriesAsLocalFavorite(
        id,
        result.rootName,
        result.rootPath,
        result.entries,
        result.handle
      );
      reportTruncatedScan(result);
      return;
    }
    if (result.status === 'cancelled') {
      return;
    }
    // Fallback to standard directory input (works reliably inside iframes and all browsers)
    remountTargetRef.current = null;
    folderInputRef.current?.click();
  }, [mountEntriesAsLocalFavorite, notify, reportTruncatedScan]);

  const handleChooseLocalFolderAgain = useCallback(
    async (id: string) => {
      if (NATIVE_SHELL) {
        try {
          const picked = await pickNativeFolder(id);
          if (!picked) return;
          const nextFavorites = config.favorites.map((f) =>
            f.id === id ? { ...f, nativePath: picked.rootPath, path: picked.rootPath } : f
          );
          setConfig((prev) => ({
            ...prev,
            favorites: prev.favorites.map((f) =>
              f.id === id ? { ...f, nativePath: picked.rootPath, path: picked.rootPath } : f
            ),
          }));
          syncNativeAccess(nextFavorites);
          refillLocalFavorite(id, picked.entries);
          reportTruncatedScan(picked);
        } catch (err) {
          notify(`Could not open folder: ${String(err)}`, 'error');
        }
        return;
      }
      const result = await tryPickDirectoryWithNativeApi(id);
      if (result.status === 'picked') {
        refillLocalFavorite(id, result.entries, result.handle);
        reportTruncatedScan(result);
        return;
      }
      if (result.status === 'cancelled') return;
      remountTargetRef.current = id;
      folderInputRef.current?.click();
    },
    [config.favorites, notify, refillLocalFavorite, reportTruncatedScan]
  );

  const handleReconnectLocalFolder = useCallback(
    async (id: string) => {
      const nativePath = config.favorites.find((f) => f.id === id)?.nativePath;
      const ok = await restoreLocalFolder(id, true, nativePath);
      if (ok) {
        setCurrentSubpath('');
        notify('Folder access restored', 'success');
      } else {
        notify(
          NATIVE_SHELL
            ? 'Folder could not be read. Try "Choose folder again".'
            : 'Access was not granted. Try "Choose folder again".',
          'info'
        );
      }
    },
    [config.favorites, notify, restoreLocalFolder]
  );

  const handleFallbackFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const targetId = remountTargetRef.current;
      remountTargetRef.current = null;
      if (!files || files.length === 0) return;
      if (targetId && config.favorites.some((f) => f.id === targetId)) {
        const scanned = convertFileListToEntries(files, targetId);
        refillLocalFavorite(targetId, scanned.entries);
        reportTruncatedScan(scanned);
      } else {
        const id = `local_${Date.now()}`;
        const scanned = convertFileListToEntries(files, id);
        mountEntriesAsLocalFavorite(id, scanned.rootName, scanned.rootPath, scanned.entries);
        reportTruncatedScan(scanned);
      }
      e.target.value = '';
    },
    [config.favorites, mountEntriesAsLocalFavorite, refillLocalFavorite, reportTruncatedScan]
  );

  const handleCopyText = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify(`Copied ${label.toLowerCase()}`, 'success');
      } catch {
        notify(`Path: ${value}`, 'info');
      }
    },
    [notify]
  );

  const handleOpenNative = useCallback(
    async (entry: FileEntry) => {
      if (!entry.nativePath) return;
      try {
        await openNativePath(entry.nativePath);
      } catch (err) {
        notify(`Could not open "${entry.name}": ${String(err)}`, 'error');
      }
    },
    [notify]
  );

  const handleRevealNative = useCallback(
    async (entry: FileEntry) => {
      if (!entry.nativePath) return;
      try {
        await revealNativePath(entry.nativePath);
      } catch (err) {
        notify(`Could not show "${entry.name}": ${String(err)}`, 'error');
      }
    },
    [notify]
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('all');
    setRecency('all');
  }, []);

  const handleResetWorkspace = useCallback(() => {
    clearSavedConfig();
    setLocalFolders({});
    setLocalStatus({});
    handlesRef.current = {};
    checkedLocalIdsRef.current = new Set();
    void clearHandles();
    syncNativeAccess([]);
    setConfig(DEFAULT_APP_CONFIG);
    const home = getInitialFolder(DEFAULT_APP_CONFIG);
    const startup = getStartupSort(DEFAULT_APP_CONFIG, home);
    setActiveFolderId(home.id);
    setCurrentSubpath('');
    setSearchQuery('');
    setFilterType('all');
    setRecency('all');
    setSortBy(startup.sortBy);
    setSortOrder(startup.sortOrder);
    setFoldersFirst(startup.foldersFirst);
    notify('Workspace reset to default demo state', 'info');
  }, [notify]);

  const handleImportConfig = useCallback((nextConfig: AppConfig) => {
    // Forget runtime data and stored handles of local favorites the imported config drops
    const keptIds = new Set(nextConfig.favorites.map((f) => f.id));
    const droppedLocalIds = config.favorites
      .filter((f) => f.sourceType === 'local' && !keptIds.has(f.id))
      .map((f) => f.id);
    if (droppedLocalIds.length > 0) {
      const dropFrom = <T,>(prev: Record<string, T>) => {
        const next = { ...prev };
        droppedLocalIds.forEach((id) => delete next[id]);
        return next;
      };
      setLocalFolders(dropFrom);
      setLocalStatus(dropFrom);
      droppedLocalIds.forEach((id) => {
        delete handlesRef.current[id];
        checkedLocalIdsRef.current.delete(id);
        void deleteHandle(id);
      });
    }
    syncNativeAccess(nextConfig.favorites);
    setConfig(nextConfig);
    const home = getInitialFolder(nextConfig);
    const startup = getStartupSort(nextConfig, home);
    setActiveFolderId(home.id);
    setCurrentSubpath('');
    setSortBy(startup.sortBy);
    setSortOrder(startup.sortOrder);
    setFoldersFirst(startup.foldersFirst);
  }, [config.favorites]);

  const handleDoubleClickRow = useCallback(
    (entry: FileEntry) => {
      if (entry.isFolder) {
        handleOpenFolderHere(entry.entryPath);
      } else {
        setSelectedId(entry.id);
        setPreviewOpen(true);
      }
    },
    [handleOpenFolderHere]
  );

  // Global keyboard shortcuts & arrow-key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen) return;

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      // Ctrl+K or Ctrl+Space: Focus search bar immediately
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'Space')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Slash key when not typing
      if (e.key === '/' && !isInputFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Alt + 1..9: Jump to pinned favorite folder
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (config.favorites[idx]) {
          e.preventDefault();
          handleSelectFolder(config.favorites[idx].id);
        }
        return;
      }

      // Escape: Close context menu or clear search
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
        if (isInputFocused) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // ArrowDown / ArrowUp: Navigate rows seamlessly even from search bar
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (visibleEntries.length === 0) return;
        e.preventDefault();
        const currentIndex = visibleEntries.findIndex((item) => item.id === selectedId);
        let nextIndex = 0;
        if (currentIndex === -1) {
          nextIndex = e.key === 'ArrowDown' ? 0 : visibleEntries.length - 1;
        } else if (e.key === 'ArrowDown') {
          nextIndex = Math.min(visibleEntries.length - 1, currentIndex + 1);
        } else {
          nextIndex = Math.max(0, currentIndex - 1);
        }
        setSelectedId(visibleEntries[nextIndex].id);
        return;
      }

      // Ctrl+Enter: open the selected file with its default app (desktop shell only)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && selectedEntry) {
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (selectedEntry.nativePath && !selectedEntry.isFolder) {
          void handleOpenNative(selectedEntry);
        }
        return;
      }

      // Enter: Open selected folder or preview file
      if (e.key === 'Enter' && selectedEntry) {
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        handleDoubleClickRow(selectedEntry);
        return;
      }

      // Backspace: Go up a folder when not editing input
      if (e.key === 'Backspace' && !isInputFocused && currentSubpath) {
        e.preventDefault();
        handleNavigateUp();
        return;
      }

      // Space: Toggle quick preview when not typing or pressing a button
      if (
        e.code === 'Space' &&
        !isInputFocused &&
        target?.tagName !== 'BUTTON' &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        setPreviewOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    config.favorites,
    contextMenu,
    currentSubpath,
    handleDoubleClickRow,
    handleNavigateUp,
    handleOpenNative,
    handleSelectFolder,
    searchQuery,
    selectedEntry,
    selectedId,
    settingsOpen,
    visibleEntries,
  ]);

  const contextMenuFolderAlreadyFavorited = useMemo(() => {
    if (!contextMenu || !contextMenu.entry.isFolder) return false;
    return config.favorites.some(
      (f) => f.path.toLowerCase() === contextMenu.entry.fullPath.toLowerCase()
    );
  }, [config.favorites, contextMenu]);

  const activeLocalStatus: LocalFolderStatus =
    activeFolder.sourceType === 'local' ? localStatus[activeFolder.id] ?? 'loading' : 'ready';
  const activeFolderUnavailable =
    activeLocalStatus === 'ready'
      ? null
      : {
          status: activeLocalStatus,
          folderName: activeFolder.name,
          onReconnect: () => void handleReconnectLocalFolder(activeFolder.id),
          onChooseAgain: () => void handleChooseLocalFolderAgain(activeFolder.id),
        };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-[#1A1A1A] dark:text-[#F3F3F3]">
      {/* Hidden fallback directory picker input for iframes & cross-browser local folder support */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleFallbackFolderInput}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <TopBar
        favorites={config.favorites}
        activeFolder={activeFolder}
        defaultFolderId={config.defaultFolderId}
        currentSubpath={currentSubpath}
        searchQuery={searchQuery}
        searchInputRef={searchInputRef}
        isCurrentLocationFavorited={currentLocationStatus.isFavorited}
        isCurrentLocationDefault={currentLocationStatus.isDefault}
        previewOpen={previewOpen}
        theme={config.theme}
        onSelectFolder={handleSelectFolder}
        onNavigateSubpath={(subpath) => setCurrentSubpath(subpath)}
        onSearchChange={setSearchQuery}
        onToggleFavoriteCurrent={handleToggleFavoriteCurrent}
        onSetCurrentAsDefault={handleSetCurrentAsDefault}
        onAddLocalFolder={handleAddLocalFolder}
        onTogglePreview={() => setPreviewOpen((prev) => !prev)}
        onToggleTheme={() =>
          setConfig((prev) => ({
            ...prev,
            theme: prev.theme === 'light' ? 'dark' : 'light',
          }))
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar
          favorites={config.favorites}
          activeFolderId={activeFolder.id}
          defaultFolderId={config.defaultFolderId}
          filterType={filterType}
          categoryCounts={categoryCounts}
          recency={recency}
          includeSubfolders={includeSubfolders}
          showHiddenFiles={config.showHiddenFiles}
          foldersFirst={foldersFirst}
          onSelectFolder={handleSelectFolder}
          onAddLocalFolder={handleAddLocalFolder}
          onRemoveFavorite={handleRemoveFavorite}
          onFilterTypeChange={setFilterType}
          onRecencyChange={setRecency}
          onToggleIncludeSubfolders={handleToggleIncludeSubfolders}
          onToggleShowHidden={() =>
            setConfig((prev) => ({
              ...prev,
              showHiddenFiles: !prev.showHiddenFiles,
            }))
          }
          onToggleFoldersFirst={handleToggleFoldersFirst}
        />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white dark:bg-[#272727]">
          <SortToolbar
            sortBy={sortBy}
            sortOrder={sortOrder}
            startupBehavior={config.startupBehavior}
            includeSubfolders={includeSubfolders}
            totalVisible={visibleEntries.length}
            closeMatches={closeMatches}
            hasActiveFilters={hasActiveFilters}
            onQuickSort={handleQuickSort}
            onToggleIncludeSubfolders={handleToggleIncludeSubfolders}
            onResetFilters={handleResetFilters}
          />

          <FileGrid
            entries={visibleEntries}
            selectedId={selectedId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            currentSubpath={currentSubpath}
            hasActiveFilters={hasActiveFilters}
            onSortColumn={handleSortColumn}
            onSelectRow={(entry) => setSelectedId(entry.id)}
            onDoubleClickRow={handleDoubleClickRow}
            onContextMenuRow={(e, entry) => {
              e.preventDefault();
              setSelectedId(entry.id);
              setContextMenu({ x: e.clientX, y: e.clientY, entry });
            }}
            onNavigateUp={handleNavigateUp}
            onResetFilters={handleResetFilters}
            unavailable={activeFolderUnavailable}
          />
        </main>

        {previewOpen && (
          <PreviewPane
            entry={selectedEntry}
            allEntriesInRoot={activeRootEntries}
            onClose={() => setPreviewOpen(false)}
            onOpenFolderHere={handleOpenFolderHere}
            onToggleFavoriteFolder={handleToggleFavoriteSubfolder}
            onSetFolderAsDefault={handleSetFolderAsDefault}
            onCopyPath={(path) => handleCopyText(path, 'Full path')}
            onOpenNative={(entry) => void handleOpenNative(entry)}
            onRevealNative={(entry) => void handleRevealNative(entry)}
          />
        )}
      </div>

      <ContextMenu
        menu={contextMenu}
        isFolderAlreadyFavorited={contextMenuFolderAlreadyFavorited}
        onClose={() => setContextMenu(null)}
        onOpenFolderHere={handleOpenFolderHere}
        onToggleFavoriteFolder={handleToggleFavoriteSubfolder}
        onSetFolderAsDefault={handleSetFolderAsDefault}
        onPreviewFile={() => setPreviewOpen(true)}
        onOpenContainingFolder={(entry) => {
          setCurrentSubpath(entry.parentPath);
          if (includeSubfolders) {
            setScopeOverride({ folderId: activeFolder.id, subpath: entry.parentPath });
          }
          setSelectedId(entry.id);
          const folderName = entry.parentPath.split('/').pop() || activeFolder.name;
          notify(`Showing "${folderName}" only`, 'info');
        }}
        onCopyText={handleCopyText}
        onOpenNative={(entry) => void handleOpenNative(entry)}
        onRevealNative={(entry) => void handleRevealNative(entry)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        config={config}
        onClose={() => setSettingsOpen(false)}
        onUpdateConfig={setConfig}
        onImportConfig={handleImportConfig}
        onResetWorkspace={handleResetWorkspace}
        onNotify={notify}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  ContextMenuState,
  FavoriteFolder,
  FileEntry,
  FilterType,
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
  filterAndSortEntries,
  scopeEntriesToSubpath,
  tryPickDirectoryWithNativeApi,
} from './services/fileProvider';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { SortToolbar } from './components/SortToolbar';
import { FileGrid } from './components/FileGrid';
import { PreviewPane } from './components/PreviewPane';
import { ContextMenu } from './components/ContextMenu';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer } from './components/ToastContainer';

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

  const [config, setConfig] = useState<AppConfig>(() => loadSavedConfig());
  const initialFolder = getInitialFolder(config);
  const initialSort = getStartupSort(config, initialFolder);

  const [activeFolderId, setActiveFolderId] = useState<string>(initialFolder.id);
  const [currentSubpath, setCurrentSubpath] = useState<string>('');
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

  const visibleEntries = useMemo(
    () =>
      filterAndSortEntries({
        entries: activeRootEntries,
        currentSubpath,
        includeSubfolders: config.includeSubfolders,
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
      config.includeSubfolders,
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
        config.includeSubfolders,
        config.showHiddenFiles,
        recency,
        searchQuery
      ),
    [
      activeRootEntries,
      currentSubpath,
      config.includeSubfolders,
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
      const fullPath = cleanSub
        ? `${activeFolder.path}\\${cleanSub.split('/').join('\\')}`
        : activeFolder.path;
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
            };
          }
        );
        setLocalFolders((prev) => ({ ...prev, [id]: scoped }));
        const newFav: FavoriteFolder = {
          id,
          name,
          path: fullPath,
          sortBy,
          sortOrder,
          foldersFirst,
          sourceType: 'local',
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

      setConfig((prev) => ({
        ...prev,
        favorites: prev.favorites.filter((f) => f.id !== folderId),
      }));

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
    (rootName: string, rootPath: string, entries: FileEntry[]) => {
      const id = `local_${Date.now()}`;
      setLocalFolders((prev) => ({ ...prev, [id]: entries }));

      const newFav: FavoriteFolder = {
        id,
        name: rootName,
        path: rootPath,
        sortBy: config.globalSortBy,
        sortOrder: config.globalSortOrder,
        foldersFirst: true,
        sourceType: 'local',
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
    [config.globalSortBy, config.globalSortOrder, notify]
  );

  const handleAddLocalFolder = useCallback(async () => {
    const idPrefix = `local_${Date.now()}`;
    const result = await tryPickDirectoryWithNativeApi(idPrefix);
    if (result.status === 'picked') {
      mountEntriesAsLocalFavorite(result.rootName, result.rootPath, result.entries);
      return;
    }
    if (result.status === 'cancelled') {
      return;
    }
    // Fallback to standard directory input (works reliably inside iframes and all browsers)
    folderInputRef.current?.click();
  }, [mountEntriesAsLocalFavorite]);

  const handleFallbackFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const { rootName, rootPath, entries } = convertFileListToEntries(
        files,
        `local_${Date.now()}`
      );
      mountEntriesAsLocalFavorite(rootName, rootPath, entries);
      e.target.value = '';
    },
    [mountEntriesAsLocalFavorite]
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

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('all');
    setRecency('all');
  }, []);

  const handleResetWorkspace = useCallback(() => {
    clearSavedConfig();
    setLocalFolders({});
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
    setConfig(nextConfig);
    const home = getInitialFolder(nextConfig);
    const startup = getStartupSort(nextConfig, home);
    setActiveFolderId(home.id);
    setCurrentSubpath('');
    setSortBy(startup.sortBy);
    setSortOrder(startup.sortOrder);
    setFoldersFirst(startup.foldersFirst);
  }, []);

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
          includeSubfolders={config.includeSubfolders}
          showHiddenFiles={config.showHiddenFiles}
          foldersFirst={foldersFirst}
          onSelectFolder={handleSelectFolder}
          onAddLocalFolder={handleAddLocalFolder}
          onRemoveFavorite={handleRemoveFavorite}
          onFilterTypeChange={setFilterType}
          onRecencyChange={setRecency}
          onToggleIncludeSubfolders={() =>
            setConfig((prev) => ({
              ...prev,
              includeSubfolders: !prev.includeSubfolders,
            }))
          }
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
            includeSubfolders={config.includeSubfolders}
            totalVisible={visibleEntries.length}
            hasActiveFilters={hasActiveFilters}
            onQuickSort={handleQuickSort}
            onToggleIncludeSubfolders={() =>
              setConfig((prev) => ({
                ...prev,
                includeSubfolders: !prev.includeSubfolders,
              }))
            }
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
        onOpenContainingFolder={(parentPath) => {
          setCurrentSubpath(parentPath);
          setConfig((prev) => ({ ...prev, includeSubfolders: false }));
          notify('Opened containing folder', 'info');
        }}
        onCopyText={handleCopyText}
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

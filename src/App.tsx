import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppConfig,
  ContextMenuState,
  FileEntry,
  FilterType,
  LocalFolderStatus,
  RecencyFilter,
} from './types/foldary';
import { buildDemoWorkspace, DEFAULT_APP_CONFIG } from './data/demoWorkspace';
import { clearSavedConfig } from './services/configStorage';
import {
  computeCategoryCounts,
  filterAndSortEntriesWithInfo,
  rebaseEntriesToSubpath,
} from './services/fileProvider';
import { syncNativeAccess } from './services/nativeBridge';
import { getInitialFolder } from './services/startup';
import { useToasts } from './hooks/useToasts';
import { useAppConfig } from './hooks/useAppConfig';
import { useFolderNavigation } from './hooks/useFolderNavigation';
import { useLocalFolders } from './hooks/useLocalFolders';
import { useFolderMounting } from './hooks/useFolderMounting';
import { useFavorites } from './hooks/useFavorites';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFileActions } from './hooks/useFileActions';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { SortToolbar } from './components/SortToolbar';
import { FileGrid } from './components/FileGrid';
import { PreviewPane } from './components/PreviewPane';
import { ContextMenu } from './components/ContextMenu';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer } from './components/ToastContainer';

export default function App() {
  const [demoWorkspace] = useState<Record<string, FileEntry[]>>(() => buildDemoWorkspace());
  const { toasts, notify } = useToasts();
  const fileActions = useFileActions(notify);
  const [config, setConfig] = useAppConfig();
  const navigation = useFolderNavigation({ config, setConfig });
  const local = useLocalFolders(config.favorites, notify);
  const { activeFolder, currentSubpath, setCurrentSubpath, sortBy, sortOrder, foldersFirst } =
    navigation;

  // Session-only "this folder only" scope set by Open Containing Folder. Never saved; it
  // ends as soon as the active folder or subpath changes.
  const [scopeOverride, setScopeOverride] = useState<{ folderId: string; subpath: string } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [recency, setRecency] = useState<RecencyFilter>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Resolve entries for the currently active root folder (including pinned demo subfolders)
  const activeRootEntries = useMemo<FileEntry[]>(() => {
    if (activeFolder.sourceType === 'local') {
      return local.localFolders[activeFolder.id] ?? [];
    }
    if (activeFolder.baseDemoId && activeFolder.subpath) {
      return rebaseEntriesToSubpath(
        demoWorkspace[activeFolder.baseDemoId] ?? [],
        activeFolder.subpath
      );
    }
    return demoWorkspace[activeFolder.id] ?? [];
  }, [activeFolder, demoWorkspace, local.localFolders]);

  const mounting = useFolderMounting({ config, setConfig, local, navigation, notify });
  const favoriteActions = useFavorites({
    config,
    setConfig,
    navigation,
    activeRootEntries,
    local,
    notify,
  });

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
  }, [includeSubfolders, setConfig]);

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
    [activeRootEntries, currentSubpath, includeSubfolders, config.showHiddenFiles, recency, searchQuery]
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

  const { selectFolder, openFolder } = navigation;
  const handleSelectFolder = useCallback(
    (folderId: string) => {
      if (selectFolder(folderId)) setContextMenu(null);
    },
    [selectFolder]
  );

  const handleOpenFolderHere = useCallback(
    (entryPath: string) => {
      setCurrentSubpath(entryPath);
      setSearchQuery('');
    },
    [setCurrentSubpath]
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('all');
    setRecency('all');
  }, []);

  const { forget, forgetAll } = local;
  const handleResetWorkspace = useCallback(() => {
    clearSavedConfig();
    forgetAll();
    syncNativeAccess([]);
    setConfig(DEFAULT_APP_CONFIG);
    openFolder(getInitialFolder(DEFAULT_APP_CONFIG), DEFAULT_APP_CONFIG);
    handleResetFilters();
    notify('Workspace reset to default demo state', 'info');
  }, [forgetAll, handleResetFilters, notify, openFolder, setConfig]);

  const handleImportConfig = useCallback(
    (nextConfig: AppConfig) => {
      // Forget runtime data and stored handles of local favorites the imported config drops
      const keptIds = new Set(nextConfig.favorites.map((f) => f.id));
      forget(
        config.favorites
          .filter((f) => f.sourceType === 'local' && !keptIds.has(f.id))
          .map((f) => f.id)
      );
      syncNativeAccess(nextConfig.favorites);
      setConfig(nextConfig);
      openFolder(getInitialFolder(nextConfig), nextConfig);
    },
    [config.favorites, forget, openFolder, setConfig]
  );

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

  const clearSearch = useCallback(() => setSearchQuery(''), []);
  const togglePreview = useCallback(() => setPreviewOpen((prev) => !prev), []);
  useKeyboardShortcuts({
    enabled: !settingsOpen && !contextMenu,
    searchInputRef,
    favorites: config.favorites,
    searchQuery,
    visibleEntries,
    selectedId,
    selectedEntry,
    currentSubpath,
    onSelectFolder: handleSelectFolder,
    onClearSearch: clearSearch,
    onSelectEntry: setSelectedId,
    onOpenEntry: handleDoubleClickRow,
    onOpenNative: fileActions.openNative,
    onNavigateUp: navigation.navigateUp,
    onTogglePreview: togglePreview,
  });

  // Accessible name for the file grid: the folder currently on screen
  const gridLabel = `Files in ${
    currentSubpath ? currentSubpath.split('/').pop() || activeFolder.name : activeFolder.name
  }`;

  const contextMenuFolderAlreadyFavorited = useMemo(() => {
    if (!contextMenu || !contextMenu.entry.isFolder) return false;
    return config.favorites.some(
      (f) => f.path.toLowerCase() === contextMenu.entry.fullPath.toLowerCase()
    );
  }, [config.favorites, contextMenu]);

  const activeLocalStatus: LocalFolderStatus =
    activeFolder.sourceType === 'local'
      ? local.localStatus[activeFolder.id] ?? 'loading'
      : 'ready';
  const activeFolderUnavailable =
    activeLocalStatus === 'ready'
      ? null
      : {
          status: activeLocalStatus,
          folderName: activeFolder.name,
          onReconnect: () => void mounting.reconnectLocalFolder(activeFolder.id),
          onChooseAgain: () => void mounting.chooseLocalFolderAgain(activeFolder.id),
        };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-[#1A1A1A] dark:text-[#F3F3F3]">
      {/* Hidden fallback directory picker input for iframes & cross-browser local folder support */}
      <input
        ref={mounting.folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={mounting.handleFallbackFolderInput}
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
        isCurrentLocationFavorited={favoriteActions.currentLocation.isFavorited}
        isCurrentLocationDefault={favoriteActions.currentLocation.isDefault}
        previewOpen={previewOpen}
        theme={config.theme}
        onSelectFolder={handleSelectFolder}
        onNavigateSubpath={setCurrentSubpath}
        onSearchChange={setSearchQuery}
        onToggleFavoriteCurrent={favoriteActions.toggleFavoriteCurrent}
        onSetCurrentAsDefault={favoriteActions.setCurrentAsDefault}
        onAddLocalFolder={mounting.addLocalFolder}
        onTogglePreview={togglePreview}
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
          onAddLocalFolder={mounting.addLocalFolder}
          onRemoveFavorite={favoriteActions.removeFavorite}
          onFilterTypeChange={setFilterType}
          onRecencyChange={setRecency}
          onToggleIncludeSubfolders={handleToggleIncludeSubfolders}
          onToggleShowHidden={() =>
            setConfig((prev) => ({
              ...prev,
              showHiddenFiles: !prev.showHiddenFiles,
            }))
          }
          onToggleFoldersFirst={navigation.toggleFoldersFirst}
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
            onQuickSort={navigation.quickSort}
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
            onSortColumn={navigation.sortByColumn}
            onSelectRow={(entry) => setSelectedId(entry.id)}
            onDoubleClickRow={handleDoubleClickRow}
            onContextMenuRow={(position, entry) => {
              setSelectedId(entry.id);
              setContextMenu({ ...position, entry });
            }}
            gridLabel={gridLabel}
            onNavigateUp={navigation.navigateUp}
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
            onToggleFavoriteFolder={favoriteActions.toggleFavoriteSubfolder}
            onSetFolderAsDefault={favoriteActions.setFolderAsDefault}
            onCopyPath={(path) => fileActions.copyText(path, 'Full path')}
            onOpenNative={fileActions.openNative}
            onRevealNative={fileActions.revealNative}
          />
        )}
      </div>

      <ContextMenu
        menu={contextMenu}
        isFolderAlreadyFavorited={contextMenuFolderAlreadyFavorited}
        onClose={() => setContextMenu(null)}
        onOpenFolderHere={handleOpenFolderHere}
        onToggleFavoriteFolder={favoriteActions.toggleFavoriteSubfolder}
        onSetFolderAsDefault={favoriteActions.setFolderAsDefault}
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
        onCopyText={fileActions.copyText}
        onOpenNative={fileActions.openNative}
        onRevealNative={fileActions.revealNative}
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

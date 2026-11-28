import { ChangeEvent, Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { AppConfig, FavoriteFolder, FileEntry } from '../types/foldary';
import {
  convertFileListToEntries,
  LocalDirectoryHandle,
  tryPickDirectoryWithNativeApi,
} from '../services/fileProvider';
import { pickNativeFolder, syncNativeAccess } from '../services/nativeBridge';
import { FolderNavigation } from './useFolderNavigation';
import { LocalFolders, NATIVE_SHELL } from './useLocalFolders';
import { Notify } from './useToasts';

interface FolderMountingOptions {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  local: LocalFolders;
  navigation: FolderNavigation;
  notify: Notify;
}

const itemCount = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/**
 * Adding a local folder, picking a missing one again, and asking for access again.
 * Uses the desktop shell's picker, the File System Access API, or the hidden
 * <input webkitdirectory> fallback (`folderInputRef`), in that order.
 */
export function useFolderMounting({
  config,
  setConfig,
  local,
  navigation,
  notify,
}: FolderMountingOptions) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  // Favorite id the <input webkitdirectory> fallback should refill instead of creating a new favorite
  const remountTargetRef = useRef<string | null>(null);

  const { storeEntries, reportTruncatedScan, restoreLocalFolder } = local;
  const { goToFolder, setCurrentSubpath } = navigation;

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
      storeEntries(id, entries, handle);
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
      setConfig((prev) => ({ ...prev, favorites: [...prev.favorites, newFav] }));
      goToFolder(id, newFav);
      notify(`Mounted "${rootName}" (${itemCount(entries.length)})`, 'success');
    },
    [config.globalSortBy, config.globalSortOrder, goToFolder, notify, setConfig, storeEntries]
  );

  // Refill an existing local favorite (same id, sort and Default status) after a reload
  const refillLocalFavorite = useCallback(
    (id: string, entries: FileEntry[], handle?: LocalDirectoryHandle) => {
      storeEntries(id, entries, handle);
      setCurrentSubpath('');
      const name = config.favorites.find((f) => f.id === id)?.name ?? 'folder';
      notify(`Reconnected "${name}" (${itemCount(entries.length)})`, 'success');
    },
    [config.favorites, notify, setCurrentSubpath, storeEntries]
  );

  const addLocalFolder = useCallback(async () => {
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
      mountEntriesAsLocalFavorite(id, result.rootName, result.rootPath, result.entries, result.handle);
      reportTruncatedScan(result);
      return;
    }
    if (result.status === 'cancelled') return;
    // Fallback to standard directory input (works reliably inside iframes and all browsers)
    remountTargetRef.current = null;
    folderInputRef.current?.click();
  }, [mountEntriesAsLocalFavorite, notify, reportTruncatedScan]);

  const chooseLocalFolderAgain = useCallback(
    async (id: string) => {
      if (NATIVE_SHELL) {
        try {
          const picked = await pickNativeFolder(id);
          if (!picked) return;
          const repoint = (f: FavoriteFolder) =>
            f.id === id ? { ...f, nativePath: picked.rootPath, path: picked.rootPath } : f;
          setConfig((prev) => ({ ...prev, favorites: prev.favorites.map(repoint) }));
          syncNativeAccess(config.favorites.map(repoint));
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
    [config.favorites, notify, refillLocalFavorite, reportTruncatedScan, setConfig]
  );

  const reconnectLocalFolder = useCallback(
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
    [config.favorites, notify, restoreLocalFolder, setCurrentSubpath]
  );

  const handleFallbackFolderInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
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

  return {
    folderInputRef,
    addLocalFolder,
    chooseLocalFolderAgain,
    reconnectLocalFolder,
    handleFallbackFolderInput,
  };
}

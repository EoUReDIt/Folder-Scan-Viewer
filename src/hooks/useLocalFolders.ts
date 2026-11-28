import { useCallback, useEffect, useRef, useState } from 'react';
import { FavoriteFolder, FileEntry, LocalFolderStatus } from '../types/foldary';
import {
  getHandlePermission,
  LocalDirectoryHandle,
  scanDirectoryHandle,
} from '../services/fileProvider';
import { clearHandles, deleteHandle, loadHandle, saveHandle } from '../services/handleStore';
import { isNativeShell, scanNativeFolder } from '../services/nativeBridge';
import { Notify } from './useToasts';

// Running inside the Tauri desktop shell: folders come from Rust commands, not browser APIs
export const NATIVE_SHELL = isNativeShell();

interface ScanResult {
  rootName: string;
  entries: FileEntry[];
  truncated: boolean;
}

/** Drops `ids` from a record, returning the same object when none were present. */
function omitIds<T>(prev: Record<string, T>, ids: string[]): Record<string, T> {
  if (!ids.some((id) => id in prev)) return prev;
  const next = { ...prev };
  ids.forEach((id) => delete next[id]);
  return next;
}

/**
 * Runtime store for local (on-disk) favorites: their scanned entries, availability status
 * and directory handles. Nothing here is saved in config.json.
 */
export function useLocalFolders(favorites: FavoriteFolder[], notify: Notify) {
  const [localFolders, setLocalFolders] = useState<Record<string, FileEntry[]>>({});
  // Runtime-only availability of each local favorite (not persisted)
  const [localStatus, setLocalStatus] = useState<Record<string, LocalFolderStatus>>({});
  // Directory handles for local favorites mounted via the File System Access API
  const handlesRef = useRef<Record<string, LocalDirectoryHandle>>({});
  // Local favorites whose availability check has already started (guards StrictMode double effects)
  const checkedLocalIdsRef = useRef<Set<string>>(new Set());

  const setFolderStatus = useCallback((id: string, status: LocalFolderStatus) => {
    setLocalStatus((prev) => ({ ...prev, [id]: status }));
  }, []);

  // Warns when a scan stopped at SCAN_LIMITS.maxEntries (browser and desktop alike)
  const reportTruncatedScan = useCallback(
    (scan: ScanResult) => {
      if (scan.truncated) {
        notify(`"${scan.rootName}" is large: only the first ${scan.entries.length} items are listed`, 'info');
      }
    },
    [notify]
  );

  /** Keeps a directory handle in memory and in IndexedDB for later sessions. */
  const rememberHandle = useCallback((id: string, handle: LocalDirectoryHandle) => {
    handlesRef.current[id] = handle;
    void saveHandle(id, handle);
  }, []);

  const getHandle = useCallback(
    (id: string): LocalDirectoryHandle | undefined => handlesRef.current[id],
    []
  );

  /** Stores freshly scanned entries for a favorite and marks it ready. */
  const storeEntries = useCallback(
    (id: string, entries: FileEntry[], handle?: LocalDirectoryHandle) => {
      setLocalFolders((prev) => ({ ...prev, [id]: entries }));
      setFolderStatus(id, 'ready');
      checkedLocalIdsRef.current.add(id);
      if (handle) rememberHandle(id, handle);
    },
    [rememberHandle, setFolderStatus]
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

  // Restore local favorites that have no loaded contents yet (startup and config import).
  // Favorites mounted in this session are registered as checked before they reach config.
  useEffect(() => {
    favorites.forEach((fav) => {
      if (fav.sourceType !== 'local') return;
      if (checkedLocalIdsRef.current.has(fav.id)) return;
      checkedLocalIdsRef.current.add(fav.id);
      setFolderStatus(fav.id, 'loading');
      void restoreLocalFolder(fav.id, false, fav.nativePath);
    });
  }, [favorites, restoreLocalFolder, setFolderStatus]);

  /** Forgets runtime data and stored handles, so removed folders don't linger in memory or IndexedDB. */
  const forget = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setLocalFolders((prev) => omitIds(prev, ids));
    setLocalStatus((prev) => omitIds(prev, ids));
    ids.forEach((id) => {
      delete handlesRef.current[id];
      checkedLocalIdsRef.current.delete(id);
      void deleteHandle(id);
    });
  }, []);

  const forgetAll = useCallback(() => {
    setLocalFolders({});
    setLocalStatus({});
    handlesRef.current = {};
    checkedLocalIdsRef.current = new Set();
    void clearHandles();
  }, []);

  return {
    localFolders,
    localStatus,
    storeEntries,
    rememberHandle,
    getHandle,
    restoreLocalFolder,
    reportTruncatedScan,
    forget,
    forgetAll,
  };
}

export type LocalFolders = ReturnType<typeof useLocalFolders>;

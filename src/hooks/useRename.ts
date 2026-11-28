import { Dispatch, SetStateAction, useCallback } from 'react';
import { AppConfig, FavoriteFolder, FileEntry, LocalFolderStatus } from '../types/foldary';
import { getHandlePermission, resolveSubdirectoryHandle } from '../services/fileProvider';
import { joinNativePath, renameNativePath, syncNativeAccess } from '../services/nativeBridge';
import {
  PathChange,
  rebaseFavoritesAfterRename,
  rebasePath,
  renameHandleEntry,
  renameLastSegment,
} from '../services/rename';
import { FolderNavigation } from './useFolderNavigation';
import { LocalFolders, NATIVE_SHELL } from './useLocalFolders';
import { Notify } from './useToasts';

interface RenameOptions {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  navigation: FolderNavigation;
  /** Entries of the open favorite, used to check new names against their neighbours. */
  activeRootEntries: FileEntry[];
  activeLocalStatus: LocalFolderStatus;
  local: LocalFolders;
  notify: Notify;
}

export type RenameResult = { ok: true; entryPath: string } | { ok: false; error: string };

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'The item could not be renamed';

/** True when `child` lies strictly inside `parent` (letter case ignored). */
const isInside = (child: string, parent: string) => {
  const rebased = rebasePath(child, parent, '\u0000');
  return rebased !== null && rebased !== '\u0000';
};

/** Renaming pinned folders (display name) and files or folders on disk. */
export function useRename({
  config,
  setConfig,
  navigation,
  activeRootEntries,
  activeLocalStatus,
  local,
  notify,
}: RenameOptions) {
  const { activeFolder, currentSubpath, setCurrentSubpath } = navigation;
  const { getHandle, rememberHandle, restoreLocalFolder } = local;

  /** Why items in the open folder can't be renamed on disk, or null when they can. */
  const renameBlockedReason = useCallback((): string | null => {
    if (activeFolder.sourceType !== 'local') return 'Demo files can’t be renamed. Open a folder from your computer';
    if (activeLocalStatus !== 'ready') return 'Reconnect this folder before renaming';
    if (NATIVE_SHELL) return activeFolder.nativePath ? null : 'Choose this folder again to rename items in it';
    return getHandle(activeFolder.id)
      ? null
      : 'This folder was opened as a read-only copy. Use Chrome or Edge, or the desktop app, to rename';
  }, [activeFolder, activeLocalStatus, getHandle]);

  /** Names of the other items next to `entry`, for the duplicate check. */
  const siblingNames = useCallback(
    (entry: FileEntry) =>
      activeRootEntries
        .filter((e) => e.parentPath === entry.parentPath && e.id !== entry.id)
        .map((e) => e.name),
    [activeRootEntries]
  );

  const renameFavorite = useCallback(
    (favorite: FavoriteFolder, name: string) => {
      const trimmed = name.trim();
      setConfig((prev) => ({
        ...prev,
        favorites: prev.favorites.map((f) => (f.id === favorite.id ? { ...f, name: trimmed } : f)),
      }));
      notify(`Renamed "${favorite.name}" to "${trimmed}"`, 'success');
    },
    [notify, setConfig]
  );

  const renameEntry = useCallback(
    async (entry: FileEntry, newName: string): Promise<RenameResult> => {
      const blocked = renameBlockedReason();
      if (blocked) return { ok: false, error: blocked };
      const rootHandle = NATIVE_SHELL ? undefined : getHandle(activeFolder.id);
      try {
        if (NATIVE_SHELL) {
          if (!entry.nativePath) return { ok: false, error: 'This item has no path on disk' };
          await renameNativePath(entry.nativePath, newName);
        } else {
          if (!rootHandle) return { ok: false, error: 'This folder is not connected' };
          // Asked during the Rename click, so the browser can show its prompt
          const permission = await getHandlePermission(rootHandle, { request: true, mode: 'readwrite' });
          if (permission !== 'granted') {
            return { ok: false, error: 'Foldary needs permission to change files in this folder' };
          }
          await renameHandleEntry(rootHandle, entry.entryPath, newName, entry.isFolder);
        }
      } catch (err) {
        return { ok: false, error: messageOf(err) };
      }

      const newEntryPath = renameLastSegment(entry.entryPath, newName);
      const itemPaths = [entry.fullPath, joinNativePath(activeFolder.path, entry.entryPath)];
      if (entry.nativePath) itemPaths.push(entry.nativePath);
      const changes: PathChange[] = [...new Set(itemPaths)].map((from) => ({
        from,
        to: renameLastSegment(from, newName),
      }));

      // Other local favorites whose listing includes the item: ancestors, and for a folder
      // the favorites inside it, whose paths move with it
      const favorites = config.favorites;
      const rebased = entry.isFolder
        ? rebaseFavoritesAfterRename(favorites, changes, entry.name, newName)
        : favorites;
      const toRescan = rebased.filter((fav, i) => {
        if (fav.sourceType !== 'local') return false;
        if (fav.id === activeFolder.id || fav !== favorites[i]) return true;
        const paths = [fav.path, fav.nativePath].filter((p): p is string => Boolean(p));
        return paths.some((p) => changes.some((c) => isInside(c.from, p)));
      });

      if (rebased !== favorites) {
        setConfig((prev) => ({
          ...prev,
          favorites: rebaseFavoritesAfterRename(prev.favorites, changes, entry.name, newName),
        }));
        syncNativeAccess(rebased);
      }

      // Stay in the renamed folder (or below it) if it is open
      if (entry.isFolder) {
        const sub = rebasePath(currentSubpath, entry.entryPath, newEntryPath);
        if (sub !== null) setCurrentSubpath(sub);
      }

      await Promise.all(
        toRescan.map(async (fav) => {
          const before = favorites.find((f) => f.id === fav.id);
          // Handles of favorites inside a renamed folder point at the old name: find them again
          if (rootHandle && before && before !== fav && fav.id !== activeFolder.id) {
            const change = changes.find((c) => rebasePath(before.path, c.from, c.to) !== null);
            const rest = change ? before.path.slice(change.from.length).replace(/^[\\/]+/, '') : '';
            const sub = [newEntryPath, ...rest.split(/[\\/]/)].filter(Boolean).join('/');
            const handle = await resolveSubdirectoryHandle(rootHandle, sub);
            if (handle) rememberHandle(fav.id, handle);
          }
          await restoreLocalFolder(fav.id, false, fav.nativePath);
        })
      );

      notify(`Renamed to "${newName}"`, 'success');
      return { ok: true, entryPath: newEntryPath };
    },
    [
      activeFolder,
      config.favorites,
      currentSubpath,
      getHandle,
      notify,
      rememberHandle,
      renameBlockedReason,
      restoreLocalFolder,
      setConfig,
      setCurrentSubpath,
    ]
  );

  return { renameBlockedReason, siblingNames, renameFavorite, renameEntry };
}

export type RenameActions = ReturnType<typeof useRename>;

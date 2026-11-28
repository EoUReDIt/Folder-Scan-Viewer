/**
 * Adapter for the Tauri desktop shell. Every disk operation goes through a Rust command
 * (src-tauri/src/lib.rs) that only accepts paths inside folders the user picked in the
 * OS dialog, so the WebView never gets general filesystem access.
 *
 * In a plain browser `isNativeShell()` is false and none of these are called.
 */
import { invoke } from '@tauri-apps/api/core';
import { FavoriteFolder, FileEntry } from '../types/foldary';
import { categorizeExtension, extractExtension } from './fileProvider';

interface NativeEntry {
  name: string;
  entryPath: string;
  isFolder: boolean;
  size: number;
  modifiedMs: number;
  hidden: boolean;
}

interface NativeScanResult {
  rootName: string;
  rootPath: string;
  entries: NativeEntry[];
  truncated: boolean;
}

export interface NativeScannedFolder {
  rootName: string;
  rootPath: string;
  entries: FileEntry[];
  truncated: boolean;
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Joins an absolute OS path and a forward-slash relative path with the path's own separator. */
export function joinNativePath(root: string, relative: string): string {
  const clean = relative.replace(/^\/+|\/+$/g, '');
  if (!clean) return root;
  // POSIX paths use '/', everything else (Windows, demo and browser paths) uses '\\'
  const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\';
  const base = root.endsWith(sep) ? root.slice(0, -1) : root;
  return `${base}${sep}${clean.split('/').join(sep)}`;
}

function toFileEntries(result: NativeScanResult, idPrefix: string): FileEntry[] {
  return result.entries.map((e, index) => {
    const slash = e.entryPath.lastIndexOf('/');
    const parentPath = slash === -1 ? '' : e.entryPath.slice(0, slash);
    const extension = e.isFolder ? '' : extractExtension(e.name);
    const nativePath = joinNativePath(result.rootPath, e.entryPath);
    return {
      id: `${idPrefix}_${e.isFolder ? 'dir' : 'file'}_${index}_${e.entryPath}`,
      name: e.name,
      isFolder: e.isFolder,
      extension,
      category: e.isFolder ? 'folder' : categorizeExtension(extension),
      relativePath: parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\',
      parentPath,
      entryPath: e.entryPath,
      fullPath: nativePath,
      dateModified: e.modifiedMs || 0,
      size: e.size,
      isHidden: e.hidden,
      nativePath,
    };
  });
}

function toScanned(result: NativeScanResult, idPrefix: string): NativeScannedFolder {
  return {
    rootName: result.rootName,
    rootPath: result.rootPath,
    entries: toFileEntries(result, idPrefix),
    truncated: result.truncated,
  };
}

/** Opens the OS folder dialog; resolves to null when the user cancels. */
export async function pickNativeFolder(idPrefix: string): Promise<NativeScannedFolder | null> {
  const result = await invoke<NativeScanResult | null>('pick_folder');
  return result ? toScanned(result, idPrefix) : null;
}

/** Rescans a folder the user picked earlier (or a subfolder of one). */
export async function scanNativeFolder(path: string, idPrefix: string): Promise<NativeScannedFolder> {
  return toScanned(await invoke<NativeScanResult>('scan_folder', { path }), idPrefix);
}

export async function readNativeTextSnippet(
  path: string,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  return invoke('read_text_snippet', { path, maxBytes });
}

export async function readNativeFileBytes(path: string, maxBytes: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>('read_file_bytes', { path, maxBytes });
}

/** Opens a file or folder with the OS default app. */
export async function openNativePath(path: string): Promise<void> {
  await invoke('open_path', { path });
}

/** Shows the item selected in File Explorer / Finder. */
export async function revealNativePath(path: string): Promise<void> {
  await invoke('reveal_path', { path });
}

/** Tells the shell which disk paths favorites still use, so it can forget the rest. */
export async function syncNativeFolders(keep: string[]): Promise<void> {
  await invoke('sync_folders', { keep });
}

/**
 * Tells the shell which picked folders the given favorites still use, so it can forget
 * the others. Does nothing in a plain browser; failures are ignored.
 */
export function syncNativeAccess(favorites: FavoriteFolder[]): void {
  if (!isNativeShell()) return;
  const keep = favorites.flatMap((f) => (f.nativePath ? [f.nativePath] : []));
  void syncNativeFolders(keep).catch(() => undefined);
}

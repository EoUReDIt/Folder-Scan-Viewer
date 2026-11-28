import {
  FileCategory,
  FileEntry,
  FilterType,
  RecencyFilter,
  SortField,
  SortOrder,
} from '../types/foldary';

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'rtf',
  'odt',
  'csv',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'ts',
  'tsx',
  'js',
  'jsx',
  'rs',
  'py',
  'cs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'sh',
  'sql',
  'log',
  'ini',
  'env',
  'local',
  'gitignore',
]);

const PICTURE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'bmp',
  'ico',
  'avif',
  'tiff',
  'tif',
  'heic',
  'psd',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'wmv',
  'flv',
  'm4v',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  'm4a',
  'wma',
  'opus',
  'aiff',
]);

const COMPRESSED_EXTENSIONS = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'zst',
  'cab',
  'iso',
  'lz',
  'lzma',
]);

const TEXT_READABLE_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'ts',
  'tsx',
  'js',
  'jsx',
  'rs',
  'py',
  'cs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'sh',
  'sql',
  'csv',
  'log',
  'ini',
  'env',
  'local',
  'gitignore',
  'svg',
]);

export function extractExtension(filename: string): string {
  if (filename.startsWith('.') && filename.indexOf('.', 1) === -1) {
    return filename.slice(1).toLowerCase();
  }
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function categorizeExtension(ext: string): FileCategory {
  const lower = ext.toLowerCase();
  if (DOCUMENT_EXTENSIONS.has(lower)) return 'document';
  if (PICTURE_EXTENSIONS.has(lower)) return 'picture';
  if (VIDEO_EXTENSIONS.has(lower)) return 'video';
  if (AUDIO_EXTENSIONS.has(lower)) return 'audio';
  if (COMPRESSED_EXTENSIONS.has(lower)) return 'compressed';
  return 'other';
}

export function isTextPreviewable(ext: string): boolean {
  return TEXT_READABLE_EXTENSIONS.has(ext.toLowerCase());
}

export function formatFileSize(bytes: number, isFolder = false): string {
  if (isFolder) return '--';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/** A `dateModified` of 0 means the source could not report a time. */
export function isUnknownDate(timestamp: number): boolean {
  return !timestamp;
}

/**
 * Dates each folder by the newest item inside it. Folders are visited deepest-first, so a
 * child folder is already rolled up when its parent reads it. Empty folders stay unknown (0).
 */
export function rollUpFolderDates(entries: FileEntry[]): void {
  const folders = new Map<string, FileEntry>();
  entries.forEach((e) => {
    if (e.isFolder) folders.set(e.entryPath, e);
  });
  const newestChild = new Map<string, number>();
  const depth = (p: string) => p.split('/').length;
  const bump = (parentPath: string, ms: number) => {
    if (!parentPath || !ms) return;
    if (ms > (newestChild.get(parentPath) ?? 0)) newestChild.set(parentPath, ms);
  };
  entries.forEach((e) => {
    if (!e.isFolder) bump(e.parentPath, e.dateModified);
  });
  [...folders.values()]
    .sort((a, b) => depth(b.entryPath) - depth(a.entryPath))
    .forEach((folder) => {
      folder.dateModified = Math.max(folder.dateModified, newestChild.get(folder.entryPath) ?? 0);
      bump(folder.parentPath, folder.dateModified);
    });
}

export function formatRelativeTime(timestamp: number): string {
  if (isUnknownDate(timestamp)) return '—';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatExactDate(timestamp: number): string {
  if (isUnknownDate(timestamp)) return 'Unknown';
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getCategoryLabel(category: FileCategory, extension: string): string {
  if (category === 'folder') return 'Folder';
  if (extension) return `${extension.toUpperCase()} File`;
  const map: Record<FileCategory, string> = {
    folder: 'Folder',
    document: 'Document',
    picture: 'Picture',
    video: 'Video',
    audio: 'Audio',
    compressed: 'Compressed',
    other: 'File',
  };
  return map[category];
}

/**
 * Simple, fast subsequence + substring matcher for instant Listary-style filtering.
 */
export function matchesQuery(entry: FileEntry, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const targetName = entry.name.toLowerCase();
  const targetPath = entry.relativePath.toLowerCase();

  // Direct substring match (supports space-separated multi-token queries)
  const tokens = q.split(/\s+/).filter(Boolean);
  const allTokensMatch = tokens.every(
    (token) => targetName.includes(token) || targetPath.includes(token)
  );
  if (allTokensMatch) return true;

  // Subsequence fuzzy fallback on single token against filename
  if (tokens.length === 1) {
    let qi = 0;
    for (let i = 0; i < targetName.length && qi < q.length; i++) {
      if (targetName[i] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  return false;
}

export function isWithinRecency(timestamp: number, recency: RecencyFilter): boolean {
  if (recency === 'all') return true;
  const daysMap: Record<Exclude<RecencyFilter, 'all'>, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '365d': 365,
  };
  const cutoff = Date.now() - daysMap[recency] * 24 * 60 * 60 * 1000;
  return timestamp >= cutoff;
}

export function scopeEntriesToSubpath(
  allEntries: FileEntry[],
  currentSubpath: string,
  includeSubfolders: boolean
): FileEntry[] {
  const cleanSubpath = currentSubpath.replace(/^\/+|\/+$/g, '');

  return allEntries
    .filter((entry) => {
      if (!cleanSubpath) {
        return includeSubfolders ? true : entry.parentPath === '';
      }
      const prefix = `${cleanSubpath}/`;
      if (includeSubfolders) {
        return entry.parentPath === cleanSubpath || entry.parentPath.startsWith(prefix);
      }
      return entry.parentPath === cleanSubpath;
    })
    .map((entry) => {
      if (!cleanSubpath) return entry;
      const localParent =
        entry.parentPath === cleanSubpath
          ? ''
          : entry.parentPath.slice(cleanSubpath.length + 1);
      return {
        ...entry,
        relativePath: localParent ? `.\\${localParent.split('/').join('\\')}\\` : '.\\',
      };
    });
}

export interface FilterSortOptions {
  entries: FileEntry[];
  currentSubpath: string;
  includeSubfolders: boolean;
  showHiddenFiles: boolean;
  filterType: FilterType;
  recency: RecencyFilter;
  query: string;
  sortBy: SortField;
  sortOrder: SortOrder;
  foldersFirst: boolean;
}

export function filterAndSortEntries(options: FilterSortOptions): FileEntry[] {
  const {
    entries,
    currentSubpath,
    includeSubfolders,
    showHiddenFiles,
    filterType,
    recency,
    query,
    sortBy,
    sortOrder,
    foldersFirst,
  } = options;

  const scoped = scopeEntriesToSubpath(entries, currentSubpath, includeSubfolders);

  const filtered = scoped.filter((entry) => {
    if (!showHiddenFiles && entry.isHidden) return false;

    if (filterType === 'folder' && !entry.isFolder) return false;
    if (filterType === 'file' && entry.isFolder) return false;
    if (
      filterType !== 'all' &&
      filterType !== 'folder' &&
      filterType !== 'file' &&
      entry.category !== filterType
    ) {
      return false;
    }

    if (!isWithinRecency(entry.dateModified, recency)) return false;
    if (!matchesQuery(entry, query)) return false;

    return true;
  });

  const dir = sortOrder === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    if (foldersFirst && a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }

    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'relativePath':
        cmp = a.relativePath.localeCompare(b.relativePath, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (cmp === 0) {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        break;
      case 'dateModified':
        cmp = a.dateModified - b.dateModified;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'category':
        cmp = getCategoryLabel(a.category, a.extension).localeCompare(
          getCategoryLabel(b.category, b.extension)
        );
        if (cmp === 0) {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        break;
    }

    if (cmp === 0) {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
    return cmp * dir;
  });
}

export function computeCategoryCounts(
  entries: FileEntry[],
  currentSubpath: string,
  includeSubfolders: boolean,
  showHiddenFiles: boolean,
  recency: RecencyFilter,
  query: string
): Record<FilterType, number> {
  const scoped = scopeEntriesToSubpath(entries, currentSubpath, includeSubfolders).filter(
    (entry) => {
      if (!showHiddenFiles && entry.isHidden) return false;
      if (!isWithinRecency(entry.dateModified, recency)) return false;
      if (!matchesQuery(entry, query)) return false;
      return true;
    }
  );

  const counts: Record<FilterType, number> = {
    all: scoped.length,
    folder: 0,
    file: 0,
    document: 0,
    picture: 0,
    video: 0,
    audio: 0,
    compressed: 0,
  };

  for (const item of scoped) {
    if (item.isFolder) {
      counts.folder += 1;
    } else {
      counts.file += 1;
      if (item.category === 'document') counts.document += 1;
      else if (item.category === 'picture') counts.picture += 1;
      else if (item.category === 'video') counts.video += 1;
      else if (item.category === 'audio') counts.audio += 1;
      else if (item.category === 'compressed') counts.compressed += 1;
    }
  }

  return counts;
}

/**
 * Converts a browser FileList from <input webkitdirectory> into structured FileEntry items,
 * automatically inferring intermediate subfolder entries so directory browsing works natively.
 */
export function convertFileListToEntries(
  files: FileList | File[],
  folderIdPrefix: string
): { rootName: string; rootPath: string; entries: FileEntry[] } {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    return { rootName: 'Local Folder', rootPath: 'Local\\Folder', entries: [] };
  }

  const firstRel = (fileArray[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  const rootName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Local Folder';
  const rootPath = `Local\\${rootName}`;

  const entries: FileEntry[] = [];
  const folderMap = new Map<string, FileEntry>();

  const ensureFolder = (folderEntryPath: string, modifiedMs: number) => {
    const clean = folderEntryPath.replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    const segments = clean.split('/');
    let running = '';
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const parentPath = running;
      running = running ? `${running}/${seg}` : seg;
      const existing = folderMap.get(running);
      if (existing) {
        if (modifiedMs > existing.dateModified) {
          existing.dateModified = modifiedMs;
        }
        continue;
      }
      const relativePath = parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\';
      const entry: FileEntry = {
        id: `${folderIdPrefix}_dir_${running}`,
        name: seg,
        isFolder: true,
        extension: '',
        category: 'folder',
        relativePath,
        parentPath,
        entryPath: running,
        fullPath: `${rootPath}\\${running.split('/').join('\\')}`,
        dateModified: modifiedMs,
        size: 0,
        isHidden: seg.startsWith('.'),
      };
      folderMap.set(running, entry);
      entries.push(entry);
    }
  };

  fileArray.forEach((file, index) => {
    const rawRel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rawRel.split('/').filter(Boolean);
    // Drop root folder name prefix when webkitRelativePath includes it
    const innerParts = parts.length > 1 && parts[0] === rootName ? parts.slice(1) : parts;
    const name = innerParts[innerParts.length - 1] || file.name;
    const parentPath = innerParts.slice(0, -1).join('/');
    const entryPath = innerParts.join('/');
    const ext = extractExtension(name);
    const modified = file.lastModified || 0;
    const isHidden = innerParts.some((seg) => seg.startsWith('.'));

    if (parentPath) {
      ensureFolder(parentPath, modified);
    }

    const relativePath = parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\';
    entries.push({
      id: `${folderIdPrefix}_file_${index}_${entryPath}`,
      name,
      isFolder: false,
      extension: ext,
      category: categorizeExtension(ext),
      relativePath,
      parentPath,
      entryPath,
      fullPath: `${rootPath}\\${entryPath.split('/').join('\\')}`,
      dateModified: modified,
      size: file.size,
      isHidden,
      localFile: file,
    });
  });

  return { rootName, rootPath, entries };
}

interface DirectoryHandleLike {
  kind?: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, HandleLike]>;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

interface SubDirectoryHandleLike extends DirectoryHandleLike {
  kind: 'directory';
}

type HandleLike = FileHandleLike | SubDirectoryHandleLike;

/**
 * Opaque directory handle from the File System Access API. UI code only passes it around;
 * all reads go through the helpers below so a Tauri/Electron adapter can replace them.
 */
export type LocalDirectoryHandle = DirectoryHandleLike;

export interface ScannedDirectory {
  rootName: string;
  rootPath: string;
  entries: FileEntry[];
}

/** Recursively reads a directory handle into FileEntry items. */
export async function scanDirectoryHandle(
  dirHandle: LocalDirectoryHandle,
  folderIdPrefix: string
): Promise<ScannedDirectory> {
  const rootName = dirHandle.name || 'Local Folder';
  const rootPath = `Local\\${rootName}`;
  const entries: FileEntry[] = [];
  let counter = 0;

  const walk = async (handle: DirectoryHandleLike, parentPath: string, depth: number) => {
    if (depth > 8 || entries.length > 2500) return;
    for await (const [name, child] of handle.entries()) {
      const entryPath = parentPath ? `${parentPath}/${name}` : name;
      const relativePath = parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\';
      const isHidden = name.startsWith('.');

      if (child.kind === 'directory') {
        // Skip giant build folders in POC browser scans to stay snappy
        if (name === 'node_modules' || name === '.git') continue;
        entries.push({
          id: `${folderIdPrefix}_dir_${counter++}_${entryPath}`,
          name,
          isFolder: true,
          extension: '',
          category: 'folder',
          relativePath,
          parentPath,
          entryPath,
          fullPath: `${rootPath}\\${entryPath.split('/').join('\\')}`,
          // The File System Access API has no folder timestamps; rolled up after the walk
          dateModified: 0,
          size: 0,
          isHidden,
        });
        await walk(child, entryPath, depth + 1);
      } else {
        try {
          const file = await child.getFile();
          const ext = extractExtension(name);
          entries.push({
            id: `${folderIdPrefix}_file_${counter++}_${entryPath}`,
            name,
            isFolder: false,
            extension: ext,
            category: categorizeExtension(ext),
            relativePath,
            parentPath,
            entryPath,
            fullPath: `${rootPath}\\${entryPath.split('/').join('\\')}`,
            dateModified: file.lastModified || 0,
            size: file.size,
            isHidden,
            localFile: file,
          });
        } catch {
          // Ignore unreadable OS-locked files
        }
      }
    }
  };

  await walk(dirHandle, '', 0);
  rollUpFolderDates(entries);
  return { rootName, rootPath, entries };
}

/**
 * Attempts modern File System Access API (showDirectoryPicker).
 * Returns 'unsupported' if unavailable or blocked by iframe security so caller can trigger <input webkitdirectory>.
 */
export async function tryPickDirectoryWithNativeApi(
  folderIdPrefix: string
): Promise<
  | ({ status: 'picked'; handle: LocalDirectoryHandle } & ScannedDirectory)
  | { status: 'cancelled' }
  | { status: 'unsupported' }
> {
  const picker = (
    window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }
  ).showDirectoryPicker;

  if (typeof picker !== 'function') {
    return { status: 'unsupported' };
  }

  try {
    const dirHandle = await picker();
    const scanned = await scanDirectoryHandle(dirHandle, folderIdPrefix);
    return { status: 'picked', handle: dirHandle, ...scanned };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return { status: 'unsupported' };
  }
}

/**
 * Checks (and optionally requests) read access to a stored handle.
 * `request: true` must be called from a user gesture (click), otherwise browsers reject it.
 */
export async function getHandlePermission(
  handle: LocalDirectoryHandle,
  { request }: { request: boolean }
): Promise<PermissionState> {
  try {
    const descriptor = { mode: 'read' as const };
    if (typeof handle.queryPermission !== 'function') return 'granted';
    const current = await handle.queryPermission(descriptor);
    if (current === 'granted' || !request || typeof handle.requestPermission !== 'function') {
      return current;
    }
    return await handle.requestPermission(descriptor);
  } catch {
    return 'denied';
  }
}

/** Walks from a root handle to a nested subfolder ("a/b/c"). Returns null if any segment is missing. */
export async function resolveSubdirectoryHandle(
  root: LocalDirectoryHandle,
  subpath: string
): Promise<LocalDirectoryHandle | null> {
  try {
    let current = root;
    for (const segment of subpath.split('/').filter(Boolean)) {
      current = await current.getDirectoryHandle(segment);
    }
    return current;
  } catch {
    return null;
  }
}

export async function readLocalFileTextSnippet(file: File, maxBytes = 12_000): Promise<string> {
  const slice = file.slice(0, maxBytes);
  const text = await slice.text();
  return file.size > maxBytes ? `${text}\n\n... (truncated preview)` : text;
}

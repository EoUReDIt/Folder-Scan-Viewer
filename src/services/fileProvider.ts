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
 * How well an entry matches the search box, best first:
 * 4 every word starts a word in the name, 3 every word is in the name, 2 every word is in the
 * name or relative path (at least one only in the path), 1 single-word letters in order within
 * the name (fuzzy), 0 no match. Fuzzy results are only kept when nothing scores 2+ (see
 * matchQueryInScope).
 */
export type QueryMatchTier = 0 | 1 | 2 | 3 | 4;

const WORD_SEPARATOR = /[_\-.\s]/;

function startsWordAt(name: string, lowerName: string, token: string): boolean {
  for (let idx = lowerName.indexOf(token); idx !== -1; idx = lowerName.indexOf(token, idx + 1)) {
    if (idx === 0) return true;
    const prev = name[idx - 1] ?? '';
    const cur = name[idx] ?? '';
    if (WORD_SEPARATOR.test(prev)) return true;
    // camelCase boundary: "HardwareUpgrade" starts a word at "U"
    if (prev !== prev.toUpperCase() && cur !== cur.toLowerCase()) return true;
  }
  return false;
}

function isSubsequence(query: string, target: string): boolean {
  let qi = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

export function queryMatchTier(entry: FileEntry, rawQuery: string): QueryMatchTier {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 4;
  const tokens = q.split(/\s+/).filter(Boolean);
  const name = entry.name.toLowerCase();
  const path = entry.relativePath.toLowerCase();

  if (tokens.every((t) => name.includes(t))) {
    return tokens.every((t) => startsWordAt(entry.name, name, t)) ? 4 : 3;
  }
  if (tokens.every((t) => name.includes(t) || path.includes(t))) return 2;
  if (tokens.length === 1 && isSubsequence(q, name)) return 1;
  return 0;
}

/** True when the entry matches the query on its own (any tier, fuzzy included). */
export function matchesQuery(entry: FileEntry, rawQuery: string): boolean {
  return queryMatchTier(entry, rawQuery) > 0;
}

export interface QueryMatchResult {
  /** Tier per entry id; entries that do not match are absent. */
  tiers: Map<string, QueryMatchTier>;
  /** True when nothing matched directly and the results are fuzzy matches only. */
  closeMatches: boolean;
}

/**
 * Matches the query against a whole set of entries. Fuzzy (tier 1) matches are kept only when
 * no entry in the set matches directly, so a typo still finds something while a real word does
 * not pull in unrelated names. Returns null for an empty query (everything matches).
 */
export function matchQueryInScope(entries: FileEntry[], rawQuery: string): QueryMatchResult | null {
  if (!rawQuery.trim()) return null;
  const tiers = new Map<string, QueryMatchTier>();
  let direct = false;
  for (const entry of entries) {
    const tier = queryMatchTier(entry, rawQuery);
    if (tier === 0) continue;
    if (tier >= 2) direct = true;
    tiers.set(entry.id, tier);
  }
  if (direct) {
    for (const [id, tier] of tiers) if (tier === 1) tiers.delete(id);
  }
  return { tiers, closeMatches: !direct && tiers.size > 0 };
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

/**
 * The entries inside `subpath`, re-rooted so that `subpath` becomes the top level.
 * Used to show a pinned subfolder as a favorite of its own.
 */
export function rebaseEntriesToSubpath(entries: FileEntry[], subpath: string): FileEntry[] {
  const prefix = `${subpath}/`;
  return entries
    .filter((entry) => entry.parentPath === subpath || entry.parentPath.startsWith(prefix))
    .map((entry) => {
      const newParent =
        entry.parentPath === subpath ? '' : entry.parentPath.slice(subpath.length + 1);
      return {
        ...entry,
        parentPath: newParent,
        entryPath: newParent ? `${newParent}/${entry.name}` : entry.name,
        relativePath: newParent ? `.\\${newParent.split('/').join('\\')}\\` : '.\\',
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

/** Scope, hidden and recency filters: the set the search and the sidebar counts work on. */
function searchBase(
  entries: FileEntry[],
  currentSubpath: string,
  includeSubfolders: boolean,
  showHiddenFiles: boolean,
  recency: RecencyFilter
): FileEntry[] {
  return scopeEntriesToSubpath(entries, currentSubpath, includeSubfolders).filter((entry) => {
    if (!showHiddenFiles && entry.isHidden) return false;
    return isWithinRecency(entry.dateModified, recency);
  });
}

export interface FilteredEntries {
  entries: FileEntry[];
  /** True when the query matched nothing directly and only fuzzy matches are shown. */
  closeMatches: boolean;
}

export function filterAndSortEntries(options: FilterSortOptions): FileEntry[] {
  return filterAndSortEntriesWithInfo(options).entries;
}

export function filterAndSortEntriesWithInfo(options: FilterSortOptions): FilteredEntries {
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

  const base = searchBase(entries, currentSubpath, includeSubfolders, showHiddenFiles, recency);
  const match = matchQueryInScope(base, query);

  const filtered = base.filter((entry) => {
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
    return !match || match.tiers.has(entry.id);
  });

  const dir = sortOrder === 'asc' ? 1 : -1;

  const sorted = [...filtered].sort((a, b) => {
    if (foldersFirst && a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    // While searching, better matches come first; the column sort orders each tier
    if (match) {
      const tierDiff = (match.tiers.get(b.id) ?? 0) - (match.tiers.get(a.id) ?? 0);
      if (tierDiff !== 0) return tierDiff;
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
  return { entries: sorted, closeMatches: match?.closeMatches ?? false };
}

export function computeCategoryCounts(
  entries: FileEntry[],
  currentSubpath: string,
  includeSubfolders: boolean,
  showHiddenFiles: boolean,
  recency: RecencyFilter,
  query: string
): Record<FilterType, number> {
  const base = searchBase(entries, currentSubpath, includeSubfolders, showHiddenFiles, recency);
  const match = matchQueryInScope(base, query);
  // Same matching as filterAndSortEntries, so the counts always equal what the grid shows
  const scoped = match ? base.filter((entry) => match.tiers.has(entry.id)) : base;

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
 * Scan limits shared by every folder source. Keep in sync with MAX_DEPTH, MAX_ENTRIES and
 * SKIPPED_DIRS in src-tauri/src/scan.rs so browser and desktop scans list the same items.
 * Depth counts levels of entries: 1 lists only the folder's direct children.
 */
export const SCAN_LIMITS = {
  maxDepth: 8,
  maxEntries: 2500,
  skippedFolders: ['node_modules', '.git'] as readonly string[],
};

/**
 * Hidden rule for the browser scanners: an entry is hidden when its own name or any folder
 * above it starts with '.', so everything inside a hidden folder is hidden too (as in scan.rs).
 * Browsers cannot read the Windows Hidden attribute, so only the desktop scan uses it.
 */
export function isHiddenEntryPath(entryPath: string): boolean {
  return entryPath.split('/').some((seg) => seg.startsWith('.'));
}

/**
 * Converts a browser FileList from <input webkitdirectory> into structured FileEntry items,
 * automatically inferring intermediate subfolder entries so directory browsing works natively.
 */
export function convertFileListToEntries(
  files: FileList | File[],
  folderIdPrefix: string
): ScannedDirectory {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    return { rootName: 'Local Folder', rootPath: 'Local\\Folder', entries: [], truncated: false };
  }

  const firstRel = (fileArray[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  const rootName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Local Folder';
  const rootPath = `Local\\${rootName}`;

  const entries: FileEntry[] = [];
  const folderMap = new Map<string, FileEntry>();
  let truncated = false;

  /** Folders in `folderEntryPath` that do not have an entry yet. */
  const missingFolderCount = (folderEntryPath: string) => {
    if (!folderEntryPath) return 0;
    let running = '';
    let missing = 0;
    for (const seg of folderEntryPath.split('/')) {
      running = running ? `${running}/${seg}` : seg;
      if (!folderMap.has(running)) missing++;
    }
    return missing;
  };

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
        isHidden: isHiddenEntryPath(running),
      };
      folderMap.set(running, entry);
      entries.push(entry);
    }
  };

  for (let index = 0; index < fileArray.length; index++) {
    const file = fileArray[index];
    const rawRel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rawRel.split('/').filter(Boolean);
    // Drop root folder name prefix when webkitRelativePath includes it
    const innerParts = parts.length > 1 && parts[0] === rootName ? parts.slice(1) : parts;
    const folderParts = innerParts.slice(0, -1);
    // Same limits as the directory-handle and desktop scans: skipped folders and anything past
    // maxDepth are left out, but the folders above them that are in range are still listed
    const skipAt = folderParts.findIndex((seg) => SCAN_LIMITS.skippedFolders.includes(seg));
    if (skipAt >= 0 || innerParts.length > SCAN_LIMITS.maxDepth) {
      const keep = Math.min(skipAt >= 0 ? skipAt : folderParts.length, SCAN_LIMITS.maxDepth);
      const visibleFolder = folderParts.slice(0, keep).join('/');
      const missing = missingFolderCount(visibleFolder);
      if (missing === 0) continue;
      if (entries.length + missing > SCAN_LIMITS.maxEntries) {
        truncated = true;
        break;
      }
      ensureFolder(visibleFolder, 0); // its listed contents are unknown here, like scan.rs
      continue;
    }
    const name = innerParts[innerParts.length - 1] || file.name;
    const parentPath = folderParts.join('/');
    if (entries.length + missingFolderCount(parentPath) + 1 > SCAN_LIMITS.maxEntries) {
      truncated = true;
      break;
    }
    const entryPath = innerParts.join('/');
    const ext = extractExtension(name);
    const modified = file.lastModified || 0;
    const isHidden = isHiddenEntryPath(entryPath);

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
  }

  return { rootName, rootPath, entries, truncated };
}

interface DirectoryHandleLike {
  kind?: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, HandleLike]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle?(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  /** Chromium: renames the item in place (not in every browser or version). */
  move?(newName: string): Promise<void>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  move?(newName: string): Promise<void>;
  createWritable?(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
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
export type LocalFileHandle = FileHandleLike;

export interface ScannedDirectory {
  rootName: string;
  rootPath: string;
  entries: FileEntry[];
  /** True when SCAN_LIMITS.maxEntries cut the listing short. */
  truncated: boolean;
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
  let truncated = false;

  // depth 0 lists the root's direct children, matching scan.rs
  const walk = async (handle: DirectoryHandleLike, parentPath: string, depth: number) => {
    for await (const [name, child] of handle.entries()) {
      if (truncated) return;
      if (entries.length >= SCAN_LIMITS.maxEntries) {
        truncated = true;
        return;
      }
      const entryPath = parentPath ? `${parentPath}/${name}` : name;
      const relativePath = parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\';
      const isHidden = isHiddenEntryPath(entryPath);

      if (child.kind === 'directory') {
        if (SCAN_LIMITS.skippedFolders.includes(name)) continue;
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
        if (depth + 1 < SCAN_LIMITS.maxDepth) await walk(child, entryPath, depth + 1);
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
  return { rootName, rootPath, entries, truncated };
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
 * Checks (and optionally requests) access to a stored handle: read by default, or
 * `readwrite` for changes such as renaming.
 * `request: true` must be called from a user gesture (click), otherwise browsers reject it.
 */
export async function getHandlePermission(
  handle: LocalDirectoryHandle,
  { request, mode = 'read' }: { request: boolean; mode?: 'read' | 'readwrite' }
): Promise<PermissionState> {
  try {
    const descriptor = { mode };
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

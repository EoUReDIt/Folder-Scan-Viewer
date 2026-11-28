export type FileCategory =
  | 'folder'
  | 'document'
  | 'picture'
  | 'video'
  | 'audio'
  | 'compressed'
  | 'other';

export type FilterType =
  | 'all'
  | 'folder'
  | 'file'
  | 'document'
  | 'picture'
  | 'video'
  | 'audio'
  | 'compressed';

export type RecencyFilter = 'all' | '1d' | '7d' | '30d' | '365d';

export type SortField =
  | 'name'
  | 'relativePath'
  | 'dateModified'
  | 'size'
  | 'category';

export type SortOrder = 'asc' | 'desc';

export type StartupBehavior = 'per_folder' | 'global';

export type ThemeMode = 'light' | 'dark';

export interface FavoriteFolder {
  id: string;
  name: string;
  path: string;
  sortBy: SortField;
  sortOrder: SortOrder;
  foldersFirst: boolean;
  sourceType: 'demo' | 'local';
  /** Optional root demo folder id + subpath when a nested folder is pinned */
  baseDemoId?: string;
  subpath?: string;
  /** Desktop shell only: absolute path of the folder on disk (rescanned on startup) */
  nativePath?: string;
}

export interface AppConfig {
  defaultFolderId: string;
  startupBehavior: StartupBehavior;
  globalSortBy: SortField;
  globalSortOrder: SortOrder;
  includeSubfolders: boolean;
  showHiddenFiles: boolean;
  theme: ThemeMode;
  favorites: FavoriteFolder[];
}

export interface FileEntry {
  id: string;
  name: string;
  isFolder: boolean;
  extension: string;
  category: FileCategory;
  /** Display relative path inside the active root (e.g. ".\\" or ".\\Reports\\") */
  relativePath: string;
  /** Normalized forward-slash parent path relative to root ("" for root, "Reports" for child) */
  parentPath: string;
  /** Normalized forward-slash path of this entry relative to root (e.g. "Reports/Q4_Report.pdf") */
  entryPath: string;
  /** Full Windows-style or OS-style path for display & clipboard */
  fullPath: string;
  /** Timestamp in milliseconds */
  dateModified: number;
  /** File size in bytes (0 for folders) */
  size: number;
  isHidden: boolean;
  previewUrl?: string;
  textSnippet?: string;
  dimensions?: string;
  duration?: string;
  /** Attached browser File object for mounted local folders */
  localFile?: File;
  /** Desktop shell only: absolute path on disk, used for open/reveal/preview */
  nativePath?: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'info' | 'success' | 'error';
}

/**
 * Runtime-only availability of a local favorite's contents (never persisted).
 * - loading: checking the stored directory handle
 * - ready: entries loaded
 * - needs-permission: handle stored, browser needs a click to grant read access again
 * - needs-remount: no handle (fallback picker or imported config); folder must be chosen again
 */
export type LocalFolderStatus = 'loading' | 'ready' | 'needs-permission' | 'needs-remount';

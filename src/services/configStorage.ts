import { DEFAULT_APP_CONFIG } from '../data/demoWorkspace';
import { AppConfig, FavoriteFolder, SortField, SortOrder, StartupBehavior } from '../types/foldary';

const STORAGE_KEY = 'foldary.config.v1';

const VALID_SORT_FIELDS: SortField[] = [
  'name',
  'relativePath',
  'dateModified',
  'size',
  'category',
];
const VALID_SORT_ORDERS: SortOrder[] = ['asc', 'desc'];
const VALID_STARTUP_BEHAVIORS: StartupBehavior[] = ['per_folder', 'global'];

export function loadSavedConfig(): AppConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_CONFIG;
    const parsed = JSON.parse(raw);
    const validated = validateAndNormalizeConfig(parsed);
    return validated.ok ? validated.config : DEFAULT_APP_CONFIG;
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    // Only persist serializable metadata (demo favorites remain immediately functional across reloads;
    // local browser directory handles cannot survive reload in web sandbox, so mark/keep demo favorites cleanly)
    const persistable: AppConfig = {
      ...config,
      favorites: config.favorites.filter((f) => f.sourceType === 'demo'),
    };
    const defaultExists = persistable.favorites.some(
      (f) => f.id === persistable.defaultFolderId
    );
    if (!defaultExists && persistable.favorites.length > 0) {
      persistable.defaultFolderId = persistable.favorites[0].id;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function clearSavedConfig(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function exportConfigJsonString(config: AppConfig): string {
  const cleanExport = {
    defaultFolderId: config.defaultFolderId,
    startupBehavior: config.startupBehavior,
    globalSortBy: config.globalSortBy,
    globalSortOrder: config.globalSortOrder,
    includeSubfolders: config.includeSubfolders,
    showHiddenFiles: config.showHiddenFiles,
    theme: config.theme,
    favorites: config.favorites.map((fav) => ({
      id: fav.id,
      name: fav.name,
      path: fav.path,
      sortBy: fav.sortBy,
      sortOrder: fav.sortOrder,
      foldersFirst: fav.foldersFirst,
      ...(fav.baseDemoId ? { baseDemoId: fav.baseDemoId } : {}),
      ...(fav.subpath ? { subpath: fav.subpath } : {}),
    })),
  };
  return JSON.stringify(cleanExport, null, 2);
}

export function downloadConfigJson(config: AppConfig): void {
  const content = exportConfigJsonString(config);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateAndNormalizeConfig(
  input: unknown
): { ok: true; config: AppConfig } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Configuration must be a JSON object.' };
  }

  const obj = input as Record<string, unknown>;

  if (!Array.isArray(obj.favorites) || obj.favorites.length === 0) {
    return {
      ok: false,
      error: 'Configuration must include a non-empty "favorites" array.',
    };
  }

  const normalizedFavorites: FavoriteFolder[] = [];
  for (let i = 0; i < obj.favorites.length; i++) {
    const item = obj.favorites[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Favorite entry at index ${i} is invalid.` };
    }
    const f = item as Record<string, unknown>;
    if (typeof f.id !== 'string' || !f.id.trim()) {
      return { ok: false, error: `Favorite entry at index ${i} is missing a valid "id".` };
    }
    if (typeof f.name !== 'string' || !f.name.trim()) {
      return { ok: false, error: `Favorite entry "${f.id}" is missing a valid "name".` };
    }
    if (typeof f.path !== 'string' || !f.path.trim()) {
      return { ok: false, error: `Favorite entry "${f.id}" is missing a valid "path".` };
    }

    const sortBy = VALID_SORT_FIELDS.includes(f.sortBy as SortField)
      ? (f.sortBy as SortField)
      : 'dateModified';
    const sortOrder = VALID_SORT_ORDERS.includes(f.sortOrder as SortOrder)
      ? (f.sortOrder as SortOrder)
      : 'desc';

    normalizedFavorites.push({
      id: f.id.trim(),
      name: f.name.trim(),
      path: f.path.trim(),
      sortBy,
      sortOrder,
      foldersFirst: typeof f.foldersFirst === 'boolean' ? f.foldersFirst : true,
      sourceType: f.sourceType === 'local' ? 'local' : 'demo',
      baseDemoId: typeof f.baseDemoId === 'string' ? f.baseDemoId : undefined,
      subpath: typeof f.subpath === 'string' ? f.subpath : undefined,
    });
  }

  const startupBehavior = VALID_STARTUP_BEHAVIORS.includes(
    obj.startupBehavior as StartupBehavior
  )
    ? (obj.startupBehavior as StartupBehavior)
    : 'per_folder';

  const globalSortBy = VALID_SORT_FIELDS.includes(obj.globalSortBy as SortField)
    ? (obj.globalSortBy as SortField)
    : 'dateModified';

  const globalSortOrder = VALID_SORT_ORDERS.includes(obj.globalSortOrder as SortOrder)
    ? (obj.globalSortOrder as SortOrder)
    : 'desc';

  const requestedDefault =
    typeof obj.defaultFolderId === 'string' ? obj.defaultFolderId : '';
  const defaultFolderId = normalizedFavorites.some((f) => f.id === requestedDefault)
    ? requestedDefault
    : normalizedFavorites[0].id;

  return {
    ok: true,
    config: {
      defaultFolderId,
      startupBehavior,
      globalSortBy,
      globalSortOrder,
      includeSubfolders:
        typeof obj.includeSubfolders === 'boolean' ? obj.includeSubfolders : true,
      showHiddenFiles:
        typeof obj.showHiddenFiles === 'boolean' ? obj.showHiddenFiles : false,
      theme: obj.theme === 'dark' ? 'dark' : 'light',
      favorites: normalizedFavorites,
    },
  };
}

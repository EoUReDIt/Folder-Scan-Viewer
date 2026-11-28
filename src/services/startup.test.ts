import { describe, expect, it } from 'vitest';
import { AppConfig, FavoriteFolder } from '../types/foldary';
import { getInitialFolder, getStartupSort } from './startup';

const folder = (id: string, overrides: Partial<FavoriteFolder> = {}): FavoriteFolder => ({
  id,
  name: id,
  path: id,
  sortBy: 'name',
  sortOrder: 'asc',
  foldersFirst: false,
  sourceType: 'demo',
  ...overrides,
});

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  defaultFolderId: 'b',
  startupBehavior: 'per_folder',
  globalSortBy: 'size',
  globalSortOrder: 'desc',
  includeSubfolders: true,
  showHiddenFiles: false,
  theme: 'light',
  favorites: [folder('a'), folder('b')],
  onboarded: true,
  ...overrides,
});

describe('getInitialFolder', () => {
  it('opens the Default Folder', () => {
    expect(getInitialFolder(config()).id).toBe('b');
  });

  it('falls back to the first favorite when the default is gone', () => {
    expect(getInitialFolder(config({ defaultFolderId: 'removed' })).id).toBe('a');
  });
});

describe('getStartupSort', () => {
  it('uses the folder sort in per_folder mode', () => {
    expect(getStartupSort(config(), folder('a'))).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
      foldersFirst: false,
    });
  });

  it('uses the global sort in global mode but keeps the folder foldersFirst', () => {
    expect(getStartupSort(config({ startupBehavior: 'global' }), folder('a'))).toEqual({
      sortBy: 'size',
      sortOrder: 'desc',
      foldersFirst: false,
    });
  });
});

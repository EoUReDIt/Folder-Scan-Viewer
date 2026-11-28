import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG } from '../data/demoWorkspace';
import { AppConfig } from '../types/foldary';
import { exportConfigJsonString, validateAndNormalizeConfig } from './configStorage';

function valid(input: unknown): AppConfig {
  const result = validateAndNormalizeConfig(input);
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

const localFolder = {
  id: 'loc_1',
  name: 'Music',
  path: 'D:\\Music',
  sortBy: 'name',
  sortOrder: 'asc',
  foldersFirst: false,
  sourceType: 'local',
  nativePath: 'D:\\Music',
} as const;

describe('validateAndNormalizeConfig', () => {
  it('rejects input that is not a config', () => {
    expect(validateAndNormalizeConfig(null).ok).toBe(false);
    expect(validateAndNormalizeConfig('x').ok).toBe(false);
    expect(validateAndNormalizeConfig({ favorites: [] }).ok).toBe(false);
    expect(validateAndNormalizeConfig({ favorites: [{ id: 'a', name: 'A' }] })).toEqual({
      ok: false,
      error: 'Favorite entry "a" is missing a valid "path".',
    });
  });

  it('fills defaults for missing or unknown values', () => {
    const config = valid({
      defaultFolderId: 'missing',
      startupBehavior: 'sometimes',
      globalSortBy: 'colour',
      theme: 'purple',
      favorites: [{ id: ' x ', name: ' X ', path: ' C:\\X ', sortBy: 'bogus' }],
    });
    expect(config).toEqual({
      defaultFolderId: 'x',
      startupBehavior: 'per_folder',
      globalSortBy: 'dateModified',
      globalSortOrder: 'desc',
      includeSubfolders: true,
      showHiddenFiles: false,
      theme: 'light',
      favorites: [
        {
          id: 'x',
          name: 'X',
          path: 'C:\\X',
          sortBy: 'dateModified',
          sortOrder: 'desc',
          foldersFirst: true,
          sourceType: 'local',
          baseDemoId: undefined,
          subpath: undefined,
          nativePath: undefined,
        },
      ],
    });
  });

  it('infers sourceType for files exported before it existed (H3)', () => {
    const config = valid({
      favorites: [
        { id: 'fav_projects', name: 'Projects', path: 'p' },
        { id: 'sub', name: 'Sub', path: 's', baseDemoId: 'fav_projects', subpath: 'A' },
        { id: 'mine', name: 'Mine', path: 'm' },
      ],
    });
    expect(config.favorites.map((f) => f.sourceType)).toEqual(['demo', 'demo', 'local']);
  });

  it('drops nativePath from demo favorites', () => {
    const config = valid({
      favorites: [{ id: 'd', name: 'D', path: 'd', sourceType: 'demo', nativePath: 'C:\\Windows' }],
    });
    expect(config.favorites[0].nativePath).toBeUndefined();
  });
});

describe('config.json export', () => {
  it('round-trips through import unchanged, keeping sourceType and nativePath (H3)', () => {
    const config: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      startupBehavior: 'global',
      theme: 'dark',
      defaultFolderId: localFolder.id,
      favorites: [...DEFAULT_APP_CONFIG.favorites, { ...localFolder }],
    };
    const exported = JSON.parse(exportConfigJsonString(config));
    expect(exported.favorites.at(-1)).toEqual(localFolder);

    const reimported = valid(exported);
    expect(JSON.parse(exportConfigJsonString(reimported))).toEqual(exported);
    expect(reimported.favorites.at(-1)).toMatchObject(localFolder);
  });
});

import { describe, expect, it } from 'vitest';
import { entry, pickedFile } from '../test/entries';
import { FileEntry } from '../types/foldary';
import {
  categorizeExtension,
  computeCategoryCounts,
  convertFileListToEntries,
  extractExtension,
  filterAndSortEntries,
  filterAndSortEntriesWithInfo,
  FilterSortOptions,
  formatFileSize,
  isHiddenEntryPath,
  isWithinRecency,
  matchQueryInScope,
  queryMatchTier,
  rebaseEntriesToSubpath,
  rollUpFolderDates,
  SCAN_LIMITS,
  scopeEntriesToSubpath,
} from './fileProvider';

const DAY = 24 * 60 * 60 * 1000;

function options(entries: FileEntry[], overrides: Partial<FilterSortOptions> = {}): FilterSortOptions {
  return {
    entries,
    currentSubpath: '',
    includeSubfolders: true,
    showHiddenFiles: false,
    filterType: 'all',
    recency: 'all',
    query: '',
    sortBy: 'name',
    sortOrder: 'asc',
    foldersFirst: true,
    ...overrides,
  };
}

const names = (entries: FileEntry[]) => entries.map((e) => e.name);

describe('extensions and categories', () => {
  it('extracts lower-case extensions, including dotfiles', () => {
    expect(extractExtension('Report.PDF')).toBe('pdf');
    expect(extractExtension('archive.tar.gz')).toBe('gz');
    expect(extractExtension('.gitignore')).toBe('gitignore');
    expect(extractExtension('README')).toBe('');
    expect(extractExtension('trailing.')).toBe('');
  });

  it('maps extensions to categories', () => {
    expect(categorizeExtension('pdf')).toBe('document');
    expect(categorizeExtension('JPG')).toBe('picture');
    expect(categorizeExtension('mkv')).toBe('video');
    expect(categorizeExtension('flac')).toBe('audio');
    expect(categorizeExtension('7z')).toBe('compressed');
    expect(categorizeExtension('exe')).toBe('other');
  });

  it('formats sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(1234, true)).toBe('--');
  });
});

describe('search matching (M5)', () => {
  const report = entry('Reports/Q4_Report.pdf');
  const upgrade = entry('HardwareUpgrade.md');

  it('ranks word starts above substrings above path-only matches', () => {
    expect(queryMatchTier(report, 'report')).toBe(4);
    expect(queryMatchTier(upgrade, 'upgrade')).toBe(4); // camelCase boundary
    expect(queryMatchTier(upgrade, 'ware')).toBe(3);
    expect(queryMatchTier(report, 'reports q4')).toBe(2); // "reports" only in the path
    expect(queryMatchTier(report, 'qrpt')).toBe(1);
    expect(queryMatchTier(report, 'invoice')).toBe(0);
    expect(queryMatchTier(report, '   ')).toBe(4);
  });

  it('drops fuzzy matches when anything matches directly', () => {
    const entries = [entry('budget.xlsx'), entry('bug_list.txt')];
    const direct = matchQueryInScope(entries, 'bug');
    expect([...direct!.tiers.keys()]).toEqual(['bug_list.txt']);
    expect(direct!.closeMatches).toBe(false);

    const fuzzy = matchQueryInScope(entries, 'bdgt');
    expect([...fuzzy!.tiers.keys()]).toEqual(['budget.xlsx']);
    expect(fuzzy!.closeMatches).toBe(true);

    expect(matchQueryInScope(entries, '')).toBeNull();
  });

  it('sorts better matches first, then by the chosen column', () => {
    const entries = [entry('a_notes_report.txt'), entry('report_z.txt'), entry('report_a.txt')];
    const result = filterAndSortEntriesWithInfo(options(entries, { query: 'report' }));
    expect(names(result.entries)).toEqual(['a_notes_report.txt', 'report_a.txt', 'report_z.txt']);
    const ranked = filterAndSortEntries(options(entries, { query: 'port' }));
    expect(names(ranked)).toEqual(['a_notes_report.txt', 'report_a.txt', 'report_z.txt']);
  });
});

describe('recency', () => {
  it('keeps everything for "all" and cuts off by days otherwise', () => {
    const now = Date.now();
    expect(isWithinRecency(0, 'all')).toBe(true);
    expect(isWithinRecency(now - 2 * 60 * 60 * 1000, '1d')).toBe(true);
    expect(isWithinRecency(now - 2 * DAY, '1d')).toBe(false);
    expect(isWithinRecency(now - 6 * DAY, '7d')).toBe(true);
    expect(isWithinRecency(now - 31 * DAY, '30d')).toBe(false);
    expect(isWithinRecency(now - 300 * DAY, '365d')).toBe(true);
  });
});

describe('scope and rebase (M3, L4)', () => {
  const tree = [
    entry('top.txt'),
    entry('Reports/'),
    entry('Reports/q4.pdf'),
    entry('Reports/2026/'),
    entry('Reports/2026/jan.pdf'),
    entry('Other/x.txt'),
  ];

  it('shows the current folder only or everything below it', () => {
    expect(names(scopeEntriesToSubpath(tree, '', false))).toEqual(['top.txt', 'Reports']);
    expect(names(scopeEntriesToSubpath(tree, 'Reports', false))).toEqual(['q4.pdf', '2026']);
    expect(names(scopeEntriesToSubpath(tree, '/Reports/', true))).toEqual([
      'q4.pdf',
      '2026',
      'jan.pdf',
    ]);
  });

  it('rewrites relative paths against the current folder', () => {
    const scoped = scopeEntriesToSubpath(tree, 'Reports', true);
    expect(scoped.find((e) => e.name === 'jan.pdf')!.relativePath).toBe('.\\2026\\');
    expect(scoped.find((e) => e.name === 'q4.pdf')!.relativePath).toBe('.\\');
    // the source entries are not changed
    expect(tree.find((e) => e.name === 'jan.pdf')!.relativePath).toBe('.\\Reports\\2026\\');
  });

  it('re-roots a subfolder as its own top level', () => {
    const rebased = rebaseEntriesToSubpath(tree, 'Reports');
    expect(rebased.map((e) => e.entryPath)).toEqual(['q4.pdf', '2026', '2026/jan.pdf']);
    const jan = rebased.find((e) => e.name === 'jan.pdf')!;
    expect(jan.parentPath).toBe('2026');
    expect(jan.relativePath).toBe('.\\2026\\');
    // "Reports2" must not count as inside "Reports"
    expect(rebaseEntriesToSubpath([entry('Reports2/a.txt')], 'Reports')).toEqual([]);
  });
});

describe('filtering and sorting', () => {
  const now = Date.now();
  const entries = [
    entry('zeta/'),
    entry('alpha/'),
    entry('big.mp4', { size: 9000, dateModified: now - 3 * DAY }),
    entry('photo.png', { size: 300, dateModified: now - 1000 }),
    entry('notes.md', { size: 50, dateModified: now - 40 * DAY }),
    entry('.secret.txt', { isHidden: true }),
    entry('file10.txt', { size: 1 }),
    entry('file9.txt', { size: 2 }),
  ];

  it('puts folders first and sorts names numerically', () => {
    expect(names(filterAndSortEntries(options(entries)))).toEqual([
      'alpha',
      'zeta',
      'big.mp4',
      'file9.txt',
      'file10.txt',
      'notes.md',
      'photo.png',
    ]);
  });

  it('mixes folders in when foldersFirst is off', () => {
    const sorted = names(filterAndSortEntries(options(entries, { foldersFirst: false })));
    expect(sorted.indexOf('zeta')).toBe(sorted.length - 1);
  });

  it('sorts by size and date in either direction', () => {
    const files = entries.filter((e) => !e.isFolder);
    expect(names(filterAndSortEntries(options(files, { sortBy: 'size', sortOrder: 'desc' })))[0]).toBe(
      'big.mp4'
    );
    expect(
      names(filterAndSortEntries(options(files, { sortBy: 'dateModified', sortOrder: 'asc' })))[0]
    ).toBe('notes.md');
  });

  it('filters by kind, recency and hidden', () => {
    expect(names(filterAndSortEntries(options(entries, { filterType: 'folder' })))).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(names(filterAndSortEntries(options(entries, { filterType: 'picture' })))).toEqual([
      'photo.png',
    ]);
    expect(names(filterAndSortEntries(options(entries, { recency: '30d' })))).not.toContain(
      'notes.md'
    );
    expect(names(filterAndSortEntries(options(entries, { showHiddenFiles: true })))).toContain(
      '.secret.txt'
    );
  });

  it('counts what the grid shows', () => {
    const counts = computeCategoryCounts(entries, '', true, false, 'all', '');
    expect(counts).toEqual({
      all: 7,
      folder: 2,
      file: 5,
      document: 3,
      picture: 1,
      video: 1,
      audio: 0,
      compressed: 0,
    });
    const searched = computeCategoryCounts(entries, '', true, false, 'all', 'file');
    expect(searched.all).toBe(
      filterAndSortEntries(options(entries, { query: 'file' })).length
    );
  });
});

describe('folder dates (M1)', () => {
  it('dates folders by their newest item and leaves empty folders unknown', () => {
    const entries = [
      entry('a/', { dateModified: 0 }),
      entry('a/b/', { dateModified: 0 }),
      entry('a/b/new.txt', { dateModified: 5000 }),
      entry('a/old.txt', { dateModified: 1000 }),
      entry('empty/', { dateModified: 0 }),
    ];
    rollUpFolderDates(entries);
    const date = (p: string) => entries.find((e) => e.entryPath === p)!.dateModified;
    expect(date('a/b')).toBe(5000);
    expect(date('a')).toBe(5000);
    expect(date('empty')).toBe(0);
  });
});

describe('browser folder picker (M2, M4)', () => {
  it('treats anything inside a dot folder as hidden', () => {
    expect(isHiddenEntryPath('.config/app.json')).toBe(true);
    expect(isHiddenEntryPath('src/.env')).toBe(true);
    expect(isHiddenEntryPath('src/main.ts')).toBe(false);
  });

  it('builds folder entries and strips the root name', () => {
    const result = convertFileListToEntries(
      [pickedFile('Proj/readme.md', 1000), pickedFile('Proj/src/app.ts', 2000)],
      'loc'
    );
    expect(result.rootName).toBe('Proj');
    expect(result.truncated).toBe(false);
    expect(result.entries.map((e) => e.entryPath).sort()).toEqual(['readme.md', 'src', 'src/app.ts']);
    const src = result.entries.find((e) => e.entryPath === 'src')!;
    expect(src.isFolder).toBe(true);
    expect(src.dateModified).toBe(2000);
  });

  it('skips node_modules and .git but lists the folder above them', () => {
    const result = convertFileListToEntries(
      [
        pickedFile('Proj/web/node_modules/react/index.js'),
        pickedFile('Proj/.git/HEAD'),
        pickedFile('Proj/web/index.html'),
      ],
      'loc'
    );
    const paths = result.entries.map((e) => e.entryPath);
    expect(paths).toContain('web');
    expect(paths).toContain('web/index.html');
    expect(paths.some((p) => p.includes('node_modules') || p.includes('.git'))).toBe(false);
  });

  it('stops at the depth limit', () => {
    const deep = Array.from({ length: SCAN_LIMITS.maxDepth + 1 }, (_, i) => `d${i}`).join('/');
    const result = convertFileListToEntries([pickedFile(`Proj/${deep}/f.txt`)], 'loc');
    const maxDepth = Math.max(...result.entries.map((e) => e.entryPath.split('/').length));
    expect(maxDepth).toBe(SCAN_LIMITS.maxDepth);
    expect(result.entries.every((e) => e.isFolder)).toBe(true);
  });

  it('stops at the entry limit and reports truncation', () => {
    const files = Array.from({ length: SCAN_LIMITS.maxEntries + 10 }, (_, i) =>
      pickedFile(`Proj/f${i}.txt`)
    );
    const result = convertFileListToEntries(files, 'loc');
    expect(result.entries).toHaveLength(SCAN_LIMITS.maxEntries);
    expect(result.truncated).toBe(true);
  });
});

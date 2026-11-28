import { describe, expect, it } from 'vitest';
import { FavoriteFolder } from '../types/foldary';
import {
  editableNameRange,
  rebaseFavoritesAfterRename,
  rebasePath,
  renameHandleEntry,
  renameLastSegment,
  validateEntryName,
  validateFavoriteName,
} from './rename';
import { LocalDirectoryHandle } from './fileProvider';

describe('validateEntryName', () => {
  const siblings = ['Report.pdf', 'notes', 'a.txt'];
  it('accepts ordinary names and case-only changes of the same item', () => {
    expect(validateEntryName('Report v2.pdf', siblings, 'Report.pdf')).toBeNull();
    expect(validateEntryName('report.PDF', siblings, 'Report.pdf')).toBeNull();
    expect(validateEntryName('.env', siblings, 'a.txt')).toBeNull();
    expect(validateEntryName('CONTRACT.pdf', siblings, 'a.txt')).toBeNull();
  });
  it('rejects names the disk would refuse', () => {
    for (const bad of ['', '   ', '.', '..', 'a/b', 'a\\b', 'a:b', 'what?', 'a|b', 'x\u0001', 'end.', 'end ', 'CON', 'nul.txt', 'com3', 'LPT9.log', 'x'.repeat(256)]) {
      expect(validateEntryName(bad, siblings, 'a.txt'), bad).not.toBeNull();
    }
  });
  it('rejects a name another item in the folder has, ignoring case', () => {
    expect(validateEntryName('NOTES', siblings, 'a.txt')).toBe('"NOTES" already exists in this folder');
  });
});

describe('validateFavoriteName', () => {
  it('needs 1 to 80 characters after trimming', () => {
    expect(validateFavoriteName('  Work  ')).toBeNull();
    expect(validateFavoriteName('   ')).toBe('Enter a name');
    expect(validateFavoriteName('x'.repeat(81))).not.toBeNull();
  });
});

describe('name helpers', () => {
  it('selects the stem of a file and all of a folder or dotfile', () => {
    expect(editableNameRange('report.final.pdf', false)).toEqual([0, 12]);
    expect(editableNameRange('.gitignore', false)).toEqual([0, 10]);
    expect(editableNameRange('v1.2', true)).toEqual([0, 4]);
  });
  it('replaces the last path segment with either separator', () => {
    expect(renameLastSegment('a/b/c.txt', 'd.txt')).toBe('a/b/d.txt');
    expect(renameLastSegment('C:\\x\\old', 'new')).toBe('C:\\x\\new');
    expect(renameLastSegment('top', 'new')).toBe('new');
  });
  it('rebases paths at segment boundaries only, ignoring case', () => {
    expect(rebasePath('C:\\P\\Old', 'C:\\p\\old', 'C:\\p\\New')).toBe('C:\\p\\New');
    expect(rebasePath('C:\\P\\Old\\x', 'C:\\p\\old', 'C:\\p\\New')).toBe('C:\\p\\New\\x');
    expect(rebasePath('/p/old/x', '/p/old', '/p/new')).toBe('/p/new/x');
    expect(rebasePath('C:\\P\\Older', 'C:\\P\\Old', 'C:\\P\\New')).toBeNull();
  });
});

describe('rebaseFavoritesAfterRename', () => {
  const fav = (id: string, name: string, path: string, nativePath?: string): FavoriteFolder => ({
    id, name, path, nativePath, sortBy: 'name', sortOrder: 'asc', foldersFirst: true, sourceType: 'local',
  });
  const favorites = [
    fav('root', 'Proj', 'D:\\Proj', 'D:\\Proj'),
    fav('same', 'Old', 'D:\\Proj\\Old', 'D:\\Proj\\Old'),
    fav('custom', 'My stuff', 'D:\\Proj\\Old\\deep', 'D:\\Proj\\Old\\deep'),
    fav('similar', 'Older', 'D:\\Proj\\Older', 'D:\\Proj\\Older'),
  ];
  const changes = [{ from: 'D:\\Proj\\Old', to: 'D:\\Proj\\New' }];

  it('moves favorites at or under the renamed folder and renames the exact one', () => {
    const next = rebaseFavoritesAfterRename(favorites, changes, 'Old', 'New');
    expect(next[0]).toBe(favorites[0]);
    expect(next[1]).toMatchObject({ name: 'New', path: 'D:\\Proj\\New', nativePath: 'D:\\Proj\\New' });
    expect(next[2]).toMatchObject({ name: 'My stuff', path: 'D:\\Proj\\New\\deep' });
    expect(next[3]).toBe(favorites[3]);
  });
  it('keeps a custom name on the renamed folder and returns the same array when nothing matches', () => {
    const custom = [fav('c', 'Work', 'D:\\Proj\\Old')];
    expect(rebaseFavoritesAfterRename(custom, changes, 'Old', 'New')[0]).toMatchObject({ name: 'Work', path: 'D:\\Proj\\New' });
    expect(rebaseFavoritesAfterRename(favorites, [{ from: 'X:\\none', to: 'X:\\y' }], 'none', 'y')).toBe(favorites);
  });
  it('matches browser paths that differ from the stored path only by letter case', () => {
    const browser = [fav('b', 'Sub', 'Local\\Root\\sub')];
    const next = rebaseFavoritesAfterRename(browser, [{ from: 'Local\\Root\\Sub', to: 'Local\\Root\\Renamed' }], 'Sub', 'Renamed');
    expect(next[0]).toMatchObject({ name: 'Renamed', path: 'Local\\Root\\Renamed' });
  });
});

// A small in-memory stand-in for File System Access directory handles
type Node = { kind: 'file'; data: string } | { kind: 'directory'; children: Map<string, Node> };

function notFound() {
  return new DOMException('missing', 'NotFoundError');
}

function makeDir(node: Extract<Node, { kind: 'directory' }>, name: string, withMove: boolean): LocalDirectoryHandle {
  const handle = (parent: Extract<Node, { kind: 'directory' }>, childName: string, child: Node) => {
    const move = async (to: string) => {
      parent.children.delete(childName);
      parent.children.set(to, child);
    };
    if (child.kind === 'directory') {
      const dir = makeDir(child, childName, withMove);
      return withMove ? Object.assign(dir, { move }) : dir;
    }
    return {
      kind: 'file' as const,
      name: childName,
      getFile: async () => new File([child.data], childName),
      createWritable: async () => ({
        write: async (blob: Blob) => { child.data = await blob.text(); },
        close: async () => undefined,
      }),
      ...(withMove ? { move } : {}),
    };
  };
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [n, c] of node.children) yield [n, handle(node, n, c)] as never;
    },
    async getDirectoryHandle(n: string) {
      const c = node.children.get(n);
      if (!c) throw notFound();
      if (c.kind !== 'directory') throw new DOMException('file', 'TypeMismatchError');
      return handle(node, n, c) as LocalDirectoryHandle;
    },
    async getFileHandle(n: string, options?: { create?: boolean }) {
      let c = node.children.get(n);
      if (!c && options?.create) node.children.set(n, (c = { kind: 'file', data: '' }));
      if (!c) throw notFound();
      if (c.kind !== 'file') throw new DOMException('dir', 'TypeMismatchError');
      return handle(node, n, c) as never;
    },
    async removeEntry(n: string) {
      if (!node.children.delete(n)) throw notFound();
    },
  };
}

function tree(): Extract<Node, { kind: 'directory' }> {
  return {
    kind: 'directory',
    children: new Map<string, Node>([
      ['a.txt', { kind: 'file', data: 'A' }],
      ['sub', { kind: 'directory', children: new Map<string, Node>([['b.txt', { kind: 'file', data: 'B' }]]) }],
    ]),
  };
}

describe('renameHandleEntry', () => {
  it('uses move() for files and folders when the browser has it', async () => {
    const t = tree();
    const root = makeDir(t, 'Root', true);
    await renameHandleEntry(root, 'sub/b.txt', 'c.txt', false);
    await renameHandleEntry(root, 'sub', 'renamed', true);
    expect([...t.children.keys()].sort()).toEqual(['a.txt', 'renamed']);
    const sub = t.children.get('renamed');
    expect(sub?.kind === 'directory' && [...sub.children.keys()]).toEqual(['c.txt']);
  });

  it('copies a file to the new name without move(), and refuses folders and case-only changes', async () => {
    const t = tree();
    const root = makeDir(t, 'Root', false);
    await renameHandleEntry(root, 'a.txt', 'z.txt', false);
    expect(t.children.has('a.txt')).toBe(false);
    const z = t.children.get('z.txt');
    expect(z?.kind === 'file' && z.data).toBe('A');
    await expect(renameHandleEntry(root, 'sub', 'x', true)).rejects.toThrow("can't rename folders");
    await expect(renameHandleEntry(root, 'z.txt', 'Z.txt', false)).rejects.toThrow('letter case');
  });

  it('refuses a name that already exists and a missing item', async () => {
    const root = makeDir(tree(), 'Root', true);
    await expect(renameHandleEntry(root, 'a.txt', 'sub', false)).rejects.toThrow('already exists');
    await expect(renameHandleEntry(root, 'gone.txt', 'x.txt', false)).rejects.toThrow('moved or deleted');
  });
});

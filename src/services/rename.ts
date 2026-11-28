/**
 * Renaming: name rules, keeping favorites and paths in step after a rename, and the
 * browser (File System Access API) rename adapter. The desktop shell renames through the
 * `rename_path` Rust command instead (see nativeBridge.ts and src-tauri/src/rename.rs).
 */
import { FavoriteFolder } from '../types/foldary';
import { LocalDirectoryHandle, resolveSubdirectoryHandle } from './fileProvider';

export const MAX_ENTRY_NAME = 255;
export const MAX_FAVORITE_NAME = 80;

const FORBIDDEN_CHARS = /[/\\:*?"<>|]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Checks a new file or folder name. Returns an error message, or null when the name is fine.
 * Same rules as `validate_name` in src-tauri/src/rename.rs, plus a check against the other
 * items in the folder (letter case ignored, but changing only the case is allowed).
 */
export function validateEntryName(
  name: string,
  siblingNames: string[],
  currentName: string
): string | null {
  if (!name.trim()) return 'Enter a name';
  if (name === '.' || name === '..') return '"." and ".." can\'t be used as names';
  if (FORBIDDEN_CHARS.test(name) || CONTROL_CHARS.test(name)) {
    return 'A name can\'t contain / \\ : * ? " < > |';
  }
  if (/[ .]$/.test(name)) return "A name can't end with a space or a dot";
  if ([...name].length > MAX_ENTRY_NAME) {
    return `A name can't be longer than ${MAX_ENTRY_NAME} characters`;
  }
  const stem = name.split('.')[0].trimEnd();
  if (RESERVED.test(stem)) return `"${name}" is reserved by Windows`;
  const lower = name.toLowerCase();
  const isSelf = lower === currentName.toLowerCase();
  if (!isSelf && siblingNames.some((s) => s.toLowerCase() === lower)) {
    return `"${name}" already exists in this folder`;
  }
  return null;
}

/** Checks a pinned folder's display name. Returns an error message or null. */
export function validateFavoriteName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name';
  if (trimmed.length > MAX_FAVORITE_NAME) {
    return `A name can't be longer than ${MAX_FAVORITE_NAME} characters`;
  }
  return null;
}

/** The part of a name to select for editing: the stem of a file, all of a folder or dotfile. */
export function editableNameRange(name: string, isFolder: boolean): [number, number] {
  const dot = name.lastIndexOf('.');
  if (isFolder || dot <= 0) return [0, name.length];
  return [0, dot];
}

/** Replaces the last segment of a `/` or `\` separated path. */
export function renameLastSegment(path: string, newName: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === -1 ? newName : `${path.slice(0, cut + 1)}${newName}`;
}

/**
 * If `path` is `from` or lies inside it (letter case ignored), returns it moved under `to`;
 * otherwise returns null.
 */
export function rebasePath(path: string, from: string, to: string): string | null {
  if (!from) return null;
  const lowerPath = path.toLowerCase();
  const lowerFrom = from.toLowerCase();
  if (lowerPath === lowerFrom) return to;
  if (lowerPath.startsWith(`${lowerFrom}/`) || lowerPath.startsWith(`${lowerFrom}\\`)) {
    return `${to}${path.slice(from.length)}`;
  }
  return null;
}

export interface PathChange {
  from: string;
  to: string;
}

/**
 * Updates favorites after a folder was renamed on disk: paths (and desktop disk paths)
 * at or under a renamed path move to the new name. A favorite of the renamed folder
 * itself takes the new name unless it was given its own name.
 * Returns the same array when nothing changed.
 */
export function rebaseFavoritesAfterRename(
  favorites: FavoriteFolder[],
  changes: PathChange[],
  oldName: string,
  newName: string
): FavoriteFolder[] {
  let changed = false;
  const next = favorites.map((fav) => {
    let path = fav.path;
    let nativePath = fav.nativePath;
    let exact = false;
    for (const { from, to } of changes) {
      const p = rebasePath(path, from, to);
      if (p !== null) {
        exact ||= p === to;
        path = p;
      }
      if (nativePath) {
        const n = rebasePath(nativePath, from, to);
        if (n !== null) {
          exact ||= n === to;
          nativePath = n;
        }
      }
    }
    const name = exact && fav.name === oldName ? newName : fav.name;
    if (path === fav.path && nativePath === fav.nativePath && name === fav.name) return fav;
    changed = true;
    return { ...fav, path, name, ...(nativePath ? { nativePath } : {}) };
  });
  return changed ? next : favorites;
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError');
}

/** True when the folder already holds a file or folder called `name`. */
async function hasChild(parent: LocalDirectoryHandle, name: string): Promise<boolean> {
  for (const probe of [
    () => parent.getDirectoryHandle(name),
    () => (parent.getFileHandle ? parent.getFileHandle(name) : Promise.reject(new DOMException('', 'NotFoundError'))),
  ]) {
    try {
      await probe();
      return true;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  return false;
}

/**
 * Renames the item at `entryPath` (relative to `root`) in a folder opened with the
 * File System Access API. Uses `move()` where the browser has it; otherwise files are
 * copied to the new name and the old one removed. Throws an Error with a readable message.
 * The caller must already hold `readwrite` permission.
 */
export async function renameHandleEntry(
  root: LocalDirectoryHandle,
  entryPath: string,
  newName: string,
  isFolder: boolean
): Promise<void> {
  const segments = entryPath.split('/').filter(Boolean);
  const oldName = segments.pop();
  if (!oldName) throw new Error('This folder is the pinned folder. Rename the pinned folder instead');
  const parent = await resolveSubdirectoryHandle(root, segments.join('/'));
  if (!parent) throw new Error('The folder holding this item was moved or deleted');

  const caseOnly = oldName !== newName && oldName.toLowerCase() === newName.toLowerCase();
  if (!caseOnly && oldName !== newName && (await hasChild(parent, newName))) {
    throw new Error(`"${newName}" already exists in this folder`);
  }

  let child;
  try {
    child = isFolder
      ? await parent.getDirectoryHandle(oldName)
      : await parent.getFileHandle?.(oldName);
  } catch {
    child = undefined;
  }
  if (!child) throw new Error(`"${oldName}" was moved or deleted`);

  if (typeof child.move === 'function') {
    await child.move(newName);
    return;
  }
  if (isFolder) {
    throw new Error("This browser can't rename folders. Use the Foldary desktop app");
  }
  const file = child as Awaited<ReturnType<NonNullable<LocalDirectoryHandle['getFileHandle']>>>;
  if (caseOnly) {
    throw new Error("This browser can't change only the letter case of a name");
  }
  if (!parent.getFileHandle || !parent.removeEntry) {
    throw new Error("This browser can't rename files");
  }
  const target = await parent.getFileHandle(newName, { create: true });
  if (typeof target.createWritable !== 'function') {
    throw new Error("This browser can't rename files");
  }
  try {
    const writable = await target.createWritable();
    await writable.write(await file.getFile());
    await writable.close();
  } catch (err) {
    // Don't leave a half-written copy next to the original
    await parent.removeEntry(newName).catch(() => undefined);
    throw err;
  }
  await parent.removeEntry(oldName);
}

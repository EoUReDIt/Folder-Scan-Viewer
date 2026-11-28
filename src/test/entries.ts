import { categorizeExtension, extractExtension } from '../services/fileProvider';
import { FileEntry } from '../types/foldary';

/** Builds a FileEntry from its path inside the root ("Reports/q4.pdf"); folders end in "/". */
export function entry(path: string, overrides: Partial<FileEntry> = {}): FileEntry {
  const isFolder = path.endsWith('/');
  const entryPath = path.replace(/\/$/, '');
  const parts = entryPath.split('/');
  const name = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');
  const extension = isFolder ? '' : extractExtension(name);
  return {
    id: entryPath,
    name,
    isFolder,
    extension,
    category: isFolder ? 'folder' : categorizeExtension(extension),
    relativePath: parentPath ? `.\\${parentPath.split('/').join('\\')}\\` : '.\\',
    parentPath,
    entryPath,
    fullPath: `C:\\Root\\${entryPath.split('/').join('\\')}`,
    dateModified: Date.now(),
    size: isFolder ? 0 : 100,
    isHidden: false,
    ...overrides,
  };
}

/** A File with a webkitRelativePath, as <input webkitdirectory> returns it. */
export function pickedFile(relativePath: string, lastModified = 1_700_000_000_000): File {
  const name = relativePath.split('/').pop() ?? relativePath;
  const file = new File(['x'], name, { lastModified });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

import type { LocalDirectoryHandle } from './fileProvider';

/**
 * IndexedDB store for File System Access directory handles, keyed by favorite id.
 * Handles are structured-cloneable, so they survive reloads here even though
 * they cannot be written to localStorage. Every call fails soft: when IndexedDB
 * is unavailable (private mode, sandboxed iframe), the app behaves as if no
 * handle was stored and the folder must be chosen again.
 */

const DB_NAME = 'foldary.handles';
const DB_VERSION = 1;
const STORE = 'directoryHandles';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function saveHandle(id: string, handle: LocalDirectoryHandle): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(handle, id));
  } catch {
    // Persisting is best-effort; the folder still works for this session.
  }
}

export async function loadHandle(id: string): Promise<LocalDirectoryHandle | null> {
  try {
    const handle = await run<LocalDirectoryHandle | undefined>('readonly', (store) =>
      store.get(id)
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function deleteHandle(id: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // Ignore
  }
}

export async function clearHandles(): Promise<void> {
  try {
    await run('readwrite', (store) => store.clear());
  } catch {
    // Ignore
  }
}

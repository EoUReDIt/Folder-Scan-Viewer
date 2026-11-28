import { useCallback } from 'react';
import { FileEntry } from '../types/foldary';
import { openNativePath, revealNativePath } from '../services/nativeBridge';
import { Notify } from './useToasts';

/** Copy a path, or open / reveal a file through the desktop shell, reporting failures as toasts. */
export function useFileActions(notify: Notify) {
  const copyText = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify(`Copied ${label.toLowerCase()}`, 'success');
      } catch {
        notify(`Path: ${value}`, 'info');
      }
    },
    [notify]
  );

  const openNative = useCallback(
    (entry: FileEntry) => {
      if (!entry.nativePath) return;
      openNativePath(entry.nativePath).catch((err) =>
        notify(`Could not open "${entry.name}": ${String(err)}`, 'error')
      );
    },
    [notify]
  );

  const revealNative = useCallback(
    (entry: FileEntry) => {
      if (!entry.nativePath) return;
      revealNativePath(entry.nativePath).catch((err) =>
        notify(`Could not show "${entry.name}": ${String(err)}`, 'error')
      );
    },
    [notify]
  );

  return { copyText, openNative, revealNative };
}

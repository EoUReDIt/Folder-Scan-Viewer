import { RefObject, useEffect } from 'react';
import { FavoriteFolder, FileEntry } from '../types/foldary';

interface KeyboardShortcutOptions {
  /** False while a dialog or menu that handles its own keys is open. */
  enabled: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  favorites: FavoriteFolder[];
  searchQuery: string;
  visibleEntries: FileEntry[];
  selectedId: string | null;
  selectedEntry: FileEntry | null;
  currentSubpath: string;
  onSelectFolder: (folderId: string) => void;
  onClearSearch: () => void;
  onSelectEntry: (id: string) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onOpenNative: (entry: FileEntry) => void;
  onNavigateUp: () => void;
  onTogglePreview: () => void;
}

/** Global keyboard shortcuts & arrow-key navigation (AGENTS.md §4.4). */
export function useKeyboardShortcuts({
  enabled,
  searchInputRef,
  favorites,
  searchQuery,
  visibleEntries,
  selectedId,
  selectedEntry,
  currentSubpath,
  onSelectFolder,
  onClearSearch,
  onSelectEntry,
  onOpenEntry,
  onOpenNative,
  onNavigateUp,
  onTogglePreview,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The settings dialog and the context menu handle their own keys while open
      if (!enabled) return;

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      // Ctrl+K or Ctrl+Space: Focus search bar immediately
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'Space')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Slash key when not typing
      if (e.key === '/' && !isInputFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Alt + 1..9: Jump to pinned favorite folder
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (favorites[idx]) {
          e.preventDefault();
          onSelectFolder(favorites[idx].id);
        }
        return;
      }

      // Escape: clear search (an open context menu closes itself)
      if (e.key === 'Escape') {
        if (searchQuery) {
          onClearSearch();
          return;
        }
        if (isInputFocused) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // ArrowDown / ArrowUp: Navigate rows seamlessly even from search bar
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (visibleEntries.length === 0) return;
        e.preventDefault();
        const currentIndex = visibleEntries.findIndex((item) => item.id === selectedId);
        let nextIndex = 0;
        if (currentIndex === -1) {
          nextIndex = e.key === 'ArrowDown' ? 0 : visibleEntries.length - 1;
        } else if (e.key === 'ArrowDown') {
          nextIndex = Math.min(visibleEntries.length - 1, currentIndex + 1);
        } else {
          nextIndex = Math.max(0, currentIndex - 1);
        }
        onSelectEntry(visibleEntries[nextIndex].id);
        return;
      }

      // Ctrl+Enter: open the selected file with its default app (desktop shell only)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && selectedEntry) {
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (selectedEntry.nativePath && !selectedEntry.isFolder) {
          onOpenNative(selectedEntry);
        }
        return;
      }

      // Enter: Open selected folder or preview file
      if (e.key === 'Enter' && selectedEntry) {
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        onOpenEntry(selectedEntry);
        return;
      }

      // Backspace: Go up a folder when not editing input
      if (e.key === 'Backspace' && !isInputFocused && currentSubpath) {
        e.preventDefault();
        onNavigateUp();
        return;
      }

      // Space: Toggle quick preview when not typing or pressing a button
      if (
        e.code === 'Space' &&
        !isInputFocused &&
        target?.tagName !== 'BUTTON' &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        onTogglePreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    searchInputRef,
    favorites,
    searchQuery,
    visibleEntries,
    selectedId,
    selectedEntry,
    currentSubpath,
    onSelectFolder,
    onClearSearch,
    onSelectEntry,
    onOpenEntry,
    onOpenNative,
    onNavigateUp,
    onTogglePreview,
  ]);
}

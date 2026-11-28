import { useEffect, useRef } from 'react';
import {
  Copy,
  ExternalLink,
  Eye,
  FileText,
  FolderInput,
  FolderOpen,
  Home,
  ScanSearch,
  Star,
} from 'lucide-react';
import { ContextMenuState, FileEntry } from '../types/foldary';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  isFolderAlreadyFavorited: boolean;
  onClose: () => void;
  onOpenFolderHere: (entryPath: string) => void;
  onToggleFavoriteFolder: (entryPath: string, name: string, fullPath: string) => void;
  onSetFolderAsDefault: (entryPath: string, name: string, fullPath: string) => void;
  onPreviewFile: () => void;
  onOpenContainingFolder: (entry: FileEntry) => void;
  onCopyText: (value: string, label: string) => void;
  /** Desktop shell only: shown for entries with a nativePath */
  onOpenNative: (entry: FileEntry) => void;
  onRevealNative: (entry: FileEntry) => void;
}

const ITEM_CLASS =
  'w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-[13px] text-[#1A1A1A] dark:text-[#F3F3F3] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] focus:bg-[#F3F3F3] dark:focus:bg-[#383838] focus:outline-none transition-colors';

function getItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

export function ContextMenu({
  menu,
  isFolderAlreadyFavorited,
  onClose,
  onOpenFolderHere,
  onToggleFavoriteFolder,
  onSetFolderAsDefault,
  onPreviewFile,
  onOpenContainingFolder,
  onCopyText,
  onOpenNative,
  onRevealNative,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = menu !== null;

  // Hand focus back to where it was (usually the grid) once the menu closes, unless the user
  // already moved it somewhere else, e.g. by clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const focusLeftWithMenu =
        !document.activeElement || document.activeElement === document.body;
      if (opener?.isConnected && focusLeftWithMenu) opener.focus();
    };
  }, [isOpen]);

  // Focus the first item whenever the menu opens, or reopens for another row
  useEffect(() => {
    if (menu) getItems(menuRef.current)[0]?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // Up/Down wrap through the items, Home/End jump to the ends, Tab closes like a native menu
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
      return;
    }
    const items = getItems(menuRef.current);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };

  const { entry } = menu;
  // Keep floating menu safely within viewport boundaries
  const menuWidth = 224;
  const hasNative = Boolean(entry.nativePath);
  const nativeItems = hasNative ? (entry.isFolder ? 1 : 2) : 0;
  const menuHeight = (entry.isFolder ? 185 : 175) + nativeItems * 30 + (hasNative ? 9 : 0);
  const left = Math.min(menu.x, Math.max(8, window.innerWidth - menuWidth - 12));
  const top = Math.min(menu.y, Math.max(8, window.innerHeight - menuHeight - 12));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${entry.name}`}
      onKeyDown={handleMenuKeyDown}
      style={{ left, top }}
      className="fixed z-50 w-56 py-1.5 rounded-lg bg-white dark:bg-[#2C2C2C] border border-[#DFDFDF] dark:border-[#424242] shadow-xl select-none"
    >
      <div aria-hidden="true" className="px-3 py-1 text-[11px] font-medium text-[#5C5C5C] dark:text-[#A6A6A6] truncate border-b border-[#EFEFEF] dark:border-[#3A3A3A] mb-1">
        {entry.name}
      </div>

      {entry.isFolder ? (
        <>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onOpenFolderHere(entry.entryPath);
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
            <span>Open here</span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onToggleFavoriteFolder(entry.entryPath, entry.name, entry.fullPath);
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <Star
              className={`w-3.5 h-3.5 text-amber-500 ${
                isFolderAlreadyFavorited ? 'fill-amber-500' : ''
              }`}
            />
            <span>
              {isFolderAlreadyFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onSetFolderAsDefault(entry.entryPath, entry.name, entry.fullPath);
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <Home className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
            <span>Set as Default Folder</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onPreviewFile();
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <Eye className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
            <span>Quick Preview</span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onOpenContainingFolder(entry);
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <FolderInput className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6]" />
            <span>Open Containing Folder</span>
          </button>
        </>
      )}

      {hasNative && (
        <>
          <div role="separator" className="my-1 border-t border-[#EFEFEF] dark:border-[#3A3A3A]" />
          {!entry.isFolder && (
            <button
              type="button"
              role="menuitem"
            tabIndex={-1}
              onClick={() => {
                onOpenNative(entry);
                onClose();
              }}
              className={ITEM_CLASS}
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
              <span className="flex-1">Open</span>
              <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6]">Ctrl+Enter</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onRevealNative(entry);
              onClose();
            }}
            className={ITEM_CLASS}
          >
            <ScanSearch className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6]" />
            <span>Show in Explorer</span>
          </button>
        </>
      )}

      <div role="separator" className="my-1 border-t border-[#EFEFEF] dark:border-[#3A3A3A]" />

      <button
        type="button"
        role="menuitem"
            tabIndex={-1}
        onClick={() => {
          onCopyText(entry.fullPath, 'Full path');
          onClose();
        }}
        className={ITEM_CLASS}
      >
        <Copy className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6]" />
        <span>Copy Path</span>
      </button>

      <button
        type="button"
        role="menuitem"
            tabIndex={-1}
        onClick={() => {
          onCopyText(entry.name, 'Filename');
          onClose();
        }}
        className={ITEM_CLASS}
      >
        <FileText className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6]" />
        <span>Copy Name</span>
      </button>
    </div>
  );
}

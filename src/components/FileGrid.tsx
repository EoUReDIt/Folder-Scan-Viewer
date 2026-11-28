import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CornerLeftUp,
  FolderOpen,
  FolderSync,
  Loader2,
  RotateCcw,
  SearchX,
} from 'lucide-react';
import { FileEntry, LocalFolderStatus, SortField, SortOrder } from '../types/foldary';
import {
  formatExactDate,
  formatFileSize,
  formatRelativeTime,
  getCategoryLabel,
} from '../services/fileProvider';
import { FileIcon } from './FileIcon';

interface FileGridProps {
  entries: FileEntry[];
  selectedId: string | null;
  sortBy: SortField;
  sortOrder: SortOrder;
  currentSubpath: string;
  hasActiveFilters: boolean;
  onSortColumn: (field: SortField) => void;
  onSelectRow: (entry: FileEntry) => void;
  onDoubleClickRow: (entry: FileEntry) => void;
  /** Right-click on a row, or Shift+F10 / the Menu key on the selected row. */
  onContextMenuRow: (position: { x: number; y: number }, entry: FileEntry) => void;
  /** Accessible name for the grid, e.g. the folder being shown. */
  gridLabel: string;
  onNavigateUp: () => void;
  onResetFilters: () => void;
  /** Set when the active folder is a local folder whose contents are not loaded yet. */
  unavailable?: {
    status: Exclude<LocalFolderStatus, 'ready'>;
    folderName: string;
    onReconnect: () => void;
    onChooseAgain: () => void;
  } | null;
}

const COLUMNS: {
  id: SortField;
  label: string;
  align: 'left' | 'right';
  widthClass: string;
}[] = [
  { id: 'name', label: 'Name', align: 'left', widthClass: 'w-[34%] min-w-[200px]' },
  { id: 'relativePath', label: 'Path (Relative)', align: 'left', widthClass: 'w-[22%] min-w-[130px]' },
  { id: 'dateModified', label: 'Date Modified', align: 'left', widthClass: 'w-[18%] min-w-[120px]' },
  { id: 'size', label: 'Size', align: 'right', widthClass: 'w-[12%] min-w-[84px]' },
  { id: 'category', label: 'Type', align: 'left', widthClass: 'w-[14%] min-w-[100px]' },
];

/** DOM id for a body row, referenced by the grid's aria-activedescendant. */
function rowDomId(index: number) {
  return `foldary-row-${index}`;
}

/** Fixed row pitch: matches the h-[38px] row class below. */
const ROW_HEIGHT = 38;
/** Lists longer than this only render the rows near the viewport. */
const VIRTUALIZE_AFTER = 150;
/** Extra rows rendered above and below the viewport while virtualized. */
const OVERSCAN = 12;

export function FileGrid({
  entries,
  selectedId,
  sortBy,
  sortOrder,
  currentSubpath,
  hasActiveFilters,
  onSortColumn,
  onSelectRow,
  onDoubleClickRow,
  onContextMenuRow,
  onNavigateUp,
  onResetFilters,
  unavailable,
  gridLabel,
}: FileGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const [view, setView] = useState({ scrollTop: 0, height: 0, tbodyTop: 0 });
  // Last measured view, so scroll events that change nothing schedule no React update
  const viewRef = useRef(view);

  // Where the first body row sits inside the scrolled content (below the Up bar and header)
  const measureTbodyTop = useCallback(() => {
    const container = containerRef.current;
    const tbody = tbodyRef.current;
    if (!container || !tbody) return 0;
    return (
      tbody.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop
    );
  }, []);

  const syncView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = {
      scrollTop: container.scrollTop,
      height: container.clientHeight,
      tbodyTop: measureTbodyTop(),
    };
    const prev = viewRef.current;
    if (
      prev.scrollTop === next.scrollTop &&
      prev.height === next.height &&
      prev.tbodyTop === next.tbodyTop
    ) {
      return;
    }
    viewRef.current = next;
    setView(next);
  }, [measureTbodyTop]);

  const hasRows = !unavailable && entries.length > 0;

  useLayoutEffect(() => {
    syncView();
  }, [syncView, hasRows, currentSubpath, entries.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => syncView());
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncView]);

  // Keep the selected row in view, clear of the sticky header. Works by index, so it also
  // reaches rows that are not rendered while the list is virtualized.
  // A layout effect that re-syncs the window in the same commit: if the update waited for the
  // scroll event instead, fast key repeat would leave it pending between keypress commits until
  // React aborts with "Maximum update depth exceeded" (M6).
  useLayoutEffect(() => {
    if (!selectedId) return;
    const container = containerRef.current;
    if (!container) return;
    const index = entries.findIndex((e) => e.id === selectedId);
    if (index < 0) return;
    const headerHeight = theadRef.current?.offsetHeight ?? 0;
    const rowTop = measureTbodyTop() + index * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop - headerHeight < container.scrollTop) {
      container.scrollTop = rowTop - headerHeight;
    } else if (rowBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = rowBottom - container.clientHeight;
    }
    syncView();
    // Follow selection and folder changes, not every re-sort or filter keystroke
  }, [selectedId, currentSubpath]);

  const virtualized = entries.length > VIRTUALIZE_AFTER;
  let start = 0;
  let end = entries.length;
  if (virtualized) {
    const offset = view.scrollTop - view.tbodyTop;
    const height = view.height || 800;
    start = Math.max(0, Math.floor(offset / ROW_HEIGHT) - OVERSCAN);
    end = Math.min(entries.length, Math.ceil((offset + height) / ROW_HEIGHT) + OVERSCAN);
    if (end <= start) end = Math.min(entries.length, start + OVERSCAN * 2);
  }
  const visibleEntries = virtualized ? entries.slice(start, end) : entries;
  const selectedIndex = selectedId ? entries.findIndex((e) => e.id === selectedId) : -1;
  // Only point at a row that is actually rendered
  const activeRowId =
    selectedIndex >= start && selectedIndex < end ? rowDomId(selectedIndex) : undefined;

  // Shift+F10 or the Menu key opens the row's actions menu, anchored under its name
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
    if (selectedIndex < 0) return;
    e.preventDefault();
    const rect = document.getElementById(rowDomId(selectedIndex))?.getBoundingClientRect();
    if (!rect) return;
    onContextMenuRow({ x: rect.left + 24, y: rect.bottom }, entries[selectedIndex]);
  };
  const topSpacer = start * ROW_HEIGHT;
  const bottomSpacer = (entries.length - end) * ROW_HEIGHT;

  return (
    <div
      ref={containerRef}
      onScroll={virtualized ? syncView : undefined}
      className="flex-1 min-h-0 overflow-auto bg-white dark:bg-[#272727]"
    >
      {currentSubpath && (
        <div className="px-4 py-1.5 bg-[#FAFAFA] dark:bg-[#242424] border-b border-[#EFEFEF] dark:border-[#343434] flex items-center">
          <button
            type="button"
            onClick={onNavigateUp}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0067C0] dark:text-[#60CDFF] hover:underline focus-visible:outline-2 focus-visible:outline-[#0067C0]"
          >
            <CornerLeftUp className="w-3.5 h-3.5" />
            <span>Up to parent folder</span>
            <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6]">
              (Backspace)
            </span>
          </button>
        </div>
      )}

      {unavailable ? (
        <div className="h-full min-h-[280px] flex flex-col items-center justify-center px-6 py-12 text-center">
          {unavailable.status === 'loading' ? (
            <>
              <Loader2
                className="w-9 h-9 text-[#8E8E8E] dark:text-[#6E6E6E] mb-3 animate-spin"
                strokeWidth={1.5}
              />
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1">
                Checking folder access…
              </h3>
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] max-w-sm">
                Reopening “{unavailable.folderName}”.
              </p>
            </>
          ) : (
            <>
              <FolderSync
                className="w-9 h-9 text-[#8E8E8E] dark:text-[#6E6E6E] mb-3"
                strokeWidth={1.5}
              />
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1">
                {unavailable.status === 'needs-permission'
                  ? 'Allow access to this folder again'
                  : 'Choose this folder again'}
              </h3>
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] max-w-sm mb-4">
                {unavailable.status === 'needs-permission'
                  ? `Your browser needs permission to read “${unavailable.folderName}” after a reload.`
                  : `The browser can't reopen “${unavailable.folderName}” on its own. Pick the same folder to load its files; this favorite keeps its sort and Default settings.`}
              </p>
              <div className="flex items-center gap-2">
                {unavailable.status === 'needs-permission' && (
                  <button
                    type="button"
                    onClick={unavailable.onReconnect}
                    className="h-8 px-3.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    <span>Reconnect folder</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={unavailable.onChooseAgain}
                  className={
                    unavailable.status === 'needs-permission'
                      ? 'h-8 px-3.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium border border-[#E5E5E5] dark:border-[#383838] bg-white dark:bg-[#2C2C2C] hover:bg-[#F3F3F3] dark:hover:bg-[#333333] text-[#1A1A1A] dark:text-[#F3F3F3] transition-colors'
                      : 'h-8 px-3.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors'
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Choose folder again</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : entries.length === 0 ? (
        <div className="h-full min-h-[280px] flex flex-col items-center justify-center px-6 py-12 text-center">
          {hasActiveFilters ? (
            <>
              <SearchX className="w-9 h-9 text-[#8E8E8E] dark:text-[#6E6E6E] mb-3" strokeWidth={1.5} />
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1">
                No matching files found
              </h3>
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] max-w-sm mb-4">
                Your current search query, type filter, or date window hid all items in this folder.
              </p>
              <button
                type="button"
                onClick={onResetFilters}
                className="h-8 px-3.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear all filters</span>
              </button>
            </>
          ) : (
            <>
              <FolderOpen className="w-9 h-9 text-[#8E8E8E] dark:text-[#6E6E6E] mb-3" strokeWidth={1.5} />
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1">
                This folder is empty
              </h3>
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] max-w-sm">
                There are no visible files in this directory. Try enabling “Show hidden files” or navigating up.
              </p>
            </>
          )}
        </div>
      ) : (
        <table
          role="grid"
          tabIndex={0}
          aria-label={gridLabel}
          aria-rowcount={entries.length + 1}
          aria-activedescendant={activeRowId}
          onKeyDown={handleGridKeyDown}
          onContextMenu={(e) => {
            // The Menu key fires contextmenu on the focused grid itself; the keydown handler opens it
            if (e.target === e.currentTarget) e.preventDefault();
          }}
          className="group w-full border-collapse text-left table-fixed outline-none"
        >
          <thead
            ref={theadRef}
            className="sticky top-0 z-10 bg-[#FAFAFA] dark:bg-[#242424] border-b border-[#E5E5E5] dark:border-[#383838] select-none">
            <tr aria-rowindex={1}>
              {COLUMNS.map((col) => {
                const isSorted = sortBy === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={
                      isSorted
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={`${col.widthClass} px-3.5 py-2 text-[12px] font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]`}
                  >
                    <button
                      type="button"
                      onClick={() => onSortColumn(col.id)}
                      className={`w-full inline-flex items-center gap-1 hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
                        col.align === 'right' ? 'justify-end' : 'justify-start'
                      } ${isSorted ? 'text-[#0067C0] dark:text-[#60CDFF]' : ''}`}
                    >
                      <span className="truncate">{col.label}</span>
                      {isSorted &&
                        (sortOrder === 'desc' ? (
                          <ArrowDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ArrowUp className="w-3 h-3 shrink-0" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            ref={tbodyRef}
            className="divide-y divide-[#F0F0F0] dark:divide-[#323232]"
          >
            {topSpacer > 0 && (
              <tr aria-hidden="true" className="border-0" style={{ height: topSpacer }} />
            )}
            {visibleEntries.map((entry, i) => {
              const isSelected = entry.id === selectedId;
              return (
                <tr
                  key={entry.id}
                  id={rowDomId(start + i)}
                  aria-rowindex={start + i + 2}
                  onClick={() => onSelectRow(entry)}
                  onDoubleClick={() => onDoubleClickRow(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenuRow({ x: e.clientX, y: e.clientY }, entry);
                  }}
                  aria-selected={isSelected}
                  className={`h-[38px] cursor-pointer transition-colors select-none ${
                    isSelected
                      ? 'bg-[#0067C0]/10 dark:bg-[#60CDFF]/15 text-[#1A1A1A] dark:text-[#FFFFFF] group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-[#0067C0] dark:group-focus-visible:outline-[#60CDFF]'
                      : 'text-[#1A1A1A] dark:text-[#E8E8E8] hover:bg-[#F5F5F5] dark:hover:bg-[#313131]'
                  } ${entry.isHidden ? 'opacity-70' : ''}`}
                >
                  <td className="px-3.5 py-1.5 text-[13px] font-medium truncate">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileIcon
                        category={entry.category}
                        extension={entry.extension}
                        isFolder={entry.isFolder}
                      />
                      <span className="truncate">{entry.name}</span>
                    </div>
                  </td>

                  <td
                    title={entry.fullPath}
                    className="px-3.5 py-1.5 font-mono text-[12px] text-[#5C5C5C] dark:text-[#A6A6A6] truncate"
                  >
                    {entry.relativePath}
                  </td>

                  <td
                    title={formatExactDate(entry.dateModified)}
                    className="px-3.5 py-1.5 font-mono text-[12px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums whitespace-nowrap truncate"
                  >
                    {formatRelativeTime(entry.dateModified)}
                  </td>

                  <td className="px-3.5 py-1.5 font-mono text-[12px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums text-right whitespace-nowrap">
                    {formatFileSize(entry.size, entry.isFolder)}
                  </td>

                  <td className="px-3.5 py-1.5 text-[12px] text-[#5C5C5C] dark:text-[#A6A6A6] whitespace-nowrap truncate">
                    {getCategoryLabel(entry.category, entry.extension)}
                  </td>
                </tr>
              );
            })}
            {bottomSpacer > 0 && (
              <tr aria-hidden="true" className="border-0" style={{ height: bottomSpacer }} />
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

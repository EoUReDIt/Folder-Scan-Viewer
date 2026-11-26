import { useEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CornerLeftUp,
  FolderOpen,
  RotateCcw,
  SearchX,
} from 'lucide-react';
import { FileEntry, SortField, SortOrder } from '../types/foldary';
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
  onContextMenuRow: (e: React.MouseEvent, entry: FileEntry) => void;
  onNavigateUp: () => void;
  onResetFilters: () => void;
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
}: FileGridProps) {
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    const el = rowRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedId]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-[#272727]">
      {currentSubpath && (
        <div className="px-4 py-1.5 bg-[#FAFAFA] dark:bg-[#242424] border-b border-[#EFEFEF] dark:border-[#343434] flex items-center">
          <button
            type="button"
            onClick={onNavigateUp}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0067C0] dark:text-[#60CDFF] hover:underline focus-visible:outline-2 focus-visible:outline-[#0067C0]"
          >
            <CornerLeftUp className="w-3.5 h-3.5" />
            <span>Up to parent folder</span>
            <span className="font-mono text-[11px] text-[#767676] dark:text-[#8E8E8E]">
              (Backspace)
            </span>
          </button>
        </div>
      )}

      {entries.length === 0 ? (
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
        <table className="w-full border-collapse text-left table-fixed">
          <thead className="sticky top-0 z-10 bg-[#FAFAFA] dark:bg-[#242424] border-b border-[#E5E5E5] dark:border-[#383838] select-none">
            <tr>
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

          <tbody className="divide-y divide-[#F0F0F0] dark:divide-[#323232]">
            {entries.map((entry) => {
              const isSelected = entry.id === selectedId;
              return (
                <tr
                  key={entry.id}
                  ref={(node) => {
                    if (node) rowRefs.current.set(entry.id, node);
                    else rowRefs.current.delete(entry.id);
                  }}
                  onClick={() => onSelectRow(entry)}
                  onDoubleClick={() => onDoubleClickRow(entry)}
                  onContextMenu={(e) => onContextMenuRow(e, entry)}
                  aria-selected={isSelected}
                  className={`h-[38px] cursor-pointer transition-colors select-none ${
                    isSelected
                      ? 'bg-[#0067C0]/10 dark:bg-[#60CDFF]/15 text-[#1A1A1A] dark:text-[#FFFFFF]'
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
          </tbody>
        </table>
      )}
    </div>
  );
}

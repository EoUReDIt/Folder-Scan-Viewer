import { ArrowDown, ArrowUp, FolderTree, RotateCcw } from 'lucide-react';
import { SortField, SortOrder, StartupBehavior } from '../types/foldary';

interface SortToolbarProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  startupBehavior: StartupBehavior;
  includeSubfolders: boolean;
  totalVisible: number;
  hasActiveFilters: boolean;
  onQuickSort: (field: SortField, defaultOrder: SortOrder) => void;
  onToggleIncludeSubfolders: () => void;
  onResetFilters: () => void;
}

const QUICK_SORTS: {
  id: SortField;
  label: string;
  defaultOrder: SortOrder;
}[] = [
  { id: 'dateModified', label: 'Recent', defaultOrder: 'desc' },
  { id: 'name', label: 'A–Z', defaultOrder: 'asc' },
  { id: 'size', label: 'Largest', defaultOrder: 'desc' },
  { id: 'category', label: 'Kind', defaultOrder: 'asc' },
];

export function SortToolbar({
  sortBy,
  sortOrder,
  startupBehavior,
  includeSubfolders,
  totalVisible,
  hasActiveFilters,
  onQuickSort,
  onToggleIncludeSubfolders,
  onResetFilters,
}: SortToolbarProps) {
  return (
    <div className="min-h-[42px] px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 bg-[#F9F9F9] dark:bg-[#272727] border-b border-[#E5E5E5] dark:border-[#383838] select-none">
      {/* Quick Sort Controls */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] whitespace-nowrap shrink-0">
          Sort:
        </span>

        <div
          role="group"
          aria-label="Quick sort options"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-[#EDEDED] dark:bg-[#1F1F1F] border border-[#E2E2E2] dark:border-[#383838]"
        >
          {QUICK_SORTS.map((preset) => {
            const isActive = sortBy === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onQuickSort(preset.id, preset.defaultOrder)}
                className={`h-6 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
                  isActive
                    ? 'bg-white dark:bg-[#333333] text-[#0067C0] dark:text-[#60CDFF] shadow-xs'
                    : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3]'
                }`}
              >
                <span>{preset.label}</span>
                {isActive &&
                  (sortOrder === 'desc' ? (
                    <ArrowDown className="w-3 h-3" />
                  ) : (
                    <ArrowUp className="w-3 h-3" />
                  ))}
              </button>
            );
          })}
        </div>

        <span className="hidden xl:inline text-xs text-[#767676] dark:text-[#8E8E8E] whitespace-nowrap">
          · {startupBehavior === 'per_folder' ? 'Saved per folder' : 'Global startup sort'}
        </span>
      </div>

      {/* Scope Switcher + Results Metadata */}
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={onToggleIncludeSubfolders}
          className="h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#E0E0E0] dark:border-[#404040] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0]"
        >
          <FolderTree className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
          <span>
            Scope: {includeSubfolders ? 'Include Subfolders' : 'Current Folder Only'}
          </span>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#0067C0] dark:text-[#60CDFF] hover:underline whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset filters</span>
          </button>
        )}

        <span className="font-mono text-xs text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums whitespace-nowrap shrink-0">
          {totalVisible} {totalVisible === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  );
}

import {
  Clock,
  File,
  FileArchive,
  FileText,
  Film,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Music,
  Star,
  Trash2,
} from 'lucide-react';
import { FavoriteFolder, FilterType, RecencyFilter } from '../types/foldary';

interface SidebarProps {
  favorites: FavoriteFolder[];
  activeFolderId: string;
  defaultFolderId: string;
  filterType: FilterType;
  categoryCounts: Record<FilterType, number>;
  recency: RecencyFilter;
  includeSubfolders: boolean;
  showHiddenFiles: boolean;
  foldersFirst: boolean;
  onSelectFolder: (folderId: string) => void;
  onAddLocalFolder: () => void;
  onRemoveFavorite: (folderId: string) => void;
  onFilterTypeChange: (type: FilterType) => void;
  onRecencyChange: (recency: RecencyFilter) => void;
  onToggleIncludeSubfolders: () => void;
  onToggleShowHidden: () => void;
  onToggleFoldersFirst: () => void;
}

const FILTER_OPTIONS: {
  id: FilterType;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'file', label: 'File', icon: File },
  { id: 'document', label: 'Document', icon: FileText },
  { id: 'picture', label: 'Picture', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'compressed', label: 'Compressed', icon: FileArchive },
];

const RECENCY_OPTIONS: { id: RecencyFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '1d', label: 'Last 1 day' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '365d', label: 'Last 365 days' },
];

function FluentToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="w-full px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2 text-left text-[13px] text-[#1A1A1A] dark:text-[#F3F3F3] hover:bg-[#EAEAEA] dark:hover:bg-[#2E2E2E] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0]"
    >
      <span className="truncate">{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-[18px] w-[34px] shrink-0 items-center rounded-full transition-colors ${
          checked
            ? 'bg-[#0067C0] dark:bg-[#60CDFF]'
            : 'bg-transparent border border-[#767676] dark:border-[#8E8E8E]'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full transition-transform ${
            checked
              ? 'translate-x-[18px] bg-white dark:bg-[#1A1A1A]'
              : 'translate-x-[2px] bg-[#5C5C5C] dark:bg-[#A6A6A6]'
          }`}
        />
      </span>
    </button>
  );
}

export function Sidebar({
  favorites,
  activeFolderId,
  defaultFolderId,
  filterType,
  categoryCounts,
  recency,
  includeSubfolders,
  showHiddenFiles,
  foldersFirst,
  onSelectFolder,
  onAddLocalFolder,
  onRemoveFavorite,
  onFilterTypeChange,
  onRecencyChange,
  onToggleIncludeSubfolders,
  onToggleShowHidden,
  onToggleFoldersFirst,
}: SidebarProps) {
  return (
    <aside className="w-[244px] shrink-0 h-full overflow-y-auto bg-[#F3F3F3] dark:bg-[#202020] border-r border-[#E5E5E5] dark:border-[#383838] px-2.5 py-3 flex flex-col gap-5 select-none">
      {/* Pinned Folders */}
      <section aria-label="Pinned Folders">
        <div className="flex items-center justify-between px-2 mb-1.5">
          <h2 className="text-[12px] font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]">
            Pinned Folders
          </h2>
          <button
            type="button"
            onClick={onAddLocalFolder}
            title="Mount a local folder from your computer"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-[#0067C0] dark:text-[#60CDFF] hover:bg-[#0067C0]/10 dark:hover:bg-[#60CDFF]/15 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0]"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Add Folder</span>
          </button>
        </div>

        <ul className="space-y-0.5">
          {favorites.map((fav) => {
            const isActive = fav.id === activeFolderId;
            const isDefault = fav.id === defaultFolderId;
            const sortHint = `${fav.sortBy === 'dateModified' ? 'Date' : fav.sortBy} ${
              fav.sortOrder === 'desc' ? '↓' : '↑'
            }`;

            return (
              <li key={fav.id} className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectFolder(fav.id)}
                  title={`${fav.path} · Saved sort: ${sortHint}`}
                  className={`relative w-full h-8 px-2.5 rounded-md flex items-center gap-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
                    isActive
                      ? 'bg-[#E6E6E6] dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#FFFFFF] font-medium'
                      : 'text-[#1A1A1A] dark:text-[#E5E5E5] hover:bg-[#EAEAEA] dark:hover:bg-[#2A2A2A]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[#0067C0] dark:bg-[#60CDFF]"
                    />
                  )}
                  {isDefault ? (
                    <Home className="w-3.5 h-3.5 shrink-0 text-[#0067C0] dark:text-[#60CDFF]" />
                  ) : fav.sourceType === 'local' ? (
                    <HardDrive className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Star className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500/25" />
                  )}
                  <span className="truncate flex-1">{fav.name}</span>
                  {isDefault && (
                    <span className="text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] shrink-0">
                      Default
                    </span>
                  )}
                </button>

                {!isDefault && favorites.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFavorite(fav.id);
                    }}
                    title={`Unpin ${fav.name}`}
                    aria-label={`Unpin ${fav.name}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute right-1.5 p-1 rounded text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Filter by Type */}
      <section aria-label="Filter by file type">
        <h2 className="px-2 mb-1.5 text-[12px] font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]">
          Filter by
        </h2>
        <ul className="space-y-0.5">
          {FILTER_OPTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = filterType === id;
            const count = categoryCounts[id] ?? 0;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onFilterTypeChange(id)}
                  className={`relative w-full h-8 px-2.5 rounded-md flex items-center justify-between gap-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
                    isActive
                      ? 'bg-[#E6E6E6] dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#FFFFFF] font-medium'
                      : 'text-[#1A1A1A] dark:text-[#E5E5E5] hover:bg-[#EAEAEA] dark:hover:bg-[#2A2A2A]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[#0067C0] dark:bg-[#60CDFF]"
                    />
                  )}
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive
                          ? 'text-[#0067C0] dark:text-[#60CDFF]'
                          : 'text-[#5C5C5C] dark:text-[#A6A6A6]'
                      }`}
                    />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#8E8E8E] tabular-nums shrink-0">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Recently modified */}
      <section aria-label="Recently modified">
        <h2 className="px-2 mb-1.5 text-[12px] font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]">
          Recently modified
        </h2>
        <ul className="space-y-0.5">
          {RECENCY_OPTIONS.map(({ id, label }) => {
            const isActive = recency === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onRecencyChange(id)}
                  className={`relative w-full h-8 px-2.5 rounded-md flex items-center gap-2.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
                    isActive
                      ? 'bg-[#E6E6E6] dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#FFFFFF] font-medium'
                      : 'text-[#1A1A1A] dark:text-[#E5E5E5] hover:bg-[#EAEAEA] dark:hover:bg-[#2A2A2A]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[#0067C0] dark:bg-[#60CDFF]"
                    />
                  )}
                  <Clock
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive
                        ? 'text-[#0067C0] dark:text-[#60CDFF]'
                        : 'text-[#5C5C5C] dark:text-[#A6A6A6]'
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Advanced Toggles */}
      <section aria-label="Advanced options" className="pb-2">
        <h2 className="px-2 mb-1.5 text-[12px] font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]">
          Advanced
        </h2>
        <div className="space-y-0.5">
          <FluentToggle
            label="Include subfolders"
            checked={includeSubfolders}
            onChange={onToggleIncludeSubfolders}
          />
          <FluentToggle
            label="Show hidden files"
            checked={showHiddenFiles}
            onChange={onToggleShowHidden}
          />
          <FluentToggle
            label="Pin folders to top"
            checked={foldersFirst}
            onChange={onToggleFoldersFirst}
          />
        </div>
      </section>
    </aside>
  );
}

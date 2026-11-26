import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Home,
  Moon,
  PanelRight,
  Search,
  Settings,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { FavoriteFolder, ThemeMode } from '../types/foldary';

interface TopBarProps {
  favorites: FavoriteFolder[];
  activeFolder: FavoriteFolder;
  defaultFolderId: string;
  currentSubpath: string;
  searchQuery: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isCurrentLocationFavorited: boolean;
  isCurrentLocationDefault: boolean;
  previewOpen: boolean;
  theme: ThemeMode;
  onSelectFolder: (folderId: string) => void;
  onNavigateSubpath: (subpath: string) => void;
  onSearchChange: (q: string) => void;
  onToggleFavoriteCurrent: () => void;
  onSetCurrentAsDefault: () => void;
  onAddLocalFolder: () => void;
  onTogglePreview: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function TopBar({
  favorites,
  activeFolder,
  defaultFolderId,
  currentSubpath,
  searchQuery,
  searchInputRef,
  isCurrentLocationFavorited,
  isCurrentLocationDefault,
  previewOpen,
  theme,
  onSelectFolder,
  onNavigateSubpath,
  onSearchChange,
  onToggleFavoriteCurrent,
  onSetCurrentAsDefault,
  onAddLocalFolder,
  onTogglePreview,
  onToggleTheme,
  onOpenSettings,
}: TopBarProps) {
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!favDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFavDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFavDropdownOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [favDropdownOpen]);

  const subpathSegments = currentSubpath ? currentSubpath.split('/').filter(Boolean) : [];
  const activeLeafName =
    subpathSegments.length > 0 ? subpathSegments[subpathSegments.length - 1] : activeFolder.name;

  return (
    <header className="h-[52px] shrink-0 flex items-center gap-3 px-3 bg-[#F3F3F3] dark:bg-[#202020] border-b border-[#E5E5E5] dark:border-[#383838] select-none">
      {/* Brand + Favorites quick switcher */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-[15px] font-bold tracking-tight text-[#1A1A1A] dark:text-[#F3F3F3] whitespace-nowrap shrink-0 pl-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Foldary
        </span>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setFavDropdownOpen((prev) => !prev)}
            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-white dark:bg-[#2C2C2C] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#E0E0E0] dark:border-[#3E3E3E] hover:bg-[#F9F9F9] dark:hover:bg-[#353535] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0]"
            aria-expanded={favDropdownOpen}
            aria-haspopup="menu"
          >
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/25 shrink-0" />
            <span>Favorites</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6] shrink-0" />
          </button>

          {favDropdownOpen && (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 py-1.5 rounded-lg bg-white dark:bg-[#2C2C2C] border border-[#E0E0E0] dark:border-[#424242] shadow-lg"
            >
              <div className="px-3 py-1 text-[11px] font-medium text-[#5C5C5C] dark:text-[#A6A6A6]">
                Switch folder
              </div>
              {favorites.map((fav, index) => {
                const isDefault = fav.id === defaultFolderId;
                const isActive = fav.id === activeFolder.id && !currentSubpath;
                return (
                  <button
                    key={fav.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectFolder(fav.id);
                      setFavDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left text-[13px] transition-colors ${
                      isActive
                        ? 'bg-[#0067C0]/10 dark:bg-[#60CDFF]/15 text-[#0067C0] dark:text-[#60CDFF] font-medium'
                        : 'text-[#1A1A1A] dark:text-[#F3F3F3] hover:bg-[#F3F3F3] dark:hover:bg-[#383838]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {isDefault ? (
                        <Home className="w-3.5 h-3.5 shrink-0 text-[#0067C0] dark:text-[#60CDFF]" />
                      ) : (
                        <Star className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500/25" />
                      )}
                      <span className="truncate">{fav.name}</span>
                      {isDefault && (
                        <span className="text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] shrink-0">
                          · Default
                        </span>
                      )}
                    </span>
                    {index < 9 && (
                      <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums shrink-0">
                        Alt+{index + 1}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="my-1.5 border-t border-[#E5E5E5] dark:border-[#3E3E3E]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFavDropdownOpen(false);
                  onAddLocalFolder();
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[13px] text-[#0067C0] dark:text-[#60CDFF] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Mount Local Folder...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active Folder Context & Breadcrumb Bar */}
      <div className="flex items-center gap-1.5 h-8 px-2.5 min-w-0 max-w-[44%] rounded-md bg-white dark:bg-[#2C2C2C] border border-[#E0E0E0] dark:border-[#3E3E3E]">
        <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-400/20 shrink-0" />

        <nav
          aria-label="Current folder path"
          className="flex items-center gap-1 min-w-0 overflow-hidden text-xs"
        >
          <button
            type="button"
            onClick={() => onNavigateSubpath('')}
            title={activeFolder.path}
            className={`truncate font-mono text-[12px] transition-colors whitespace-nowrap ${
              subpathSegments.length === 0
                ? 'text-[#1A1A1A] dark:text-[#F3F3F3] font-medium'
                : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#0067C0] dark:hover:text-[#60CDFF]'
            }`}
          >
            {activeFolder.path}
          </button>

          {subpathSegments.map((segment, idx) => {
            const pathUpTo = subpathSegments.slice(0, idx + 1).join('/');
            const isLast = idx === subpathSegments.length - 1;
            return (
              <span key={pathUpTo} className="flex items-center gap-0.5 min-w-0 shrink-0">
                <ChevronRight className="w-3 h-3 text-[#5C5C5C] dark:text-[#8E8E8E] shrink-0" />
                <button
                  type="button"
                  onClick={() => onNavigateSubpath(pathUpTo)}
                  className={`font-mono text-[12px] truncate max-w-[140px] transition-colors ${
                    isLast
                      ? 'text-[#1A1A1A] dark:text-[#F3F3F3] font-medium'
                      : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#0067C0] dark:hover:text-[#60CDFF]'
                  }`}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </nav>

        <div className="h-4 w-px bg-[#E5E5E5] dark:bg-[#404040] mx-1 shrink-0" />

        <button
          type="button"
          onClick={onToggleFavoriteCurrent}
          title={
            isCurrentLocationFavorited
              ? 'Remove current folder from Favorites'
              : 'Add current folder to Favorites'
          }
          aria-label={
            isCurrentLocationFavorited ? 'Remove from Favorites' : 'Add to Favorites'
          }
          className={`p-1 rounded transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
            isCurrentLocationFavorited
              ? 'text-amber-500 hover:bg-amber-500/10'
              : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] hover:bg-[#F3F3F3] dark:hover:bg-[#383838]'
          }`}
        >
          <Star
            className={`w-3.5 h-3.5 ${isCurrentLocationFavorited ? 'fill-amber-500' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={onSetCurrentAsDefault}
          title={
            isCurrentLocationDefault
              ? 'This is your Default Startup Folder'
              : 'Set as Default Startup Folder'
          }
          aria-label={
            isCurrentLocationDefault
              ? 'Current Default Startup Folder'
              : 'Set as Default Startup Folder'
          }
          className={`p-1 rounded transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
            isCurrentLocationDefault
              ? 'text-[#0067C0] dark:text-[#60CDFF] bg-[#0067C0]/10 dark:bg-[#60CDFF]/15'
              : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] hover:bg-[#F3F3F3] dark:hover:bg-[#383838]'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Live Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search in ${activeLeafName}...`}
          aria-label={`Search in ${activeLeafName}`}
          className="w-full h-8 pl-8 pr-16 rounded-md text-[13px] bg-white dark:bg-[#2C2C2C] text-[#1A1A1A] dark:text-[#F3F3F3] placeholder:text-[#767676] dark:placeholder:text-[#8E8E8E] border border-[#E0E0E0] dark:border-[#3E3E3E] border-b-[#B8B8B8] dark:border-b-[#555555] focus:outline-none focus:border-[#0067C0] dark:focus:border-[#60CDFF] focus:border-b-2 transition-colors"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] hover:bg-[#F0F0F0] dark:hover:bg-[#3A3A3A]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#767676] dark:text-[#8E8E8E] hidden sm:inline">
            Ctrl+K
          </span>
        )}
      </div>

      {/* Right Utility Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onTogglePreview}
          title={previewOpen ? 'Hide Quick Preview (Space)' : 'Show Quick Preview (Space)'}
          aria-label="Toggle Quick Preview pane"
          aria-pressed={previewOpen}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0] ${
            previewOpen
              ? 'bg-[#0067C0]/12 dark:bg-[#60CDFF]/15 text-[#0067C0] dark:text-[#60CDFF]'
              : 'text-[#5C5C5C] dark:text-[#A6A6A6] hover:bg-[#E8E8E8] dark:hover:bg-[#333333] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3]'
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[#5C5C5C] dark:text-[#A6A6A6] hover:bg-[#E8E8E8] dark:hover:bg-[#333333] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] transition-colors focus-visible:outline-2 focus-visible:outline-[#0067C0]"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings & config.json"
          aria-label="Open Settings"
          className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-[#1A1A1A] dark:text-[#F3F3F3] hover:bg-[#E8E8E8] dark:hover:bg-[#333333] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0067C0]"
        >
          <Settings className="w-4 h-4 text-[#5C5C5C] dark:text-[#A6A6A6]" />
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>
    </header>
  );
}

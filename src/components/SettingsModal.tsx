import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Keyboard,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { AppConfig, SortField, SortOrder, StartupBehavior } from '../types/foldary';
import {
  downloadConfigJson,
  exportConfigJsonString,
  validateAndNormalizeConfig,
} from '../services/configStorage';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onClose: () => void;
  onUpdateConfig: (updater: (prev: AppConfig) => AppConfig) => void;
  onImportConfig: (nextConfig: AppConfig) => void;
  onResetWorkspace: () => void;
  onNotify: (text: string, tone?: 'info' | 'success' | 'error') => void;
}

type SettingsTab = 'general' | 'config' | 'shortcuts';

const TABS: { id: SettingsTab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'general', label: 'Startup & Sorting', icon: SlidersHorizontal },
  { id: 'config', label: 'config.json', icon: Download },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
];

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable controls inside the dialog, in Tab order, skipping hidden ones (like the file input). */
function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0
  );
}

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: 'Ctrl + K / Ctrl + Space', desc: 'Focus folder search input' },
  { keys: '↑ / ↓', desc: 'Move selection up or down in file grid' },
  { keys: 'Enter', desc: 'Open selected folder or open file preview' },
  { keys: 'Ctrl + Enter', desc: 'Open selected file with its default app (desktop app)' },
  { keys: 'Backspace', desc: 'Navigate up to parent folder' },
  { keys: 'Space', desc: 'Toggle Quick Preview pane' },
  { keys: 'F2', desc: 'Rename the selected item' },
  { keys: 'Shift + F10 / Menu', desc: 'Open the actions menu for the selected row' },
  { keys: 'Alt + 1–9', desc: 'Switch directly to a pinned favorite folder' },
  { keys: 'Esc', desc: 'Clear search or close menus & modals' },
];

export function SettingsModal({
  isOpen,
  config,
  onClose,
  onUpdateConfig,
  onImportConfig,
  onResetWorkspace,
  onNotify,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open, keep it there, and hand it back to the opener on close
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const keepFocusInside = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        panel.focus();
      }
    };
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      const focusLeftWithDialog =
        !document.activeElement || document.activeElement === document.body;
      if (opener?.isConnected && focusLeftWithDialog) opener.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const jsonPreview = exportConfigJsonString(config);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = validateAndNormalizeConfig(parsed);
      if (result.ok === false) {
        setImportError(result.error);
        return;
      }
      onImportConfig(result.config);
      onNotify('Imported config.json successfully', 'success');
    } catch {
      setImportError('Invalid JSON file. Please select a valid Foldary config.json.');
    } finally {
      e.target.value = '';
    }
  };

  // Tab and Shift+Tab cycle through the dialog's controls instead of leaving it
  const handleTrapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = getFocusable(panelRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Left/Right/Home/End move between tabs (automatic activation)
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === activeTab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActiveTab(TABS[next].id);
    document.getElementById(`settings-tab-${TABS[next].id}`)?.focus();
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonPreview);
      onNotify('Copied config.json to clipboard', 'success');
    } catch {
      onNotify('Could not access clipboard in this context', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        onKeyDown={handleTrapTab}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white dark:bg-[#272727] border border-[#DFDFDF] dark:border-[#404040] shadow-2xl overflow-hidden outline-none"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#E5E5E5] dark:border-[#383838] bg-[#F9F9F9] dark:bg-[#2C2C2C]">
          <h2
            id="settings-modal-title"
            className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F3F3F3]"
          >
            Foldary Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-1 rounded-md text-[#5C5C5C] dark:text-[#A6A6A6] hover:bg-[#EAEAEA] dark:hover:bg-[#353535] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="px-5 pt-2.5 flex items-center gap-5 border-b border-[#E5E5E5] dark:border-[#383838] bg-[#F9F9F9] dark:bg-[#2C2C2C]"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`settings-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="settings-tabpanel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={handleTabKeyDown}
                className={`pb-2.5 inline-flex items-center gap-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0067C0] dark:focus-visible:outline-[#60CDFF] ${
                  isActive
                    ? 'border-[#0067C0] dark:border-[#60CDFF] text-[#0067C0] dark:text-[#60CDFF]'
                    : 'border-transparent text-[#5C5C5C] dark:text-[#A6A6A6] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div
          id="settings-tabpanel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="p-5 overflow-y-auto flex-1 space-y-5"
        >
          {activeTab === 'general' && (
            <>
              {/* Default Startup Folder */}
              <div>
                <label
                  htmlFor="default-folder-select"
                  className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1.5"
                >
                  Default Startup Folder (Home)
                </label>
                <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] mb-2">
                  Foldary opens directly into this folder on launch with files immediately visible.
                </p>
                <select
                  id="default-folder-select"
                  value={config.defaultFolderId}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({ ...prev, defaultFolderId: e.target.value }))
                  }
                  className="w-full h-9 px-3 rounded-md text-[13px] bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] focus:outline-none focus:border-[#0067C0] dark:focus:border-[#60CDFF]"
                >
                  {config.favorites.map((fav) => (
                    <option key={fav.id} value={fav.id}>
                      {fav.name} — {fav.path}
                    </option>
                  ))}
                </select>
              </div>

              {/* Startup Sort Behavior */}
              <div>
                <div className="text-xs font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1.5">
                  Startup Sort Behavior
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      {
                        id: 'per_folder' as StartupBehavior,
                        title: 'Per-Folder Memory',
                        desc: 'Remember a separate sort field, order, and folder pinning for each favorited folder.',
                      },
                      {
                        id: 'global' as StartupBehavior,
                        title: 'Global Startup Sort',
                        desc: 'Every launch and folder switch starts with your chosen global sort order below.',
                      },
                    ] as const
                  ).map((option) => {
                    const selected = config.startupBehavior === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            startupBehavior: option.id,
                          }))
                        }
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selected
                            ? 'border-[#0067C0] dark:border-[#60CDFF] bg-[#0067C0]/6 dark:bg-[#60CDFF]/10'
                            : 'border-[#E2E2E2] dark:border-[#3D3D3D] hover:bg-[#F7F7F7] dark:hover:bg-[#303030]'
                        }`}
                      >
                        <div className="text-[13px] font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-0.5">
                          {option.title}
                        </div>
                        <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] leading-relaxed">
                          {option.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Global Sort Selector */}
              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="global-sort-field"
                    className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1.5"
                  >
                    Global Sort Column
                  </label>
                  <select
                    id="global-sort-field"
                    value={config.globalSortBy}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        globalSortBy: e.target.value as SortField,
                      }))
                    }
                    className="w-full h-9 px-3 rounded-md text-[13px] bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] focus:outline-none focus:border-[#0067C0] dark:focus:border-[#60CDFF]"
                  >
                    <option value="dateModified">Date Modified</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                    <option value="category">File Type</option>
                    <option value="relativePath">Relative Path</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="global-sort-order"
                    className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-1.5"
                  >
                    Global Sort Direction
                  </label>
                  <select
                    id="global-sort-order"
                    value={config.globalSortOrder}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        globalSortOrder: e.target.value as SortOrder,
                      }))
                    }
                    className="w-full h-9 px-3 rounded-md text-[13px] bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] focus:outline-none focus:border-[#0067C0] dark:focus:border-[#60CDFF]"
                  >
                    <option value="desc">Descending (Newest / Largest / Z–A)</option>
                    <option value="asc">Ascending (Oldest / Smallest / A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Saved Per-Folder Summary */}
              <div className="pt-2 border-t border-[#EAEAEA] dark:border-[#383838]">
                <div className="text-xs font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] mb-2">
                  Per-Folder Sort Memory
                </div>
                <div className="divide-y divide-[#EFEFEF] dark:divide-[#343434] border border-[#E5E5E5] dark:border-[#3A3A3A] rounded-lg overflow-hidden">
                  {config.favorites.map((fav) => (
                    <div
                      key={fav.id}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs bg-[#FAFAFA] dark:bg-[#2C2C2C]"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[#1A1A1A] dark:text-[#F3F3F3] truncate">
                          {fav.name}
                          {fav.id === config.defaultFolderId && (
                            <span className="ml-1.5 text-[11px] font-normal text-[#0067C0] dark:text-[#60CDFF]">
                              · Default
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] truncate">
                          {fav.path}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] whitespace-nowrap shrink-0">
                        {fav.sortBy} ({fav.sortOrder === 'desc' ? '↓' : '↑'}) ·{' '}
                        {fav.foldersFirst ? 'folders first' : 'mixed'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] leading-relaxed">
                This live <code className="font-mono">config.json</code> mirrors Foldary’s portable
                desktop schema. Export it to seed your Tauri or Electron build on GitHub, or import
                an edited file to test different startup sort behaviors.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadConfigJson(config);
                    onNotify('Downloaded config.json', 'success');
                  }}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download config.json</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import config.json</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </button>

                <button
                  type="button"
                  onClick={onResetWorkspace}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset workspace</span>
                </button>
              </div>

              {importError && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-md border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
                >
                  {importError}
                </div>
              )}

              <pre className="p-3.5 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1C] border border-[#E2E2E2] dark:border-[#383838] font-mono text-[11.5px] leading-relaxed text-[#1A1A1A] dark:text-[#E2E2E2] overflow-auto max-h-72">
                {jsonPreview}
              </pre>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="divide-y divide-[#EFEFEF] dark:divide-[#343434] border border-[#E5E5E5] dark:border-[#3A3A3A] rounded-lg overflow-hidden">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.keys}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-4 text-xs bg-white dark:bg-[#242424]"
                >
                  <span className="text-[#1A1A1A] dark:text-[#F3F3F3]">{s.desc}</span>
                  <kbd className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#F3F3F3] dark:bg-[#323232] text-[#1A1A1A] dark:text-[#E5E5E5] border border-[#E0E0E0] dark:border-[#444444] whitespace-nowrap shrink-0">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end border-t border-[#E5E5E5] dark:border-[#383838] bg-[#F9F9F9] dark:bg-[#2C2C2C]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

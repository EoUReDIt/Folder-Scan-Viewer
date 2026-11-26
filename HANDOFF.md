# HANDOFF.md

Technical handoff notes for taking **Foldary** from this working web Proof of Concept (POC) to a production desktop application on GitHub.

---

## 1. Current State (What Is Built & Working)

The React + TypeScript + Tailwind CSS v4 frontend is complete, compiles cleanly (`tsc --noEmit` + `vite build`), and exercises the full end-to-end UX:

- **Direct-to-Default Startup**: Opens immediately into `defaultFolderId` (`Projects` by default) with sorted files visible right away.
- **Pinned Favorites & Subfolder Pinning**:
  - Preloaded demo folders (`Projects`, `Downloads`, `Invoices`) plus live pinning of any nested subfolder via the TopBar star/home controls or right-click context menu.
  - One-click switching via sidebar, TopBar Favorites dropdown, or `Alt+1..9`.
- **Sorting Engine & Persistence**:
  - Supports **Per-Folder Memory** (remembers `sortBy`, `sortOrder`, and `foldersFirst` independently per favorite folder) and **Global Startup Sort** (configurable in Settings).
  - Clickable column headers (`Name`, `Path (Relative)`, `Date Modified`, `Size`, `Type`) + Quick Sort toolbar (`Recent`, `A–Z`, `Largest`, `Kind`).
- **Stacked Faceted Filtering**:
  - Instant substring + subsequence fuzzy search (`Ctrl+K`, `Ctrl+Space`, `/`).
  - `Filter by` categories: `All`, `Folder`, `File`, `Document`, `Picture`, `Video`, `Audio`, `Compressed` (with live counts).
  - `Recently modified`: `All`, `Last 1 day`, `Last 7 days`, `Last 30 days`, `Last 365 days`.
  - `Advanced` toggles: `Include subfolders` (Flat Mode vs. Directory Mode), `Show hidden files`, `Pin folders to top`.
- **Local Folder Mounting (Browser POC)**:
  - `+ Add Folder` attempts `window.showDirectoryPicker()` (File System Access API) and automatically falls back to `<input type="file" webkitdirectory>` so it works across browsers and iframes.
  - Reads real image previews (`URL.createObjectURL`) and UTF-8 text/code snippets in the Quick Preview pane.
- **Quick Preview & Context Menu**:
  - Collapsible right-hand preview pane (`Space`) for images, text/code, folder summaries, video/audio, and compressed archives.
  - Viewport-clamped right-click menu (`Open here`, `Add/Remove Favorites`, `Set as Default Folder`, `Quick Preview`, `Open Containing Folder`, `Copy Path`, `Copy Name`).
- **`config.json` Portability**:
  - Persists to `localStorage` under `foldary.config.v1`.
  - Settings modal provides live JSON inspection, copy, `config.json` download, validated JSON import, and demo reset.
- **Theme**: Windows 11 Fluent Light + Dark mode toggle synced to `<html class="dark">`.

---

## 2. Known Browser POC Limitations

These are intentional web-sandbox constraints to replace once wrapped in a native desktop shell:

1. **Local folders do not survive page refresh**: Browser `FileList` / `FileSystemDirectoryHandle` references live in memory only. `saveConfig()` currently persists demo favorites to `localStorage` and excludes ephemeral browser local folders.
2. **No OS file execution**: Double-clicking a file opens the in-app Quick Preview pane instead of launching the OS default application (e.g., opening a `.pdf` or `.docx`).
3. **No live filesystem watcher**: New or modified files on disk are not pushed automatically until native watching is wired up.
4. **No OS-wide summon hotkey**: `Ctrl+Space` and `Ctrl+K` work while the app window is focused, not globally across the OS.
5. **Browser scan cap**: `tryPickDirectoryWithNativeApi` caps depth at 8 and 2,500 entries and skips `node_modules`/`.git` to stay responsive inside a browser tab.

---

## 3. Recommended Desktop Migration Path (Tauri v2)

The React UI is already cleanly separated from data adapters, making **Tauri v2** (Rust backend + this Vite frontend) the fastest path to native performance.

### Step 1: Tauri v2 Shell & Manual NSIS Release Workflow (Already Scaffolded)
A minimal Tauri v2 Windows shell (`src-tauri/`) targeting **NSIS `.exe` installers** and a manual GitHub Actions workflow (`.github/workflows/release.yml`) are already set up in this repo:
- Run **Actions → Release Foldary (Windows NSIS Installer)** with `mode: version_bump_only` for a no-output version increase (commits synced versions across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` with no installer artifact).
- Run with `mode: release_installer` to build the Windows NSIS `.exe` setup installer and publish a GitHub Release with `SHA256SUMS.txt`.

To add native filesystem, dialog, opener, and global hotkey plugins next:
```bash
npm install -D @tauri-apps/cli
npm install @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-opener @tauri-apps/plugin-global-shortcut
```

### Step 2: Replace the Two Adapter Files

Only two service modules need native implementations:

| Web POC Module | Native Desktop Replacement |
| :--- | :--- |
| `src/services/fileProvider.ts` (`tryPickDirectoryWithNativeApi`, `readLocalFileTextSnippet`) | Rust IPC commands: `scan_folder(path, include_subfolders)` using `walkdir`, `open_file(path)` / `reveal_in_explorer(path)` via `tauri-plugin-opener`, and `pick_folder()` via `tauri-plugin-dialog`. |
| `src/services/configStorage.ts` (`loadSavedConfig`, `saveConfig`) | Read/write `%APPDATA%/Foldary/config.json` (Windows) or `~/.config/foldary/config.json` (macOS/Linux) via `tauri-plugin-fs` using the exact same `AppConfig` JSON schema. |

### Step 3: Add Live Watching & Global Hotkey
- **Live File Watcher**: Use Rust's `notify` crate on the currently active folder path, debounced (~150ms), emitting a `foldary://fs-changed` event to React so newly downloaded or edited files jump to the top automatically.
- **Global Summon Hotkey**: Register `Ctrl+Space` (or user-configurable shortcut) via `tauri-plugin-global-shortcut` to toggle window visibility and focus `searchInputRef`.

---

## 4. Suggested Next-Milestone Backlog

Priority order for continuing on GitHub:

1. **Native Filesystem Backend (Tauri IPC)** — Replace browser folder picker with persistent OS paths so real folders save inside `config.json` and load automatically on app startup.
2. **Open File & Reveal in Explorer** — Wire double-click / `Enter` on files to launch the OS default handler, and add "Show in Explorer / Finder" to `ContextMenu.tsx`.
3. **Real-Time File Watcher** — Live updates via `notify` without manual refresh.
4. **Virtual Scrolling for Massive Folders** — Swap the `<tbody>` list in `FileGrid.tsx` for `@tanstack/react-virtual` once indexing 10,000+ files in flat subfolder mode.
5. **Custom Extension Filter Editor** — Wire an edit dialog next to `Filter by` so power users can customize extension mappings (e.g., add `.fig`, `.blend`, or `.psd` to custom categories) and store them in `config.json`.
6. **Multi-Select & Drag-Out** — Support `Shift`/`Ctrl` multi-row selection for batch copying paths or dragging files into other desktop apps.
7. **System Tray & Launch at Login** — Minimize to tray for sub-50ms summon latency.

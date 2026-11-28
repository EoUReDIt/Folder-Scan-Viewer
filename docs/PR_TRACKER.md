# Foldary PR Tracker

Single source of truth for review findings and the pull requests that resolve them. Agents without GitHub tooling should read and update this file instead of GitHub.

**Baseline**: v2.0.1 (`f1f0385`), reviewed 2026-11-28.
**Method**: one issue → one PR at a time (waterfall).

## Resolution track

Every issue moves through these stages in order:

> 📋 Document (this file) → 🔀 PR opened → 📝 Proposal → 🔧 Implementation → ✅ Ready-to-close check → 🏁 PR closed/merged

Status values: ⏳ Not started · 🟡 In progress · ✅ Done · ❌ Blocked

## Findings backlog

| ID | Severity | Finding | Status | PR |
|----|----------|---------|--------|----|
| H1 | 🔴 High | Mounted local folders (and a local Default Folder) are never persisted; reload silently falls back to a demo folder | ✅ Merged | [#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) |
| H2 | 🔴 High | Desktop build has no native filesystem layer: fake `Local\…` paths, no "Open file" action, `csp: null`, `core:default` only | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#3](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/3) |
| H3 | 🔴 High | `config.json` export drops `sourceType`; re-imported local favorites become empty demo folders | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#2](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/2) |
| M1 | 🟡 Medium | Native-picker folders get `dateModified: Date.now()`; skews recency filter and Recent sort | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#4](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/4) |
| M2 | 🟡 Medium | Scan cap (2,500) leaks; fallback picker has no cap or `node_modules`/`.git` skip; no grid virtualization | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#5](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/5) |
| M3 | 🟡 Medium | "Open Containing Folder" silently persists `includeSubfolders = false` | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#6](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/6) |
| M4 | 🟡 Medium | Hidden-file detection differs between native and fallback pickers | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#7](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/7) |
| M5 | 🟡 Medium | Single-token fuzzy search over-matches with no relevance ranking | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#8](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/8) |
| M6 | 🟡 Medium | Grid keyboard scroll-sync: rapid ↓/↑ on a 2,500-row folder sometimes drops a key and throws React error #185 (update depth exceeded). Present since M2; seen in 2–3 of 8 runs of the M2 test, old and new code alike | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#9](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/9) |
| L1 | Low | Unused AI Studio leftovers (`@google/genai`, `express`, `dotenv`, `motion`, `tsx`, Gemini `.env.example`, `metadata.json`); build tools in `dependencies` | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#10](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/10) |
| L2 | Low | Removing a local favorite leaks its `localFolders` entry | ✅ Merged | [#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) (folded into H1) |
| L3 | Low | Accessibility: rows not focusable, context menu lacks focus/arrow keys, settings modal lacks focus trap | ✅ Merged | [EoUReDIt/Folder-Scan-Viewer#11](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/11) |
| L4 | Low | `App.tsx` (879 lines at review, 1,235 now) mixes favorites, mounting and shortcuts; extract hooks | ✅ Ready to close | [#12](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/12) |
| L5 | Low | No tests; no CI on push/PR; version-bump commit is pushed before the installer build succeeds | ⏳ | — |
| L6 | Low | `bump-version.mjs` doesn't update `package-lock.json` (fixed manually in `e918ec6`) | ⏳ | — |
| L7 | Low | Preview pane dark background `#222222` drifts from documented tokens | ⏳ | — |

---

## H1 — Persist mounted local folders across reloads

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) (draft) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Passed |
| 🏁 Closed | ✅ | Merged to `main` as `f61b100` |

### Problem

`saveConfig` (`src/services/configStorage.ts`) writes only `sourceType === 'demo'` favorites to `localStorage` and rewrites `defaultFolderId` to the first demo favorite if the default was local. Consequences:

- Every mounted folder disappears on reload.
- "Set as Default Folder" on a local folder shows a success toast, then silently reverts on reload — the app's core promise ("launch into your Default Folder") does not hold for real folders.
- Pinned subfolders of a local folder are likewise lost.

### Proposal

**Goal**: a mounted folder, its pinned subfolders, and a local Default Folder survive a reload. When the browser can restore access, the folder rescans automatically; when it can't, the user sees a clear "Reconnect" state instead of a silent fallback.

**Key constraint**: browsers do not keep file access across reloads by themselves.
- Folders picked with `showDirectoryPicker` return a `FileSystemDirectoryHandle`, which can be stored in IndexedDB and re-authorized later (`queryPermission` / `requestPermission`, the latter needs a click).
- Folders picked with the `<input webkitdirectory>` fallback give only `File` objects, which cannot be stored. These favorites are kept but need the folder chosen again after a reload.

**Steps**

1. **Persist all favorites** — `src/services/configStorage.ts`
   - `saveConfig` stores every favorite, including `sourceType: 'local'`, and no longer rewrites `defaultFolderId`.
   - The storage key stays `foldary.config.v1`; the schema is unchanged (`sourceType` is already validated on load), so existing saved configs and `config.json` files keep working.
2. **Store directory handles** — new `src/services/handleStore.ts`
   - Small IndexedDB wrapper: `saveHandle(id, handle)`, `loadHandle(id)`, `deleteHandle(id)`, `clearHandles()`. Every call is wrapped in try/catch and degrades to "no handle" when IndexedDB is unavailable.
3. **Split scanning from picking** — `src/services/fileProvider.ts`
   - Extract `scanDirectoryHandle(handle, idPrefix)` from `tryPickDirectoryWithNativeApi`; the picker returns the handle alongside the entries.
   - Add `getHandlePermission(handle, { request })` and `resolveSubdirectoryHandle(root, subpath)`.
4. **Restore on startup and track availability** — `src/App.tsx`
   - New runtime state `localStatus: Record<id, 'loading' | 'ready' | 'needs-permission' | 'needs-remount'>` (not persisted).
   - On load, for each local favorite: load its handle → if permission is already granted, rescan (`ready`); if not, `needs-permission`; if there is no handle, `needs-remount`.
   - Native mounts save their handle under the new favorite id. Pinning a subfolder of a native mount resolves and saves the subfolder's own handle.
   - Removing a favorite deletes its handle and its `localFolders` entry (also fixes **L2**). Reset Workspace clears all handles.
5. **Reconnect UI** — `src/components/FileGrid.tsx`
   - When the active folder is local and not `ready`, the grid shows a state instead of "This folder is empty": "Checking folder access…" while loading, **Reconnect folder** (requests permission, then rescans) or **Choose folder again** (opens the picker and refills the *same* favorite, keeping its id, sort and Default status). Light and dark variants included.
6. **Verify**
   - `npm run lint` and `npm run build` pass.
   - Playwright check in Chromium: mount a folder through the fallback input, set it as Default, reload → app opens on that folder in the "Choose folder again" state, not a demo folder; demo folders still behave as before.

**Out of scope** (tracked separately): native Tauri filesystem access (**H2**), `sourceType` in `config.json` export (**H3**).

### Implementation

| File | Change |
|------|--------|
| `src/services/configStorage.ts` | `saveConfig` persists all favorites; no longer rewrites `defaultFolderId` |
| `src/services/handleStore.ts` (new) | IndexedDB store for directory handles (`foldary.handles`), fail-soft |
| `src/services/fileProvider.ts` | `scanDirectoryHandle`, `getHandlePermission`, `resolveSubdirectoryHandle`; picker returns its handle |
| `src/types/foldary.ts` | `LocalFolderStatus` runtime type |
| `src/App.tsx` | Startup restore, handle save on mount/pin, refill-in-place, cleanup on remove (**L2**) and reset |
| `src/components/FileGrid.tsx` | Loading / Reconnect / Choose-again state, light + dark |

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ built |
| Fallback picker: mount → set Default → reload → "Choose folder again" → refill same favorite | ✅ Playwright |
| Native picker (OPFS handle): mount → set Default → reload → auto-restored, handle in IndexedDB | ✅ Playwright |
| Imported local favorite with no handle → remount state; demo default unaffected | ✅ Playwright |
| Light and dark screenshots of new state | ✅ checked |
| `config.json` keys unchanged (backwards compatible) | ✅ |
| "Reconnect folder" permission prompt (`needs-permission`) | 🟡 Not automatable headless (test handles are always granted); needs a manual check in Chrome/Edge |

---

## H3 — `config.json` export drops `sourceType`

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#2](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/2) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See Ready-to-close check below |
| 🏁 Closed | ✅ | Merged to `main` as `fc49c82` |

### Problem

`exportConfigJsonString` (`src/services/configStorage.ts`) writes each favorite without `sourceType`. On import, `validateAndNormalizeConfig` defaults a missing `sourceType` to `'demo'`. So exporting a config that contains a mounted folder (or a pinned subfolder of one) and importing it again turns those favorites into demo folders. A demo folder with an unknown id has no entries, so the user sees an empty folder with no way to reconnect it. If that favorite was the Default Folder, the app opens into an empty folder.

Since H1, local favorites persist in `localStorage`, so they now always reach the export.

### Proposal

1. **Export `sourceType`** in `exportConfigJsonString` for every favorite. This adds a key and removes none, so older Foldary builds can still read the file.
2. **Infer `sourceType` for files exported before this fix** in `validateAndNormalizeConfig`. When the key is missing:
   - `'demo'` if the favorite has a `baseDemoId` or its id is a built-in demo folder (`fav_projects`, `fav_downloads`, `fav_invoices`);
   - otherwise `'local'`, because every favorite the app creates without those markers is a mounted folder or a pinned subfolder of one.
   An explicit `sourceType` is used as given, as today.
3. **Clean up stale handles on import** (`src/App.tsx`, `handleImportConfig`): delete the stored directory handle and loaded entries for any local favorite that is not in the imported config. Imported local favorites go through the H1 restore path: they reopen on their own when the same browser still holds their handle, and otherwise show "Choose folder again".
4. **Verify**
   - `npm run lint` and `npm run build` pass.
   - Playwright in Chromium:
     - Round trip: mount a folder, set it as Default, export, reset the workspace, import. The favorite comes back as local and the Default, showing "Choose folder again" rather than an empty folder.
     - A legacy file with no `sourceType`: demo favorites stay demo and the others become local.
     - The default demo config still imports unchanged.

**Out of scope**: native Tauri filesystem paths (**H2**).

### Implementation

| File | Change |
|------|--------|
| `src/services/configStorage.ts` | Export writes `sourceType`; import infers it when missing (`resolveSourceType`: `baseDemoId` or built-in demo id → `demo`, else `local`) |
| `src/App.tsx` | `handleImportConfig` drops entries, status, refs and the IndexedDB handle of local favorites not in the imported config |

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ built |
| Exported JSON has `sourceType` (`local` for the mount, `demo` for the 3 demo folders) | ✅ Playwright |
| Round trip: mount → set Default → export → Reset Demo → import → local + Default, "Choose this folder again" | ✅ Playwright |
| Legacy file without `sourceType`: demo root and `baseDemoId` pin → `demo`; mount and its pin → `local` | ✅ Playwright |
| Local favorites missing from the imported file are dropped | ✅ Playwright |
| Default demo config imports unchanged | ✅ Playwright |
| H1 regression suite | ✅ 13/13 Playwright |
| `config.json` backwards compatible (key added, none removed) | ✅ |

---

## H2 — Desktop build has no native filesystem layer

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#3](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/3) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Ready, pending the owner's merge and a manual Windows run |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`18da9af`) |

### Problem

The Tauri shell (`src-tauri/`) only runs the web bundle. It registers no commands or plugins, so the desktop app behaves exactly like the browser proof of concept:

- Folders are mounted through the WebView's browser APIs. Paths are shown as fake `Local\<name>\…` strings, and "Copy path" copies a path that does not exist on disk.
- There is no way to open a file with its default app or show it in Explorer, the core job of a launcher.
- Access after a restart depends on WebView2's File System Access permission state (H1), not on the real path.
- `tauri.conf.json` sets `csp: null`, so the WebView runs with no Content Security Policy.
- `capabilities/default.json` grants only `core:default`. That is fine, but nothing in the app is scoped either.

### Proposal

The web build keeps working unchanged. Every native path is behind an `isNativeShell()` check, and UI that needs it is hidden in the browser so no button is dead.

1. **Rust commands with a folder allowlist** (`src-tauri/src/`)
   - `pick_folder()`: opens the OS folder dialog (`tauri-plugin-dialog`, called from Rust) and adds the chosen folder to an allowlist of roots. The allowlist is saved to `allowed_roots.json` in the app data dir, so it survives restarts.
   - `scan_folder(path)`: walks the folder recursively. It returns name, relative path, is-folder, size, real modified time and hidden flag (dot-prefix, plus the Windows hidden attribute). It keeps the existing limits: depth 8, 2,500 entries, and skipping `node_modules` and `.git`.
   - `read_text_snippet(path, max_bytes)` and `read_file_bytes(path, max_bytes)`, for text and image previews.
   - `open_path(path)` and `reveal_path(path)`: open with the default app, or show in Explorer (`tauri-plugin-opener`, called from Rust).
   - `forget_folder(path)`: removes a root from the allowlist when its favorite is removed.
   - Every command canonicalizes the path and refuses anything outside an allowed root, so the WebView cannot read or open arbitrary files. No dialog, opener or fs permissions are granted to JavaScript.
2. **Frontend bridge**, new `src/services/nativeBridge.ts`
   - `isNativeShell()` plus typed wrappers around `invoke` (`@tauri-apps/api`).
   - `scanNativeFolder()` converts results into `FileEntry` items with real `fullPath`s.
   - UI components never call `invoke` directly (AGENTS.md §3).
3. **Types and config** (`src/types/foldary.ts`, `src/services/configStorage.ts`)
   - `FavoriteFolder.nativePath?: string`: the absolute folder path for desktop favorites.
   - `FileEntry.nativePath?: string`: the absolute file path.
   - The validator keeps `nativePath` when it is a string, and the export writes it. This only adds a key, so older `config.json` files and builds keep working; `sourceType` stays `'local'`.
4. **App wiring** (`src/App.tsx`)
   - In the desktop shell, "Mount local folder" and "Choose folder again" call `pick_folder`.
   - Startup restore rescans favorites that have a `nativePath`. A missing or disallowed folder shows the existing "Choose folder again" state.
   - Pinned subfolders get `nativePath = root + subpath`.
   - Removing a favorite calls `forget_folder` when no other favorite still uses that root.
5. **Open actions** (`ContextMenu.tsx`, `PreviewPane.tsx`, `App.tsx`, `SettingsModal.tsx`), shown only for entries with a `nativePath`
   - **Open**: default app. **Show in Explorer**: reveal.
   - `Ctrl+Enter` opens the selected file. It is added to the shortcuts reference.
   - The preview reads text and images through the bridge, revoking object URLs as today.
6. **Security config** (`src-tauri/tauri.conf.json`, `capabilities/default.json`)
   - Replace `csp: null` with a strict policy:
     - `default-src 'self'`
     - `img-src 'self' blob: data:`
     - `media-src 'self' blob:`
     - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
     - `font-src 'self' https://fonts.gstatic.com`
     - `connect-src 'self' ipc: http://ipc.localhost`
   - Capabilities stay `core:default`, with the plugin permissions not exposed to JavaScript.
7. **Verify**
   - `npm run lint` and `npm run build` pass.
   - `cargo check` and `cargo test` in `src-tauri/`, with unit tests for the allowlist and path checks (outside a root, `..` traversal) and for the scan (hidden files, skipped folders, limits).
   - Playwright with a stubbed Tauri `invoke`: mount, restore after reload, pin a subfolder, Open/Reveal calls, real path in "Copy path", and web mode unchanged (no native buttons).
   - An actual Windows desktop run is manual: it needs the release workflow or a Windows machine.

**Out of scope**: bundling fonts for offline use, a file-system watcher or live refresh, grid virtualization (**M2**), and folder dates for the browser picker (**M1**; native scans get real dates here).

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Allowlist | `src-tauri/src/roots.rs` | Roots the user picked are saved to `allowed_roots.json`. `resolve()` canonicalizes with `dunce` and refuses paths outside a root (`..`, symlink escapes and shared-prefix siblings included) |
| Scan | `src-tauri/src/scan.rs` | Recursive walk: depth 8, 2,500 entries, skips `node_modules`/`.git`, never follows symlinks, hidden = dot-prefix, Windows hidden attribute or hidden parent; sets a `truncated` flag |
| Commands | `src-tauri/src/lib.rs` | `pick_folder`, `scan_folder`, `read_text_snippet`, `read_file_bytes` (binary IPC response, size cap), `open_path`, `reveal_path`, `sync_folders`. Dialog and opener plugins are used from Rust only |
| Security | `src-tauri/tauri.conf.json` | Strict CSP replaces `csp: null`. Capabilities stay `core:default` |
| Bridge | `src/services/nativeBridge.ts` | `isNativeShell()` and typed `invoke` wrappers. UI never calls `invoke` directly |
| Config | `src/types/foldary.ts`, `src/services/configStorage.ts` | Optional `nativePath` on favorites and entries. Exported, and kept on import only for local favorites |
| App | `src/App.tsx` | Mount, "Choose folder again", restore and pin subfolder use native paths. Remove, import and reset call `sync_folders`. Truncated-scan toast. `Ctrl+Enter` opens |
| UI | `PreviewPane.tsx`, `ContextMenu.tsx`, `SettingsModal.tsx` | Open / Show in Explorer (desktop only), previews through the bridge with object URLs revoked, shortcut listed |
| Lockfile | `src-tauri/Cargo.lock` | Committed for reproducible builds |

**Deviation from proposal:** `forget_folder(path)` became `sync_folders(keep)`. The frontend sends every path still in use, and the shell drops roots that none of them cover. This also handles config import and workspace reset, which a per-path call missed.

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| `cargo check` | ✅ |
| `cargo test` (allowlist + scan) | ✅ 10/10 |
| Playwright, stubbed Tauri (mount, preview, Open/Reveal, Ctrl+Enter, pin, restore, remove→sync, remount) | ✅ 23/23 |
| Playwright web mode: no native actions shown | ✅ |
| H1 / H3 regressions | ✅ 13/13 · 14/14 |
| Light + dark screenshots | ✅ |
| Real Windows desktop run | ⏳ Manual, needs the release workflow or a Windows machine |

## M1 — Browser-picker folders are always dated "now"

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#4](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/4) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Ready, pending the owner's merge |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`cf6724f`) |

### Problem

`scanDirectoryHandle` (`src/services/fileProvider.ts`) is used both when you mount a folder with `showDirectoryPicker` and when you reconnect one on startup. It gives every folder `dateModified: Date.now()`, because the File System Access API exposes no folder timestamps. As a result:

- Every folder shows "Just now" in the grid and the scan time in the preview.
- Every folder passes every *Recently modified* filter (1, 7, 30 and 365 days), so "Last 1 day" is full of folders whose contents are years old.
- Under *Recent* sort, all folders tie at the top, whatever their age.
- The `<input webkitdirectory>` fallback already dates a folder by its newest file. The two pickers disagree for the same folder.

A smaller version of the same problem: a native (Tauri) entry with no readable time falls back to `Date.now()` in `nativeBridge.ts`, and the file pickers do the same when `file.lastModified` is 0.

### Proposal

1. **Folder date = newest item inside** (`fileProvider.ts`, `scanDirectoryHandle`)
   - Create folder entries with `dateModified: 0` (unknown).
   - After the walk, roll dates up: visit folders deepest-first and set each to the newest `dateModified` of its direct children. Child folders have already been rolled up, so this covers all descendants.
   - This matches what the fallback picker does today, so both pickers agree.
2. **Unknown dates are not "now"**
   - Use `0` for unknown in all three adapters:
     - an empty folder in the browser picker
     - a file with no `lastModified`
     - a native entry with no readable time (`nativeBridge.ts`)
   - `formatRelativeTime(0)` returns `—`, and `formatExactDate(0)` returns `Unknown`, in the grid and the preview.
   - Recency filters already exclude `0`: it is older than any cutoff. That is correct, because nothing shows the item changed recently.
   - *Recent* sort places unknown dates last (descending) or first (ascending), the same as the oldest items.
3. **Verify**
   - `npm run lint` and `npm run build` pass.
   - Playwright with a mocked `showDirectoryPicker`. The tree has an old nested folder, a recent folder and an empty folder. Check:
     - folder dates equal their newest descendant
     - the empty folder shows `—` and is excluded from "Last 7 days"
     - *Recent* sort puts the recent folder first
     - reconnecting on startup gives the same dates
   - The fallback picker gives the same folder dates as the native picker for the same tree.
   - H1, H2 and H3 regression tests still pass.

**Out of scope**:
- Real folder timestamps in the browser. The API has none; the desktop shell already reports them (H2).
- Scan caps and virtualization (**M2**).
- Differences in how hidden files are detected (**M4**).

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Roll-up | `src/services/fileProvider.ts` | New `rollUpFolderDates()`. `scanDirectoryHandle` creates folders with `dateModified: 0` and rolls the dates up deepest-first after the walk |
| Unknown dates | `src/services/fileProvider.ts`, `src/services/nativeBridge.ts` | `isUnknownDate()`. `formatRelativeTime(0)` returns `—` and `formatExactDate(0)` returns `Unknown`. All `Date.now()` fallbacks for a missing time are now `0` |

There are no UI component changes. The grid and preview already call the formatters.

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| Playwright: folder dates match their newest descendant, empty folder shows `—` / `Unknown`, *Recent* order, "Last 7 days" filter, same dates after reconnecting, fallback picker gives the same dates | ✅ 18/18 |
| H1 / H2 / H3 regressions, web mode shows no native actions | ✅ 13/13 · 23/23 · 14/14 · 1/1 |
| Light + dark screenshots | ✅ |

## M2 — Scan limits leak, fallback picker is unlimited, grid is not virtualized

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#5](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/5) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Ready, pending the owner's merge |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`229f253`) |

### Problem

The desktop scan (`src-tauri/src/scan.rs`, H2) enforces its limits. The two browser paths in `src/services/fileProvider.ts` do not:

- **The cap leaks.** `scanDirectoryHandle` checks `entries.length > 2500` only when it *enters* a folder. One folder with 10,000 files adds all 10,000, and sibling folders keep adding after the cap.
- **Depth is off by one.** The browser scan stops at `depth > 8`, which lists 9 levels. The desktop scan lists 8.
- **The fallback picker has no limits.** `convertFileListToEntries` (`<input webkitdirectory>`) has no cap or depth limit, and it does not skip `node_modules` or `.git`. Picking a project folder can produce hundreds of thousands of entries.
- **No feedback.** Browser scans never say they were cut short. Only the desktop shell shows the "only the first N items" toast.
- **The grid renders every row.** `FileGrid.tsx` mounts one `<tr>` per entry. Several thousand rows make typing in search, changing sort and ↑/↓ visibly slow. It also uses `scrollIntoView`, which can leave the selected row under the sticky header.

### Proposal

1. **One set of limits** (`src/services/fileProvider.ts`)
   - Export `SCAN_LIMITS = { maxDepth: 8, maxEntries: 2500, skippedFolders: ['node_modules', '.git'] }`.
   - A comment notes that the values mirror `scan.rs`.
   - `ScannedDirectory` gains `truncated: boolean`.
2. **`scanDirectoryHandle`**
   - Check the cap before *every* push. Once the cap is hit, set `truncated` and stop the walk.
   - Recurse only while `depth + 1 < maxDepth`, matching Rust.
3. **`convertFileListToEntries`** (fallback picker)
   - Drop files under a skipped folder or deeper than `maxDepth`.
   - Before adding a file, count the ancestor folders it still needs. If they don't fit under the cap, stop and set `truncated`.
   - The browser still hands over the full `FileList`; that cannot be avoided. Entries, sorting and rendering stay bounded.
4. **Feedback** (`src/App.tsx`)
   - Generalize `reportNativeScan` to `reportTruncatedScan(name, count, truncated)`.
   - Call it from every mount, refill and reconnect path, browser and desktop alike.
5. **Grid virtualization** (`src/components/FileGrid.tsx`), written in-house with no new dependency
   - Rows are a fixed 38px. Lists with more than 150 rows render only the visible window plus 12 rows of overscan, with spacer rows above and below so the scrollbar keeps its real size.
   - Smaller lists render exactly as today.
   - The visible window is recomputed on scroll and on resize (`ResizeObserver`).
   - Keyboard scroll sync scrolls by row index. A row that is not rendered can still be brought into view, and the selected row clears the sticky header.
   - The table gets `aria-rowcount`, and each row gets `aria-rowindex`, so screen readers know the real size.
6. **Verify**
   - `npm run lint` and `npm run build` pass. `cargo test` is unchanged.
   - Playwright with a mocked `showDirectoryPicker`:
     - one folder of 3,000 files lists exactly 2,500 and shows the "large folder" toast
     - a 12-level tree lists 8 levels
     - `node_modules` is skipped
   - Fallback picker on a disk fixture: the same cap, depth and skip results.
   - Grid with 2,500 entries:
     - fewer than 100 `<tr>` in the DOM
     - scrolling to the bottom shows the last item
     - `End`-style ↓ navigation keeps the selected row visible and not under the header
     - search filtering stays responsive
   - H1, H2, H3 and M1 regression tests still pass. Light and dark screenshots.

**Out of scope**:
- Raising the cap or paging past it.
- A cancellable or progressive scan UI.
- Hidden-file detection (**M4**).

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Limits | `src/services/fileProvider.ts` | New `SCAN_LIMITS` (mirrors `scan.rs`). `ScannedDirectory.truncated` |
| Handle scan | `src/services/fileProvider.ts` | `scanDirectoryHandle` checks the cap before every entry, stops and sets `truncated` when it is hit, and recurses only while `depth + 1 < maxDepth` |
| Fallback picker | `src/services/fileProvider.ts` | `convertFileListToEntries` applies the same cap, depth and skip rules. Folders above a dropped file are still listed when in range (with an unknown date), so a folder that only holds out-of-range items shows up as it does in the other scans |
| Feedback | `src/App.tsx` | `reportNativeScan` became `reportTruncatedScan` and runs on every mount, refill and reconnect path: browser handle, fallback picker, startup restore and desktop |
| Grid | `src/components/FileGrid.tsx` | In-house virtualization over 150 rows (38px pitch, 12 rows overscan, spacer rows, scroll + `ResizeObserver`). Selection scrolls by row index and clears the sticky header. `aria-rowcount` / `aria-rowindex` |

One deviation from the proposal: the fallback picker also lists in-range folders whose contents are all past the limits. The first test run showed `L8` missing there while the handle scan listed it.

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| `cargo test` | ✅ 10/10 (unchanged) |
| Playwright, handle picker: 3,000 files list exactly 2,500 with the toast; 12-level tree lists 8 levels; `node_modules` skipped | ✅ |
| Playwright, fallback picker on disk fixtures: same cap, depth and skip results | ✅ |
| Grid with 2,500 rows: under 100 `<tr>` in the DOM, 38px pitch, bottom and mid-list scroll render the right rows, ↓×60 / ↑×30 keep the selection visible below the header, search settles in under 1s | ✅ 24/24 total |
| H1 / H2 / H3 / M1 regressions, web mode shows no native actions | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 1/1 |
| Light + dark screenshots | ✅ |

## M3 — "Open Containing Folder" silently turns off *Include subfolders* for good

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#6](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/6) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Ready, pending the owner's merge |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`c5f32aa`) |

### Problem

The context-menu action *Open Containing Folder* (`src/App.tsx`, `onOpenContainingFolder`) runs `setConfig({ ...prev, includeSubfolders: false })`.

- `includeSubfolders` is a **global, saved** setting: it goes to `localStorage` and into the exported `config.json`.
- One click on a menu item therefore changes the scope for every folder and every later session. Nothing says so. The only hint is the toolbar label changing to *Current Folder Only*.
- Switching to another favorite, going up a folder or reloading does not bring the scope back. The user has to find the *Include subfolders* switch and turn it on again.
- The action also loses its place: the file the menu was opened on is not selected in the folder that opens.

### Proposal

1. **A temporary scope, not a saved one** (`src/App.tsx`)
   - New session-only state: `scopeOverride: { folderId: string; subpath: string } | null`. It is not saved and never reaches `config.json`.
   - The scope in use becomes `includeSubfolders = config.includeSubfolders && !overrideMatches`, where `overrideMatches` means the override's folder and subpath equal the active folder and `currentSubpath`.
   - That one value replaces `config.includeSubfolders` everywhere it is read: `filterAndSortEntries`, `computeCategoryCounts`, `Sidebar` and `SortToolbar`.
   - The override ends by itself on any navigation (another favorite, breadcrumb, Backspace, drill-in), because the folder or subpath no longer matches. The navigation code does not need to change.
2. **Open Containing Folder** (`src/App.tsx`, `src/components/ContextMenu.tsx`)
   - The callback receives the whole entry, not just `parentPath`.
   - It navigates to `entry.parentPath`, sets the override only when subfolders are on (otherwise the scope is already *Current Folder Only*), and selects the entry so the file is highlighted and scrolled into view.
   - It no longer calls `setConfig`.
   - The toast says what happened: `Showing "<folder>" only`.
3. **Scope toggles** (sidebar switch and toolbar button)
   - Toggling flips the scope that is *in use* and clears the override. While the override is active, one click turns subfolders back on, which is what the label promises.
   - These toggles still save the setting, as before. Only the context-menu action stops saving.
4. **Verify**
   - `npm run lint` and `npm run build` pass.
   - Playwright on the demo workspace:
     - With subfolders on, *Open Containing Folder* on a nested file opens its folder, shows *Current Folder Only*, and selects the file.
     - `config.includeSubfolders` in `localStorage` stays `true`.
     - After a reload, or after switching favorite, going up or using the breadcrumb, the scope is *Include Subfolders* again.
     - While the override is active, the toolbar button and the sidebar switch each restore subfolders with one click, and that choice is saved.
     - With subfolders off, the action opens the folder and the scope stays off.
     - Export `config.json` after the action: `includeSubfolders` is unchanged.
   - H1, H2, H3, M1 and M2 regressions pass. Light and dark screenshots.

**Out of scope**:
- A per-folder saved scope.
- Other context-menu actions.

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Temporary scope | `src/App.tsx` | New session-only `scopeOverride { folderId, subpath }`. The scope in use is `config.includeSubfolders && !scopeOverrideActive`, and it feeds `filterAndSortEntries`, `computeCategoryCounts`, `Sidebar` and `SortToolbar`. An effect clears the override as soon as the folder or subpath no longer matches |
| Scope toggles | `src/App.tsx` | New `handleToggleIncludeSubfolders`, shared by the sidebar switch and the toolbar button. It flips the scope in use, clears the override and saves, as before |
| Open Containing Folder | `src/App.tsx`, `src/components/ContextMenu.tsx` | The callback receives the whole entry. It navigates, sets the override only when subfolders are on, selects the file and shows `Showing "<folder>" only`. It no longer calls `setConfig` |
| Selection scroll | `src/components/FileGrid.tsx` | The scroll-to-selection effect also runs when `currentSubpath` changes, so the file picked by the action is scrolled into view in the new folder |

One addition to the proposal: the `FileGrid.tsx` dependency change. Without it, the selected file would not scroll into view when its id was already selected before the folder changed.

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| Playwright: the action opens the folder, shows *Current Folder Only*, turns the sidebar switch off, selects the file and names the folder in the toast | ✅ |
| Saved `includeSubfolders` and exported `config.json` stay `true` after the action | ✅ |
| Scope comes back after Backspace, the breadcrumb, switching favorite and reload. Re-entering the folder does not bring the override back | ✅ |
| Toolbar button and sidebar switch each restore subfolders in one click and save it | ✅ |
| With subfolders off, the action keeps *Current Folder Only*, and it stays off after navigating | ✅ 22/22 total |
| H1 / H2 / H3 / M1 / M2 regressions, web check | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 24/24 · 1/1 |
| Light + dark screenshots | ✅ |

## M4 — Hidden-file detection differs between the desktop scan and the browser pickers

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#7](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/7) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | Ready, pending the owner's merge |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`438b184`) |

### Problem

*Show hidden files* hides entries whose `isHidden` is true. Each of the three scanners sets that flag its own way, so the same folder shows different files depending on how it was opened.

| Scanner | Name starts with `.` | Inside a hidden folder | Windows *Hidden* attribute |
|---------|----------------------|------------------------|----------------------------|
| Desktop, `src-tauri/src/scan.rs` | ✅ | ✅ inherited from the parent | ✅ |
| Browser folder handle, `scanDirectoryHandle` | ✅ | ❌ | ❌ |
| Browser fallback picker, files (`convertFileListToEntries`) | ✅ | ✅ any `.` segment | ❌ |
| Browser fallback picker, folders (`ensureFolder`) | ✅ | ❌ | ❌ |

What the user sees with *Show hidden files* off and *Include subfolders* on:
- **Folder-handle picker** (Chrome, Edge): everything inside a hidden folder is listed. For example, `.config/settings.json` or `.vscode/launch.json` show up even though `.config` itself is hidden. The sidebar counts include them too.
- **Fallback picker** (Firefox, Safari): files inside `.config` are hidden, but a subfolder such as `.config/nested/` is still listed.
- **Desktop**: all of it is hidden, which is the intended behavior.

The Windows *Hidden* attribute cannot be read from a browser: neither `File` nor the File System Access API exposes it. That part of the gap cannot be closed in web mode.

### Proposal

1. **One rule for the browser** (`src/services/fileProvider.ts`)
   - New exported helper `isHiddenEntryPath(entryPath: string): boolean`. It is true when any `/`-separated segment starts with `.`. This is the same as the desktop rule without the attribute check, because a hidden parent makes everything under it hidden.
2. **Use it in both browser scanners**
   - `scanDirectoryHandle`: replace `name.startsWith('.')` with the helper on the entry path, for folders and files.
   - `convertFileListToEntries`: use the helper in `ensureFolder` (on the folder path built so far) and for files.
3. **Document the remaining gap**
   - A comment on the helper and on `has_hidden_attribute` in `scan.rs` says the browser cannot see the Windows attribute, so web mode only uses the dot rule.
   - The desktop scan keeps its current behavior. No Rust change.
4. **Verify**
   - `npm run lint` and `npm run build` pass. `cargo test` is unchanged.
   - Playwright on the same tree through both browser pickers (mocked `showDirectoryPicker`, and the fallback input on a disk fixture). The tree holds `.config/settings.json`, `.config/nested/deep.txt`, `.env`, `docs/.draft.md` and visible files.
   - With *Show hidden files* off, both pickers list exactly the same visible set, with no hidden entry and no item inside a hidden folder. The sidebar counts match.
   - With it on, both pickers list the full tree, the same set as each other.
   - H1, H2, H3, M1, M2 and M3 regressions pass. Light and dark screenshots.

**Out of scope**:
- Reading the Windows *Hidden* attribute in web mode. No browser API exposes it.
- Changing what the desktop scan treats as hidden.
- A user-defined hide list, such as `Thumbs.db` or `desktop.ini`.

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Shared rule | `src/services/fileProvider.ts` | New `isHiddenEntryPath(entryPath)`: true when any path segment starts with `.` |
| Folder-handle scan | `src/services/fileProvider.ts` | `scanDirectoryHandle` uses the helper on the entry path, for folders and files |
| Fallback picker | `src/services/fileProvider.ts` | `convertFileListToEntries` uses the helper for files and in `ensureFolder` (on the folder path built so far) |
| Desktop note | `src-tauri/src/scan.rs` | Comment only: browsers cannot read the Windows attribute, so web mode uses the dot rule alone. No behavior change |

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| `cargo test` | ✅ 10/10 (unchanged) |
| Same M4 test on the code before the fix | ❌ 9 failures, as described in Problem: the folder-handle picker leaked `settings.json`, `nested` and `deep.txt`; the fallback picker leaked `nested` |
| Playwright, both pickers on the same tree: hidden off lists exactly the 5 visible items with sidebar *All* = 5; hidden on lists all 11 with *All* = 11; exactly the hidden entries are dimmed; both pickers give the same sets | ✅ 16/16 |
| H1 / H2 / H3 / M1 / M2 / M3 regressions, web check | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 24/24 · 22/22 · 1/1 |
| Light + dark screenshots | ✅ |

## M5 — Single-word search matches too much and is not ranked

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#8](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/8) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See below |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`93220ef`) |

### Problem

`matchesQuery` in `src/services/fileProvider.ts` accepts an entry when every word of the query is in its name or relative path. For a single word it also accepts any name that contains the letters **in order, anywhere** (a subsequence match). That fuzzy match always runs, not only when nothing else matches. Results are then sorted only by the column sort.

Measured on the demo workspace (40 entries, every folder, subfolders included):

| Query | Results | Contain the text | Fuzzy-only extras |
|-------|---------|------------------|-------------------|
| `rep` | 14 | 4 | `hero_banner.png`, `foldary_logo_proof.webp`, `launcher_demo_capture.mp4`, `release_v0.2_assets.zip`, `systems_craft_ep42.mp3`, `fluent_grid_reference.jpg`, `rust_async_patterns_2026.pdf`, `INV-2026-09_HardwareUpgrade.pdf`, `workstation_receipt_photo.jpg`, `2025_receipts_backup.7z` |
| `mp4` | 3 | 2 | `systems_craft_ep42.mp3` |
| `png` | 4 | 2 | `layout_blueprint.jpg`, `2026_Expenses_Ledger.csv` |
| `note` | 3 | 2 | `launcher_demo_capture.mp4` |
| `arch` | 2 | 1 | `workstation_receipt_photo.jpg` |

Consequences:
- Most results for a short word are unrelated, and longer names in a real folder match almost any three letters.
- No ranking: with the default *Recent* sort, a file named exactly like the query can sit under newer unrelated hits. A file that only matches because its **folder** name contains the word ranks the same as a name match.
- **Enter** opens the selected row. When the earlier selection still matches, it stays selected, so Enter does not open the best match.
- Nothing tells the user that a result is a loose match.

### Proposal

1. **Match tiers** (`src/services/fileProvider.ts`)
   - Replace the yes/no matcher with `queryMatchTier(entry, query)`, which returns:
     - **4 word start**: every query word starts a word in the name. A word starts at the start of the name, after `_ - . space`, or at a lower-to-upper case change. For example, `report` in `Q4_Report.pdf`.
     - **3 name**: every word is somewhere in the name.
     - **2 path**: every word is in the name or the relative path, and at least one is only in the path.
     - **1 fuzzy**: single-word query, letters in order within the name.
     - **0**: no match.
   - Keep `matchesQuery` as a wrapper (tier > 0), so other callers do not change.
2. **Fuzzy only as a fallback**
   - New shared helper `matchQueryInScope(entries, query)`. It works on the folder's entries after scope, hidden and recency filters, before the type filter. It returns each entry's tier and whether fuzzy is in use.
   - Fuzzy matches are kept **only when no entry reaches tier 2 or above**. A typo such as `rprt` still finds `Q4_Report.pdf`, but `rep` no longer pulls in `hero_banner.png`.
   - `filterAndSortEntries` and `computeCategoryCounts` both use the helper, so the sidebar counts always equal what the grid shows.
3. **Ranking with a query**
   - While a query is typed, rows sort by: *Pin folders to top* group first (unchanged), then tier (highest first), then the chosen column sort inside each tier.
   - With no query, sorting is unchanged.
4. **Selection follows the query** (`src/App.tsx`)
   - When the query text changes and is not empty, the first (best) row is selected, so **Enter** opens the top match.
   - Arrow keys work as before.
5. **Say when results are loose** (`src/components/SortToolbar.tsx`)
   - When the fallback is active, the item count reads `N items · close matches`. It is plain muted text, not a pill, with light and dark colors.
6. **Verify**
   - `npm run lint` and `npm run build` pass.
   - Unit checks on the demo data with `tsx`:
     - `rep` gives only the 4 entries that contain it
     - `mp4` excludes `.mp3`, `png` excludes `.jpg` and `.csv`
     - `rprt` falls back to fuzzy and finds `Q4_Report.pdf`
     - tiers come out 4 > 3 > 2 > 1 as defined
     - multi-word queries are unchanged
   - Playwright on the demo workspace:
     - typing `report` puts the word-start name match first under the *Recent* sort
     - Enter after typing opens the top row
     - `rprt` shows *close matches*, and `rep` does not
     - sidebar counts equal the grid
     - Esc clears and the original order comes back
   - All earlier regressions pass (H1, H2, H3, M1, M2, M3, M4). Light and dark screenshots.

**Out of scope**:
- Searching file contents.
- Typo tolerance for multi-word queries.
- Highlighting the matched letters in names.
- Indexing or search across folders that are not open.

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Match tiers | `src/services/fileProvider.ts` | `queryMatchTier` returns 4 word start, 3 name, 2 path, 1 fuzzy or 0. `matchesQuery` is kept as `tier > 0` |
| Fuzzy fallback | `src/services/fileProvider.ts` | `matchQueryInScope` drops fuzzy hits whenever any entry reaches tier 2+, and reports `closeMatches`. It runs on the scope + hidden + recency base, before the type filter |
| One code path | `src/services/fileProvider.ts` | New `filterAndSortEntriesWithInfo` returns `{ entries, closeMatches }`. `filterAndSortEntries` wraps it. `computeCategoryCounts` uses the same base and matcher, so sidebar counts equal the grid |
| Ranking | `src/services/fileProvider.ts` | With a query, rows sort by the folders-first group, then tier (highest first), then the column sort |
| Selection | `src/App.tsx` | When the query text changes and is not empty, the top row is selected, so Enter opens the best match |
| Close-match label | `src/components/SortToolbar.tsx` | In fuzzy fallback the count reads `N close matches` (muted mono text with a tooltip). **Change from proposal item 5:** the planned `N items · close matches` was too wide and wrapped the toolbar onto a second line, shifting the grid down. Replacing the word keeps the toolbar on one line |

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| Unit checks on demo data (`tsx`): `rep` 14 → 4, `mp4` excludes `.mp3`, `png` excludes `.jpg`/`.csv`, `rprt` falls back to fuzzy, tiers descend, counts equal the grid for every folder and query | ✅ 18/18 |
| Playwright on demo workspace: `retro`, `png`, `rep` drop unrelated names; `report` gives Reports and Q4_Report.pdf first under *Recent*, then path-only hits; the top row is selected while typing; Enter opens the top match; `rprt` shows the close-match label on the toolbar's first line; sidebar *All* = rows; Esc restores the full list; multi-word path matching unchanged; no page errors | ✅ 17/17 |
| Same M5 test on the code before the fix | ❌ 6 failures, as described in Problem |
| H1 / H2 / H3 / M1 / M2 / M3 / M4 regressions, web check | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 24/24 · 22/22 · 16/16 · 1/1 |
| M2 test flake (rapid arrow keys, React #185) | 🟡 Pre-existing: old code fails 3/8 runs, new code 2/8. Not caused by M5; logged as **M6** |
| Light + dark screenshots | ✅ |

## M6 — Fast arrow keys in a large folder drop a key and throw React error #185

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#9](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/9) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See below |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`4601f45`) |

### Problem

In a virtualized folder (more than 150 rows), holding or quickly repeating ↓/↑ sometimes skips a row, and the page logs *Minified React error #185 (Maximum update depth exceeded)*. Found during the M5 regressions. The M2 test failed in 2–3 of 8 runs on both the old and the new code.

Repro (production build, 2,500-file folder, click row 1, press ↓ 60 times, repeated 15 times): **7 of 15 rounds ended one row short, with 11 errors.** The development build does not show it, because it is slower.

Cause, from the stack trace and React 19.3 source:
1. Each ↓ calls `setSelectedId` from a keydown handler, which is a sync-lane render.
2. `FileGrid` then sets `container.scrollTop` in a passive effect to keep the row in view.
3. That fires a `scroll` event, and `onScroll={syncView}` calls `setView`, a continuous-lane update.
4. When keys arrive faster than that update renders, the next key's sync commit finishes while the continuous update is still pending. React counts each such commit as a *nested update* and does not reset the counter until a commit leaves no pending work.
5. After 50 commits in a row like this, the next `setState` throws. That is the keydown's `setSelectedId`, so the key is lost and #185 is reported.

Scrolling with the mouse or wheel is not affected: it never mixes with sync keyboard updates at that rate.

### Proposal

1. **Sync the visible window in the same commit** (`src/components/FileGrid.tsx`)
   - Change the keep-selection-in-view effect from `useEffect` to `useLayoutEffect`.
   - After it writes `scrollTop`, call `syncView()` straight away. The rendered rows are then updated inside the keypress's own commit. This also stops a one-frame blank gap at the edge while the window catches up.
2. **Ignore scroll events that change nothing** (`src/components/FileGrid.tsx`)
   - `syncView` keeps the last measured view in a ref and only calls `setView` when scroll position, height or body offset really changed.
   - The scroll event fired by the programmatic scroll in step 1 then finds nothing new and schedules no update, so no work is left pending between keypresses and the counter resets after every commit.
3. **Verify**
   - `npm run lint` and `npm run build` pass.
   - The repro on the production build: 15 rounds of ↓×60 and ↑×30 all land on the right row, with no page errors.
   - Holding ↓ for 300 presses from the first row reaches the 301st row (`aria-rowindex` 302), with the selected row in view below the sticky header.
   - Mouse-wheel scrolling still renders the right rows: top, middle and bottom of the 2,500-row list.
   - The M2 test passes 8 of 8 runs. All other regressions pass (H1, H2, H3, M1, M3, M4, M5). Light and dark screenshots.

**Out of scope**:
- Changing how keys are handled in `App.tsx` (the handler is correct once the throw is gone).
- Making the virtual window size or overscan configurable.

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Same-commit sync | `src/components/FileGrid.tsx` | The keep-selection-in-view effect is now `useLayoutEffect` and calls `syncView()` after it adjusts `scrollTop`, so the virtual window updates inside the keypress's own commit |
| Quiet scroll events | `src/components/FileGrid.tsx` | `syncView` compares against `viewRef` (the last measured view) and returns without calling `setView` when nothing changed. The scroll event that follows a programmatic scroll therefore schedules no work |

### Ready-to-close check

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| Playwright M6 test, production build, 2,500-file folder: 15 rounds of ↓×60 then ↑×30 land on the right rows, in view; 300 × ↓ reaches `aria-rowindex` 302 in view; the virtual window covers the selection; wheel scrolling fills the viewport at mid-list and reaches the last row; no page errors | ✅ 7/7 |
| Same M6 test on the code before the fix | ❌ 4 failures: 7 of 15 rounds one row short, 300 presses lost 4 keys, React #185 logged |
| M2 test, 8 runs in a row (was failing in 2–3 of 8) | ✅ 8/8 runs clean, 24/24 each |
| H1 / H2 / H3 / M1 / M3 / M4 / M5 regressions, web check | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 22/22 · 16/16 · 17/17 · 1/1 |
| Light + dark screenshots | ✅ |

---

## L1 — Remove unused AI Studio leftovers; move build tools to devDependencies

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [EoUReDIt/Folder-Scan-Viewer#10](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/10) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See below |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`d753ca4`) |

### Problem

The project was scaffolded in Google AI Studio, and its template is still in the repository even though Foldary uses none of it:

| Leftover | Where | Used? |
|----------|-------|-------|
| `@google/genai` | `dependencies` | No import anywhere |
| `express`, `@types/express` | `dependencies`, `devDependencies` | No server; the `clean` script still deletes a `server.js` that never exists |
| `dotenv` | `dependencies` | No import |
| `motion` | `dependencies` | No import |
| `tsx` | `devDependencies` | No script runs it |
| `autoprefixer` | `devDependencies` | No PostCSS config; Tailwind v4 runs through `@tailwindcss/vite` |
| `esbuild` | `devDependencies` | Not imported; Vite 8 builds with Rolldown and only lists esbuild as an optional peer |
| `.env.example` | repo root | Describes `GEMINI_API_KEY` and `APP_URL`, which nothing reads |
| `metadata.json` | repo root | AI Studio app manifest that claims `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` |

`vite`, `@vitejs/plugin-react` and `@tailwindcss/vite` are build tools but sit in `dependencies`. The app ships as a static bundle (web) or inside the Tauri binary, so nothing needs them at run time.

Effect: a slower `npm install` with about a dozen unused packages, a misleading picture of what the app does (Gemini, a server, API keys), and a larger audit surface.

### Proposal

1. **Remove unused packages**: `@google/genai`, `express`, `@types/express`, `dotenv`, `motion`, `tsx`, `autoprefixer`, `esbuild`. Regenerate `package-lock.json` with `npm install`.
2. **Move build tools** `vite`, `@vitejs/plugin-react` and `@tailwindcss/vite` to `devDependencies`. `npm ci` in the release workflow still installs them.
3. **Delete** `.env.example` and `metadata.json`, and drop the `!.env.example` exception from `.gitignore` (`.env*` stays ignored).
4. **Fix the `clean` script** to `rm -rf dist`.
5. **Reword the `vite.config.ts` comment** on the asset-copy plugin. The plugin stays, because the demo workspace loads its images from `/src/assets/images/…`; the comment should say that rather than mention AI Studio's `generate_image`.
6. **Verify**: `npm run lint` and `npm run build` pass; the production build loads with the demo images visible and no console errors; the H1–M6 regression tests still pass; `npm ls` shows no missing peers.

### Out of scope

- The `DISABLE_HMR` switch in `vite.config.ts`. It is off unless the variable is set, costs nothing, and still matters if the project is ever edited in AI Studio again.
- The `@/*` path alias in `vite.config.ts` and `tsconfig.json`. It is unused, but it is ordinary project config rather than an AI Studio leftover.

### Implementation

| Area | Files | What changed |
|------|-------|--------------|
| Packages | `package.json`, `package-lock.json` | Removed `@google/genai`, `express`, `@types/express`, `dotenv`, `motion`, `tsx`, `autoprefixer`, `esbuild`. Moved `vite`, `@vitejs/plugin-react` and `@tailwindcss/vite` to `devDependencies`. `dependencies` is now `@tauri-apps/api`, `lucide-react`, `react` and `react-dom`. The lockfile went from 212 to 87 packages, with no version change for any package that stayed, and it now lists every platform's native Tailwind, Rolldown and Lightning CSS binary |
| Template files | `.env.example`, `metadata.json`, `.gitignore` | Deleted both files; dropped the `!.env.example` exception (`.env*` stays ignored) |
| Scripts | `package.json` | `clean` is now `rm -rf dist` |
| Vite config | `vite.config.ts` | The asset-copy comment now names the demo workspace images instead of AI Studio's `generate_image` |

### Ready-to-close check

| Check | Result |
|-------|--------|
| Clean `npm ci` | ✅ 0 vulnerabilities |
| `npm run lint` | ✅ |
| `npm run build` | ✅ The 3 demo images are copied to `dist/src/assets/images`; no Gemini strings in `dist` |
| Release workflow and `tauri.conf.json` | ✅ `npm ci` installs devDependencies (nothing sets `--omit=dev` or `NODE_ENV=production`); `beforeBuildCommand` is still `npm run build` |
| Playwright L1 test, production build: all 3 demo images served as JPEG, demo grid renders, no failed requests, no console errors | ✅ 6/6 |
| H1 / H2 / H3 / M1 / M2 / M3 / M4 / M5 / M6 regressions, web check | ✅ 13/13 · 23/23 · 14/14 · 18/18 · 24/24 · 22/22 · 16/16 · 17/17 · 7/7 · 1/1 |

---

## L3 — Keyboard and screen-reader access for the grid, context menu and settings

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [#11](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/11) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See Ready to close below |
| 🏁 Closed | ✅ | Merged 2026-11-28 (`300bce3`) |

### Problem

| Area | What happens today |
|------|--------------------|
| File grid (`FileGrid.tsx`) | Neither the table nor its rows can take focus. ↑/↓/Enter work only because `App.tsx` listens on `window`, so Tab never lands on the grid, nothing shows where keyboard focus is, and a screen reader is never told which row is selected. The table has no accessible name |
| Context menu (`ContextMenu.tsx`) | Opens only on right-click: there is no Shift+F10 or Menu-key equivalent. Focus stays where it was, so the items cannot be reached by keyboard (Tab goes to the page behind the menu). ↑/↓ while the menu is open move the grid selection underneath it instead of the menu highlight. After closing, focus is not returned |
| Settings modal (`SettingsModal.tsx`) | `role="dialog"` and `aria-modal` are set, but opening it does not move focus into it, Tab walks out into the page behind, and closing does not return focus to the button that opened it. The tab strip is a row of plain buttons with no tab semantics |

### Proposal

1. **Grid as one focusable widget**
   - The `<table>` becomes `role="grid"` with `tabIndex={0}`, an `aria-label` naming the folder, and `aria-activedescendant` pointing at the selected row. Each row gets a stable `id` and `aria-selected`. This keeps a single Tab stop and works with virtualization, because the selected row is always scrolled into view and rendered (M6).
   - When the grid has keyboard focus, the selected row shows a 2px accent outline (`#0067C0` light / `#60CDFF` dark). Clicking a row focuses the grid as well.
   - The global ↑/↓/Enter/Space/Backspace shortcuts stay as they are, so the search box keeps driving the grid.
2. **Keyboard-operable context menu**
   - With the grid focused, **Shift+F10** or the **Menu** key opens the menu for the selected row, anchored to that row.
   - On open, focus moves to the first item. ↑/↓ move between items and wrap; Home/End jump to the ends; Enter/Space activate; Esc and Tab close. Items are `tabIndex={-1}` and the menu moves focus itself (Tab closes it, so the menu is never a Tab stop), and separators get `role="separator"`. The menu is labelled "Actions for <name>".
   - While the menu is open, the global grid shortcuts are suspended.
   - On close, focus goes back to where it was before the menu opened.
3. **Settings modal focus management**
   - On open, focus moves into the dialog panel. Tab and Shift+Tab cycle inside it. On close (Esc, ×, or a click on the backdrop), focus returns to the element that opened it.
   - The tab strip uses `role="tablist"` / `tab` / `tabpanel` with `aria-selected` and `aria-controls`, and ←/→ move between tabs.
4. **Verify**
   - Lint and build pass.
   - A Playwright test of the production build covers:
     - Tab reaches the grid
     - `aria-activedescendant` follows ↑/↓
     - Shift+F10 opens the menu with focus on its first item
     - arrows wrap, Esc returns focus to the grid
     - ↑/↓ inside the menu leave the selection alone
     - the settings dialog takes focus, traps Tab both ways and returns focus on close
     - tab arrows switch panels
   - The H1–M6 and L1 regression tests pass, and light and dark screenshots show the focus ring.

### Implementation

| File | Change |
|------|--------|
| `src/components/FileGrid.tsx` | `<table role="grid" tabIndex={0}>` with `aria-label` ("Files in <folder>") and `aria-activedescendant` set to the selected row's `id` (`foldary-row-<index>`) only while that row is rendered. Shift+F10 / Menu key on the grid calls the new `onContextMenuRow` prop, anchored under the selected row. The selected row gets a `group-focus-visible` 2px outline (`#0067C0` / `#60CDFF`) |
| `src/App.tsx` | The global key handler returns early while the settings dialog or the context menu is open, so ↑/↓/Esc there no longer move the grid or clear search. Passes `gridLabel` and `onContextMenuRow` (selects the row, then opens the menu) |
| `src/components/ContextMenu.tsx` | Focus moves to the first item on open and returns to the opener on close. ↑/↓ wrap, Home/End jump, Tab closes. Items are `tabIndex={-1}` with a `focus:` background in both themes; the menu is labelled "Actions for <name>", the header is `aria-hidden`, and separators have `role="separator"` |
| `src/components/SettingsModal.tsx` | `role="dialog"` moved to the panel, which takes focus on open. Tab/Shift+Tab cycle inside it (keydown plus a `focusin` guard), and focus returns to the opener on close. Tabs use `tablist`/`tab`/`tabpanel` with `aria-selected`, `aria-controls` and a single Tab stop; ←/→/Home/End switch tabs. The shortcuts list gains "Shift + F10 / Menu" |

### Ready to close

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ |
| L3 Playwright test (production build) | ✅ 37/37: Tab reaches grid, `aria-activedescendant` follows ↑/↓, focus outline, Shift+F10 and Menu key open the menu anchored to the row with focus on the first item, wrap/Home/End, ↑/↓ in menu leave the selection alone, Esc and Tab return focus to the grid, Enter activates, right-click menu takes focus, dialog takes focus, Tab/Shift+Tab ×40 stay inside, ←/→ switch tabs and panel, Esc returns focus to the Settings button, no page errors |
| Regression tests | ✅ L1 6, H1 13, H2 23, H3 14, M1 18, M2 24, M3 22, M4 16, M5 17, M6 7. H2/H3/M3 now find settings tabs by `role="tab"` instead of `button`; M1's on-disk fixture timestamps were refreshed |
| Light and dark screenshots | ✅ Menu focus highlight and tab focus ring visible in both themes |

### Out of scope

- The Favorites dropdown and other TopBar controls. They are already native buttons; a full menu pattern for the dropdown can follow separately if needed.
- A roving `tabIndex` across individual cells. The app's model is row selection, not cell navigation.

---

## L4 — Split `App.tsx` into hooks

| Stage | Status | Notes |
|-------|--------|-------|
| 📋 Document | ✅ | This section |
| 🔀 PR | ✅ | [#12](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/12) |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ✅ | See Implementation below |
| ✅ Ready-to-close check | ✅ | See Ready to close below |
| 🏁 Closed | ⏳ | |

### Problem

`src/App.tsx` was 879 lines at review and is 1,235 lines after H1–L3. One component holds every concern:

| Concern | Where in `App.tsx` today |
|---------|--------------------------|
| Toasts | `toasts` state and `notify` |
| Config persistence and theme | `config` state, the save effect and the `dark` class effect |
| Local-folder runtime store | `localFolders`, `localStatus`, `handlesRef`, `checkedLocalIdsRef`, `restoreLocalFolder`, the startup restore effect, and hand-written clean-up in three places (remove, import, reset) |
| Mounting flows | Add folder, Choose again, Reconnect, the `<input webkitdirectory>` fallback, `mountEntriesAsLocalFavorite`, `refillLocalFavorite` |
| Favorites | Pin subfolder, remove, toggle, set Default, current-location status |
| Navigation and sort | `activeFolderId`, `currentSubpath` and the three sort fields. "Go to this folder with its startup sort" is written out five times (select, mount, reset, import, and remove-active fallback), so a change to startup sort must be made in every copy |
| Keyboard shortcuts | One 120-line `useEffect` with a 12-item dependency list |

This makes changes risky (the H1, M3 and L3 fixes all had to touch several of these at once) and makes it hard to unit-test anything without rendering the whole app (L5).

### Proposal

A behaviour-preserving refactor. No UI, `config.json` or storage changes.

1. **Pure helpers out of the component**
   - `getInitialFolder` and `getStartupSort` move to `src/services/startup.ts`.
   - `syncNativeAccess(favorites)` moves next to `syncNativeFolders` in `src/services/nativeBridge.ts`, keeping all Tauri calls in `src/services/` as AGENTS.md §3 requires.
2. **New hooks in `src/hooks/`**

   | Hook | Owns |
   |------|------|
   | `useToasts` | `toasts`, `notify` |
   | `useAppConfig` | `config` and `setConfig`, saving to `localStorage`, the `dark` class |
   | `useFolderNavigation` | `activeFolderId`, `currentSubpath`, `sortBy`/`sortOrder`/`foldersFirst`, and one `goToFolder(folder, config)` that replaces the five copies |
   | `useLocalFolders` | The runtime store (entries, status, handles), `restoreLocalFolder`, the startup restore effect, and `register` / `forget(ids)` / `forgetAll` helpers that replace the hand-written clean-up |
   | `useFolderMounting` | Add, Choose again, Reconnect and the fallback `<input>` (`folderInputRef`, `handleFallbackFolderInput`) |
   | `useFavorites` | Pin, remove, toggle, set Default, current-location status |
   | `useKeyboardShortcuts` | The global keydown listener. It takes one options object and keeps the L3 rule that it is suspended while the menu or settings is open |

   Each hook gets what it needs as arguments (`config`, `setConfig`, `notify`, navigation callbacks). None reaches into another hook's state directly.
3. **`App.tsx` keeps** the view state (search, filters, selection, preview, settings, context menu, M3 scope override), the derived lists (`visibleEntries`, counts), and the JSX. Target: under 450 lines.
4. **Docs**
   - AGENTS.md §3 lists `src/hooks/` and its boundary: hooks may call `src/services/`, and components never do.
5. **Verify**
   - Lint and build pass.
   - All browser tests pass unchanged: L1, H1, H2, H3, M1–M6 and L3. They exercise mounting, remount, import/export, favorites, scope override, search, the virtualized grid and every shortcut.
   - Bundle size stays about the same.

### Implementation

`App.tsx` goes from 1,235 to 431 lines. Behaviour, `config.json` and storage are unchanged.

| File | Change |
|------|--------|
| `src/services/startup.ts` (new) | `getInitialFolder`, `getStartupSort` and the `FolderSort` type, moved out of `App.tsx` |
| `src/services/nativeBridge.ts` | `syncNativeAccess(favorites)` moved here from `App.tsx`, so every Tauri call stays in `src/services/` |
| `src/services/fileProvider.ts` | `rebaseEntriesToSubpath(entries, subpath)` re-roots entries under a subfolder. It replaces two hand-written copies: the demo pinned-subfolder view and pinning a local subfolder |
| `src/hooks/useToasts.ts` | `toasts`, `notify` |
| `src/hooks/useAppConfig.ts` | `config` and `setConfig`, the `localStorage` save, the `dark` class |
| `src/hooks/useFolderNavigation.ts` | Active folder, subpath and sort. `goToFolder` / `openFolder(folder, config)` replace the five copies of "open with startup sort" (select, mount, reset, import; remove-active uses `switchFolderKeepingSort`, as before). Also `navigateUp`, `sortByColumn`, `quickSort`, `toggleFoldersFirst` |
| `src/hooks/useLocalFolders.ts` | Entries, status and handles of local favorites; `restoreLocalFolder`; the startup restore effect; `storeEntries`, `forget(ids)`, `forgetAll` replace the clean-up written out in remove, import and reset |
| `src/hooks/useFolderMounting.ts` | Add folder, Choose again, Reconnect, the `<input webkitdirectory>` fallback and `folderInputRef` |
| `src/hooks/useFavorites.ts` | Pin, remove, toggle, set Default, current-location status |
| `src/hooks/useKeyboardShortcuts.ts` | The global keydown listener, taking one options object; still suspended while the menu or settings is open |
| `src/hooks/useFileActions.ts` | Copy path, open and reveal through the desktop shell. Not in the proposal: added to bring `App.tsx` under the 450-line target |
| `src/App.tsx` | Keeps view state (search, filters, selection, preview, settings, context menu, M3 scope override), the derived lists and the JSX |
| `AGENTS.md` §3 | Lists `src/hooks/` and `startup.ts`. The rule is worded as "hooks own state and may call services; components get props and never import hooks". The proposal's "components never call services" was dropped because `FileGrid`, `PreviewPane` and `SettingsModal` already use service helpers (formatting, preview reads, config validation) |

### Ready to close

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ JS bundle 331.9 kB (98.4 kB gzip), was 330.2 kB (97.7 kB gzip) |
| `App.tsx` size | ✅ 431 lines (target under 450) |
| Regression tests (production build) | ✅ L1 6, H1 13, H2 23, H3 14, M1 18, M2 24, M3 22, M4 16, M5 17, M6 7, L3 37, web-mode check. All unchanged, 0 failures |

### Out of scope

- Splitting `SettingsModal.tsx` or `FileGrid.tsx`.
- State libraries (Redux, Zustand) or context providers. Plain hooks are enough at this size.
- Unit tests for the new hooks. These belong to L5, which this refactor makes possible.

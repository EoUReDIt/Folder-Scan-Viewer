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
| M3 | 🟡 Medium | "Open Containing Folder" silently persists `includeSubfolders = false` | 🟡 In progress | (PR pending) |
| M4 | 🟡 Medium | Hidden-file detection differs between native and fallback pickers | ⏳ | — |
| M5 | 🟡 Medium | Single-token fuzzy search over-matches with no relevance ranking | ⏳ | — |
| L1 | Low | Unused AI Studio leftovers (`@google/genai`, `express`, `dotenv`, `motion`, `tsx`, Gemini `.env.example`, `metadata.json`); build tools in `dependencies` | ⏳ | — |
| L2 | Low | Removing a local favorite leaks its `localFolders` entry | ✅ Merged | [#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) (folded into H1) |
| L3 | Low | Accessibility: rows not focusable, context menu lacks focus/arrow keys, settings modal lacks focus trap | ⏳ | — |
| L4 | Low | `App.tsx` (879 lines) mixes favorites, mounting and shortcuts; extract hooks | ⏳ | — |
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
| 🔀 PR | ⏳ | |
| 📝 Proposal | ✅ | See Proposal below |
| 🔧 Implementation | ⏳ | |
| ✅ Ready-to-close check | ⏳ | |
| 🏁 Closed | ⏳ | |

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

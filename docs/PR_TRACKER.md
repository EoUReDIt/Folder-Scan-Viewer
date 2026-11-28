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
| H1 | 🔴 High | Mounted local folders (and a local Default Folder) are never persisted; reload silently falls back to a demo folder | 🟡 In progress | [#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) |
| H2 | 🔴 High | Desktop build has no native filesystem layer: fake `Local\…` paths, no "Open file" action, `csp: null`, `core:default` only | ⏳ | — |
| H3 | 🔴 High | `config.json` export drops `sourceType`; re-imported local favorites become empty demo folders | ⏳ | — |
| M1 | 🟡 Medium | Native-picker folders get `dateModified: Date.now()`; skews recency filter and Recent sort | ⏳ | — |
| M2 | 🟡 Medium | Scan cap (2,500) leaks; fallback picker has no cap or `node_modules`/`.git` skip; no grid virtualization | ⏳ | — |
| M3 | 🟡 Medium | "Open Containing Folder" silently persists `includeSubfolders = false` | ⏳ | — |
| M4 | 🟡 Medium | Hidden-file detection differs between native and fallback pickers | ⏳ | — |
| M5 | 🟡 Medium | Single-token fuzzy search over-matches with no relevance ranking | ⏳ | — |
| L1 | Low | Unused AI Studio leftovers (`@google/genai`, `express`, `dotenv`, `motion`, `tsx`, Gemini `.env.example`, `metadata.json`); build tools in `dependencies` | ⏳ | — |
| L2 | Low | Removing a local favorite leaks its `localFolders` entry | 🟡 In progress | [#1](https://github.com/EoUReDIt/Folder-Scan-Viewer/pull/1) (folded into H1) |
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
| ✅ Ready-to-close check | ✅ | Passed; awaiting owner go-ahead to merge |
| 🏁 Closed | ⏳ | |

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

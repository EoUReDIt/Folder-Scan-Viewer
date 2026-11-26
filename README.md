# Foldary

**Foldary** is a folder-first desktop file launcher and sorter proof of concept inspired by Listary and Windows 11 Fluent Design.

Instead of opening to a blank whole-PC search prompt, Foldary launches **directly into your Default Folder** with your files immediately visible, sorted according to your per-folder (or global) startup rules, and ready to filter in real time.

---

## Key Features

- **Default Folder Startup (Home)**: Opens straight into your designated default folder on launch.
- **Pinned Favorite Folders**: Jump between bookmarked folders in one click (or via `Alt+1`–`Alt+9`) and pin any nested subfolder directly from the breadcrumb bar or right-click menu.
- **Per-Folder & Global Startup Sorting**:
  - Remember a different sort field, sort direction, and *Pin folders to top* setting for each favorite folder—or enforce a Global Startup Sort in Settings.
  - Switch sorts in one click via column headers (`Name`, `Path (Relative)`, `Date Modified`, `Size`, `Type`) or Quick Sort buttons (`Recent`, `A–Z`, `Largest`, `Kind`).
- **Stacked Search & Faceted Sidebar Filters**:
  - Live substring + subsequence fuzzy search (`Ctrl+K`, `Ctrl+Space`, or `/`).
  - **Filter by**: `All`, `Folder`, `File`, `Document`, `Picture`, `Video`, `Audio`, and `Compressed` (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.iso`, etc.) with live item counts.
  - **Recently modified**: `All`, `Last 1 day`, `Last 7 days`, `Last 30 days`, `Last 365 days`.
  - **Advanced**: `Include subfolders` (Flat Mode vs. Directory Mode), `Show hidden files`, and `Pin folders to top`.
- **Preloaded Demo Workspace + Real Local Folder Mounting**: Test every feature immediately in the preloaded workspace (`Projects`, `Downloads`, `Invoices`), or click **Add Folder** to mount a real directory from your machine via the browser directory picker.
- **Quick File Preview Pane**: Collapsible right-hand inspector (`Space`) showing image thumbnails, text/code snippets, folder summaries, media/archive details, and path copy actions.
- **Right-Click Context Menu**: `Open here`, `Add/Remove Favorites`, `Set as Default Folder`, `Quick Preview`, `Open Containing Folder`, `Copy Path`, and `Copy Name`.
- **Portable `config.json` & Windows 11 Fluent Light/Dark Theme**: Export, inspect, and import validated `config.json` profiles from the Settings modal, and toggle Light/Dark mode cleanly.

---

## Quick Start

### Prerequisites
- Node.js 20+ (or Bun)

### Run Locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Build & Type-Check
```bash
npm run lint     # TypeScript check (tsc --noEmit)
npm run build    # Production bundle in dist/
npm run preview  # Preview production build
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` / `Ctrl + Space` / `/` | Focus search bar |
| `↑` / `↓` | Move selection up or down in the file grid |
| `Enter` | Open selected folder or open file preview |
| `Backspace` | Navigate up to parent folder |
| `Space` | Toggle Quick Preview pane |
| `Alt + 1` – `Alt + 9` | Jump directly to a pinned favorite folder |
| `Esc` | Clear search or close active menu/modal |

---

## Portable `config.json` Schema

Foldary persists configuration locally and lets you export/import `config.json` directly from **Settings**:

```json
{
  "defaultFolderId": "fav_projects",
  "startupBehavior": "per_folder",
  "globalSortBy": "dateModified",
  "globalSortOrder": "desc",
  "includeSubfolders": true,
  "showHiddenFiles": false,
  "theme": "light",
  "favorites": [
    {
      "id": "fav_projects",
      "name": "Projects",
      "path": "C:\\Users\\You\\Projects",
      "sortBy": "dateModified",
      "sortOrder": "desc",
      "foldersFirst": true
    },
    {
      "id": "fav_downloads",
      "name": "Downloads",
      "path": "C:\\Users\\You\\Downloads",
      "sortBy": "dateModified",
      "sortOrder": "desc",
      "foldersFirst": false
    }
  ]
}
```

---

## Documentation

- [`PROJECT.md`](./PROJECT.md) — Product vision, typical user personas, core workflows, and non-goals.
- [`HANDOFF.md`](./HANDOFF.md) — POC status, browser limitations, and step-by-step Tauri v2 desktop migration guide.
- [`AGENTS.md`](./AGENTS.md) — Architecture, module boundaries, design system invariants, and contributor/agent rules.

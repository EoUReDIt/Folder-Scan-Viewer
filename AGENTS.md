# AGENTS.md

Instructions and architectural guardrails for AI coding agents and human contributors working on **Foldary**.

## 1. Project Overview

Foldary is a folder-first file launcher and sorter built as a React + TypeScript + Tailwind CSS v4 web proof of concept, designed to be wrapped into a native desktop shell (**Tauri v2** or **Electron**) on GitHub.

Unlike whole-PC launchers that open to an empty search prompt, Foldary launches directly into a user's **Default Folder** with files immediately visible, sorted according to per-folder or global startup rules, and filterable in real time.

## 2. Commands

Run these from the repository root:

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server on http://localhost:3000
npm run lint       # Run strict TypeScript type-checking (tsc --noEmit)
npm run build      # Production build to dist/
npm run preview    # Preview the built dist/ bundle locally
```

Always run both `npm run lint` and `npm run build` after code changes before committing or ending a session.

## 3. Repository Structure & Module Boundaries

Keep UI components strictly decoupled from filesystem and persistence adapters so swapping web adapters for Tauri/Electron IPC commands requires touching only `src/services/`.

- `src/types/foldary.ts` — Canonical TypeScript interfaces (`AppConfig`, `FavoriteFolder`, `FileEntry`, `FilterType`, `FileCategory`, `SortField`, `SortOrder`, `RecencyFilter`). Matches the `config.json` schema.
- `src/services/fileProvider.ts` — Extension categorization (`document`, `picture`, `video`, `audio`, `compressed`, `other`), fuzzy/substring query matching, recency & scope filtering, sorting comparator, category counter, and browser local folder mounting (`showDirectoryPicker` + `<input webkitdirectory>` fallback).
- `src/services/configStorage.ts` — `localStorage` persistence, `config.json` export/download, and runtime schema validation (`validateAndNormalizeConfig`) for imported JSON files.
- `src/data/demoWorkspace.ts` — Preloaded demo workspace (`Projects`, `Downloads`, `Invoices`) using relative timestamps (`Date.now() - offset`) so recency filters (`1d`, `7d`, `30d`, `365d`) always remain testable.
- `src/components/` — Presentational and interactive UI modules:
  - `TopBar.tsx` — Favorites dropdown, interactive breadcrumb path, Star/Default folder toggles, live search input, and utility actions.
  - `Sidebar.tsx` — Pinned Folders, `Filter by` categories with live counts, `Recently modified` presets, and `Advanced` Fluent toggle switches.
  - `SortToolbar.tsx` — Quick Sort segmented controls (`Recent`, `A–Z`, `Largest`, `Kind`), scope toggle (`Include Subfolders` vs. `Current Folder Only`), filter reset, and item count.
  - `FileGrid.tsx` — High-density sortable table (`38px` rows), keyboard scroll sync, double-click drill-in/preview, and empty states.
  - `PreviewPane.tsx` — Collapsible right-hand inspector supporting generated/local image previews, text/code snippets, folder summaries, media/archive cards, and metadata.
  - `ContextMenu.tsx` — Viewport-clamped right-click menu for folder and file actions.
  - `SettingsModal.tsx` — Startup sort mode (`per_folder` vs. `global`), global sort defaults, per-folder sort overview, live `config.json` import/export, and keyboard shortcuts reference.
  - `FileIcon.tsx` & `ToastContainer.tsx` — Semantic file icons and non-blocking action notifications.
- `src/services/startup.ts` — Startup folder and startup sort rules (`getInitialFolder`, `getStartupSort`).
- `src/hooks/` — App state split by concern: `useToasts`, `useAppConfig` (persistence + dark class), `useFolderNavigation` (active folder, subpath, sort), `useLocalFolders` (runtime store of local favorites), `useFolderMounting` (add / choose again / reconnect), `useFavorites` (pin, remove, Default), `useKeyboardShortcuts`, `useFileActions`. Hooks own app state and may call `src/services/`. Components get state and actions as props and never import from `src/hooks/`. Hooks get their inputs as arguments rather than reading another hook's state.
- `src/App.tsx` — Composes the hooks, holds view state (search, filters, selection, preview, menus, scope override), derives the visible list, and renders the layout.

## 4. Design System & UI Invariants

Follow these visual and interaction rules when extending Foldary:

1. **Windows 11 Fluent Aesthetic (Light + Dark Parity)**
   - Tailwind CSS v4 dark mode uses `@custom-variant dark (&:where(.dark, .dark *));` in `src/index.css`. Never add `!important` theme inversion hacks.
   - Every new surface, border, text color, input, and menu must include both light and `dark:*` classes.
   - Light tokens: chrome/sidebar `#F3F3F3`, main canvas `#FFFFFF`, subtle toolbar `#F9F9F9`, borders `#E5E5E5`, accent `#0067C0`.
   - Dark tokens: chrome/sidebar `#202020`, main canvas `#272727`, subtle toolbar `#2C2C2C`, borders `#383838`, accent `#60CDFF`.
2. **Typography & Tabular Discipline**
   - Display/headings: `Plus Jakarta Sans`; body/file rows: `Public Sans`; paths, sizes, timestamps, counts, and JSON: `JetBrains Mono` with `tabular-nums`.
3. **Zero Static Metadata Pills**
   - Keep file types, counts, and metadata as clean, unboxed text with `·` separators rather than rounded colored pill badges. Functional interactive controls (segmented sort buttons, toggles, dropdowns) should remain clean `<button>` elements.
4. **Keyboard-First Behavior**
   - Preserve global shortcuts (`Ctrl+K` / `Ctrl+Space` / `/`, `↑`/`↓`, `Enter`, `Backspace`, `Space`, `Alt+1..9`, `Esc`). When adding modals or inputs, ensure keyboard listeners do not hijack typing inside form controls.
5. **Memory & Asset Safety**
   - Always revoke `URL.createObjectURL(...)` handles in `useEffect` cleanup functions (see `PreviewPane.tsx`).
   - Validate all user-imported `config.json` payloads via `validateAndNormalizeConfig` before mutating app state.

## 5. Extending Filters or Sort Modes

When adding a new file category (like `compressed`):
1. Update `FileCategory` and `FilterType` in `src/types/foldary.ts`.
2. Add the extension set, `categorizeExtension`, `getCategoryLabel`, and `computeCategoryCounts` entries in `src/services/fileProvider.ts`.
3. Add the sidebar button in `FILTER_OPTIONS` inside `src/components/Sidebar.tsx`.
4. Add icon styling in `src/components/FileIcon.tsx` and preview handling in `src/components/PreviewPane.tsx`.

## 6. Agent Checklist Before Finishing Any Task

- [ ] No dead buttons or unwired handlers.
- [ ] Both Light and Dark modes checked for text contrast and border visibility.
- [ ] `config.json` export/import remains backwards-compatible with existing keys.
- [ ] `npm run lint` passes with zero errors.
- [ ] `npm run build` succeeds cleanly.
- [ ] Final report follows the Coding Task Report format (see §7).

## 7. Reporting Format for Agents

Every agent (Claude Code, the main AI builder, or any other assistant) reports progress and results on coding tasks using the format in [`.claude/skills/coding-task-report/SKILL.md`](.claude/skills/coding-task-report/SKILL.md). Claude Code loads it automatically as the `coding-task-report` skill; other agents should read that file and follow it.

In short:
- Lead with a one-line status (`✅` done/pass, `❌` fail/blocked, `⏳` pending, `🟡` warning/partial, `🔴` critical).
- Use tables for checks, commits, branches and PRs; keep small tasks to the minimal form.
- Report only what was actually verified; say plainly when a step was skipped or failed.
- Link PRs and issues as full markdown links with `owner/repo`, never a bare `#123`.

This format applies to chat/status reports only. Commit messages, PR bodies and repository files follow the project's normal conventions.

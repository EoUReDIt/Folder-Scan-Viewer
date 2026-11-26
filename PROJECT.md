# PROJECT.md

Product vision, typical user profiles, core workflows, and design principles for **Foldary**.

---

## 1. Product Vision & Problem Statement

Traditional file launchers like Listary or Spotlight start with a blank search bar and search the entire operating system. That works well when you already know a filename, but breaks down when you work repeatedly inside a handful of active folders—where you want to *see* what is inside immediately, sorted the way you expect, and narrow down visually by file type or recency.

**Foldary** flips the model to be **folder-first**:
- It opens directly into your designated **Default Folder (Home)** with files immediately visible and sorted.
- It keeps your **Favorited Folders** one click (or one shortcut) away.
- It remembers a **distinct sort order per favorite folder** (or applies a clean global startup sort), eliminating repetitive column re-sorting every time you switch contexts.

---

## 2. Typical Users (Personas)

Foldary is built for keyboard-comfortable desktop power users who manage active working directories every day.

### Persona 1: The Multi-Project Software Engineer
- **Context**: Switches constantly between active repositories (`Projects`), freshly downloaded SDKs/assets (`Downloads`), and build outputs.
- **Pain Points**:
  - Windows Explorer / Finder opens to generic Home/Recents and makes flat cross-subfolder searching slow.
  - Needs `Downloads` sorted by **Date Modified (Newest First)** with folders mixed in, while `Projects` should open sorted by **Name (A–Z)** or **Recent** with **Folders Pinned to Top**.
  - Frequently inspects dotfiles (`.env.local`, `.gitignore`, `.toml`, `.json`) that standard explorers hide or bury.
- **How They Use Foldary**:
  - Launches straight into `Projects` via hotkey.
  - Uses `Ctrl+K` + fuzzy typing (`indxrs` → `indexer.rs`) with `Include subfolders` ON.
  - Toggles `Show hidden files` only when editing config dotfiles.
  - Exports `config.json` into their dotfiles repository to sync pinned folders and sort rules across workstations.

### Persona 2: The Product Designer & Content Creator
- **Context**: Works across deeply nested `Assets`, `Figma Exports`, `Design`, and `Media` folders full of PNGs, WebPs, videos, audio clips, and `.zip` handoff bundles.
- **Pain Points**:
  - Forgets exact filenames exported yesterday (`hero_banner.png` vs `logo_concept_final.png`).
  - Wastes time clicking through 4 subfolder levels just to find the latest image or archive sent to a client.
- **How They Use Foldary**:
  - Keeps `Include subfolders` (Flat Mode) enabled to view every asset across the project at once.
  - Stacks **Picture** + **Last 7 days** + `"logo"` in two clicks and a word.
  - Uses `↑` / `↓` arrow keys with the collapsible **Quick Preview** pane (`Space`) to visually verify thumbnails before copying paths or sharing assets.

### Persona 3: The Freelancer / Operations Specialist
- **Context**: Tracks recurring documents, client deliverables, invoices, tax PDFs, spreadsheets, and `.zip`/`.7z` archive backups grouped by year or client.
- **Pain Points**:
  - Switching between `Invoices` (needs chronological or alphabetical order by year) and `Downloads` (needs the file downloaded 2 minutes ago) forces constant re-sorting.
  - Wants to filter quickly for only **Document** or **Compressed** archive files without memorizing CLI flags or search syntax.
- **How They Use Foldary**:
  - Pins `Invoices` and `Downloads` alongside their Default Folder and jumps with `Alt+1`, `Alt+2`, `Alt+3`.
  - Right-clicks a recurring year subfolder (e.g., `2026`) to **Add to Favorites** or **Set as Default Folder** during tax season.
  - Uses **Compressed** and **Document** sidebar filters combined with **Last 30 days** to audit recent submissions.

---

## 3. Core User Workflows

1. **Zero-Friction Launch**: Open app → immediately view Default Folder sorted with remembered preferences → press `↓` / `Enter` or start typing to narrow results.
2. **Context-Aware Per-Folder Sorting**: Switching from `Projects` to `Downloads` automatically restores each folder's saved `sortBy`, `sortOrder`, and `foldersFirst` state (unless the user chooses Global Startup Sort in Settings).
3. **Stacked Faceted Narrowing**: Search text, file category (`All`, `Folder`, `File`, `Document`, `Picture`, `Video`, `Audio`, `Compressed`), modification window (`1d`, `7d`, `30d`, `365d`), hidden file visibility, and subfolder scope all combine live without changing folders.
4. **Flat vs. Directory Browsing**: Toggle `Include subfolders` ON for Listary-style whole-tree search/sorting, or OFF for classic single-directory browsing with double-click drill-in and breadcrumb/`Backspace` navigation.
5. **Portable Configuration**: All folder bookmarks, startup rules, and sort preferences live in a human-readable `config.json` file.

---

## 4. Product Principles & Non-Goals

### Principles
- **Instant Clarity**: Show files immediately on launch; never hide the user's workspace behind onboarding modals or empty search boxes.
- **Keyboard Speed, Mouse Comfort**: Every core action works via keyboard shortcuts while remaining discoverable via crisp Windows 11 Fluent controls and right-click context menus.
- **Local-First Simplicity**: Plain local `config.json`, zero accounts, zero cloud telemetry.

### Non-Goals
- Not a full dual-pane file transfer / FTP / batch-renaming suite (like Total Commander or Directory Opus).
- Not a cloud storage sync client or whole-disk full-text OCR indexer.
- Not a heavy plugin marketplace—focus on sub-50ms folder visibility, sorting, and filtering.

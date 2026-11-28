//! Recursive folder scan returning the metadata the grid needs.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub const MAX_DEPTH: usize = 8;
pub const MAX_ENTRIES: usize = 2500;
const SKIPPED_DIRS: [&str; 2] = ["node_modules", ".git"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEntry {
    pub name: String,
    /// Forward-slash path relative to the scanned root ("Reports/q4.pdf")
    pub entry_path: String,
    pub is_folder: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch (0 when the OS gives no time)
    pub modified_ms: f64,
    pub hidden: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root_name: String,
    pub root_path: String,
    pub entries: Vec<NativeEntry>,
    /// True when the entry limit was hit and the listing is incomplete
    pub truncated: bool,
}

fn modified_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

// Browsers cannot read this attribute, so web mode hides by the dot rule alone
// (isHiddenEntryPath in src/services/fileProvider.ts).
#[cfg(windows)]
fn has_hidden_attribute(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
}

#[cfg(not(windows))]
fn has_hidden_attribute(_meta: &fs::Metadata) -> bool {
    false
}

pub fn scan(root: &Path) -> std::io::Result<ScanResult> {
    let mut entries = Vec::new();
    let mut truncated = false;
    walk(root, "", false, 0, &mut entries, &mut truncated)?;
    Ok(ScanResult {
        root_name: root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
        root_path: root.to_string_lossy().into_owned(),
        entries,
        truncated,
    })
}

fn walk(
    dir: &Path,
    parent: &str,
    parent_hidden: bool,
    depth: usize,
    out: &mut Vec<NativeEntry>,
    truncated: &mut bool,
) -> std::io::Result<()> {
    let mut children: Vec<_> = match fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(Result::ok).collect(),
        // The root must be readable; unreadable subfolders are skipped
        Err(e) if depth == 0 => return Err(e),
        Err(_) => return Ok(()),
    };
    children.sort_by_key(|c| c.file_name());

    for child in children {
        if out.len() >= MAX_ENTRIES {
            *truncated = true;
            return Ok(());
        }
        let name = child.file_name().to_string_lossy().into_owned();
        // symlink_metadata: never follow links, so a link cannot pull in files outside the root
        let Ok(meta) = child.path().symlink_metadata() else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        let is_folder = meta.is_dir();
        if is_folder && SKIPPED_DIRS.contains(&name.as_str()) {
            continue;
        }
        let entry_path = if parent.is_empty() { name.clone() } else { format!("{parent}/{name}") };
        let hidden = parent_hidden || name.starts_with('.') || has_hidden_attribute(&meta);
        out.push(NativeEntry {
            name,
            entry_path: entry_path.clone(),
            is_folder,
            size: if is_folder { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
            hidden,
        });
        if is_folder && depth + 1 < MAX_DEPTH {
            walk(&child.path(), &entry_path, hidden, depth + 1, out, truncated)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_tree_with_relative_paths_and_flags() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("docs/deep")).unwrap();
        fs::create_dir_all(root.join(".config")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("a.txt"), "hello").unwrap();
        fs::write(root.join("docs/deep/b.md"), "#").unwrap();
        fs::write(root.join(".config/c.json"), "{}").unwrap();
        fs::write(root.join("node_modules/pkg/i.js"), "").unwrap();

        let result = scan(root).unwrap();
        let paths: Vec<_> = result.entries.iter().map(|e| e.entry_path.as_str()).collect();
        assert_eq!(paths, [".config", ".config/c.json", "a.txt", "docs", "docs/deep", "docs/deep/b.md"]);
        assert!(!result.truncated);

        let by = |p: &str| result.entries.iter().find(|e| e.entry_path == p).unwrap();
        assert_eq!(by("a.txt").size, 5);
        assert!(!by("a.txt").is_folder && by("docs").is_folder);
        assert!(by("a.txt").modified_ms > 0.0);
        // Files inside a hidden folder are hidden too
        assert!(by(".config").hidden && by(".config/c.json").hidden);
        assert!(!by("docs/deep/b.md").hidden);
    }

    #[test]
    fn stops_at_entry_limit() {
        let tmp = tempfile::tempdir().unwrap();
        for i in 0..(MAX_ENTRIES + 10) {
            fs::write(tmp.path().join(format!("f{i:05}.txt")), "").unwrap();
        }
        let result = scan(tmp.path()).unwrap();
        assert_eq!(result.entries.len(), MAX_ENTRIES);
        assert!(result.truncated);
    }

    #[test]
    fn stops_at_depth_limit() {
        let tmp = tempfile::tempdir().unwrap();
        let mut p = tmp.path().to_path_buf();
        for i in 0..(MAX_DEPTH + 3) {
            p = p.join(format!("d{i}"));
        }
        fs::create_dir_all(&p).unwrap();
        let result = scan(tmp.path()).unwrap();
        assert_eq!(result.entries.len(), MAX_DEPTH);
    }

    #[test]
    fn missing_root_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(scan(&tmp.path().join("gone")).is_err());
    }
}

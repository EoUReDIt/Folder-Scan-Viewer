//! Renaming a file or folder inside a folder the user picked.
//!
//! The parent folder is resolved through the allowlist, then the item is renamed in place,
//! so a symlink is renamed rather than its target and nothing outside a root is touched.

use crate::roots::Roots;
use std::fs;
use std::path::{Path, PathBuf};

const RESERVED: [&str; 4] = ["CON", "PRN", "AUX", "NUL"];

/// Same rules as `validateEntryName` in src/services/rename.ts (sibling check aside).
pub fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Enter a name".into());
    }
    if name == "." || name == ".." {
        return Err("\".\" and \"..\" can't be used as names".into());
    }
    if name.chars().any(|c| "/\\:*?\"<>|".contains(c) || c.is_control()) {
        return Err("A name can't contain / \\ : * ? \" < > |".into());
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err("A name can't end with a space or a dot".into());
    }
    if name.chars().count() > 255 {
        return Err("A name can't be longer than 255 characters".into());
    }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    let numbered = (stem.starts_with("COM") || stem.starts_with("LPT"))
        && stem.len() == 4
        && matches!(stem.as_bytes()[3], b'1'..=b'9');
    if RESERVED.contains(&stem.as_str()) || numbered {
        return Err(format!("\"{name}\" is reserved by Windows"));
    }
    Ok(())
}

/// Renames the item at `path` to `new_name` in the same folder and returns its new path.
pub fn rename_in(roots: &Roots, path: &str, new_name: &str) -> Result<PathBuf, String> {
    validate_name(new_name)?;
    let path = Path::new(path);
    let (Some(parent), Some(old_name)) = (path.parent(), path.file_name()) else {
        return Err("This item can't be renamed".into());
    };
    let parent = roots.resolve(&parent.to_string_lossy())?;
    let source = parent.join(old_name);
    fs::symlink_metadata(&source).map_err(|e| format!("{}: {e}", source.display()))?;
    if roots.holds_root(&source) {
        return Err("This is a folder you picked. Rename the pinned folder instead".into());
    }
    let target = parent.join(new_name);
    if fs::symlink_metadata(&target).is_ok() {
        let case_only = old_name.to_string_lossy().to_lowercase() == new_name.to_lowercase();
        let same = case_only
            && dunce::canonicalize(&target).ok() == dunce::canonicalize(&source).ok();
        if !same {
            return Err(format!("\"{new_name}\" already exists in this folder"));
        }
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, PathBuf, Roots) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/a.txt"), "a").unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        fs::write(tmp.path().join("outside.txt"), "o").unwrap();
        let roots = Roots::load(None);
        let root = roots.add(&root).unwrap();
        (tmp, root, roots)
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn renames_file_and_folder_inside_root() {
        let (_tmp, root, roots) = setup();
        let new_file = rename_in(&roots, &s(&root.join("b.txt")), "c.txt").unwrap();
        assert_eq!(new_file, root.join("c.txt"));
        assert!(root.join("c.txt").exists() && !root.join("b.txt").exists());
        rename_in(&roots, &s(&root.join("sub")), "renamed").unwrap();
        assert!(root.join("renamed/a.txt").exists());
    }

    #[test]
    fn refuses_existing_target_and_invalid_names() {
        let (_tmp, root, roots) = setup();
        assert!(rename_in(&roots, &s(&root.join("b.txt")), "sub").is_err());
        for bad in ["", "a/b", "..", "x.", "CON", "com1.txt", "a:b"] {
            assert!(rename_in(&roots, &s(&root.join("b.txt")), bad).is_err(), "{bad}");
        }
        assert!(root.join("b.txt").exists());
    }

    #[test]
    fn allows_case_only_rename() {
        let (_tmp, root, roots) = setup();
        rename_in(&roots, &s(&root.join("b.txt")), "B.txt").unwrap();
        let names: Vec<String> = fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"B.txt".to_string()));
    }

    #[test]
    fn refuses_root_and_outside_paths() {
        let (tmp, root, roots) = setup();
        assert!(rename_in(&roots, &s(&root), "moved").is_err());
        assert!(root.exists());
        assert!(rename_in(&roots, &s(&tmp.path().join("outside.txt")), "x.txt").is_err());
        let sneaky = root.join("sub/../../outside.txt");
        assert!(rename_in(&roots, &s(&sneaky), "x.txt").is_err());
        assert!(tmp.path().join("outside.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn renames_symlink_not_its_target() {
        let (tmp, root, roots) = setup();
        std::os::unix::fs::symlink(tmp.path().join("outside.txt"), root.join("link")).unwrap();
        rename_in(&roots, &s(&root.join("link")), "link2").unwrap();
        assert!(tmp.path().join("outside.txt").exists());
        assert!(fs::symlink_metadata(root.join("link2")).unwrap().file_type().is_symlink());
    }
}

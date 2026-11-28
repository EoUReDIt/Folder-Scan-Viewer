//! Allowlist of folders the user picked through the native dialog.
//!
//! Every command that touches the disk resolves its path through [`Roots::resolve`],
//! so the WebView can only read or open files inside a folder the user chose.
//! The list is saved as JSON so access survives restarts; an imported `config.json`
//! cannot add to it.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Roots {
    file: Option<PathBuf>,
    roots: Mutex<Vec<PathBuf>>,
}

fn canonical(path: &Path) -> Result<PathBuf, String> {
    dunce::canonicalize(path).map_err(|e| format!("{}: {e}", path.display()))
}

impl Roots {
    /// Loads the allowlist from `file` (missing or unreadable file = empty list).
    pub fn load(file: Option<PathBuf>) -> Self {
        let roots = file
            .as_ref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|text| serde_json::from_str::<Vec<PathBuf>>(&text).ok())
            .unwrap_or_default();
        Self { file, roots: Mutex::new(roots) }
    }

    fn save(&self, roots: &[PathBuf]) {
        let Some(file) = &self.file else { return };
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(roots) {
            let _ = fs::write(file, text);
        }
    }

    /// Adds a folder chosen by the user and returns its canonical path.
    pub fn add(&self, path: &Path) -> Result<PathBuf, String> {
        let path = canonical(path)?;
        if !path.is_dir() {
            return Err(format!("{} is not a folder", path.display()));
        }
        let mut roots = self.roots.lock().map_err(|_| "allowlist lock poisoned")?;
        if !roots.contains(&path) {
            roots.push(path.clone());
            self.save(&roots);
        }
        Ok(path)
    }

    /// Keeps only roots that contain at least one of `keep` (the folders favorites still use).
    pub fn retain_covering(&self, keep: &[String]) {
        let keep: Vec<PathBuf> = keep
            .iter()
            .map(|k| dunce::canonicalize(k).unwrap_or_else(|_| PathBuf::from(k)))
            .collect();
        if let Ok(mut roots) = self.roots.lock() {
            let before = roots.len();
            roots.retain(|root| keep.iter().any(|k| k.starts_with(root)));
            if roots.len() != before {
                self.save(&roots);
            }
        }
    }

    /// Canonicalizes `path` and checks it lies inside an allowed root.
    /// Canonicalizing first resolves `..` and symlinks, so neither can escape a root.
    pub fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let resolved = canonical(Path::new(path))?;
        let roots = self.roots.lock().map_err(|_| "allowlist lock poisoned")?;
        if roots.iter().any(|root| resolved.starts_with(root)) {
            Ok(resolved)
        } else {
            Err(format!("{} is outside the folders you chose", resolved.display()))
        }
    }

    #[cfg(test)]
    pub fn list(&self) -> Vec<PathBuf> {
        self.roots.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let allowed = tmp.path().join("allowed");
        let other = tmp.path().join("other");
        fs::create_dir_all(allowed.join("sub")).unwrap();
        fs::create_dir_all(&other).unwrap();
        fs::write(allowed.join("sub/a.txt"), "a").unwrap();
        fs::write(other.join("secret.txt"), "s").unwrap();
        (tmp, allowed, other)
    }

    #[test]
    fn resolves_inside_root_and_rejects_outside() {
        let (_tmp, allowed, other) = setup();
        let roots = Roots::load(None);
        roots.add(&allowed).unwrap();
        assert!(roots.resolve(allowed.join("sub/a.txt").to_str().unwrap()).is_ok());
        assert!(roots.resolve(allowed.to_str().unwrap()).is_ok());
        assert!(roots.resolve(other.join("secret.txt").to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_dot_dot_traversal() {
        let (_tmp, allowed, _other) = setup();
        let roots = Roots::load(None);
        roots.add(&allowed).unwrap();
        let sneaky = allowed.join("sub/../../other/secret.txt");
        assert!(roots.resolve(sneaky.to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_sibling_with_shared_prefix() {
        let (tmp, allowed, _other) = setup();
        let sibling = tmp.path().join("allowed-but-not");
        fs::create_dir_all(&sibling).unwrap();
        let roots = Roots::load(None);
        roots.add(&allowed).unwrap();
        assert!(roots.resolve(sibling.to_str().unwrap()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escaping_root() {
        let (_tmp, allowed, other) = setup();
        std::os::unix::fs::symlink(other.join("secret.txt"), allowed.join("link.txt")).unwrap();
        let roots = Roots::load(None);
        roots.add(&allowed).unwrap();
        assert!(roots.resolve(allowed.join("link.txt").to_str().unwrap()).is_err());
    }

    #[test]
    fn empty_allowlist_rejects_everything() {
        let (_tmp, allowed, _other) = setup();
        let roots = Roots::load(None);
        assert!(roots.resolve(allowed.to_str().unwrap()).is_err());
    }

    #[test]
    fn persists_and_prunes() {
        let (tmp, allowed, other) = setup();
        let file = tmp.path().join("state/allowed_roots.json");
        let roots = Roots::load(Some(file.clone()));
        roots.add(&allowed).unwrap();
        roots.add(&other).unwrap();
        roots.add(&allowed).unwrap(); // no duplicate
        assert_eq!(Roots::load(Some(file.clone())).list().len(), 2);

        // A pinned subfolder keeps its root alive; `other` is no longer used
        roots.retain_covering(&[allowed.join("sub").to_string_lossy().into_owned()]);
        let reloaded = Roots::load(Some(file));
        assert_eq!(reloaded.list(), vec![dunce::canonicalize(&allowed).unwrap()]);
    }
}

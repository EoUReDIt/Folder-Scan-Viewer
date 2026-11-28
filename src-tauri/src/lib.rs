mod rename;
mod roots;
mod scan;

use roots::Roots;
use std::io::Read;
use std::path::PathBuf;
use tauri::{ipc::Response, AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Read-only file I/O runs off the async runtime's worker threads.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Opens the OS folder dialog. The chosen folder is added to the allowlist.
/// Returns `None` when the user cancels.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Result<Option<scan::ScanResult>, String> {
    let dialog_app = app.clone();
    let picked = blocking(move || Ok(dialog_app.dialog().file().blocking_pick_folder())).await?;
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let root = app.state::<Roots>().add(&path)?;
    blocking(move || scan::scan(&root).map_err(|e| e.to_string())).await.map(Some)
}

#[tauri::command]
async fn scan_folder(roots: State<'_, Roots>, path: String) -> Result<scan::ScanResult, String> {
    let dir = roots.resolve(&path)?;
    blocking(move || scan::scan(&dir).map_err(|e| e.to_string())).await
}

#[derive(serde::Serialize)]
struct TextSnippet {
    text: String,
    truncated: bool,
}

fn read_prefix(path: &PathBuf, max_bytes: u64) -> Result<(Vec<u8>, bool), String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let mut buf = Vec::new();
    file.take(max_bytes).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok((buf, size > max_bytes))
}

#[tauri::command]
async fn read_text_snippet(
    roots: State<'_, Roots>,
    path: String,
    max_bytes: u64,
) -> Result<TextSnippet, String> {
    let file = roots.resolve(&path)?;
    blocking(move || {
        let (bytes, truncated) = read_prefix(&file, max_bytes)?;
        Ok(TextSnippet { text: String::from_utf8_lossy(&bytes).into_owned(), truncated })
    })
    .await
}

/// Returns a whole file as raw bytes (an ArrayBuffer in JS), refusing files over `max_bytes`.
#[tauri::command]
async fn read_file_bytes(
    roots: State<'_, Roots>,
    path: String,
    max_bytes: u64,
) -> Result<Response, String> {
    let file = roots.resolve(&path)?;
    blocking(move || {
        let (bytes, truncated) = read_prefix(&file, max_bytes)?;
        if truncated {
            return Err(format!("File is larger than {max_bytes} bytes"));
        }
        Ok(Response::new(bytes))
    })
    .await
}

#[tauri::command]
fn open_path(app: AppHandle, roots: State<'_, Roots>, path: String) -> Result<(), String> {
    let target = roots.resolve(&path)?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_path(app: AppHandle, roots: State<'_, Roots>, path: String) -> Result<(), String> {
    let target = roots.resolve(&path)?;
    app.opener().reveal_item_in_dir(target).map_err(|e| e.to_string())
}

/// Renames a file or folder inside a picked folder; returns its new absolute path.
#[tauri::command]
async fn rename_path(app: AppHandle, path: String, new_name: String) -> Result<String, String> {
    blocking(move || {
        let roots = app.state::<Roots>();
        rename::rename_in(&roots, &path, &new_name).map(|p| p.to_string_lossy().into_owned())
    })
    .await
}

/// Drops allowlisted roots that no favorite uses any more.
#[tauri::command]
fn sync_folders(roots: State<'_, Roots>, keep: Vec<String>) {
    roots.retain_covering(&keep);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plugins are used from Rust only; capabilities grant JS none of their commands.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let file = app.path().app_data_dir().ok().map(|d| d.join("allowed_roots.json"));
            app.manage(Roots::load(file));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            scan_folder,
            read_text_snippet,
            read_file_bytes,
            open_path,
            reveal_path,
            sync_folders,
            rename_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Foldary application");
}

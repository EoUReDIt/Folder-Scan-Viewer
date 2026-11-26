import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  FileArchive,
  Film,
  FolderOpen,
  Home,
  Image as ImageIcon,
  Music,
  Star,
  X,
} from 'lucide-react';
import { FileEntry } from '../types/foldary';
import {
  formatExactDate,
  formatFileSize,
  getCategoryLabel,
  isTextPreviewable,
  readLocalFileTextSnippet,
} from '../services/fileProvider';
import { FileIcon } from './FileIcon';

interface PreviewPaneProps {
  entry: FileEntry | null;
  allEntriesInRoot: FileEntry[];
  onClose: () => void;
  onOpenFolderHere: (entryPath: string) => void;
  onToggleFavoriteFolder: (entryPath: string, name: string, fullPath: string) => void;
  onSetFolderAsDefault: (entryPath: string, name: string, fullPath: string) => void;
  onCopyPath: (path: string) => void;
}

export function PreviewPane({
  entry,
  allEntriesInRoot,
  onClose,
  onOpenFolderHere,
  onToggleFavoriteFolder,
  onSetFolderAsDefault,
  onCopyPath,
}: PreviewPaneProps) {
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [localTextPreview, setLocalTextPreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
    setLocalTextPreview(null);

    if (!entry?.localFile) {
      setLocalObjectUrl(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    if (entry.category === 'picture') {
      createdUrl = URL.createObjectURL(entry.localFile);
      setLocalObjectUrl(createdUrl);
    } else {
      setLocalObjectUrl(null);
    }

    if (isTextPreviewable(entry.extension)) {
      readLocalFileTextSnippet(entry.localFile)
        .then((text) => {
          if (!cancelled) setLocalTextPreview(text);
        })
        .catch(() => {
          if (!cancelled) setLocalTextPreview(null);
        });
    }

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [entry]);

  const folderSummary = useMemo(() => {
    if (!entry || !entry.isFolder) return null;
    const prefix = `${entry.entryPath}/`;
    const children = allEntriesInRoot.filter(
      (item) => item.parentPath === entry.entryPath || item.parentPath.startsWith(prefix)
    );
    const files = children.filter((c) => !c.isFolder);
    const subfolders = children.filter((c) => c.isFolder);
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    return {
      fileCount: files.length,
      subfolderCount: subfolders.length,
      totalBytes,
    };
  }, [entry, allEntriesInRoot]);

  const activeImageSrc = entry?.previewUrl || localObjectUrl;
  const activeTextSnippet = entry?.textSnippet || localTextPreview;

  return (
    <aside
      aria-label="Quick File Preview"
      className="w-[316px] shrink-0 h-full overflow-y-auto bg-[#F9F9F9] dark:bg-[#222222] border-l border-[#E5E5E5] dark:border-[#383838] flex flex-col"
    >
      {/* Header */}
      <div className="h-[42px] px-4 shrink-0 flex items-center justify-between border-b border-[#E5E5E5] dark:border-[#383838]">
        <h2 className="text-xs font-semibold text-[#5C5C5C] dark:text-[#A6A6A6]">
          Quick Preview
        </h2>
        <button
          type="button"
          onClick={onClose}
          title="Close preview (Space)"
          aria-label="Close preview pane"
          className="p-1 rounded text-[#5C5C5C] dark:text-[#A6A6A6] hover:bg-[#EAEAEA] dark:hover:bg-[#333333] hover:text-[#1A1A1A] dark:hover:text-[#F3F3F3] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!entry ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6]">
            Select any file or folder to inspect its preview, path, and metadata.
          </p>
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {/* File Title Lockup */}
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5">
              <FileIcon
                category={entry.category}
                extension={entry.extension}
                isFolder={entry.isFolder}
                className="w-5 h-5"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#F3F3F3] break-words leading-snug">
                {entry.name}
              </h3>
              <p className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6] mt-0.5">
                {getCategoryLabel(entry.category, entry.extension)}
                {entry.dimensions ? ` · ${entry.dimensions}` : ''}
                {entry.duration ? ` · ${entry.duration}` : ''}
              </p>
            </div>
          </div>

          {/* Preview Canvas */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3A] bg-white dark:bg-[#2A2A2A] overflow-hidden">
            {entry.category === 'picture' && activeImageSrc && !imageError ? (
              <div className="bg-[#F3F3F3] dark:bg-[#1C1C1C] flex items-center justify-center p-2">
                <img
                  src={activeImageSrc}
                  alt={entry.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="max-h-52 w-full object-contain rounded"
                />
              </div>
            ) : entry.category === 'picture' ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2 bg-[#F3F3F3] dark:bg-[#1E1E1E] text-[#5C5C5C] dark:text-[#A6A6A6] p-4">
                <ImageIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                <span className="text-xs truncate max-w-full">{entry.name}</span>
              </div>
            ) : activeTextSnippet ? (
              <pre className="p-3 font-mono text-[11px] leading-relaxed text-[#2C2C2C] dark:text-[#DFDFDF] overflow-x-auto max-h-56 whitespace-pre-wrap break-words">
                {activeTextSnippet}
              </pre>
            ) : entry.isFolder && folderSummary ? (
              <div className="p-4 flex flex-col gap-1.5">
                <div className="text-xs font-medium text-[#1A1A1A] dark:text-[#F3F3F3]">
                  Folder Contents
                </div>
                <div className="font-mono text-xs text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums">
                  {folderSummary.fileCount} {folderSummary.fileCount === 1 ? 'file' : 'files'} ·{' '}
                  {folderSummary.subfolderCount}{' '}
                  {folderSummary.subfolderCount === 1 ? 'subfolder' : 'subfolders'}
                </div>
                <div className="font-mono text-xs text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums">
                  Total size: {formatFileSize(folderSummary.totalBytes, false)}
                </div>
              </div>
            ) : entry.category === 'video' ? (
              <div className="h-36 flex flex-col items-center justify-center gap-1.5 bg-[#F5F3FF] dark:bg-[#252130] p-4 text-center">
                <Film className="w-7 h-7 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
                <span className="text-xs font-medium text-[#1A1A1A] dark:text-[#F3F3F3]">
                  Video Clip
                </span>
                {entry.duration && (
                  <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums">
                    {entry.duration}
                  </span>
                )}
              </div>
            ) : entry.category === 'audio' ? (
              <div className="h-36 flex flex-col items-center justify-center gap-1.5 bg-[#FFF1F2] dark:bg-[#2F2024] p-4 text-center">
                <Music className="w-7 h-7 text-rose-600 dark:text-rose-400" strokeWidth={1.5} />
                <span className="text-xs font-medium text-[#1A1A1A] dark:text-[#F3F3F3]">
                  Audio Track
                </span>
                {entry.duration && (
                  <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums">
                    {entry.duration}
                  </span>
                )}
              </div>
            ) : entry.category === 'compressed' ? (
              <div className="h-36 flex flex-col items-center justify-center gap-1.5 bg-[#FFF7ED] dark:bg-[#2E241C] p-4 text-center">
                <FileArchive
                  className="w-7 h-7 text-orange-600 dark:text-orange-400"
                  strokeWidth={1.5}
                />
                <span className="text-xs font-medium text-[#1A1A1A] dark:text-[#F3F3F3]">
                  Compressed Archive
                </span>
                <span className="font-mono text-[11px] text-[#5C5C5C] dark:text-[#A6A6A6] tabular-nums">
                  {entry.extension ? `.${entry.extension.toLowerCase()}` : 'Archive'} ·{' '}
                  {formatFileSize(entry.size, false)}
                </span>
              </div>
            ) : (
              <div className="h-28 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                <FileIcon
                  category={entry.category}
                  extension={entry.extension}
                  isFolder={entry.isFolder}
                  className="w-7 h-7"
                />
                <span className="text-xs text-[#5C5C5C] dark:text-[#A6A6A6]">
                  Binary file · {formatFileSize(entry.size, false)}
                </span>
              </div>
            )}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap gap-2">
            {entry.isFolder && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenFolderHere(entry.entryPath)}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] text-white dark:text-[#1A1A1A] transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Open here</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onToggleFavoriteFolder(entry.entryPath, entry.name, entry.fullPath)
                  }
                  className="h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-[#2E2E2E] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DFDFDF] dark:border-[#424242] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors whitespace-nowrap"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pin Favorite</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSetFolderAsDefault(entry.entryPath, entry.name, entry.fullPath)
                  }
                  className="h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-[#2E2E2E] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DFDFDF] dark:border-[#424242] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors whitespace-nowrap"
                >
                  <Home className="w-3.5 h-3.5 text-[#0067C0] dark:text-[#60CDFF]" />
                  <span>Set Default</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => onCopyPath(entry.fullPath)}
              className="h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-[#2E2E2E] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DFDFDF] dark:border-[#424242] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] transition-colors whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5 text-[#5C5C5C] dark:text-[#A6A6A6]" />
              <span>Copy Path</span>
            </button>
          </div>

          {/* Unboxed Clean Metadata List */}
          <dl className="divide-y divide-[#EAEAEA] dark:divide-[#333333] border-t border-[#EAEAEA] dark:border-[#333333] text-xs">
            <div className="py-2 flex items-center justify-between gap-3">
              <dt className="text-[#5C5C5C] dark:text-[#A6A6A6]">Size</dt>
              <dd className="font-mono text-[#1A1A1A] dark:text-[#F3F3F3] tabular-nums">
                {formatFileSize(entry.size, entry.isFolder)}
              </dd>
            </div>
            <div className="py-2 flex items-center justify-between gap-3">
              <dt className="text-[#5C5C5C] dark:text-[#A6A6A6]">Modified</dt>
              <dd className="font-mono text-[#1A1A1A] dark:text-[#F3F3F3] tabular-nums text-right">
                {formatExactDate(entry.dateModified)}
              </dd>
            </div>
            <div className="py-2 flex items-center justify-between gap-3">
              <dt className="text-[#5C5C5C] dark:text-[#A6A6A6] shrink-0">Relative</dt>
              <dd className="font-mono text-[#1A1A1A] dark:text-[#F3F3F3] truncate">
                {entry.relativePath}
              </dd>
            </div>
            <div className="py-2 flex flex-col gap-1">
              <dt className="text-[#5C5C5C] dark:text-[#A6A6A6]">Full Path</dt>
              <dd className="font-mono text-[11px] text-[#1A1A1A] dark:text-[#E5E5E5] break-all leading-relaxed">
                {entry.fullPath}
              </dd>
            </div>
            {entry.isHidden && (
              <div className="py-2 flex items-center justify-between gap-3">
                <dt className="text-[#5C5C5C] dark:text-[#A6A6A6]">Visibility</dt>
                <dd className="text-[#1A1A1A] dark:text-[#F3F3F3]">Hidden dotfile</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </aside>
  );
}

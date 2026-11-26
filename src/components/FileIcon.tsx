import {
  File,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { FileCategory } from '../types/foldary';

interface FileIconProps {
  category: FileCategory;
  extension: string;
  isFolder: boolean;
  className?: string;
}

const CODE_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'rs',
  'py',
  'cs',
  'go',
  'java',
  'json',
  'yaml',
  'yml',
  'toml',
  'html',
  'css',
  'sh',
  'sql',
  'env',
  'local',
  'gitignore',
]);

const SHEET_EXTS = new Set(['csv', 'xls', 'xlsx']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'msi']);

export function FileIcon({ category, extension, isFolder, className = 'w-4 h-4' }: FileIconProps) {
  if (isFolder || category === 'folder') {
    return (
      <Folder
        className={`${className} text-amber-500 dark:text-amber-400 fill-amber-400/20 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  const ext = extension.toLowerCase();

  if (category === 'picture') {
    return (
      <ImageIcon
        className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (category === 'video') {
    return (
      <Film
        className={`${className} text-violet-600 dark:text-violet-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (category === 'audio') {
    return (
      <Music
        className={`${className} text-rose-600 dark:text-rose-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (SHEET_EXTS.has(ext)) {
    return (
      <FileSpreadsheet
        className={`${className} text-teal-600 dark:text-teal-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (CODE_EXTS.has(ext)) {
    return (
      <FileCode2
        className={`${className} text-sky-600 dark:text-sky-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (category === 'compressed' || ARCHIVE_EXTS.has(ext)) {
    return (
      <FileArchive
        className={`${className} text-orange-600 dark:text-orange-400 shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  if (category === 'document') {
    return (
      <FileText
        className={`${className} text-[#0067C0] dark:text-[#60CDFF] shrink-0`}
        strokeWidth={1.75}
      />
    );
  }

  return (
    <File
      className={`${className} text-[#5C5C5C] dark:text-[#A6A6A6] shrink-0`}
      strokeWidth={1.75}
    />
  );
}

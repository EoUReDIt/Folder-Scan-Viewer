#!/usr/bin/env node
/**
 * Synchronizes Foldary's semantic version across:
 *   - package.json
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml
 *   - src-tauri/Cargo.lock (when present)
 *
 * Usage:
 *   node scripts/bump-version.mjs --type <patch|minor|major|custom|none> [--custom 2.0.0] [--github-output]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

function parseArgs(argv) {
  const args = { type: 'patch', custom: '', githubOutput: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--type' && argv[i + 1]) {
      args.type = argv[++i].trim();
    } else if (token === '--custom' && argv[i + 1]) {
      args.custom = argv[++i].trim();
    } else if (token === '--github-output') {
      args.githubOutput = true;
    }
  }
  return args;
}

function computeNextVersion(current, bumpType, customVersion) {
  const match = SEMVER_REGEX.exec(current);
  if (!match) {
    throw new Error(`Current package.json version "${current}" is not valid X.Y.Z SemVer.`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (bumpType) {
    case 'none':
      return current;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    case 'custom': {
      const cleaned = customVersion.replace(/^v/i, '').trim();
      if (!SEMVER_REGEX.test(cleaned)) {
        throw new Error(
          `Custom version "${customVersion}" must match X.Y.Z (for example, 2.0.0).`
        );
      }
      return cleaned;
    }
    default:
      throw new Error(
        `Unsupported bump type "${bumpType}". Expected patch, minor, major, custom, or none.`
      );
  }
}

function updateJsonVersion(filePath, nextVersion) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.version === nextVersion) return false;
  parsed.version = nextVersion;
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return true;
}

function updateCargoTomlVersion(filePath, nextVersion) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  const packageSectionRegex = /(\[package\][\s\S]*?\r?\nversion\s*=\s*")([^"]+)(")/;
  if (!packageSectionRegex.test(raw)) {
    throw new Error(`Could not locate [package] version field in ${filePath}`);
  }
  const updated = raw.replace(packageSectionRegex, `$1${nextVersion}$3`);
  if (updated === raw) return false;
  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

function updateCargoLockVersion(filePath, nextVersion) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  const lockEntryRegex =
    /(\[\[package\]\]\r?\nname\s*=\s*"foldary"\r?\nversion\s*=\s*")([^"]+)(")/;
  if (!lockEntryRegex.test(raw)) return false;
  const updated = raw.replace(lockEntryRegex, `$1${nextVersion}$3`);
  if (updated === raw) return false;
  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

function main() {
  const { type, custom, githubOutput } = parseArgs(process.argv.slice(2));
  const pkgPath = path.join(rootDir, 'package.json');
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const previousVersion = String(pkg.version || '1.0.0');
  const nextVersion = computeNextVersion(previousVersion, type, custom);

  const changedPkg = updateJsonVersion(pkgPath, nextVersion);
  const changedTauri = updateJsonVersion(tauriConfPath, nextVersion);
  const changedCargo = updateCargoTomlVersion(cargoTomlPath, nextVersion);
  const changedLock = updateCargoLockVersion(cargoLockPath, nextVersion);
  const changed = changedPkg || changedTauri || changedCargo || changedLock;

  console.log(`Foldary version: ${previousVersion} -> ${nextVersion} (changed: ${changed})`);

  if (githubOutput && process.env.GITHUB_OUTPUT) {
    const lines = [
      `previous_version=${previousVersion}`,
      `version=${nextVersion}`,
      `changed=${changed ? 'true' : 'false'}`,
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

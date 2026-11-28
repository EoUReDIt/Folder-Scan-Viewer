import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeNextVersion, updatePackageLockVersion } from './bump-version.mjs';

describe('computeNextVersion', () => {
  it('bumps patch, minor and major', () => {
    expect(computeNextVersion('2.0.1', 'patch', '')).toBe('2.0.2');
    expect(computeNextVersion('2.0.1', 'minor', '')).toBe('2.1.0');
    expect(computeNextVersion('2.0.1', 'major', '')).toBe('3.0.0');
  });

  it('keeps the version for none', () => {
    expect(computeNextVersion('2.0.1', 'none', '')).toBe('2.0.1');
  });

  it('accepts a custom version with or without a v prefix', () => {
    expect(computeNextVersion('2.0.1', 'custom', 'v2.5.0')).toBe('2.5.0');
    expect(computeNextVersion('2.0.1', 'custom', ' 10.0.0 ')).toBe('10.0.0');
  });

  it('rejects bad input', () => {
    expect(() => computeNextVersion('2.0', 'patch', '')).toThrow(/not valid X.Y.Z/);
    expect(() => computeNextVersion('2.0.1', 'custom', '2.5')).toThrow(/must match X.Y.Z/);
    expect(() => computeNextVersion('2.0.1', 'huge', '')).toThrow(/Unsupported bump type/);
  });
});

describe('updatePackageLockVersion', () => {
  let dir;
  let lockPath;
  const lock = (version, rootVersion) =>
    `${JSON.stringify(
      {
        name: 'foldary',
        version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'foldary', version: rootVersion, dependencies: { react: '^19.0.0' } },
          'node_modules/react': { version: '19.0.0' },
        },
      },
      null,
      2
    )}\n`;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-lock-'));
    lockPath = path.join(dir, 'package-lock.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updates both version fields and keeps the file format', () => {
    fs.writeFileSync(lockPath, lock('2.0.1', '2.0.1'));
    expect(updatePackageLockVersion(lockPath, '2.1.0')).toBe(true);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(lock('2.1.0', '2.1.0'));
  });

  it('leaves dependency versions alone', () => {
    fs.writeFileSync(lockPath, lock('2.0.1', '2.0.1'));
    updatePackageLockVersion(lockPath, '3.0.0');
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(parsed.packages['node_modules/react'].version).toBe('19.0.0');
  });

  it('fixes a lockfile where only one field is stale', () => {
    fs.writeFileSync(lockPath, lock('2.0.1', '2.0.0'));
    expect(updatePackageLockVersion(lockPath, '2.0.1')).toBe(true);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(lock('2.0.1', '2.0.1'));
  });

  it('reports no change when already up to date or missing', () => {
    fs.writeFileSync(lockPath, lock('2.0.1', '2.0.1'));
    const before = fs.statSync(lockPath).mtimeMs;
    expect(updatePackageLockVersion(lockPath, '2.0.1')).toBe(false);
    expect(fs.statSync(lockPath).mtimeMs).toBe(before);
    expect(updatePackageLockVersion(path.join(dir, 'missing.json'), '2.0.1')).toBe(false);
  });
});

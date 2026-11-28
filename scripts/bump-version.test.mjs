import { describe, expect, it } from 'vitest';
import { computeNextVersion } from './bump-version.mjs';

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

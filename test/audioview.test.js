import { describe, it, expect } from 'vitest';
import { computePeaks, formatTime } from '../src/audioview.js';

describe('computePeaks', () => {
  it('reduces a channel to min/max per bucket', () => {
    const data = new Float32Array([0, 1, -1, 0.5, -0.5, 0, 0.2, -0.2]);
    const { mins, maxs } = computePeaks(data, 2);
    expect(mins.length).toBe(2);
    expect(maxs[0]).toBe(1);
    expect(mins[0]).toBe(-1);
  });

  it('handles more buckets than samples', () => {
    const { mins, maxs } = computePeaks(new Float32Array([0.3, -0.3]), 5);
    expect(maxs.length).toBe(5);
    expect(mins.every(Number.isFinite)).toBe(true);
  });
});

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

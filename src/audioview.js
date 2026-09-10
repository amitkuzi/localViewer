// Framework-free helpers for the audio waveform. No canvas/DOM here so this
// stays trivially unit-testable; app.js does the actual drawing.

// Downsample one audio channel into per-pixel [min,max] pairs so a whole
// track's waveform can be drawn as a fixed-width column plot.
export function computePeaks(channelData, buckets) {
  const len = channelData.length;
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);
  const step = len / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let min = Infinity, max = -Infinity;
    for (let j = start; j < end && j < len; j++) {
      const v = channelData[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) { min = 0; max = 0; }
    mins[i] = min; maxs[i] = max;
  }
  return { mins, maxs };
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

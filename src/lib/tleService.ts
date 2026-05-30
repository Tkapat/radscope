// ---------------------------------------------------------------------------
// tleService.ts – CelesTrack TLE fetch / cache service
// ---------------------------------------------------------------------------

import { TLEItem } from './satelliteTracker';
import { calculateSatellitePosition } from './satelliteTracker';

// ── Sources ────────────────────────────────────────────────────────────────

const TLE_SOURCES: Record<string, string> = {
  galileo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
  glonass: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle',
};

// ── Module state ───────────────────────────────────────────────────────────

let cachedTles: TLEItem[] = [];
let currentSource: 'galileo' | 'glonass' = 'galileo';
let lastFetchTimestamp: number = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

// ── Internal helpers ───────────────────────────────────────────────────────

function parseTleText(text: string): TLEItem[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: TLEItem[] = [];
  let i = 0;

  while (i < lines.length) {
    // Look for a name line followed by line‑1 and line‑2
    if (
      i + 2 < lines.length &&
      lines[i + 1].startsWith('1 ') &&
      lines[i + 2].startsWith('2 ')
    ) {
      items.push({
        name: lines[i],
        line1: lines[i + 1],
        line2: lines[i + 2],
      });
      i += 3;
    } else {
      // Skip unexpected lines
      i += 1;
    }
  }

  return items;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch TLEs from the currently selected CelesTrack source and cache them.
 */
export async function fetchTLEs(): Promise<void> {
  const url = TLE_SOURCES[currentSource];
  const resp = await fetch(url);
  const text = await resp.text();
  cachedTles = parseTleText(text);
  lastFetchTimestamp = Date.now();
}

/**
 * Initialise the service: fetch once, then schedule a periodic refresh
 * every 6 hours. Safe to call multiple times — subsequent calls are no‑ops.
 */
export async function initTleService(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await fetchTLEs();
  } catch (e) {
    console.warn('TLE fetch failed:', e);
  }

  refreshTimer = setInterval(fetchTLEs, 6 * 60 * 60 * 1000);
}

/**
 * Return a satellite by (partial) name, or – if no name is given – the one
 * with the highest elevation above the horizon right now.
 */
export function getActiveSatellite(name?: string): TLEItem | null {
  if (cachedTles.length === 0) return null;

  if (name) {
    const lowerName = name.toLowerCase();
    return cachedTles.find((t) => t.name.toLowerCase().includes(lowerName)) ?? null;
  }

  // Pick the satellite with the highest current elevation
  let bestTle: TLEItem | null = null;
  let bestEl = -Infinity;

  for (const tle of cachedTles) {
    try {
      const pos = calculateSatellitePosition(tle);
      if (pos.targetEl > bestEl) {
        bestEl = pos.targetEl;
        bestTle = tle;
      }
    } catch {
      // skip satellites that fail to propagate
    }
  }

  return bestTle ?? cachedTles[0] ?? null;
}

/**
 * Switch between constellation sources and trigger a re‑fetch.
 */
export function setConstellationSource(src: 'galileo' | 'glonass'): void {
  currentSource = src;
  fetchTLEs(); // fire‑and‑forget
}

/**
 * True when the cached data is older than 6 hours.
 */
export function isTleStale(): boolean {
  return Date.now() - lastFetchTimestamp > 6 * 60 * 60 * 1000;
}

export function getCachedTles(): TLEItem[] {
  return cachedTles;
}

export function getCurrentSource(): string {
  return currentSource;
}

export function getLastFetchTimestamp(): number {
  return lastFetchTimestamp;
}

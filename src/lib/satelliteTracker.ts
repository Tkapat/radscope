// ---------------------------------------------------------------------------
// satelliteTracker.ts – TLE‑based satellite position via satellite.js
// ---------------------------------------------------------------------------

import * as satellite from 'satellite.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TLEItem {
  name: string;
  line1: string;
  line2: string;
}

// ── Observer ───────────────────────────────────────────────────────────────

const OBSERVER_LAT_DEG = 22.5546;
const OBSERVER_LON_DEG = 88.4960;
const OBSERVER_ALT_KM = 0.009;

// ── State ──────────────────────────────────────────────────────────────────

let lastGoodPosition: { targetAz: number; targetEl: number } | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Propagate a TLE and return observer‑relative azimuth / elevation.
 * Falls back to the last successfully computed position (or {0,0}) when
 * propagation fails.
 */
export function calculateSatellitePosition(
  tle: TLEItem,
  date?: Date,
): { targetAz: number; targetEl: number } {
  const d = date ?? new Date();
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const posAndVel = satellite.propagate(satrec, d);

  // propagate returns { position: false } on failure
  if (!posAndVel.position || typeof posAndVel.position !== 'object') {
    return lastGoodPosition ?? { targetAz: 0, targetEl: 0 };
  }

  const gmst = satellite.gstime(d);
  const ecf = satellite.eciToEcf(posAndVel.position as satellite.EciVec3<number>, gmst);

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const observerGd: satellite.GeodeticLocation = {
    longitude: OBSERVER_LON_DEG * DEG2RAD,
    latitude: OBSERVER_LAT_DEG * DEG2RAD,
    height: OBSERVER_ALT_KM,
  };

  const lookAngles = satellite.ecfToLookAngles(observerGd, ecf);

  let targetAz = lookAngles.azimuth * RAD2DEG;
  const targetEl = lookAngles.elevation * RAD2DEG;

  // Normalise azimuth to [0, 360)
  targetAz = ((targetAz % 360) + 360) % 360;

  const result = { targetAz, targetEl };
  lastGoodPosition = result;
  return result;
}

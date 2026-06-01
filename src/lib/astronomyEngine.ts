// ---------------------------------------------------------------------------
// astronomyEngine.ts – Wrapper around the astronomy‑engine npm package
// ---------------------------------------------------------------------------

import * as Astronomy from 'astronomy-engine';
import { getPolarisAzimuth, AZIMUTH_CALIBRATION_OFFSET, OBSERVER_LAT, OBSERVER_LON } from './solarTracker';

// ── Observer ───────────────────────────────────────────────────────────────

const observer = new Astronomy.Observer(22.5546, 88.4960, 0);

// ── Body map ───────────────────────────────────────────────────────────────
// astronomy-engine uses plain string body names in its API surface.
// We keep a map so callers can use lower‑case IDs.

const BODY_MAP: Record<string, string> = {
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  moon: 'Moon',
  sun: 'Sun',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveBody(bodyId: string): string {
  return BODY_MAP[bodyId.toLowerCase()] ?? bodyId;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute apparent alt/az and RA/Dec for a named solar‑system body.
 */
export function getBodyAltAz(
  bodyId: string,
  date?: Date,
): { targetAz: number; targetEl: number; raDeg: number; decDeg: number } {
  const d = date ?? new Date();
  const body = resolveBody(bodyId) as any;

  const eq = Astronomy.Equator(body, d, observer, true, true);
  const hor = Astronomy.Horizon(d, observer, eq.ra, eq.dec, 'normal');

  return {
    targetAz: hor.azimuth,
    targetEl: hor.altitude,
    raDeg: eq.ra * 15,
    decDeg: eq.dec,
  };
}

/**
 * Convert arbitrary RA/Dec (both in degrees) to alt/az.
 */
export function getCustomRaDecAltAz(
  raDeg: number,
  decDeg: number,
  date?: Date,
): { targetAz: number; targetEl: number; raDeg: number; decDeg: number } {
  const d = date ?? new Date();
  const raHours = raDeg / 15;

  const hor = Astronomy.Horizon(d, observer, raHours, decDeg, 'normal');

  return {
    targetAz: hor.azimuth,
    targetEl: hor.altitude,
    raDeg,
    decDeg,
  };
}

/**
 * Sample a body's sky path over a time window.
 *
 * @param bodyId       – key into BODY_MAP (or raw body name)
 * @param startDate    – beginning of the window (default: now)
 * @param durationHours – total span in hours (default: 8)
 * @param stepMinutes  – sampling interval in minutes (default: 10)
 */
export function getBodyPath(
  bodyId: string,
  startDate?: Date,
  durationHours: number = 8,
  stepMinutes: number = 10,
): Array<{ az: number; el: number; time: number }> {
  const start = startDate ?? new Date();
  const totalMinutes = durationHours * 60;
  const points: Array<{ az: number; el: number; time: number }> = [];

  for (let m = 0; m <= totalMinutes; m += stepMinutes) {
    const t = new Date(start.getTime() + m * 60_000);
    const pos = getBodyAltAz(bodyId, t);
    points.push({ az: pos.targetAz, el: pos.targetEl, time: t.getTime() });
  }

  return points;
}

/**
 * Return current alt/az for every body in BODY_MAP.
 */
export function getAllBodiesNow(
  date?: Date,
): Array<{ name: string; az: number; el: number }> {
  const d = date ?? new Date();

  return Object.keys(BODY_MAP).map((key) => {
    const pos = getBodyAltAz(key, d);
    return { name: BODY_MAP[key], az: pos.targetAz, el: pos.targetEl };
  });
}

export function getMotorRaDec(
  motorAzDeg: number,
  motorElDeg: number,
  date?: Date,
): { raDeg: number; decDeg: number } {
  const d = date ?? new Date();
  
  // 1. Get true north Azimuth
  const trueAz = ((motorAzDeg + getPolarisAzimuth(d) - AZIMUTH_CALIBRATION_OFFSET) % 360 + 360) % 360;
  
  // 2. Convert to radians
  const az = trueAz * (Math.PI / 180);
  const el = motorElDeg * (Math.PI / 180);
  const lat = OBSERVER_LAT * (Math.PI / 180);

  // 3. Math for Dec
  const sinDec = Math.sin(el) * Math.sin(lat) + Math.cos(el) * Math.cos(lat) * Math.cos(az);
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));

  // 4. Math for Hour Angle
  const sinHa = -Math.sin(az) * Math.cos(el) / Math.cos(decRad);
  const cosHa = (Math.sin(el) - Math.sin(lat) * Math.sin(decRad)) / (Math.cos(lat) * Math.cos(decRad));
  const haRad = Math.atan2(sinHa, cosHa);
  const haDeg = haRad * (180 / Math.PI);

  // 5. Local Sidereal Time
  const stHours = Astronomy.SiderealTime(d);
  const lstDeg = (stHours * 15 + OBSERVER_LON) % 360;

  // 6. RA
  const raDeg = ((lstDeg - haDeg) % 360 + 360) % 360;
  const decDeg = decRad * (180 / Math.PI);

  return { raDeg, decDeg };
}

// ---------------------------------------------------------------------------
// solarTracker.ts – Full solar‑position algorithm for telescope motor coords
// ---------------------------------------------------------------------------

export const OBSERVER_LAT = 22.5601079;
export const OBSERVER_LON = 88.4873657;
export const POLARIS_RA = 37.95;          // degrees
export const POLARIS_DEC = 89.2641;       // degrees
export const AZIMUTH_CALIBRATION_OFFSET = 0;

// ── helpers ────────────────────────────────────────────────────────────────

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Convert a JS Date to a Julian Date number.
 */
export function julianDate(date: Date): number {
  // milliseconds since Unix epoch → Julian Date
  return date.getTime() / 86400000 + 2440587.5;
}

// ── internal: Greenwich Mean Sidereal Time (degrees) ──────────────────────

function gmstDeg(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}

// ── internal: Equatorial → Horizontal ─────────────────────────────────────

function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  lstDeg: number,
  latDeg: number,
): { az: number; alt: number } {
  const ha = degToRad(((lstDeg - raDeg) % 360 + 360) % 360);
  const dec = degToRad(decDeg);
  const lat = degToRad(latDeg);

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));

  const cosAz =
    (Math.sin(dec) - Math.sin(lat) * Math.sin(alt)) / (Math.cos(lat) * Math.cos(alt));
  let az = radToDeg(Math.acos(clamp(cosAz, -1, 1)));

  if (Math.sin(ha) > 0) {
    az = 360 - az;
  }

  return { az, alt: radToDeg(alt) };
}

// ── Polaris azimuth ───────────────────────────────────────────────────────

/**
 * Return the current azimuth of Polaris (true‑north referenced) for the
 * hard‑coded observer location.
 */
export function getPolarisAzimuth(date?: Date): number {
  const d = date ?? new Date();
  const jd = julianDate(d);
  const gmst = gmstDeg(jd);
  const lst = ((gmst + OBSERVER_LON) % 360 + 360) % 360;

  const { az } = equatorialToHorizontal(POLARIS_RA, POLARIS_DEC, lst, OBSERVER_LAT);
  return az;
}

// ── Sun position ──────────────────────────────────────────────────────────

/**
 * Full solar‑position calculation returning motor‑relative azimuth and raw
 * altitude so the mount firmware can point at the Sun.
 */
export function calculateSunPosition(date?: Date): { targetAz: number; targetEl: number } {
  const d = date ?? new Date();
  const jd = julianDate(d);
  const T = (jd - 2451545.0) / 36525.0;

  // Mean longitude (deg)
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  L0 = ((L0 % 360) + 360) % 360;

  // Mean anomaly (deg)
  let M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  M = ((M % 360) + 360) % 360;

  const Mrad = degToRad(M);

  // Equation of center
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // Sun true longitude
  const sunTrueLon = L0 + C;

  // Sun apparent longitude
  const omega = 125.04 - 1934.136 * T;
  const lambda = sunTrueLon - 0.00569 - 0.00478 * Math.sin(degToRad(omega));

  // Mean obliquity of the ecliptic
  const e0 = 23.0 + (26.0 + (21.448 - 46.815 * T) / 60.0) / 60.0;

  // Corrected obliquity
  const epsilon = e0 + 0.00256 * Math.cos(degToRad(omega));

  const lambdaRad = degToRad(lambda);
  const epsRad = degToRad(epsilon);

  // Right ascension (degrees)
  const RA = radToDeg(Math.atan2(Math.cos(epsRad) * Math.sin(lambdaRad), Math.cos(lambdaRad)));

  // Declination (degrees)
  const dec = radToDeg(Math.asin(Math.sin(epsRad) * Math.sin(lambdaRad)));

  // Sidereal time
  const gmst = gmstDeg(jd);
  const lst = ((gmst + OBSERVER_LON) % 360 + 360) % 360;

  // Hour angle
  const HA = degToRad(((lst - RA) % 360 + 360) % 360);
  const decRad = degToRad(dec);
  const latRad = degToRad(OBSERVER_LAT);

  // Altitude
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(HA);
  const alt = Math.asin(clamp(sinAlt, -1, 1));

  // Azimuth
  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * Math.sin(alt)) / (Math.cos(latRad) * Math.cos(alt));
  let sunAz = radToDeg(Math.acos(clamp(cosAz, -1, 1)));
  if (Math.sin(HA) > 0) {
    sunAz = 360 - sunAz;
  }

  const altitude = radToDeg(alt);

  // Motor‑relative azimuth via Polaris reference
  const polarisAz = getPolarisAzimuth(d);
  let motorAz = sunAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET;
  motorAz = ((motorAz % 360) + 360) % 360;

  return { targetAz: motorAz, targetEl: altitude };
}

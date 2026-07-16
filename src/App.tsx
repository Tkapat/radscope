import React, { useState, useEffect, useRef, useCallback, Component, ReactNode } from 'react';
import { THEME } from './styles/theme';
import {
  CelestialObject,
  TargetCoordinates,
  EspStatus,
  SkyMapBody,
  SkyPath,
  TrackingMode,
  DataLogEntry,
} from './types/telescope';
import { calculateSunPosition, getPolarisAzimuth, AZIMUTH_CALIBRATION_OFFSET } from './lib/solarTracker';
import { getBodyAltAz, getCustomRaDecAltAz, getBodyPath, getAllBodiesNow } from './lib/astronomyEngine';
import { calculateSatellitePosition } from './lib/satelliteTracker';
import {
  initTleService,
  getActiveSatellite,
  getCachedTles,
  setConstellationSource,
  isTleStale,
} from './lib/tleService';
import { espClient } from './lib/espClient';
import SkyMap3D from './components/SkyMap3D';
import ObjectCatalogue, { CATALOGUE } from './components/ObjectCatalogue';
import MotorControlPanel from './components/MotorControlPanel';
import CoordDisplay from './components/CoordDisplay';
import DataLoggerPanel from './components/DataLoggerPanel';

// ─── Error Boundary ──────────────────────────────────────────────
interface EBProps { children: ReactNode; }
interface EBState { hasError: boolean; error?: Error; }

class SkyMapErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: THEME.danger, fontFamily: THEME.font,
          flexDirection: 'column', gap: 12, padding: 24,
        }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>3D Sky Map Error</span>
          <span style={{ fontSize: 12, color: THEME.textMuted, textAlign: 'center' }}>
            {this.state.error?.message || 'Three.js rendering failed'}
          </span>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              background: THEME.accent, color: THEME.bg0, border: 'none',
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              fontFamily: THEME.font, fontSize: 12, fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────
function normalizeAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

function getTrackingMode(obj: CelestialObject): TrackingMode {
  switch (obj.type) {
    case 'solar': return 'solar';
    case 'planet': return 'planet';
    case 'moon': return 'moon';
    case 'satellite': return 'satellite';
    case 'custom': return 'custom_radec';
    default: return 'manual';
  }
}

function normalizeTarget(motorAz: number, motorEl: number, status: EspStatus | null) {
  let finalAz = motorAz;
  let finalEl = motorEl;

  if (status) {
    // 1. Zenith Flip if Elevation exceeds maxEl
    if (status.limitsSet && status.maxEl !== undefined && finalEl > status.maxEl) {
      finalAz = (finalAz + 180) % 360;
      finalEl = 180 - finalEl;
    }
    
    // 2. Shortest Path Unwrapping
    const currentAz = status.az !== undefined ? status.az : 0;
    let diff = (finalAz - currentAz) % 360;
    if (diff > 180) diff -= 360;
    if (diff <= -180) diff += 360;
    finalAz = currentAz + diff;

    // 3. Boundary Deflection (if unwrapped path hits a limit)
    if (status.limitsSet && status.minAz !== undefined && status.maxAz !== undefined) {
      if (finalAz < status.minAz && finalAz + 360 <= status.maxAz) {
        finalAz += 360;
      } else if (finalAz > status.maxAz && finalAz - 360 >= status.minAz) {
        finalAz -= 360;
      }
    }
  }
  
  return { finalAz, finalEl };
}

// ─── Main App ────────────────────────────────────────────────────
export default function App() {
  // Restore persisted selected object id
  const savedObjId = localStorage.getItem('radioscope_selected_object') || 'sun';
  const initialObj = CATALOGUE.find(c => c.id === savedObjId) || CATALOGUE[0];

  const [selectedObject, setSelectedObject] = useState<CelestialObject>(initialObj);
  const [coords, setCoords] = useState<TargetCoordinates | null>(null);
  const [espStatus, setEspStatus] = useState<EspStatus | null>(null);
  const [espConnected, setEspConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [skyBodies, setSkyBodies] = useState<SkyMapBody[]>([]);
  const [targetPath, setTargetPath] = useState<SkyPath | undefined>(undefined);
  const [customRa, setCustomRa] = useState('0');
  const [customDec, setCustomDec] = useState('0');
  const [availableSatellites, setAvailableSatellites] = useState<string[]>([]);
  const [selectedSatelliteName, setSelectedSatelliteName] = useState<string | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [trackOffsetAz, setTrackOffsetAz] = useState(0);
  const [trackOffsetEl, setTrackOffsetEl] = useState(0);

  // ─── Data Logger State ───
  const [logs, setLogs] = useState<DataLogEntry[]>([]);
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(false);
  const [logIntervalSecs, setLogIntervalSecs] = useState(1);
  const latestDataRef = useRef({ coords: coords, esp: espStatus });

  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skyRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const espStatusRef = useRef<EspStatus | null>(null);
  const computeAndSendRef = useRef<() => void>(() => {});

  // ─── Init TLE service & ESP listeners ───
  useEffect(() => {
    initTleService().catch(console.warn);
    espClient.onStatus((s) => {
      setEspStatus(s);
      espStatusRef.current = s;
    });
    espClient.onConnect((c) => setEspConnected(c));

    return () => {
      espClient.disconnect();
    };
  }, []);

  // ─── Refresh sky bodies every 10s ───
  const refreshSkyBodies = useCallback(() => {
    try {
      const allBodies = getAllBodiesNow();
      const mapped: SkyMapBody[] = allBodies.map(b => ({
        name: b.name,
        az: b.az,
        el: b.el,
        type: (b.name.toLowerCase() === 'sun' ? 'solar' :
              b.name.toLowerCase() === 'moon' ? 'moon' : 'planet') as CelestialObject['type'],
        isTarget: b.name.toLowerCase() === selectedObject.id ||
                  b.name === selectedObject.name,
      }));
      setSkyBodies(mapped);
    } catch (e) {
      console.warn('Failed to refresh sky bodies:', e);
    }
  }, [selectedObject]);

  useEffect(() => {
    refreshSkyBodies();
    skyRefreshRef.current = setInterval(refreshSkyBodies, 10000);
    return () => {
      if (skyRefreshRef.current) clearInterval(skyRefreshRef.current);
    };
  }, [refreshSkyBodies]);

  // ─── When selectedObject changes ───
  useEffect(() => {
    // Stop any active tracking
    stopTracking();
    
    // Reset tracking offsets
    setTrackOffsetAz(0);
    setTrackOffsetEl(0);

    // Persist selection
    localStorage.setItem('radioscope_selected_object', selectedObject.id);

    // Build target path for astronomy-engine bodies
    if (selectedObject.astronomyEngineBody) {
      try {
        const pathPoints = getBodyPath(selectedObject.astronomyEngineBody);
        setTargetPath({
          objectName: selectedObject.name,
          points: pathPoints,
        });
      } catch (e) {
        console.warn('Failed to compute path:', e);
        setTargetPath(undefined);
      }
    } else if (selectedObject.type === 'solar') {
      // Sun path — compute manually
      try {
        const points: Array<{ az: number; el: number; time: number }> = [];
        const now = new Date();
        for (let i = 0; i < 48; i++) {
          const t = new Date(now.getTime() + i * 10 * 60000);
          const pos = calculateSunPosition(t);
          // calculateSunPosition returns motor-frame az, we need true-north for sky map
          // So we reverse the transform: trueAz = motorAz + polarisAz - CALIBRATION_OFFSET
          const polarisAz = getPolarisAzimuth(t);
          const trueAz = normalizeAz(pos.targetAz + polarisAz - AZIMUTH_CALIBRATION_OFFSET);
          points.push({ az: trueAz, el: pos.targetEl, time: t.getTime() });
        }
        setTargetPath({ objectName: 'Sun', points });
      } catch (e) {
        console.warn('Failed to compute sun path:', e);
        setTargetPath(undefined);
      }
    } else {
      setTargetPath(undefined);
    }

    // For satellite modes: update available satellites
    if (selectedObject.isSatelliteMode && selectedObject.constellationSource) {
      setConstellationSource(selectedObject.constellationSource);
      // Wait a tick for TLEs to refresh
      setTimeout(() => {
        const tles = getCachedTles();
        setAvailableSatellites(tles.map(t => t.name));
      }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObject.id]);

  // ─── Compute and send coordinates ───
  const computeAndSend = useCallback(() => {
    const now = new Date();
    let motorAz = 0;
    let motorEl = 0;
    let rawAz: number | undefined;
    let rawEl: number | undefined;
    let raDeg: number | undefined;
    let decDeg: number | undefined;
    const mode = getTrackingMode(selectedObject);

    try {
      if (selectedObject.type === 'solar') {
        // calculateSunPosition already returns motor-frame az
        const sun = calculateSunPosition(now);
        motorAz = sun.targetAz;
        motorEl = sun.targetEl;
        // Reverse to get true-north for display
        const polarisAz = getPolarisAzimuth(now);
        rawAz = normalizeAz(motorAz + polarisAz - AZIMUTH_CALIBRATION_OFFSET);
        rawEl = motorEl;
      } else if (selectedObject.type === 'planet' || selectedObject.type === 'moon') {
        const bodyId = selectedObject.astronomyEngineBody || selectedObject.id;
        const result = getBodyAltAz(bodyId, now);
        rawAz = result.targetAz;
        rawEl = result.targetEl;
        raDeg = result.raDeg;
        decDeg = result.decDeg;
        // Transform to motor frame
        const polarisAz = getPolarisAzimuth(now);
        motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
        motorEl = rawEl;
      } else if (selectedObject.type === 'satellite') {
        const tle = getActiveSatellite(selectedSatelliteName);
        if (tle) {
          const result = calculateSatellitePosition(tle, now);
          rawAz = result.targetAz;
          rawEl = result.targetEl;
          // Transform to motor frame
          const polarisAz = getPolarisAzimuth(now);
          motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
          motorEl = rawEl;
        }
      } else if (selectedObject.type === 'custom') {
        const ra = parseFloat(customRa) || 0;
        const dec = parseFloat(customDec) || 0;
        const result = getCustomRaDecAltAz(ra, dec, now);
        rawAz = result.targetAz;
        rawEl = result.targetEl;
        raDeg = ra;
        decDeg = dec;
        // Transform to motor frame
        const polarisAz = getPolarisAzimuth(now);
        motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
        motorEl = rawEl;
      }

      motorAz += trackOffsetAz;
      motorEl += trackOffsetEl;

      const { finalAz, finalEl } = normalizeTarget(motorAz, motorEl, espStatusRef.current);

      const payload: TargetCoordinates = {
        targetAz: finalAz,
        targetEl: finalEl,
        rawAz,
        rawEl,
        raDeg,
        decDeg,
        mode,
        objectName: selectedObject.name,
        timestamp: Date.now(),
      };

      setCoords(payload);
      espClient.sendTrack(finalAz, finalEl, selectedObject.name);
    } catch (e) {
      console.warn('Tracking computation error:', e);
    }
  }, [selectedObject, customRa, customDec, selectedSatelliteName, trackOffsetAz, trackOffsetEl]);

  // ─── Handle Jog Offsets ───
  const handleJogOffset = useCallback((dAz: number, dEl: number) => {
    setTrackOffsetAz(prev => prev + dAz);
    setTrackOffsetEl(prev => prev + dEl);
  }, []);

  // ─── Tracking control ───
  const startTracking = useCallback(() => {
    if (espStatus && !espStatus.homeSet) {
      return; // Guard: home must be set
    }
    // Clear any existing interval
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
    }
    setIsTracking(true);
    // Compute immediately
    computeAndSendRef.current();
    // Then every 500ms
    trackingIntervalRef.current = setInterval(() => computeAndSendRef.current(), 500);
  }, [espStatus]);

  const stopTracking = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    if (isTracking) {
      espClient.sendStop();
    }
    setIsTracking(false);
  }, [isTracking]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    };
  }, []);

  // Sync ref
  useEffect(() => {
    computeAndSendRef.current = computeAndSend;
  }, [computeAndSend]);

  // Compute coords on demand (for display when not tracking)
  useEffect(() => {
    if (!isTracking) {
      // Do a single computation for display
      try {
        const now = new Date();
        let motorAz = 0;
        let motorEl = 0;
        let rawAz: number | undefined;
        let rawEl: number | undefined;
        let raDeg: number | undefined;
        let decDeg: number | undefined;
        const mode = getTrackingMode(selectedObject);

        if (selectedObject.type === 'solar') {
          const sun = calculateSunPosition(now);
          motorAz = sun.targetAz;
          motorEl = sun.targetEl;
          const polarisAz = getPolarisAzimuth(now);
          rawAz = normalizeAz(motorAz + polarisAz - AZIMUTH_CALIBRATION_OFFSET);
          rawEl = motorEl;
        } else if (selectedObject.type === 'planet' || selectedObject.type === 'moon') {
          const bodyId = selectedObject.astronomyEngineBody || selectedObject.id;
          const result = getBodyAltAz(bodyId, now);
          rawAz = result.targetAz;
          rawEl = result.targetEl;
          raDeg = result.raDeg;
          decDeg = result.decDeg;
          const polarisAz = getPolarisAzimuth(now);
          motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
          motorEl = rawEl;
        } else if (selectedObject.type === 'satellite') {
          const tle = getActiveSatellite(selectedSatelliteName);
          if (tle) {
            const result = calculateSatellitePosition(tle, now);
            rawAz = result.targetAz;
            rawEl = result.targetEl;
            const polarisAz = getPolarisAzimuth(now);
            motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
            motorEl = rawEl;
          }
        } else if (selectedObject.type === 'custom') {
          const ra = parseFloat(customRa) || 0;
          const dec = parseFloat(customDec) || 0;
          const result = getCustomRaDecAltAz(ra, dec, now);
          rawAz = result.targetAz;
          rawEl = result.targetEl;
          raDeg = ra;
          decDeg = dec;
          const polarisAz = getPolarisAzimuth(now);
          motorAz = normalizeAz(rawAz - polarisAz + AZIMUTH_CALIBRATION_OFFSET);
          motorEl = rawEl;
        }

        const { finalAz, finalEl } = normalizeTarget(motorAz, motorEl, espStatusRef.current);

        setCoords({
          targetAz: finalAz,
          targetEl: finalEl,
          rawAz,
          rawEl,
          raDeg,
          decDeg,
          mode,
          objectName: selectedObject.name,
          timestamp: Date.now(),
        });
      } catch (e) {
        console.warn('Display computation error:', e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObject.id, customRa, customDec, selectedSatelliteName, isTracking]);

  // ─── Data Logging Effect ───
  useEffect(() => {
    latestDataRef.current = { coords, esp: espStatus };
  }, [coords, espStatus]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (isTracking && isLoggingEnabled) {
      intervalId = setInterval(() => {
        const data = latestDataRef.current;
        if (!data.coords || !data.esp) return;

        const d = new Date();
        const deltaAz = Math.abs(data.coords.targetAz - (data.esp.az || 0));
        const deltaEl = Math.abs(data.coords.targetEl - (data.esp.el || 0));
        
        const entry: DataLogEntry = {
          time: d.toLocaleString(),
          targetName: data.coords.objectName,
          targetAz: data.coords.targetAz.toFixed(4),
          targetEl: data.coords.targetEl.toFixed(4),
          targetRa: (data.coords.raDeg ?? 0).toFixed(4),
          targetDec: (data.coords.decDeg ?? 0).toFixed(4),
          motorAz: (data.esp.az ?? 0).toFixed(4),
          motorEl: (data.esp.el ?? 0).toFixed(4),
          deltaAz: deltaAz.toFixed(4),
          deltaEl: deltaEl.toFixed(4),
        };
        setLogs(prev => [...prev, entry]);
      }, logIntervalSecs * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isTracking, isLoggingEnabled, logIntervalSecs]);

  const handleDownloadCsv = useCallback(() => {
    if (logs.length === 0) return;
    const headers = ["Time", "Target Name", "Target Az", "Target El", "Target RA", "Target Dec", "Motor Az", "Motor El", "Delta Az", "Delta El"];
    const rows = logs.map(l => [
      l.time,
      `"${l.targetName}"`,
      l.targetAz,
      l.targetEl,
      l.targetRa,
      l.targetDec,
      l.motorAz,
      l.motorEl,
      l.deltaAz,
      l.deltaEl
    ].join(","));
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `radscope_log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
  }, [logs]);

  // ─── Handle object selection ───
  const handleObjectSelect = useCallback((obj: CelestialObject) => {
    setSelectedObject(obj);
    setSelectedSatelliteName(undefined);
  }, []);

  const handleSatelliteSelect = useCallback((name: string) => {
    setSelectedSatelliteName(name);
  }, []);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isFullscreen ? '1fr' : '280px 1fr 300px',
      gridTemplateRows: '48px 1fr',
      height: '100vh',
      width: '100vw',
      gap: 0,
      background: THEME.bg0,
      fontFamily: THEME.font,
      overflow: 'hidden',
    }}>
      {/* ─── Header ─── */}
      <header style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: THEME.bg1,
        borderBottom: `1px solid ${THEME.border}`,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            color: THEME.accent,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
            ◎ Radioscope
          </span>
          <span style={{
            fontSize: 10,
            color: THEME.textDim,
            padding: '2px 8px',
            background: THEME.accentDim,
            borderRadius: 4,
          }}>
            v1.0
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {isTracking && (
            <span style={{
              fontSize: 11,
              color: THEME.accent,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: THEME.accent,
                animation: 'pulse 1.5s ease-in-out infinite',
                display: 'inline-block',
              }} />
              TRACKING {selectedObject.name.toUpperCase()}
            </span>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, color: THEME.textMuted,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: espConnected ? THEME.green : THEME.danger,
              display: 'inline-block',
              boxShadow: espConnected ? `0 0 8px ${THEME.green}` : `0 0 8px ${THEME.danger}`,
            }} />
            ESP32 {espConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
        </div>
      </header>

      {/* ─── Left Panel ─── */}
      <aside style={{
        display: isFullscreen ? 'none' : 'flex',
        flexDirection: 'column',
        background: THEME.bg1,
        borderRight: `1px solid ${THEME.border}`,
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <ObjectCatalogue
            selected={selectedObject}
            onSelect={handleObjectSelect}
            availableSatellites={availableSatellites}
            customRa={customRa}
            customDec={customDec}
            onCustomRaChange={setCustomRa}
            onCustomDecChange={setCustomDec}
            selectedSatelliteName={selectedSatelliteName}
            onSatelliteSelect={handleSatelliteSelect}
          />
        </div>
        <div style={{
          borderTop: `1px solid ${THEME.border}`,
          padding: '8px',
        }}>
          <CoordDisplay
            coords={coords}
            espStatus={espStatus}
          />
        </div>
      </aside>

      {/* ─── Center: Sky Map ─── */}
      <main style={{
        position: 'relative',
        overflow: 'hidden',
        background: THEME.bg0,
      }}>
        <SkyMapErrorBoundary>
          <SkyMap3D
            bodies={skyBodies}
            targetPath={targetPath}
            width="100%"
            height="100%"
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          />
        </SkyMapErrorBoundary>
      </main>

      {/* ─── Right Panel ─── */}
      <aside style={{
        display: isFullscreen ? 'none' : 'flex',
        flexDirection: 'column',
        background: THEME.bg1,
        borderLeft: `1px solid ${THEME.border}`,
        overflowY: 'auto',
        padding: '8px',
      }}>
        <MotorControlPanel
          isAppTracking={isTracking}
          onStartTracking={startTracking}
          onStopTracking={stopTracking}
          onJogOffset={handleJogOffset}
        />
        
        <DataLoggerPanel
          isLoggingEnabled={isLoggingEnabled}
          setIsLoggingEnabled={setIsLoggingEnabled}
          logIntervalSecs={logIntervalSecs}
          setLogIntervalSecs={setLogIntervalSecs}
          logCount={logs.length}
          onDownloadCsv={handleDownloadCsv}
          onClearLogs={() => setLogs([])}
          isAppTracking={isTracking}
        />
      </aside>

      {/* ─── Global animation keyframes ─── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

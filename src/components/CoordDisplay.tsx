import React, { useState, useEffect } from 'react';
import { TargetCoordinates, EspStatus, MotorSkyCoordinates } from '../types/telescope';
import { THEME } from '../styles/theme';
import { isTleStale } from '../lib/tleService';
import { getMotorRaDec } from '../lib/astronomyEngine';
import { getPolarisAzimuth, AZIMUTH_CALIBRATION_OFFSET } from '../lib/solarTracker';

interface CoordDisplayProps {
  coords: TargetCoordinates | null;
  espStatus: EspStatus | null;
  motorSkyPosition?: MotorSkyCoordinates | null;
  trackOffsetAz: number;
  trackOffsetEl: number;
}

const MODE_COLORS: Record<string, string> = {
  solar: THEME.orange,
  planet: THEME.amber,
  moon: THEME.moonWhite,
  satellite: THEME.green,
  custom_radec: THEME.pink,
  manual: THEME.textDim,
};

const CoordDisplay: React.FC<CoordDisplayProps> = ({ coords, espStatus, motorSkyPosition, trackOffsetAz, trackOffsetEl }) => {
  const [timeAgo, setTimeAgo] = useState<string>('—');

  useEffect(() => {
    if (!coords) {
      setTimeAgo('—');
      return;
    }

    const update = () => {
      const elapsed = (Date.now() - coords.timestamp) / 1000;
      if (elapsed < 60) {
        setTimeAgo(`${elapsed.toFixed(1)}s ago`);
      } else if (elapsed < 3600) {
        setTimeAgo(`${(elapsed / 60).toFixed(1)}m ago`);
      } else {
        setTimeAgo(`${(elapsed / 3600).toFixed(1)}h ago`);
      }
    };

    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [coords?.timestamp]);

  const cardStyle: React.CSSProperties = {
    background: THEME.bg2,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 14,
    fontFamily: THEME.font,
  };

  const labelStyle: React.CSSProperties = {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    marginBottom: 8,
  };

  const getDeltaColor = (delta: number): string => {
    if (delta < 2) return THEME.green;
    if (delta < 5) return THEME.amber;
    return THEME.danger;
  };

  const modeColor = coords ? (MODE_COLORS[coords.mode] || THEME.textMuted) : THEME.textDim;

  return (
    <div style={cardStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Computed Position</span>
        <span style={{ color: THEME.amber, textTransform: 'none', fontWeight: 600 }}>
          Offset: {trackOffsetAz.toFixed(2)}° / {trackOffsetEl.toFixed(2)}°
        </span>
      </div>

      {!coords ? (
        <div style={{ color: THEME.textDim, fontSize: 13, padding: '10px 0' }}>
          No target selected
        </div>
      ) : (
        <>
          {/* Object name */}
          <div
            style={{
              color: THEME.accent,
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 8,
            }}
          >
            {coords.objectName}
          </div>

          {/* 1. True North (Stellarium Match) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>1. Actual (True North)</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>Az <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.rawAz?.toFixed(2) ?? '—'}°</span></span>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>El <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.targetEl.toFixed(2)}°</span></span>
            </div>
            <div style={{ color: THEME.textMuted, fontSize: 10 }}>
              RA {coords.raDeg?.toFixed(2) ?? '—'}° | Dec {coords.decDeg?.toFixed(2) ?? '—'}°
            </div>
          </div>

          {/* 2. Polaris Reference */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>2. Wrt Polaris</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
              {(() => {
                const pAz = getPolarisAzimuth(new Date(coords.timestamp));
                const relAz = coords.rawAz !== undefined ? ((coords.rawAz - pAz) % 360 + 360) % 360 : 0;
                return (
                  <>
                    <span style={{ color: THEME.textDim, fontSize: 11 }}>Az <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.rawAz !== undefined ? relAz.toFixed(2) : '—'}°</span></span>
                    <span style={{ color: THEME.textDim, fontSize: 11 }}>El <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.targetEl.toFixed(2)}°</span></span>
                  </>
                );
              })()}
            </div>
            <div style={{ color: THEME.textMuted, fontSize: 10 }}>
              RA {coords.raDeg?.toFixed(2) ?? '—'}° | Dec {coords.decDeg?.toFixed(2) ?? '—'}°
            </div>
          </div>

          {/* 3. Required angle (with offset) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>3. Required angle (w/ Offset)</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
              {(() => {
                const pAz = getPolarisAzimuth(new Date(coords.timestamp));
                const relAz = coords.rawAz !== undefined ? ((coords.rawAz - pAz) % 360 + 360) % 360 : 0;
                const preUnwrapAz = ((relAz + AZIMUTH_CALIBRATION_OFFSET + trackOffsetAz) % 360 + 360) % 360;
                const preUnwrapEl = (coords.rawEl !== undefined ? coords.rawEl : coords.targetEl) + trackOffsetEl;
                return (
                  <>
                    <span style={{ color: THEME.textDim, fontSize: 11 }}>Az <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{preUnwrapAz.toFixed(2)}°</span></span>
                    <span style={{ color: THEME.textDim, fontSize: 11 }}>El <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{preUnwrapEl.toFixed(2)}°</span></span>
                  </>
                );
              })()}
            </div>
            <div style={{ color: THEME.textMuted, fontSize: 10 }}>
              (Pre-unwrapping)
            </div>
          </div>
          
          {/* 4. Required angle (Shortest Path) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>4. Required angle (Shortest Path)</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>Az <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.targetAz.toFixed(2)}°</span></span>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>El <span style={{ color: THEME.accent, fontWeight: 'bold' }}>{coords.targetEl.toFixed(2)}°</span></span>
            </div>
            <div style={{ color: THEME.textMuted, fontSize: 10 }}>
              {(() => {
                const mRaDec = getMotorRaDec(coords.targetAz, coords.targetEl, new Date(coords.timestamp));
                return `RA ${mRaDec.raDeg.toFixed(2)}° | Dec ${mRaDec.decDeg.toFixed(2)}°`;
              })()}
            </div>
          </div>

          {/* 5. Error (Manual Adjustment) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>5. Error (Manual Adjustment)</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>ΔAz <span style={{ color: THEME.amber, fontWeight: 'bold' }}>{trackOffsetAz.toFixed(2)}°</span></span>
              <span style={{ color: THEME.textDim, fontSize: 11 }}>ΔEl <span style={{ color: THEME.amber, fontWeight: 'bold' }}>{trackOffsetEl.toFixed(2)}°</span></span>
            </div>
          </div>

          {/* Mode badge + time ago */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 6,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: `${modeColor}22`,
                color: modeColor,
                border: `1px solid ${modeColor}44`,
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: 0.8,
              }}
            >
              {coords.mode.replace('_', ' ')}
            </span>
            <span style={{ color: THEME.textDim, fontSize: 11 }}>
              Computed at: {new Date(coords.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* TLE freshness for satellite mode */}
          {coords.mode === 'satellite' && (
            <div style={{ marginTop: 8 }}>
              {isTleStale() ? (
                <span
                  style={{
                    display: 'inline-block',
                    background: `${THEME.danger}22`,
                    color: THEME.danger,
                    border: `1px solid ${THEME.danger}44`,
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                  }}
                >
                  TLE STALE
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    background: `${THEME.green}22`,
                    color: THEME.green,
                    border: `1px solid ${THEME.green}44`,
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                  }}
                >
                  TLE OK
                </span>
              )}
            </div>
          )}

          {/* ESP Position */}
          {espStatus && (
            <>
              <div
                style={{
                  borderTop: `1px solid ${THEME.border}`,
                  margin: '12px 0',
                }}
              />
              <div style={{ ...labelStyle, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>ESP Position</span>
                <span style={{ textTransform: 'none', fontWeight: 400, color: THEME.textDim }}>
                  Last received: {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginBottom: 6,
                }}
              >
                <div>
                  <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>Az</span>
                  <span
                    style={{
                      color: THEME.textMuted,
                      fontSize: 16,
                      fontFamily: THEME.font,
                    }}
                  >
                    {espStatus.az?.toFixed(2) ?? '—'}°
                  </span>
                </div>
                <div>
                  <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>El</span>
                  <span
                    style={{
                      color: THEME.textMuted,
                      fontSize: 16,
                      fontFamily: THEME.font,
                    }}
                  >
                    {espStatus.el?.toFixed(2) ?? '—'}°
                  </span>
                </div>
              </div>

              {/* Motor RA/Dec */}
              {espStatus.az !== undefined && espStatus.el !== undefined && espStatus.homeSet && (
                <div style={{ color: THEME.textMuted, fontSize: 12, marginBottom: 8 }}>
                  {(() => {
                    const raDec = getMotorRaDec(espStatus.az, espStatus.el);
                    return `Motor RA ${raDec.raDeg.toFixed(2)}° Dec ${raDec.decDeg.toFixed(2)}°`;
                  })()}
                </div>
              )}

              {/* Delta */}
              {coords && (
                <div style={{ display: 'flex', gap: 12 }}>
                  {(() => {
                    const deltaAz = Math.abs(coords.targetAz - espStatus.az);
                    const deltaEl = Math.abs(coords.targetEl - espStatus.el);
                    return (
                      <>
                        <span
                          style={{
                            color: getDeltaColor(deltaAz),
                            fontSize: 12,
                            fontFamily: THEME.font,
                          }}
                        >
                          ΔAz {deltaAz.toFixed(2)}°
                        </span>
                        <span
                          style={{
                            color: getDeltaColor(deltaEl),
                            fontSize: 12,
                            fontFamily: THEME.font,
                          }}
                        >
                          ΔEl {deltaEl.toFixed(2)}°
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CoordDisplay;

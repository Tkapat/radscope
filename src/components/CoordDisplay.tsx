import React, { useState, useEffect } from 'react';
import { TargetCoordinates, EspStatus, MotorSkyCoordinates } from '../types/telescope';
import { THEME } from '../styles/theme';
import { isTleStale } from '../lib/tleService';
import { getMotorRaDec } from '../lib/astronomyEngine';

interface CoordDisplayProps {
  coords: TargetCoordinates | null;
  espStatus: EspStatus | null;
  motorSkyPosition?: MotorSkyCoordinates | null;
}

const MODE_COLORS: Record<string, string> = {
  solar: THEME.orange,
  planet: THEME.amber,
  moon: THEME.moonWhite,
  satellite: THEME.green,
  custom_radec: THEME.pink,
  manual: THEME.textDim,
};

const CoordDisplay: React.FC<CoordDisplayProps> = ({ coords, espStatus, motorSkyPosition }) => {
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
      <div style={labelStyle}>Computed Position</div>

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

          {/* Motor Az / El */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div>
              <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>Az</span>
              <span
                style={{
                  color: THEME.accent,
                  fontSize: 22,
                  fontFamily: THEME.font,
                  fontWeight: 700,
                }}
              >
                {coords.targetAz.toFixed(2)}°
              </span>
            </div>
            <div>
              <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>El</span>
              <span
                style={{
                  color: THEME.accent,
                  fontSize: 22,
                  fontFamily: THEME.font,
                  fontWeight: 700,
                }}
              >
                {coords.targetEl.toFixed(2)}°
              </span>
            </div>
          </div>

          {/* Raw Az (true north) */}
          {coords.rawAz !== undefined && (
            <div style={{ color: THEME.textMuted, fontSize: 12, marginBottom: 4 }}>
              True N: {coords.rawAz.toFixed(2)}°
            </div>
          )}

          {/* RA/Dec */}
          {coords.raDeg !== undefined && coords.decDeg !== undefined && (
            <div style={{ color: THEME.textMuted, fontSize: 12, marginBottom: 6 }}>
              RA {coords.raDeg.toFixed(2)}° Dec {coords.decDeg.toFixed(2)}°
            </div>
          )}

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

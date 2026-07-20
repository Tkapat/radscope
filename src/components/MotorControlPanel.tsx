import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EspStatus, EspLog } from '../types/telescope';
import { espClient } from '../lib/espClient';
import { bleClient, SavedWifiNetwork, BleWifiStatus } from '../lib/bleClient';
import { THEME } from '../styles/theme';

interface MotorControlPanelProps {
  isAppTracking: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onJogOffset?: (dAz: number, dEl: number) => void;
}

const TRACK_STATE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Idle', color: THEME.textDim },
  1: { label: 'Active', color: THEME.accent },
  2: { label: 'Paused', color: THEME.amber },
  3: { label: 'Parking', color: THEME.orange },
};

const MotorControlPanel: React.FC<MotorControlPanelProps> = ({
  isAppTracking,
  onStartTracking,
  onStopTracking,
  onJogOffset,
}) => {
  const [espStatus, setEspStatus] = useState<EspStatus | null>(null);
  const [espConnected, setEspConnected] = useState(false);
  const [espIp, setEspIp] = useState(() => localStorage.getItem('radioscope_esp_address') || 'radioscope.local');
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [jogStep, setJogStep] = useState(() => {
    const saved = localStorage.getItem('radioscope_jog_step');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [confirmPark, setConfirmPark] = useState(false);
  const [speedHz, setSpeedHz] = useState(() => {
    const saved = localStorage.getItem('radioscope_speed_hz');
    return saved ? parseInt(saved, 10) : 4000;
  });
  const [accel, setAccel] = useState(() => {
    const saved = localStorage.getItem('radioscope_accel');
    return saved ? parseInt(saved, 10) : 800;
  });
  const [showMotorSettings, setShowMotorSettings] = useState(false);
  const [showLimitsSettings, setShowLimitsSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<EspLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // ─── BLE State ───
  const [bleConnected, setBleConnected] = useState(false);
  const [bleNetworks, setBleNetworks] = useState<SavedWifiNetwork[]>([]);
  const [bleLastSsid, setBleLastSsid] = useState('');
  const [bleStatus, setBleStatus] = useState<BleWifiStatus | null>(null);
  const [showBleSetup, setShowBleSetup] = useState(false);
  const [newSsid, setNewSsid] = useState('');
  const [newPass, setNewPass] = useState('');
  const [bleConnecting, setBleConnecting] = useState(false);
  const bleSupported = bleClient.isSupported();

  useEffect(() => {
    espClient.onStatus((status: EspStatus) => setEspStatus(status));
    espClient.onConnect((connected: boolean) => setEspConnected(connected));
    espClient.onLog((log: EspLog) => {
      setLogs((prev) => [...prev.slice(-49), log]);
    });
    espClient.connect(espIp);
  }, []);

  // ─── BLE Listeners ───
  useEffect(() => {
    bleClient.onConnection((connected: boolean) => setBleConnected(connected));
    bleClient.onNetworkList((networks: SavedWifiNetwork[], last: string) => {
      setBleNetworks(networks);
      setBleLastSsid(last);
    });
    bleClient.onStatus((status: BleWifiStatus) => {
      setBleStatus(status);
      if (status.type === 'CONNECTED') {
        // ESP32 connected to WiFi — switch to WebSocket mode
        const ip = status.ip;
        setEspIp(ip);
        localStorage.setItem('radioscope_esp_address', ip);
        // Give ESP32 a moment to start WebSocket server
        setTimeout(() => {
          espClient.connect(ip);
        }, 1500);
        setShowBleSetup(false);
      }
    });
  }, []);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  const handleIpChange = useCallback((newIp: string) => {
    setEspIp(newIp);
  }, []);

  const handleIpCommit = useCallback(() => {
    localStorage.setItem('radioscope_esp_address', espIp);
    espClient.connect(espIp);
  }, [espIp]);

  const handleDisconnect = useCallback(() => {
    espClient.disconnect();
  }, []);

  const handleBleConnect = useCallback(async () => {
    setBleConnecting(true);
    const success = await bleClient.connect();
    setBleConnecting(false);
    if (success) {
      setShowBleSetup(true);
    }
  }, []);

  const handleBleDisconnect = useCallback(() => {
    bleClient.disconnect();
    setShowBleSetup(false);
    setBleNetworks([]);
    setBleStatus(null);
  }, []);

  const handleBleConnectNetwork = useCallback(async (ssid: string) => {
    setBleStatus({ type: 'CONNECTING', ssid });
    await bleClient.connectNetwork(ssid);
  }, []);

  const handleBleAddNetwork = useCallback(async () => {
    if (!newSsid.trim()) return;
    await bleClient.addNetwork(newSsid.trim(), newPass);
    setNewSsid('');
    setNewPass('');
  }, [newSsid, newPass]);

  const handleBleForgetNetwork = useCallback(async (ssid: string) => {
    await bleClient.forgetNetwork(ssid);
  }, []);

  const sendJog = useCallback((deltaAz: number, deltaEl: number) => {
    if (isAppTracking && onJogOffset) {
      onJogOffset(deltaAz, deltaEl);
    } else {
      espClient.sendJog(deltaAz, deltaEl);
    }
  }, [isAppTracking, onJogOffset]);

  const sendSetHome = useCallback(() => {
    espClient.sendSetHome();
  }, []);

  const handlePark = useCallback(() => {
    if (!confirmPark) {
      setConfirmPark(true);
      return;
    }
    onStopTracking();
    espClient.sendPark();
    setConfirmPark(false);
  }, [confirmPark, onStopTracking]);

  const handleApplyMotorSettings = useCallback(() => {
    espClient.setSpeed(speedHz, accel);
    localStorage.setItem('radioscope_speed_hz', speedHz.toString());
    localStorage.setItem('radioscope_accel', accel.toString());
  }, [speedHz, accel]);

  const handleJogStepChange = useCallback((step: number) => {
    setJogStep(step);
    localStorage.setItem('radioscope_jog_step', step.toString());
  }, []);

  const cardStyle: React.CSSProperties = {
    background: THEME.bg2,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    fontFamily: THEME.font,
  };

  const labelStyle: React.CSSProperties = {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    marginBottom: 10,
  };

  const btnStyle: React.CSSProperties = {
    background: THEME.bg1,
    color: THEME.textMuted,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '7px 14px',
    cursor: 'pointer',
    fontFamily: THEME.font,
    fontSize: 12,
    transition: 'all 0.15s',
  };

  const btnAccentStyle: React.CSSProperties = {
    ...btnStyle,
    color: THEME.accent,
    borderColor: `${THEME.accent}44`,
    background: THEME.accentDim,
  };

  const inputStyle: React.CSSProperties = {
    background: THEME.bg1,
    color: THEME.textPrimary,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '7px 10px',
    fontFamily: THEME.font,
    fontSize: 12,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const trackInfo = espStatus ? TRACK_STATE_LABELS[espStatus.trackState] || TRACK_STATE_LABELS[0] : TRACK_STATE_LABELS[0];

  return (
    <div>
      {/* 1. CONNECTION CARD */}
      <div style={cardStyle}>
        <div style={labelStyle}>WebSocket Connection</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input
            type="text"
            value={espIp}
            placeholder="radioscope.local or IP"
            onChange={(e) => handleIpChange(e.target.value)}
            onBlur={handleIpCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleIpCommit();
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          {espConnected ? (
            <button
              style={{ ...btnStyle, color: THEME.danger, borderColor: `${THEME.danger}44` }}
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          ) : (
            <button
              style={{ ...btnStyle, color: THEME.green, borderColor: `${THEME.green}44` }}
              onClick={handleIpCommit}
            >
              Connect
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: espConnected ? THEME.green : THEME.danger,
              boxShadow: `0 0 6px ${espConnected ? THEME.green : THEME.danger}66`,
            }}
          />
          <span style={{ color: espConnected ? THEME.green : THEME.danger, fontSize: 12 }}>
            {espConnected ? 'Connected' : 'Disconnected'}
          </span>

          {/* BLE indicator */}
          {bleConnected && (
            <>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: THEME.purple,
                  boxShadow: `0 0 6px ${THEME.purple}66`,
                  marginLeft: 8,
                }}
              />
              <span style={{ color: THEME.purple, fontSize: 12 }}>BLE</span>
            </>
          )}
        </div>

        {/* BLE Setup Section — visible when WebSocket is NOT connected */}
        {!espConnected && (
          <div style={{ marginTop: 12 }}>
            {!showBleSetup ? (
              <button
                style={{
                  ...btnStyle,
                  width: '100%',
                  color: THEME.purple,
                  borderColor: `${THEME.purple}44`,
                  background: `${THEME.purple}12`,
                  opacity: bleSupported ? 1 : 0.4,
                  cursor: bleSupported ? 'pointer' : 'not-allowed',
                }}
                onClick={handleBleConnect}
                disabled={!bleSupported || bleConnecting}
              >
                {bleConnecting ? '⟳ Pairing...' : '⚡ Setup via Bluetooth'}
              </button>
            ) : (
              <div style={{
                background: THEME.bg0,
                border: `1px solid ${THEME.purple}44`,
                borderRadius: 8,
                padding: 12,
              }}>
                {/* BLE Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ color: THEME.purple, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Bluetooth Setup</span>
                  <button
                    style={{ ...btnStyle, padding: '3px 8px', fontSize: 10 }}
                    onClick={handleBleDisconnect}
                  >
                    Close
                  </button>
                </div>

                {/* Status Badge */}
                {bleStatus && (
                  <div style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    marginBottom: 10,
                    background: bleStatus.type === 'CONNECTED' ? `${THEME.green}22` :
                                bleStatus.type === 'CONNECTING' ? `${THEME.amber}22` :
                                bleStatus.type === 'FAILED' ? `${THEME.danger}22` :
                                `${THEME.purple}22`,
                    color: bleStatus.type === 'CONNECTED' ? THEME.green :
                           bleStatus.type === 'CONNECTING' ? THEME.amber :
                           bleStatus.type === 'FAILED' ? THEME.danger :
                           THEME.purple,
                    border: `1px solid ${bleStatus.type === 'CONNECTED' ? THEME.green :
                             bleStatus.type === 'CONNECTING' ? THEME.amber :
                             bleStatus.type === 'FAILED' ? THEME.danger :
                             THEME.purple}44`,
                  }}>
                    {bleStatus.type === 'CONNECTING' && `Connecting to ${bleStatus.ssid}...`}
                    {bleStatus.type === 'CONNECTED' && `Connected! IP: ${bleStatus.ip}`}
                    {bleStatus.type === 'FAILED' && `Failed: ${bleStatus.ssid}`}
                    {bleStatus.type === 'ADDED' && `Added: ${bleStatus.ssid}`}
                    {bleStatus.type === 'FORGOTTEN' && `Removed: ${bleStatus.ssid}`}
                    {bleStatus.type === 'ERROR' && `Error: ${bleStatus.message}`}
                    {bleStatus.type === 'BLE_READY' && 'ESP32 Ready'}
                  </div>
                )}

                {/* Saved Networks List */}
                <div style={{ color: THEME.textDim, fontSize: 10, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Saved Networks ({bleNetworks.length}/5)
                </div>

                {bleNetworks.length === 0 ? (
                  <div style={{ color: THEME.textDim, fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
                    No saved networks. Add one below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                    {bleNetworks.map((net) => (
                      <div key={net.ssid} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: THEME.bg1,
                        borderRadius: 6,
                        border: `1px solid ${net.ssid === bleLastSsid ? THEME.green + '44' : THEME.border}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12 }}>📶</span>
                          <span style={{ color: THEME.textPrimary, fontSize: 12, fontFamily: THEME.font }}>
                            {net.ssid}
                          </span>
                          {net.ssid === bleLastSsid && (
                            <span style={{ fontSize: 9, color: THEME.green, fontWeight: 700 }}>LAST</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            style={{
                              ...btnStyle,
                              padding: '3px 8px',
                              fontSize: 10,
                              color: THEME.accent,
                              borderColor: `${THEME.accent}44`,
                            }}
                            onClick={() => handleBleConnectNetwork(net.ssid)}
                            disabled={bleStatus?.type === 'CONNECTING'}
                          >
                            Connect
                          </button>
                          <button
                            style={{
                              ...btnStyle,
                              padding: '3px 6px',
                              fontSize: 10,
                              color: THEME.danger,
                              borderColor: `${THEME.danger}44`,
                            }}
                            onClick={() => handleBleForgetNetwork(net.ssid)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Network */}
                <div style={{ color: THEME.textDim, fontSize: 10, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Add Network
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Wi-Fi Name (SSID)"
                    value={newSsid}
                    onChange={(e) => setNewSsid(e.target.value)}
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBleAddNetwork(); }}
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                  <button
                    style={{
                      ...btnStyle,
                      color: THEME.green,
                      borderColor: `${THEME.green}44`,
                      opacity: newSsid.trim() ? 1 : 0.4,
                    }}
                    onClick={handleBleAddNetwork}
                    disabled={!newSsid.trim()}
                  >
                    + Add & Save
                  </button>
                </div>
              </div>
            )}

            {!bleSupported && (
              <div style={{ color: THEME.textDim, fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                Bluetooth not supported in this browser. Use Chrome.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. LIVE POSITION CARD */}
      <div style={cardStyle}>
        <div style={labelStyle}>Live Position</div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
          <div>
            <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>Az</span>
            <span
              style={{
                color: THEME.accent,
                fontSize: 20,
                fontFamily: THEME.font,
                fontWeight: 700,
              }}
            >
              {espStatus && espStatus.az !== undefined ? espStatus.az.toFixed(2) : '—'}°
            </span>
          </div>
          <div>
            <span style={{ color: THEME.textDim, fontSize: 10, marginRight: 4 }}>El</span>
            <span
              style={{
                color: THEME.accent,
                fontSize: 20,
                fontFamily: THEME.font,
                fontWeight: 700,
              }}
            >
              {espStatus && espStatus.el !== undefined ? espStatus.el.toFixed(2) : '—'}°
            </span>
          </div>
        </div>

        {/* Track state badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              display: 'inline-block',
              background: `${trackInfo.color}22`,
              color: trackInfo.color,
              border: `1px solid ${trackInfo.color}44`,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: 0.8,
            }}
          >
            {trackInfo.label}
          </span>

          {/* Motor moving badges */}
          {espStatus?.azMoving && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: THEME.accent }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: THEME.accent, display: 'inline-block' }} />
              AZ Moving
            </span>
          )}
          {espStatus?.elMoving && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: THEME.accent }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: THEME.accent, display: 'inline-block' }} />
              EL Moving
            </span>
          )}
        </div>

        {/* Home not set warning */}
        {espStatus && !espStatus.homeSet && (
          <div
            style={{
              background: `${THEME.warning}18`,
              border: `1px solid ${THEME.warning}44`,
              borderRadius: 6,
              padding: '8px 12px',
              color: THEME.warning,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            ⚠ Point dish at Polaris and set home
          </div>
        )}
      </div>

      {/* 3. MANUAL JOG CARD */}
      <div style={cardStyle}>
        <div style={labelStyle}>Manual Jog</div>

        {/* Jog step selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {[0.1, 0.5, 1, 5, 10].map((step) => (
            <button
              key={step}
              style={{
                ...btnStyle,
                padding: '5px 10px',
                fontSize: 11,
                color: jogStep === step ? THEME.accent : THEME.textMuted,
                borderColor: jogStep === step ? `${THEME.accent}66` : THEME.border,
                background: jogStep === step ? THEME.accentDim : THEME.bg1,
              }}
              onClick={() => handleJogStepChange(step)}
            >
              {step}°
            </button>
          ))}
        </div>

        {/* D-pad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 1fr',
            gap: 4,
            width: 150,
            margin: '0 auto 12px auto',
          }}
        >
          {/* Row 1: empty, up, empty */}
          <div />
          <button
            style={{
              ...btnStyle,
              padding: '10px',
              fontSize: 16,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onClick={() => sendJog(0, jogStep)}
            title={`El +${jogStep}°`}
          >
            ↑
          </button>
          <div />

          {/* Row 2: left, empty, right */}
          <button
            style={{
              ...btnStyle,
              padding: '10px',
              fontSize: 16,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onClick={() => sendJog(-jogStep, 0)}
            title={`Az -${jogStep}°`}
          >
            ←
          </button>
          <div />
          <button
            style={{
              ...btnStyle,
              padding: '10px',
              fontSize: 16,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onClick={() => sendJog(jogStep, 0)}
            title={`Az +${jogStep}°`}
          >
            →
          </button>

          {/* Row 3: empty, down, empty */}
          <div />
          <button
            style={{
              ...btnStyle,
              padding: '10px',
              fontSize: 16,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onClick={() => sendJog(0, -jogStep)}
            title={`El -${jogStep}°`}
          >
            ↓
          </button>
          <div />
        </div>
      </div>

      {/* 4. HOME SETUP CARD */}
      <div style={cardStyle}>
        <div style={labelStyle}>Polaris Alignment</div>

        {!isSettingHome ? (
          <>
            {espStatus?.homeSet ? (
              <div style={{ color: THEME.green, fontSize: 13, marginBottom: 8 }}>
                ✓ Home set at Polaris
                <div style={{ color: THEME.textMuted, fontSize: 11, marginTop: 4 }}>
                  Az {espStatus.homeAz?.toFixed(2) ?? '0.00'}° El {espStatus.homeEl?.toFixed(2) ?? '0.00'}°
                </div>
              </div>
            ) : null}
            <button
              style={btnStyle}
              onClick={() => setIsSettingHome(true)}
            >
              Set Home Position (Polaris)
            </button>
          </>
        ) : (
          <>
            {/* Warning */}
            <div
              style={{
                background: `${THEME.warning}18`,
                border: `1px solid ${THEME.warning}44`,
                borderRadius: 6,
                padding: '8px 12px',
                color: THEME.warning,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              Manually jog dish to point at Polaris using the Manual Jog controls above, then confirm.
            </div>

            {/* Confirm & Cancel */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{
                  ...btnStyle,
                  flex: 1,
                  color: THEME.bg0,
                  background: THEME.green,
                  borderColor: THEME.green,
                  fontWeight: 700,
                }}
                onClick={() => {
                  sendSetHome();
                  setIsSettingHome(false);
                }}
              >
                Confirm — this is Polaris ✓
              </button>
              <button
                style={{ ...btnStyle, flex: 0 }}
                onClick={() => setIsSettingHome(false)}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      {/* 5. TRACKING CONTROLS CARD */}
      <div style={cardStyle}>
        <div style={labelStyle}>Tracking Controls</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {/* Start Tracking */}
          {!isAppTracking && (
            <button
              style={{
                ...btnAccentStyle,
                opacity: espStatus?.homeSet ? 1 : 0.4,
                cursor: espStatus?.homeSet ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (espStatus?.homeSet) onStartTracking();
              }}
              title={!espStatus?.homeSet ? 'Set home position first' : 'Begin tracking selected target'}
            >
              ▶ Start Tracking
            </button>
          )}

          {/* Pause */}
          {isAppTracking && (
            <button
              style={{ ...btnStyle, color: THEME.amber, borderColor: `${THEME.amber}44` }}
              onClick={() => {
                onStopTracking();
                espClient.sendStop();
              }}
            >
              ⏸ Pause
            </button>
          )}

          {/* Resume */}
          {espStatus?.trackState === 2 && (
            <button
              style={btnAccentStyle}
              onClick={() => {
                espClient.sendResume();
                onStartTracking();
              }}
            >
              ▶ Resume
            </button>
          )}

          {/* Park */}
          <button
            style={{
              ...btnStyle,
              color: confirmPark ? THEME.danger : THEME.orange,
              borderColor: confirmPark ? `${THEME.danger}66` : `${THEME.orange}44`,
              background: confirmPark ? `${THEME.danger}18` : THEME.bg1,
            }}
            onClick={handlePark}
          >
            {confirmPark ? 'Confirm park?' : '⏻ Park'}
          </button>
        </div>

        {/* Saved position */}
        {espStatus && (
          <div style={{ color: THEME.textDim, fontSize: 11 }}>
            Last saved: Az {espStatus.savedAz?.toFixed(2) ?? '0.00'}° El {espStatus.savedEl?.toFixed(2) ?? '0.00'}°
          </div>
        )}
      </div>

      {/* 6. HARDWARE LIMITS & PARK (collapsible) */}
      <div style={cardStyle}>
        <div
          style={{
            ...labelStyle,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: showLimitsSettings ? 10 : 0,
            userSelect: 'none',
          }}
          onClick={() => setShowLimitsSettings(!showLimitsSettings)}
        >
          <span>Hardware Limits & Park</span>
          <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: showLimitsSettings ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>

        {showLimitsSettings && (
          <div>
            <div style={{ color: THEME.textDim, fontSize: 11, marginBottom: 12 }}>
              Jog to the desired position, then click to save it.
            </div>
            
            {/* Azimuth Limits */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4 }}>Azimuth Limits</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...btnStyle, flex: 1, padding: '5px' }}
                  onClick={() => espClient.sendSetLimit('az', 'min')}
                >
                  Set Az Min {espStatus?.minAz !== undefined ? `(${espStatus.minAz.toFixed(1)}°)` : ''}
                </button>
                <button
                  style={{ ...btnStyle, flex: 1, padding: '5px' }}
                  onClick={() => espClient.sendSetLimit('az', 'max')}
                >
                  Set Az Max {espStatus?.maxAz !== undefined ? `(${espStatus.maxAz.toFixed(1)}°)` : ''}
                </button>
              </div>
            </div>

            {/* Elevation Limits */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4 }}>Elevation Limits</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...btnStyle, flex: 1, padding: '5px' }}
                  onClick={() => espClient.sendSetLimit('el', 'min')}
                >
                  Set El Min {espStatus?.minEl !== undefined ? `(${espStatus.minEl.toFixed(1)}°)` : ''}
                </button>
                <button
                  style={{ ...btnStyle, flex: 1, padding: '5px' }}
                  onClick={() => espClient.sendSetLimit('el', 'max')}
                >
                  Set El Max {espStatus?.maxEl !== undefined ? `(${espStatus.maxEl.toFixed(1)}°)` : ''}
                </button>
              </div>
            </div>

            {/* Park Position */}
            <div>
              <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 4 }}>Parking Position</div>
              <button
                style={{ ...btnStyle, width: '100%', padding: '5px', borderColor: THEME.orange, color: THEME.orange }}
                onClick={() => espClient.sendSetPark()}
              >
                Set Current Position as Park
                {espStatus?.parkAz !== undefined ? ` (${espStatus.parkAz.toFixed(1)}°, ${espStatus.parkEl?.toFixed(1)}°)` : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 7. MOTOR SETTINGS CARD (collapsible) */}
      <div style={cardStyle}>
        <div
          style={{
            ...labelStyle,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: showMotorSettings ? 10 : 0,
            userSelect: 'none',
          }}
          onClick={() => setShowMotorSettings(!showMotorSettings)}
        >
          <span>Motor Settings</span>
          <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: showMotorSettings ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>

        {showMotorSettings && (
          <div>
            {/* Speed slider */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: THEME.textMuted, fontSize: 11 }}>Speed</span>
                <span style={{ color: THEME.accent, fontSize: 12, fontFamily: THEME.font }}>{speedHz} Hz</span>
              </div>
              <input
                type="range"
                min={500}
                max={8000}
                step={100}
                value={speedHz}
                onChange={(e) => setSpeedHz(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  accentColor: THEME.accent,
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.textDim, fontSize: 9 }}>500</span>
                <span style={{ color: THEME.textDim, fontSize: 9 }}>8000</span>
              </div>
            </div>

            {/* Acceleration slider */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: THEME.textMuted, fontSize: 11 }}>Acceleration</span>
                <span style={{ color: THEME.accent, fontSize: 12, fontFamily: THEME.font }}>{accel}</span>
              </div>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={accel}
                onChange={(e) => setAccel(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  accentColor: THEME.accent,
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.textDim, fontSize: 9 }}>100</span>
                <span style={{ color: THEME.textDim, fontSize: 9 }}>2000</span>
              </div>
            </div>

            <button
              style={{
                ...btnAccentStyle,
                width: '100%',
              }}
              onClick={handleApplyMotorSettings}
            >
              Apply Settings
            </button>
          </div>
        )}
      </div>

      {/* 8. COMMUNICATIONS LOG (collapsible) */}
      <div style={cardStyle}>
        <div
          style={{
            ...labelStyle,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: showLogs ? 10 : 0,
            userSelect: 'none',
          }}
          onClick={() => setShowLogs(!showLogs)}
        >
          <span>Comms Log</span>
          <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: showLogs ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>

        {showLogs && (
          <div style={{
            background: THEME.bg0,
            borderRadius: 6,
            padding: 8,
            height: 150,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            border: `1px solid ${THEME.border}`,
          }}>
            {logs.length === 0 ? (
              <div style={{ color: THEME.textDim, fontSize: 11, textAlign: 'center', marginTop: 20 }}>No logs yet</div>
            ) : (
              logs.map((log, idx) => {
                const date = new Date(log.timestamp);
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
                const isRx = log.direction === 'rx';
                const color = isRx ? THEME.green : THEME.accent;
                return (
                  <div key={idx} style={{ fontSize: 10, fontFamily: THEME.font, lineHeight: 1.3, wordBreak: 'break-all' }}>
                    <span style={{ color: THEME.textDim }}>[{timeStr}]</span>{' '}
                    <span style={{ color, fontWeight: 700 }}>{isRx ? 'RX' : 'TX'}</span>{' '}
                    <span style={{ color: THEME.textMuted }}>{log.payload}</span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MotorControlPanel;

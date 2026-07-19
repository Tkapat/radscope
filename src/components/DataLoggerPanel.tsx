import React, { useState, useEffect } from 'react';
import { THEME } from '../styles/theme';

interface DataLoggerPanelProps {
  isLoggingEnabled: boolean;
  setIsLoggingEnabled: (val: boolean) => void;
  logIntervalSecs: number;
  setLogIntervalSecs: (val: number) => void;
  logCount: number;
  onDownloadCsv: () => void;
  onClearLogs: () => void;
  isAppTracking: boolean;
}

const DataLoggerPanel: React.FC<DataLoggerPanelProps> = ({
  isLoggingEnabled,
  setIsLoggingEnabled,
  logIntervalSecs,
  setLogIntervalSecs,
  logCount,
  onDownloadCsv,
  onClearLogs,
  isAppTracking,
}) => {
  const [intervalVal, setIntervalVal] = useState<number>(logIntervalSecs);
  const [intervalUnit, setIntervalUnit] = useState<'secs' | 'mins'>(logIntervalSecs >= 60 && logIntervalSecs % 60 === 0 ? 'mins' : 'secs');

  useEffect(() => {
    const valInSecs = intervalUnit === 'mins' ? intervalVal * 60 : intervalVal;
    if (valInSecs > 0) {
      setLogIntervalSecs(valInSecs);
    }
  }, [intervalVal, intervalUnit, setLogIntervalSecs]);

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
  };

  const btnStyle: React.CSSProperties = {
    background: THEME.bg1,
    color: THEME.textPrimary,
    border: `1px solid ${THEME.border}`,
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: THEME.font,
    fontWeight: 600,
    flex: 1,
  };

  return (
    <div style={cardStyle}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>Data Logger</div>

      {/* Enable Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={isLoggingEnabled}
          onChange={(e) => setIsLoggingEnabled(e.target.checked)}
          style={{ accentColor: THEME.accent, cursor: 'pointer' }}
        />
        <span style={{ color: THEME.textPrimary, fontSize: 13, fontWeight: 600 }}>
          Enable Auto-Logging
        </span>
      </label>

      {/* Interval Setup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ color: THEME.textMuted, fontSize: 12 }}>Log every</span>
        <input
          type="number"
          min="1"
          value={intervalVal}
          onChange={(e) => setIntervalVal(parseInt(e.target.value) || 0)}
          style={{
            background: THEME.bg1,
            border: `1px solid ${THEME.border}`,
            color: THEME.textPrimary,
            padding: '4px 8px',
            borderRadius: 4,
            width: 50,
            fontSize: 12,
            fontFamily: THEME.font,
          }}
        />
        <select
          value={intervalUnit}
          onChange={(e) => setIntervalUnit(e.target.value as 'secs' | 'mins')}
          style={{
            background: THEME.bg1,
            border: `1px solid ${THEME.border}`,
            color: THEME.textPrimary,
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: THEME.font,
            cursor: 'pointer',
          }}
        >
          <option value="secs">Seconds</option>
          <option value="mins">Minutes</option>
        </select>
      </div>

      {/* Status */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.textMuted, fontSize: 12 }}>
          Saved points: <strong style={{ color: THEME.accent }}>{logCount}</strong>
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 4,
          background: isLoggingEnabled && isAppTracking ? `${THEME.green}22` : `${THEME.textDim}22`,
          color: isLoggingEnabled && isAppTracking ? THEME.green : THEME.textDim,
        }}>
          {isLoggingEnabled && isAppTracking ? 'RECORDING' : 'PAUSED'}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ ...btnStyle, opacity: logCount > 0 ? 1 : 0.5 }}
          onClick={onDownloadCsv}
          disabled={logCount === 0}
        >
          Download CSV
        </button>
        <button
          style={{ ...btnStyle, background: `${THEME.danger}22`, color: THEME.danger, border: `1px solid ${THEME.danger}44`, opacity: logCount > 0 ? 1 : 0.5 }}
          onClick={onClearLogs}
          disabled={logCount === 0}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default DataLoggerPanel;

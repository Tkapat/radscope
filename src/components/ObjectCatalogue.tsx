import React, { useState } from 'react';
import { CelestialObject } from '../types/telescope';
import { THEME } from '../styles/theme';

interface ObjectCatalogueProps {
  selected: CelestialObject;
  onSelect: (obj: CelestialObject) => void;
  availableSatellites: string[];
  customRa: string;
  customDec: string;
  onCustomRaChange: (v: string) => void;
  onCustomDecChange: (v: string) => void;
  selectedSatelliteName?: string;
  onSatelliteSelect: (name: string) => void;
}

export const CATALOGUE: CelestialObject[] = [
  { id: 'sun', name: 'Sun', type: 'solar', description: 'Solar tracker — Polaris referenced' },
  { id: 'moon', name: 'Moon', type: 'moon', description: "Earth's natural satellite" },
  { id: 'mercury', name: 'Mercury', type: 'planet', description: 'Innermost planet', astronomyEngineBody: 'Mercury' },
  { id: 'venus', name: 'Venus', type: 'planet', description: 'Brightest planet', astronomyEngineBody: 'Venus' },
  { id: 'mars', name: 'Mars', type: 'planet', description: 'Red planet', astronomyEngineBody: 'Mars' },
  { id: 'jupiter', name: 'Jupiter', type: 'planet', description: 'Gas giant', astronomyEngineBody: 'Jupiter' },
  { id: 'saturn', name: 'Saturn', type: 'planet', description: 'Ringed giant', astronomyEngineBody: 'Saturn' },
  { id: 'uranus', name: 'Uranus', type: 'planet', description: 'Ice giant', astronomyEngineBody: 'Uranus' },
  { id: 'neptune', name: 'Neptune', type: 'planet', description: 'Distant ice giant', astronomyEngineBody: 'Neptune' },
  { id: 'galileo', name: 'Galileo MEO', type: 'satellite', description: 'EU navigation constellation', isSatelliteMode: true, constellationSource: 'galileo' },
  { id: 'glonass', name: 'GLONASS MEO', type: 'satellite', description: 'Russian navigation constellation', isSatelliteMode: true, constellationSource: 'glonass' },
  { id: 'custom', name: 'Custom RA/Dec', type: 'custom', description: 'Enter coordinates manually' },
];

const TYPE_COLORS: Record<string, string> = {
  solar: THEME.orange,
  planet: THEME.amber,
  moon: THEME.moonWhite,
  satellite: THEME.green,
  dso: THEME.purple,
  custom: THEME.pink,
};

const ObjectCatalogue: React.FC<ObjectCatalogueProps> = ({
  selected,
  onSelect,
  availableSatellites,
  customRa,
  customDec,
  onCustomRaChange,
  onCustomDecChange,
  selectedSatelliteName,
  onSatelliteSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = CATALOGUE.filter((obj) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      obj.name.toLowerCase().includes(q) ||
      obj.description.toLowerCase().includes(q) ||
      obj.type.toLowerCase().includes(q)
    );
  });

  const inputStyle: React.CSSProperties = {
    background: THEME.bg1,
    color: THEME.textPrimary,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontFamily: THEME.font,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  };

  return (
    <div
      style={{
        background: THEME.bg2,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: 14,
        fontFamily: THEME.font,
      }}
    >
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: THEME.textDim,
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          placeholder="Search objects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            ...inputStyle,
            paddingLeft: 30,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = THEME.borderHover;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = THEME.border;
          }}
        />
      </div>

      {/* Scrollable list */}
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          borderRadius: 6,
        }}
      >
        {filtered.map((obj) => {
          const isSelected = selected.id === obj.id;
          const isHovered = hoveredId === obj.id;
          const dotColor = TYPE_COLORS[obj.type] || THEME.textMuted;

          return (
            <div
              key={obj.id}
              onClick={() => onSelect(obj)}
              onMouseEnter={() => setHoveredId(obj.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                marginBottom: 2,
                borderLeft: isSelected ? `3px solid ${THEME.accent}` : '3px solid transparent',
                background: isSelected
                  ? THEME.accentDim
                  : isHovered
                    ? `rgba(100,120,200,0.08)`
                    : 'transparent',
                transition: 'all 0.12s',
              }}
            >
              {/* Type dot */}
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: dotColor,
                  marginRight: 12,
                  flexShrink: 0,
                  boxShadow: isSelected ? `0 0 6px ${dotColor}` : 'none',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: isSelected ? THEME.accent : THEME.textPrimary,
                    fontWeight: 700,
                    fontSize: 13,
                    marginBottom: 2,
                  }}
                >
                  {obj.name}
                </div>
                <div
                  style={{
                    color: THEME.textMuted,
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {obj.description}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div
            style={{
              color: THEME.textDim,
              fontSize: 12,
              textAlign: 'center',
              padding: 20,
            }}
          >
            No objects match "{searchQuery}"
          </div>
        )}
      </div>

      {/* Satellite sub-list */}
      {selected.type === 'satellite' && availableSatellites.length > 0 && (
        <div
          style={{
            marginTop: 10,
            background: THEME.bg1,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div
            style={{
              color: THEME.textMuted,
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Available Satellites ({availableSatellites.length})
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {availableSatellites.map((name) => {
              const isSatSelected = selectedSatelliteName === name;
              return (
                <div
                  key={name}
                  onClick={() => onSatelliteSelect(name)}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    fontSize: 12,
                    color: isSatSelected ? THEME.accent : THEME.textMuted,
                    background: isSatSelected ? THEME.accentDim : 'transparent',
                    transition: 'all 0.12s',
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSatSelected) {
                      e.currentTarget.style.background = 'rgba(100,120,200,0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSatSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{ marginRight: 8, color: THEME.green }}>●</span>
                  {name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom RA/Dec inputs */}
      {selected.type === 'custom' && (
        <div
          style={{
            marginTop: 10,
            background: THEME.bg1,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              color: THEME.textMuted,
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Custom Coordinates
          </div>
          <div style={{ marginBottom: 8 }}>
            <label
              style={{
                color: THEME.textMuted,
                fontSize: 11,
                display: 'block',
                marginBottom: 4,
              }}
            >
              Right Ascension (degrees)
            </label>
            <input
              type="text"
              value={customRa}
              onChange={(e) => onCustomRaChange(e.target.value)}
              placeholder="e.g. 83.63"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = THEME.accent;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = THEME.border;
              }}
            />
          </div>
          <div>
            <label
              style={{
                color: THEME.textMuted,
                fontSize: 11,
                display: 'block',
                marginBottom: 4,
              }}
            >
              Declination (degrees)
            </label>
            <input
              type="text"
              value={customDec}
              onChange={(e) => onCustomDecChange(e.target.value)}
              placeholder="e.g. -5.39"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = THEME.accent;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = THEME.border;
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ObjectCatalogue;

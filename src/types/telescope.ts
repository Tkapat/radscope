// Tracking modes
export type TrackingMode =
  | 'solar'
  | 'satellite'
  | 'planet'
  | 'moon'
  | 'custom_radec'
  | 'manual';

// Celestial object in catalogue
export interface CelestialObject {
  id: string;
  name: string;
  type: 'solar' | 'planet' | 'moon' | 'satellite' | 'dso' | 'custom';
  description: string;
  astronomyEngineBody?: string;
  isSatelliteMode?: boolean;
  constellationSource?: 'galileo' | 'glonass';
}

// Computed sky coordinates
export interface TargetCoordinates {
  targetAz: number;
  targetEl: number;
  rawAz?: number;
  rawEl?: number;
  raDeg?: number;
  decDeg?: number;
  mode: TrackingMode;
  objectName: string;
  timestamp: number;
}

export interface MotorSkyCoordinates {
  az: number;
  el: number;
  raDeg: number;
  decDeg: number;
  timestamp: number;
}

// Sky map body for 3D rendering
export interface SkyMapBody {
  name: string;
  az: number;
  el: number;
  type: CelestialObject['type'];
  isTarget: boolean;
}

// Sky path for arc rendering
export interface SkyPath {
  objectName: string;
  points: Array<{ az: number; el: number; time: number }>;
}

// ESP32 status received from WebSocket
export type EspTrackState = 0 | 1 | 2 | 3;

export interface EspStatus {
  type: 'status';
  az: number;
  el: number;
  homeAz: number;
  homeEl: number;
  homeSet: boolean;
  savedAz: number;
  savedEl: number;
  positionKnown: boolean;
  trackState: EspTrackState;
  azMoving: boolean;
  elMoving: boolean;
  azSteps: number;
  elSteps: number;
  trackUpdateMs: number;
  ip: string;
  minAz?: number;
  maxAz?: number;
  minEl?: number;
  maxEl?: number;
  parkAz?: number;
  parkEl?: number;
  limitsSet: boolean;
}

// Commands sent to ESP
export interface TrackCommand {
  type: 'track';
  targetAz: number;
  targetEl: number;
  objectName?: string;
  timestamp: number;
}

export interface JogCommand {
  type: 'jog';
  deltaAz: number;
  deltaEl: number;
}

export type EspCommand =
  | TrackCommand
  | JogCommand
  | { type: 'stop' }
  | { type: 'set_home' }
  | { type: 'park' }
  | { type: 'resume' }
  | { type: 'get_status' }
  | { type: 'set_speed'; speedHz: number; accel: number }
  | { type: 'set_limit'; axis: 'az' | 'el'; limit: 'min' | 'max' }
  | { type: 'set_park' };

// Comms state
export interface CommsState {
  wsConnected: boolean;
  espIp: string;
  lastSeenMs?: number;
}

// Log entry for WebSocket communications
export interface EspLog {
  timestamp: number;
  direction: 'rx' | 'tx';
  payload: string;
}

export interface DataLogEntry {
  time: string;
  targetName: string;
  targetAz: string;
  targetEl: string;
  targetRa: string;
  targetDec: string;
  motorAz: string;
  motorEl: string;
  deltaAz: string;
  deltaEl: string;
}

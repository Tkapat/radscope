// ---------------------------------------------------------------------------
// espClient.ts – WebSocket client for the ESP32 telescope controller
// ---------------------------------------------------------------------------

import type { EspStatus, EspCommand, EspLog } from '../types/telescope';

class EspClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private statusListeners: Array<(s: EspStatus) => void> = [];
  private connectListeners: Array<(connected: boolean) => void> = [];
  private logListeners: Array<(l: EspLog) => void> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSentTrackMs: number = 0;
  private readonly CLIENT_THROTTLE_MS = 100;

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Open (or re‑open) the WebSocket connection to the ESP32.
   */
  connect(address: string, port: number = 81): void {
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }

    if (address.startsWith('ws://') || address.startsWith('wss://')) {
      this.url = address;
    } else if (address.includes(':')) {
      this.url = `ws://${address}`;
    } else {
      this.url = `ws://${address}:${port}`;
    }
    
    this.ws = new WebSocket(this.url);
    this.setupWs();
  }

  sendTrack(targetAz: number, targetEl: number, objectName?: string): void {
    const now = Date.now();
    if (now - this.lastSentTrackMs < this.CLIENT_THROTTLE_MS) return;
    this.lastSentTrackMs = now;
    this.send({ type: 'track', targetAz, targetEl, objectName, timestamp: now });
  }

  sendJog(deltaAz: number, deltaEl: number): void {
    this.send({ type: 'jog', deltaAz, deltaEl });
  }

  sendStop(): void {
    this.send({ type: 'stop' });
  }

  sendSetHome(): void {
    this.send({ type: 'set_home' });
  }

  sendPark(): void {
    this.send({ type: 'park' });
  }

  sendResume(): void {
    this.send({ type: 'resume' });
  }

  sendGetStatus(): void {
    this.send({ type: 'get_status' });
  }

  setSpeed(speedHz: number, accel: number): void {
    this.send({ type: 'set_speed', speedHz, accel });
  }

  sendSetLimit(axis: 'az' | 'el', limit: 'min' | 'max'): void {
    this.send({ type: 'set_limit', axis, limit });
  }

  sendSetPark(): void {
    this.send({ type: 'set_park' });
  }

  /** Register a listener that fires on every ESP status message. */
  onStatus(cb: (s: EspStatus) => void): void {
    this.statusListeners.push(cb);
  }

  /** Register a listener that fires when the connection state changes. */
  onConnect(cb: (connected: boolean) => void): void {
    this.connectListeners.push(cb);
  }

  /** Register a listener for raw WebSocket logs. */
  onLog(cb: (l: EspLog) => void): void {
    this.logListeners.push(cb);
  }

  /** Tear down the connection and stop reconnection attempts. */
  disconnect(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Attach all WebSocket event handlers. Called both on initial connect and
   * on reconnect so that the new socket instance has the same behaviour.
   */
  private setupWs(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.sendGetStatus();
      this.notifyConnect(true);
    };

    this.ws.onclose = () => {
      this.notifyConnect(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = (event: Event) => {
      this.notifyLog('rx', 'WebSocket Error: Connection failed');
      // onclose will fire right after onerror — reconnect logic lives there.
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const data = event.data as string;
      this.notifyLog('rx', data);
      try {
        const msg = JSON.parse(data);
        if (msg && msg.type === 'status') {
          for (const cb of this.statusListeners) {
            cb(msg as EspStatus);
          }
        }
      } catch {
        // Ignore non‑JSON frames
      }
    };
  }

  private send(obj: EspCommand): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(obj);
      this.notifyLog('tx', payload);
      this.ws.send(payload);
    }
  }

  private notifyConnect(connected: boolean): void {
    for (const cb of this.connectListeners) {
      cb(connected);
    }
  }

  private notifyLog(direction: 'rx' | 'tx', payload: string): void {
    const log: EspLog = { timestamp: Date.now(), direction, payload };
    for (const cb of this.logListeners) {
      cb(log);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.url) {
        this.ws = new WebSocket(this.url);
        this.setupWs();
      }
    }, 4000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton ESP client instance shared across the application. */
export const espClient = new EspClient();

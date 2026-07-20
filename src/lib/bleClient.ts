// ---------------------------------------------------------------------------
// bleClient.ts – Web Bluetooth client for ESP32 BLE Wi-Fi provisioning
// ---------------------------------------------------------------------------

export interface SavedWifiNetwork {
  ssid: string;
}

export type BleWifiStatus =
  | { type: 'BLE_READY' }
  | { type: 'CONNECTING'; ssid: string }
  | { type: 'CONNECTED'; ip: string }
  | { type: 'FAILED'; ssid: string }
  | { type: 'ADDED'; ssid: string }
  | { type: 'FORGOTTEN'; ssid: string }
  | { type: 'ERROR'; message: string };

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const WIFI_LIST_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const WIFI_CMD_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';
const WIFI_STATUS_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26aa';

class BleClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private wifiListChar: BluetoothRemoteGATTCharacteristic | null = null;
  private wifiCmdChar: BluetoothRemoteGATTCharacteristic | null = null;
  private wifiStatusChar: BluetoothRemoteGATTCharacteristic | null = null;

  private statusListeners: Array<(s: BleWifiStatus) => void> = [];
  private networkListListeners: Array<(networks: SavedWifiNetwork[], last: string) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];

  // ── Public API ───────────────────────────────────────────────────────────

  /** Check if Web Bluetooth is supported in this browser/environment. */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /** Is the BLE GATT connection currently active? */
  isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  /**
   * Open the browser's Bluetooth pairing dialog and connect to "Telescope_Rig".
   * Returns true if connection was successful.
   */
  async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      console.error('Web Bluetooth API is not supported in this browser.');
      return false;
    }

    try {
      // Request the device — this opens the browser's BLE pairing dialog
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'Telescope_Rig' }],
        optionalServices: [SERVICE_UUID],
      });

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('BLE: Device disconnected');
        this.cleanup();
        this.notifyConnection(false);
      });

      // Connect to GATT server
      this.server = await this.device.gatt!.connect();
      console.log('BLE: Connected to GATT server');

      // Get service
      const service = await this.server.getPrimaryService(SERVICE_UUID);

      // Get characteristics
      this.wifiListChar = await service.getCharacteristic(WIFI_LIST_UUID);
      this.wifiCmdChar = await service.getCharacteristic(WIFI_CMD_UUID);
      this.wifiStatusChar = await service.getCharacteristic(WIFI_STATUS_UUID);

      // Subscribe to notifications
      await this.wifiListChar.startNotifications();
      this.wifiListChar.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        this.handleNetworkListUpdate(target.value!);
      });

      await this.wifiStatusChar.startNotifications();
      this.wifiStatusChar.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        this.handleStatusUpdate(target.value!);
      });

      this.notifyConnection(true);

      // Read the initial network list safely
      try {
        const value = await this.wifiListChar.readValue();
        this.handleNetworkListUpdate(value);
      } catch (e) {
        console.warn('BLE: Failed to read initial network list', e);
      }

      return true;
    } catch (err) {
      console.error('BLE: Connection failed', err);
      this.cleanup();
      return false;
    }
  }

  /** Send ADD command to save a new Wi-Fi network on the ESP32. */
  async addNetwork(ssid: string, password: string): Promise<void> {
    await this.sendCommand(`ADD:${ssid},${password}`);
  }

  /** Send CONNECT command to tell the ESP32 to connect to a saved network. */
  async connectNetwork(ssid: string): Promise<void> {
    await this.sendCommand(`CONNECT:${ssid}`);
  }

  /** Send FORGET command to remove a saved network from the ESP32. */
  async forgetNetwork(ssid: string): Promise<void> {
    await this.sendCommand(`FORGET:${ssid}`);
  }

  /** Register a listener for Wi-Fi status updates from the ESP32. */
  onStatus(cb: (s: BleWifiStatus) => void): void {
    this.statusListeners.push(cb);
  }

  /** Register a listener for network list updates from the ESP32. */
  onNetworkList(cb: (networks: SavedWifiNetwork[], last: string) => void): void {
    this.networkListListeners.push(cb);
  }

  /** Register a listener for BLE connection state changes. */
  onConnection(cb: (connected: boolean) => void): void {
    this.connectionListeners.push(cb);
  }

  /** Disconnect from the BLE device. */
  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.cleanup();
    this.notifyConnection(false);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async sendCommand(cmd: string): Promise<void> {
    if (!this.wifiCmdChar) {
      console.error('BLE: Not connected — cannot send command');
      return;
    }
    const encoder = new TextEncoder();
    await this.wifiCmdChar.writeValue(encoder.encode(cmd));
    console.log('BLE CMD sent:', cmd);
  }

  private handleNetworkListUpdate(value: DataView): void {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(value.buffer);
      const data = JSON.parse(json);

      const networks: SavedWifiNetwork[] = (data.networks || []).map((n: { ssid: string }) => ({
        ssid: n.ssid,
      }));
      const last: string = data.last || '';

      for (const cb of this.networkListListeners) {
        cb(networks, last);
      }
    } catch (err) {
      console.error('BLE: Failed to parse network list', err);
    }
  }

  private handleStatusUpdate(value: DataView): void {
    try {
      const decoder = new TextDecoder();
      const raw = decoder.decode(value.buffer);

      const status = this.parseStatus(raw);
      for (const cb of this.statusListeners) {
        cb(status);
      }
    } catch (err) {
      console.error('BLE: Failed to parse status', err);
    }
  }

  private parseStatus(raw: string): BleWifiStatus {
    if (raw === 'BLE_READY') return { type: 'BLE_READY' };
    if (raw.startsWith('CONNECTING:')) return { type: 'CONNECTING', ssid: raw.substring(11) };
    if (raw.startsWith('CONNECTED:')) return { type: 'CONNECTED', ip: raw.substring(10) };
    if (raw.startsWith('FAILED:')) return { type: 'FAILED', ssid: raw.substring(7) };
    if (raw.startsWith('ADDED:')) return { type: 'ADDED', ssid: raw.substring(6) };
    if (raw.startsWith('FORGOTTEN:')) return { type: 'FORGOTTEN', ssid: raw.substring(10) };
    if (raw.startsWith('ERROR:')) return { type: 'ERROR', message: raw.substring(6) };
    return { type: 'ERROR', message: raw };
  }

  private notifyConnection(connected: boolean): void {
    for (const cb of this.connectionListeners) {
      cb(connected);
    }
  }

  private cleanup(): void {
    this.wifiListChar = null;
    this.wifiCmdChar = null;
    this.wifiStatusChar = null;
    this.server = null;
  }
}

/** Singleton BLE client instance shared across the application. */
export const bleClient = new BleClient();

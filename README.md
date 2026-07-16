# 🔭 Radscope

Radscope is an advanced radio telescope control application that features a frontend built with React 18, TypeScript, Three.js, and Vite, which communicates via low-latency WebSockets to an ESP32 WROVER edge-server. The ESP32 drives NEMA 21 stepper motors through DM542 drivers and worm gearboxes to actively control the radio telescope.

## 🛠️ Technology Stack

### Hardware
* **Microcontroller:** ESP32-WROVER (Handles real-time motor commands, Wi-Fi networking, and EEPROM state saving).
* **Stepper Motors:** NEMA 21 (Provides the physical torque for Azimuth and Altitude movement).
* **Motor Drivers:** DM542 (High-voltage/high-current drivers to smoothly control the NEMA motors).
* **Mechanical Drive:** Worm gearboxes attached to the motors (Ratio calculated at 29.92 steps per degree).

### Software (Desktop Application)
* **App Framework:** Tauri (Bundles the web app into a lightweight, native desktop application using a Rust backend).
* **UI Framework:** React 18 with TypeScript and Vite (For a highly responsive, strongly-typed user interface).
* **3D Rendering:** Three.js / React Three Fiber (Renders the interactive 3D sky map and dynamic target paths).
* **Astronomical Math:** `astronomy-engine` (Calculates live planetary, lunar, and solar positions, plus complex RA/Dec to Alt/Az transforms).
* **Satellite Tracking:** `satellite.js` (Decodes TLE data to track live orbital positions of satellites like the ISS).

### Firmware & Networking (ESP32)
* **Language:** C++ (Using the Arduino IDE framework).
* **Motor Control:** `AccelStepper` library (Calculates real-time acceleration curves, maximum speeds, and absolute positional steps).
* **Communication Protocol:** WebSockets (`WebSocketsServer`) over Port 81 (For instant, low-latency, two-way communication between the desktop app and the telescope).
* **Network Discovery:** mDNS (`ESPmDNS`) (Allows the app to automatically find the telescope using `radioscope.local` instead of a shifting IP address).
* **Data Parsing:** `ArduinoJson` (Encodes and decodes the complex command structures sent back and forth).

## 🚀 Development Setup

To run the desktop application locally in development mode:

```bash
# Install dependencies
pnpm install

# Run the Tauri development server
pnpm tauri dev
```

To build a standalone production application:
```bash
pnpm tauri build
```

# Vehicle Monitor

Real-time vehicle telemetry server. Receives sensor frames from an ESP32 over WebSocket, persists them to Firebase Realtime Database, and streams live data to a browser dashboard.

---

## Architecture

```
ESP32  ──WS──►  server.js  ──►  Firebase Realtime DB
                    │
              broadcaster.js
                    │
              ◄──WS──  Browser dashboard
```

- **WebSocket** (`/ws`) — bidirectional; ESP32 and browser clients distinguished by role handshake
- **REST API** (`/api/*`) — read-only endpoints for history and events
- **Static files** (`/public`) — single-page dashboard (Chart.js + Leaflet)

---

## Setup

### 1. Prerequisites

- Node.js 20+ (or 24 LTS)
- A Firebase project with Realtime Database enabled
- A Firebase service account JSON key

### 2. Clone & install

```bash
cd vehicle-monitor
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | HTTP/WS listen port (default `3000`) |
| `FIREBASE_DB_URL` | Firebase Realtime DB URL, e.g. `https://<project>-default-rtdb.firebaseio.com` |
| `FIREBASE_CREDENTIALS_PATH` | Path to your service account JSON (default `./firebase-service-account.json`) |

Place your downloaded service account JSON at the path set in `FIREBASE_CREDENTIALS_PATH`.

---

## Running

### Development (auto-restart on file changes)

```bash
npm run dev
```

### Production

```bash
npm start
```

On startup the server prints a banner:

```
  Vehicle Monitor Server
  ──────────────────────────────────
  Local :  http://localhost:3000
  LAN   :  http://192.168.x.x:3000
  WS    :  ws://192.168.x.x:3000/ws   ← paste into ESP32 sketch
  ──────────────────────────────────
```

Copy the **WS URL** into your ESP32 sketch's `WS_HOST` / `WS_PORT` constants.

---

## Synthetic device (dashboard validation without ESP32)

Run the simulator in a second terminal while the server is running:

```bash
node scripts/test-device.js
# or point at a different host:
node scripts/test-device.js ws://192.168.1.42:3000/ws
```

The simulator streams a fake sensor frame every 100 ms with:

- Slowly varying acceleration (sinusoidal + Gaussian noise)
- GPS random walk around Bangalore (12.9716, 77.5946)
- Four scripted events at predictable times:

| Time | Event | Severity |
|---|---|---|
| ~5 s  (frame 50)  | `collision`    | high   |
| ~15 s (frame 150) | `rash_driving` | medium |
| ~25 s (frame 250) | `tow`          | medium |
| ~35 s (frame 350) | `toppling`     | high   |

Open `http://localhost:3000` in a browser to watch the dashboard update live.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server status, uptime, connected client counts |
| `GET` | `/api/live` | Latest sensor reading from `/live` in Firebase |
| `GET` | `/api/history?limit=100&since=<ms>` | Recent readings (max 1000, filtered by server timestamp) |
| `GET` | `/api/events?limit=50` | Recent events, newest first (max 1000) |

All endpoints return JSON. Errors return `{ "error": "<message>" }` with an appropriate HTTP status code.

---

## Firebase data structure

```
/live          — single object, overwritten on every frame
/history/<key> — every sensor reading, pushed with server timestamp
/events/<key>  — every detected event, pushed with server timestamp
```

---

## ESP32 frame format

The server expects frames as JSON over WebSocket:

```json
{
  "ax": 0.012,
  "ay": -0.003,
  "az": 0.981,
  "lat": 12.9716,
  "lng": 77.5946,
  "speed": 42.3,
  "deviceTs": 1713600000000,
  "events": [
    {
      "type": "rash_driving",
      "severity": "medium",
      "metrics": { "ax": 1.82, "speed": 87.4 },
      "deviceTs": 1713600000000
    }
  ]
}
```

`events` may be an empty array `[]` or omitted when no event occurred.

---

## Project structure

```
vehicle-monitor/
├── server.js                  — entry point
├── config/firebase.js         — firebase-admin init + DB helpers
├── routes/api.js              — Express REST router
├── utils/broadcaster.js       — WebSocket server + heartbeat
├── utils/events.js            — server-side event classification
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── dashboard.js       — WS client + metric cards + event ticker
│       ├── charts.js          — Chart.js acceleration & jerk charts
│       └── map.js             — Leaflet map + trajectory
└── scripts/
    └── test-device.js         — synthetic ESP32 simulator
```

/**
 * Synthetic ESP32 simulator — streams fake sensor frames to the local server.
 * Usage:  node scripts/test-device.js [ws://localhost:3000/ws]
 *
 * Fires one of each event type at predictable intervals so you can validate
 * the dashboard without touching real hardware:
 *
 *   frame 50  (~5 s)  → collision      (ax spike to 3 g)
 *   frame 150 (~15 s) → rash_driving   (ax spike to 1.8 g, sharp brake sim)
 *   frame 250 (~25 s) → tow            (az anomaly, speed drops to 0)
 *   frame 350 (~35 s) → toppling       (ay spike to 2.5 g, roll > 60°)
 */

'use strict';

const WebSocket = require('ws');

const WS_URL    = process.argv[2] || 'ws://localhost:3000/ws';
const DEVICE_ID = 'sim-device-01';
const INTERVAL  = 100;          // ms between frames
const START_LAT = 12.9716;      // Bangalore — swap to your city
const START_LNG = 77.5946;

// ── Tiny PRNG helpers ─────────────────────────────────────────────────────────
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
const noise = (sigma)  => (Math.random() + Math.random() + Math.random()
                          + Math.random() - 2) * sigma; // ~normal via CLT

// ── State ─────────────────────────────────────────────────────────────────────
let frame = 0;
let lat   = START_LAT;
let lng   = START_LNG;
let speed = 30;                 // km/h
let headingRad = rand(0, 2 * Math.PI);

// ── Synthetic sensor walk ─────────────────────────────────────────────────────
function nextFrame() {
  frame++;
  const t = frame * INTERVAL / 1000; // seconds elapsed

  // Slowly drifting acceleration (gravity on Z, gentle lateral motion)
  let ax = 0.08 * Math.sin(t * 0.4)  + noise(0.015);
  let ay = 0.05 * Math.cos(t * 0.25) + noise(0.012);
  let az = 1.00 + 0.03 * Math.sin(t * 0.6) + noise(0.008);

  // Slowly varying speed
  speed = 30 + 15 * Math.sin(t * 0.05) + noise(0.5);
  speed = Math.max(0, speed);

  // GPS random walk in direction of heading, small heading wobble
  headingRad += noise(0.02);
  const metersPerFrame = (speed / 3.6) * (INTERVAL / 1000);
  lat += (metersPerFrame * Math.cos(headingRad)) / 111_320;
  lng += (metersPerFrame * Math.sin(headingRad)) / (111_320 * Math.cos(lat * Math.PI / 180));

  const events = [];

  // ── Scripted events ───────────────────────────────────────────────────────
  if (frame === 50) {
    ax = 3.2 + noise(0.1);
    ay = 0.4 + noise(0.05);
    events.push({
      type:     'collision',
      severity: 'high',
      metrics:  { ax: +ax.toFixed(3), ay: +ay.toFixed(3), az: +az.toFixed(3),
                  lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      deviceTs: Date.now(),
    });
    console.log('[sim] 💥 collision event fired');
  }

  if (frame === 150) {
    ax = 1.85 + noise(0.05);
    events.push({
      type:     'rash_driving',
      severity: 'medium',
      metrics:  { ax: +ax.toFixed(3), speed: +speed.toFixed(1),
                  lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      deviceTs: Date.now(),
    });
    console.log('[sim] ⚠️  rash_driving event fired');
  }

  if (frame === 250) {
    az = 0.35 + noise(0.03);  // z drops — lifted off ground
    speed = 0;
    events.push({
      type:     'tow',
      severity: 'medium',
      metrics:  { az: +az.toFixed(3), speed: 0,
                  lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      deviceTs: Date.now(),
    });
    console.log('[sim] 🚛 tow event fired');
  }

  if (frame === 350) {
    ay = 2.6 + noise(0.08);
    events.push({
      type:     'toppling',
      severity: 'high',
      metrics:  { ay: +ay.toFixed(3), az: +az.toFixed(3),
                  lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      deviceTs: Date.now(),
    });
    console.log('[sim] 🔴 toppling event fired');
  }

  return {
    ax:      +ax.toFixed(4),
    ay:      +ay.toFixed(4),
    az:      +az.toFixed(4),
    lat:     +lat.toFixed(6),
    lng:     +lng.toFixed(6),
    speed:   +speed.toFixed(2),
    deviceTs: Date.now(),
    events,
  };
}

// ── Connection & retry ────────────────────────────────────────────────────────
let timer       = null;
let retryDelay  = 1_000;
const MAX_DELAY = 16_000;

function connect() {
  console.log(`[sim] connecting → ${WS_URL}`);
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log(`[sim] connected as ${DEVICE_ID}`);
    retryDelay = 1_000;

    // Role handshake
    ws.send(JSON.stringify({ role: 'device', id: DEVICE_ID }));

    // Start streaming
    timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(nextFrame()));
      if (frame % 50 === 0) {
        console.log(`[sim] frame ${frame}  lat=${lat.toFixed(5)}  lng=${lng.toFixed(5)}  speed=${speed.toFixed(1)} km/h`);
      }
    }, INTERVAL);
  });

  ws.on('close', () => {
    clearInterval(timer);
    console.log(`[sim] disconnected — retrying in ${retryDelay / 1000}s`);
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
  });

  ws.on('error', (err) => {
    const detail = err.code === 'ECONNREFUSED'
      ? `connection refused — is the server running on ${WS_URL}?`
      : (err.message || err.code || err);
    console.error(`[sim] error: ${detail}`);
    ws.terminate();
  });
}

connect();

require('dotenv').config();

const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { saveSensorReading, saveEvent } = require('./config/firebase');
const Broadcaster = require('./utils/broadcaster');
const { classifyFrame } = require('./utils/events');
const apiRouter = require('./routes/api');

const PORT = parseInt(process.env.PORT || '3000', 10);

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const broadcaster = new Broadcaster();

app.use('/api', apiRouter(broadcaster));

// ── HTTP + WS server ──────────────────────────────────────────────────────────

const httpServer = http.createServer(app);
broadcaster.attach(httpServer);

// ── Device-frame handler ──────────────────────────────────────────────────────

let previousFrame = null;

broadcaster.onDeviceFrame(async (frame) => {
  // Persist sensor reading
  const reading = {
    ax: frame.ax,
    ay: frame.ay,
    az: frame.az,
    lat: frame.lat,
    lng: frame.lng,
    speed: frame.speed,
    deviceTs: frame.deviceTs,
  };
  saveSensorReading(reading); // fire-and-forget; errors logged inside

  // Validate and persist events
  const events = classifyFrame(frame, previousFrame);
  for (const ev of events) {
    saveEvent(ev); // fire-and-forget
  }
  previousFrame = frame;

  // Broadcast enriched frame to all browser clients
  broadcaster.broadcastToBrowsers({
    ...frame,
    events,
    serverTs: Date.now(),
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────

function getLanIps() {
  const results = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  return results;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = getLanIps();
  const divider = '  ' + '─'.repeat(52);
  console.log('');
  console.log('  Vehicle Monitor Server');
  console.log(divider);
  console.log(`  Local  :  http://localhost:${PORT}`);
  if (ips.length === 0) {
    console.log('  (no LAN interfaces detected)');
  } else {
    ips.forEach(({ name, address }) => {
      console.log(`  LAN    :  http://${address}:${PORT}  [${name}]`);
    });
    console.log('');
    ips.forEach(({ name, address }) => {
      console.log(`  WS     :  ws://${address}:${PORT}/ws  [${name}]  ← ESP32 WS_HOST`);
    });
  }
  console.log(divider);
  console.log('  Pick the WS line whose IP matches your ESP32\'s subnet.');
  console.log('  ESP32 subnet = first 3 octets of its Serial "IP=" value.');
  console.log('');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down gracefully`);
  broadcaster._wss.close(() => {
    httpServer.close(() => {
      console.log('[server] closed');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

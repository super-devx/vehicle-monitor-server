const { WebSocketServer, OPEN } = require('ws');

const HEARTBEAT_INTERVAL_MS = 30_000;

class Broadcaster {
  constructor() {
    this.deviceClients = new Set();
    this.browserClients = new Set();
    this._deviceFrameHandler = null;
    this._wss = null;
    this._heartbeatTimer = null;
  }

  attach(httpServer) {
    this._wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this._wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this._startHeartbeat();
    console.log('[broadcaster] WebSocket server attached on /ws');
  }

  broadcastToBrowsers(message) {
    const data = JSON.stringify(message);
    for (const ws of this.browserClients) {
      if (ws.readyState === OPEN) ws.send(data);
    }
  }

  onDeviceFrame(callback) {
    this._deviceFrameHandler = callback;
  }

  // ── private ──────────────────────────────────────────────────────────────

  _handleConnection(ws, req) {
    const addr = req.socket.remoteAddress;
    ws.isAlive = true;
    ws._role = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let frame;
      try { frame = JSON.parse(raw); } catch { return; }

      // Role handshake — first message from any client
      if (!ws._role) {
        ws._role = frame.role === 'device' ? 'device' : 'browser';
        if (ws._role === 'device') {
          ws._deviceId = frame.id || 'unknown';
          this.deviceClients.add(ws);
          console.log(`[broadcaster] device connected  id=${ws._deviceId} addr=${addr}`);
        } else {
          this.browserClients.add(ws);
          console.log(`[broadcaster] browser connected  addr=${addr}`);
        }
        return;
      }

      if (ws._role === 'device' && this._deviceFrameHandler) {
        this._deviceFrameHandler(frame, ws);
      }
    });

    ws.on('close', () => {
      if (ws._role === 'device') {
        this.deviceClients.delete(ws);
        console.log(`[broadcaster] device disconnected  id=${ws._deviceId} addr=${addr}`);
      } else {
        this.browserClients.delete(ws);
        console.log(`[broadcaster] browser disconnected  addr=${addr}`);
      }
    });

    ws.on('error', (err) => {
      console.error(`[broadcaster] ws error addr=${addr}:`, err.message);
    });
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      for (const ws of this._wss.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    this._wss.on('close', () => clearInterval(this._heartbeatTimer));
  }
}

module.exports = Broadcaster;

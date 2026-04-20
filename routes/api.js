const { Router } = require('express');
const admin = require('firebase-admin');

const MAX_LIMIT = 1000;

function parseLimit(raw, defaultVal) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return null; // signal bad input
  return Math.min(n, MAX_LIMIT);
}

module.exports = (broadcaster) => {
  const router = Router();
  const db = () => admin.database(); // lazy — firebase already init'd by the time routes run

  // GET /api/health
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      connectedDevices: broadcaster.deviceClients.size,
      connectedBrowsers: broadcaster.browserClients.size,
    });
  });

  // GET /api/live
  router.get('/live', async (req, res) => {
    try {
      const snap = await db().ref('live').once('value');
      res.json(snap.val() ?? {});
    } catch {
      res.status(500).json({ error: 'Failed to fetch live data' });
    }
  });

  // GET /api/history?limit=100&since=<ms>
  router.get('/history', async (req, res) => {
    let limitVal = 100;
    if (req.query.limit !== undefined) {
      const parsed = parseLimit(req.query.limit, 100);
      if (parsed === null) return res.status(400).json({ error: 'limit must be a positive integer' });
      limitVal = parsed;
    }

    let sinceVal = null;
    if (req.query.since !== undefined) {
      sinceVal = Number(req.query.since);
      if (!Number.isFinite(sinceVal) || sinceVal < 0) {
        return res.status(400).json({ error: 'since must be a non-negative millisecond timestamp' });
      }
    }

    try {
      let ref = db().ref('history').orderByChild('serverTs').limitToLast(limitVal);
      if (sinceVal !== null) ref = ref.startAt(sinceVal);

      const snap = await ref.once('value');
      const rows = [];
      snap.forEach((child) => rows.push({ _key: child.key, ...child.val() }));
      rows.reverse(); // newest first
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // GET /api/events?limit=50
  router.get('/events', async (req, res) => {
    let limitVal = 50;
    if (req.query.limit !== undefined) {
      const parsed = parseLimit(req.query.limit, 50);
      if (parsed === null) return res.status(400).json({ error: 'limit must be a positive integer' });
      limitVal = parsed;
    }

    try {
      const snap = await db().ref('events').orderByChild('serverTs').limitToLast(limitVal).once('value');
      const rows = [];
      snap.forEach((child) => rows.push({ _key: child.key, ...child.val() }));
      rows.reverse(); // newest first
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  return router;
};

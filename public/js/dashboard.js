import { initCharts, updateCharts } from './charts.js';
import { initMap, updateMap }       from './map.js';

const MAX_TICKER_EVENTS = 10;
const MAX_HISTORY_ROWS  = 50;
const MAX_RECONNECT_MS  = 30_000;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pill      = document.getElementById('conn-status');
const lastSeen  = document.getElementById('last-seen');
const eventList = document.getElementById('event-list');
const tbody     = document.getElementById('history-tbody');

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws              = null;
let reconnectDelay  = 1_000;

function connect() {
  const url = `ws://${location.host}/ws`;
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ role: 'browser' }));
    setConnected(true);
    reconnectDelay = 1_000;
  });

  ws.addEventListener('message', ({ data }) => {
    let frame;
    try { frame = JSON.parse(data); } catch { return; }
    handleFrame(frame);
  });

  ws.addEventListener('close', () => {
    setConnected(false);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  });

  // Let the close handler schedule the reconnect
  ws.addEventListener('error', () => ws.close());
}

function setConnected(ok) {
  pill.className = `status-pill ${ok ? 'connected' : 'disconnected'}`;
  pill.textContent = ok ? 'CONNECTED' : 'DISCONNECTED';
}

// ── Frame handler ─────────────────────────────────────────────────────────────
function handleFrame(frame) {
  const ax    = frame.ax    ?? 0;
  const ay    = frame.ay    ?? 0;
  const az    = frame.az    ?? 0;
  const lat   = frame.lat   ?? null;
  const lng   = frame.lng   ?? null;
  const speed = frame.speed ?? null;

  const amag  = Math.sqrt(ax * ax + ay * ay + az * az);
  const pitch = Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);
  const roll  = Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI);

  // Header timestamp
  lastSeen.textContent = `Last seen: ${new Date().toLocaleTimeString()}`;

  // Metric cards
  setText('val-ax',    `${ax.toFixed(3)} g`);
  setText('val-ay',    `${ay.toFixed(3)} g`);
  setText('val-az',    `${az.toFixed(3)} g`);
  setText('val-amag',  `${amag.toFixed(3)} g`);
  setText('val-lat',   lat   != null ? lat.toFixed(6)          : '—');
  setText('val-lng',   lng   != null ? lng.toFixed(6)          : '—');
  setText('val-speed', speed != null ? `${speed.toFixed(1)} km/h` : '—');
  setText('val-pitch', `${pitch.toFixed(1)}°`);
  setText('val-roll',  `${roll.toFixed(1)}°`);

  // Sub-systems
  updateCharts(frame);
  if (lat != null && lng != null) updateMap(frame);

  // Events from this frame
  if (Array.isArray(frame.events)) {
    frame.events.forEach(addToTicker);
  }
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

// ── Event ticker ──────────────────────────────────────────────────────────────
function addToTicker(ev) {
  // Remove placeholder on first real event
  const placeholder = eventList.querySelector('.event-empty');
  if (placeholder) placeholder.remove();

  const ts      = new Date(ev.serverTs ?? Date.now()).toLocaleTimeString();
  const metrics = ev.metrics ?? {};
  const detail  = Object.entries(metrics)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join('  ') || ev.type;

  const li = document.createElement('li');
  li.innerHTML =
    `<span class="event-pill ${ev.type}">${ev.type.replace('_', '\u00a0')}</span>` +
    `<span class="event-ts">${ts}</span>` +
    `<span class="event-meta">${escHtml(detail)}</span>`;

  eventList.prepend(li);

  while (eventList.children.length > MAX_TICKER_EVENTS) {
    eventList.lastElementChild.remove();
  }
}

// ── History table ─────────────────────────────────────────────────────────────
async function loadHistory() {
  let events;
  try {
    const res = await fetch(`/api/events?limit=${MAX_HISTORY_ROWS}`);
    if (!res.ok) return;
    events = await res.json();
  } catch {
    return;
  }

  if (!events.length) return;

  tbody.innerHTML = '';
  events.forEach((ev) => {
    const ts      = new Date(ev.serverTs ?? ev.deviceTs ?? 0).toLocaleString();
    const metrics = ev.metrics ?? {};
    const lat     = metrics.lat;
    const lng     = metrics.lng;
    const gps     = lat != null && lng != null
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : '—';
    const details = Object.entries(metrics)
      .filter(([k]) => k !== 'lat' && k !== 'lng')
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(' ') || '—';

    const sevClass = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[ev.severity] ?? '';

    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escHtml(ts)}</td>` +
      `<td><span class="event-pill ${ev.type}">${ev.type.replace('_', '\u00a0')}</span></td>` +
      `<td class="${sevClass}">${escHtml(ev.severity ?? '—')}</td>` +
      `<td>${escHtml(details)}</td>` +
      `<td>${escHtml(gps)}</td>`;

    tbody.appendChild(tr);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initCharts();
initMap();
loadHistory();
connect();

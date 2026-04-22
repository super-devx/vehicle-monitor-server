import { initCharts, updateCharts } from './charts.js';
import { initMap, updateMap }       from './map.js';

const MAX_TICKER_EVENTS = 10;
const MAX_HISTORY_TOTAL = 500; // in-memory cap
const PAGE_SIZE         = 10;
const MAX_RECONNECT_MS  = 30_000;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pill      = document.getElementById('conn-status');
const lastSeen  = document.getElementById('last-seen');
const eventList = document.getElementById('event-list');
const tbody     = document.getElementById('history-tbody');
const btnPrev   = document.getElementById('btn-prev');
const btnNext   = document.getElementById('btn-next');
const pageInfo  = document.getElementById('page-info');

// ── History state ─────────────────────────────────────────────────────────────
// allHistory is always sorted newest-first.
const allHistory = [];
const historyKeys = new Set(); // Firebase _keys already loaded
let currentPage = 0;

function totalPages() {
  return Math.max(1, Math.ceil(allHistory.length / PAGE_SIZE));
}

function renderPage() {
  const start = currentPage * PAGE_SIZE;
  const slice = allHistory.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = '';
  if (slice.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No history yet.</td></tr>';
  } else {
    slice.forEach((ev) => tbody.appendChild(buildHistoryRow(ev)));
  }

  pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages()}`;
  btnPrev.disabled = currentPage === 0;
  btnNext.disabled = currentPage >= totalPages() - 1;
}

btnPrev.addEventListener('click', () => { currentPage--; renderPage(); });
btnNext.addEventListener('click', () => { currentPage++; renderPage(); });

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws             = null;
let reconnectDelay = 1_000;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);

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

  lastSeen.textContent = `Last seen: ${new Date().toLocaleTimeString()}`;

  setText('val-ax',    `${ax.toFixed(3)} g`);
  setText('val-ay',    `${ay.toFixed(3)} g`);
  setText('val-az',    `${az.toFixed(3)} g`);
  setText('val-amag',  `${amag.toFixed(3)} g`);
  setText('val-lat',   lat   != null ? lat.toFixed(6)             : '—');
  setText('val-lng',   lng   != null ? lng.toFixed(6)             : '—');
  setText('val-speed', speed != null ? `${speed.toFixed(1)} km/h` : '—');
  setText('val-pitch', `${pitch.toFixed(1)}°`);
  setText('val-roll',  `${roll.toFixed(1)}°`);

  updateCharts(frame);
  if (lat != null && lng != null) updateMap(frame);

  if (Array.isArray(frame.events) && frame.events.length > 0) {
    frame.events.forEach((ev) => {
      // Merge frame GPS into event metrics as fallback for ESP32 events that
      // don't include coordinates in their own metrics object.
      const enriched = {
        ...ev,
        metrics: {
          ...(lat  != null && { lat }),
          ...(lng  != null && { lng }),
          ...(speed != null && { speed }),
          ...(ev.metrics ?? {}), // device-supplied metrics take precedence
        },
        serverTs: ev.serverTs ?? frame.serverTs ?? Date.now(),
      };
      addToTicker(enriched);
      insertHistory(enriched, null);
    });
  }
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

// ── Event ticker ──────────────────────────────────────────────────────────────
function addToTicker(ev) {
  const placeholder = eventList.querySelector('.event-empty');
  if (placeholder) placeholder.remove();

  const ts     = new Date(ev.serverTs ?? Date.now()).toLocaleTimeString();
  const detail = fmtMetrics(ev.metrics, /*excludeGps*/ true);

  const li = document.createElement('li');
  li.innerHTML =
    `<span class="event-pill ${ev.type}">${fmtType(ev.type)}</span>` +
    `<span class="event-ts">${ts}</span>` +
    `<span class="event-meta">${escHtml(detail)}</span>`;

  eventList.prepend(li);
  while (eventList.children.length > MAX_TICKER_EVENTS) {
    eventList.lastElementChild.remove();
  }
}

// ── History (in-memory + paginated) ──────────────────────────────────────────
function insertHistory(ev, key) {
  if (key && historyKeys.has(key)) return;
  if (key) historyKeys.add(key);

  // Prepend newest-first; trim tail if over cap
  allHistory.unshift(ev);
  if (allHistory.length > MAX_HISTORY_TOTAL) allHistory.pop();

  // Stay on page 0 for live events; other pages keep their view stable
  if (currentPage === 0) renderPage();
  else {
    // Just update pagination controls so the page count reflects new data
    pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages()}`;
    btnPrev.disabled = currentPage === 0;
    btnNext.disabled = currentPage >= totalPages() - 1;
  }
}

function buildHistoryRow(ev) {
  const ts      = new Date(ev.serverTs ?? ev.deviceTs ?? 0).toLocaleString();
  const metrics = ev.metrics ?? {};
  const lat     = metrics.lat;
  const lng     = metrics.lng;
  const gps     = lat != null && lng != null
    ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
    : '—';
  const details = fmtMetrics(metrics, /*excludeGps*/ true) || '—';
  const sevClass = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[ev.severity] ?? '';

  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td>${escHtml(ts)}</td>` +
    `<td><span class="event-pill ${ev.type}">${fmtType(ev.type)}</span></td>` +
    `<td class="${sevClass}">${escHtml(ev.severity ?? '—')}</td>` +
    `<td>${escHtml(details)}</td>` +
    `<td>${escHtml(gps)}</td>`;
  return tr;
}

async function loadHistory() {
  let events;
  try {
    const res = await fetch(`/api/events?limit=${MAX_HISTORY_TOTAL}`);
    if (!res.ok) return;
    events = await res.json();
  } catch {
    return;
  }

  if (!events.length) return;

  // API returns newest-first; push in order so allHistory stays newest-first
  events.forEach((ev) => {
    const key = ev._key ?? null;
    if (key && historyKeys.has(key)) return;
    if (key) historyKeys.add(key);
    allHistory.push(ev);
  });

  renderPage();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtType(type) {
  return type.replace('_', '\u00a0');
}

// Format metric key=value pairs, optionally skipping lat/lng/speed (shown in GPS col)
function fmtMetrics(metrics, excludeGps = false) {
  if (!metrics) return '—';
  const GPS_KEYS = new Set(['lat', 'lng', 'speed']);
  const entries = Object.entries(metrics)
    .filter(([k]) => !excludeGps || !GPS_KEYS.has(k))
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(3) : v}`);
  return entries.length ? entries.join('  ') : '—';
}

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

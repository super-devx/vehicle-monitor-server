const TRAJECTORY_CAP = 500;

let map        = null;
let marker     = null;
let polyline   = null;
let trajectory = [];
let autoFollow = true;
let firstFix   = false;

// Custom circle marker icon so we don't depend on default Leaflet image assets
function makeIcon() {
  return L.divIcon({
    className: '',
    html: `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
             <circle cx="9" cy="9" r="7" fill="#58a6ff" stroke="#0f1419" stroke-width="2"/>
           </svg>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function buildRecenterControl() {
  const Control = L.Control.extend({
    onAdd() {
      const btn = L.DomUtil.create('button');
      btn.id = 'recenter-btn';
      btn.textContent = '⊕ Recenter';
      btn.title = 'Re-enable auto-follow';
      Object.assign(btn.style, {
        display: 'none',
        padding: '4px 10px',
        fontSize: '12px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: '#1a1f26',
        color: '#58a6ff',
        border: '1px solid #30363d',
        borderRadius: '6px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      });

      L.DomEvent.on(btn, 'click', () => {
        autoFollow = true;
        btn.style.display = 'none';
        if (marker) map.panTo(marker.getLatLng(), { animate: true, duration: 0.5 });
      });

      this._btn = btn;
      return btn;
    },
  });
  return new Control({ position: 'topright' });
}

export function initMap() {
  map = L.map('map', { zoomControl: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  map.setView([0, 0], 2);

  polyline = L.polyline([], {
    color: '#58a6ff',
    weight: 2.5,
    opacity: 0.75,
  }).addTo(map);

  const recenterControl = buildRecenterControl();
  recenterControl.addTo(map);

  // Disable auto-follow on any manual pan and reveal the recenter button
  map.on('dragstart', () => {
    autoFollow = false;
    if (recenterControl._btn) recenterControl._btn.style.display = '';
  });
}

export function updateMap(frame) {
  const { lat, lng } = frame;
  if (lat == null || lng == null) return;
  // Skip null-island (0,0) unless that's a real fix — ESP32 reports 0,0 before lock
  if (lat === 0 && lng === 0) return;

  const latlng = L.latLng(lat, lng);

  if (!firstFix) {
    map.setView(latlng, 16);
    firstFix = true;
  }

  if (!marker) {
    marker = L.marker(latlng, { icon: makeIcon() }).addTo(map);
  } else {
    marker.setLatLng(latlng);
  }

  trajectory.push(latlng);
  if (trajectory.length > TRAJECTORY_CAP) trajectory.shift();
  polyline.setLatLngs(trajectory);

  if (autoFollow) map.panTo(latlng, { animate: true, duration: 0.4 });
}

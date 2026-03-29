// ── State ──
let spots = JSON.parse(localStorage.getItem('geospots') || '[]');
let pendingLatLng = null;
let map, markerClusterLayer, userMarker, contentRadiusCircle, hotspotCircles = [], spotMarkers = [];
let lastKnownPosition = null;
const API_BASE_URL = "http://127.0.0.1:5000";
const CONTENT_UNLOCK_RADIUS_METRES = 50;
const ZOOM_LEVELS = [5,8,10,12,16,18,20];
const ZOOM_RADIUS_MILES = [220, 150, 90, 35, 12, 3, 0.75];
const SAVED_ZOOM_KEY = "dropspot-map-zoom";
const LOCATION_REFRESH_MS = 20000;
const savedZoom = Number.parseInt(localStorage.getItem(SAVED_ZOOM_KEY) || "", 10);
const initialZoom = Number.isFinite(savedZoom) && ZOOM_LEVELS.includes(savedZoom) ? savedZoom : 18;

// ── Init Map ──
map = L.map('map', {
  center: [51.505, -0.09],
  zoom: initialZoom,
  zoomControl: false,
  scrollWheelZoom: false,
  wheelDebounceTime: 80,
  wheelPxPerZoomLevel: 180,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© CartoDB',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

markerClusterLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  maxClusterRadius: 50,
  iconCreateFunction(cluster) {
    const childMarkers = cluster.getAllChildMarkers();
    const containsHotspot = childMarkers.some(marker => marker._isHotspot);
    const count = childMarkers.length;
    const clusterClass = containsHotspot ? 'hotspot-cluster' : 'spot-cluster';

    return L.divIcon({
      html: `
        <div class="${clusterClass}">
          <span>${count}</span>
        </div>
      `,
      className: 'marker-cluster-custom',
      iconSize: [38, 38],
    });
  }
});

map.addLayer(markerClusterLayer);

// ── Snapped scroll zoom (5 levels only) ──
map.getContainer().addEventListener('wheel', (e) => {
  e.preventDefault();
  const current = map.getZoom();
  const idx = ZOOM_LEVELS.reduce((best, lvl, i) =>
    Math.abs(lvl - current) < Math.abs(ZOOM_LEVELS[best] - current) ? i : best, 0);
  const next = e.deltaY < 0
    ? Math.min(idx + 1, ZOOM_LEVELS.length - 1)
    : Math.max(idx - 1, 0);
  if (next !== idx) map.setZoom(ZOOM_LEVELS[next]);
}, { passive: false });


// ── Custom icon factories ──
function makeSpotIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="spot-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  });
}

function makeHotspotIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="hotspot-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  });
}

function makePlacedSpotIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div class="placed-spot">
        <div class="placed-spot-ring"></div>
        <div class="spot-dot"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

function makeYouIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="you-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

async function postJson(path, payload, errorMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return response.json();
}

function createDisplayedSpot(note) {
  return {
    lat: note.latitude,
    lng: note.longitude,
    title: note.title || "Nearby spot",
    text: note.content || "",
    createdAt: note.createdAt || null,
    hotspot: note.hotspot,
    id: note.id || note.noteID || Date.now(),
  };
}

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  const diffMs = Date.now() - timestamp.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function buildExpandableText(className, text, limit) {
  const safeText = String(text || "");
  const preview = safeText.length > limit
    ? `${safeText.slice(0, limit).trimEnd()}...`
    : safeText;

  if (!safeText || safeText.length <= limit || safeText === "Locked!") {
    return `<div class="${className}">${escHtml(safeText)}</div>`;
  }

  return `
    <div class="popup-expandable">
      <div class="${className} popup-preview">${escHtml(preview)}</div>
      <div class="${className} popup-full">${escHtml(safeText)}</div>
      <button class="popup-toggle" type="button" onclick="toggleExpandable(this)">Show more</button>
    </div>
  `;
}

function toggleExpandable(button) {
  const wrapper = button.closest('.popup-expandable');

  if (!wrapper) {
    return;
  }

  wrapper.classList.toggle('open');
  button.textContent = wrapper.classList.contains('open') ? 'Show less' : 'Show more';
}

function getCurrentRadiusMiles() {
  const currentZoom = map.getZoom();
  const idx = ZOOM_LEVELS.reduce((best, lvl, i) =>
    Math.abs(lvl - currentZoom) < Math.abs(ZOOM_LEVELS[best] - currentZoom) ? i : best, 0);
  return ZOOM_RADIUS_MILES[idx];
}

function getNearestZoomIndex(zoom) {
  return ZOOM_LEVELS.reduce((best, lvl, i) =>
    Math.abs(lvl - zoom) < Math.abs(ZOOM_LEVELS[best] - zoom) ? i : best, 0);
}

// ── Zoom slider ──
const zoomSlider = document.getElementById('zoom-slider');

function updateSliderUI(idx) {
  zoomSlider.value = idx;
}

zoomSlider.addEventListener('input', () => {
  const idx = +zoomSlider.value;
  localStorage.setItem(SAVED_ZOOM_KEY, String(ZOOM_LEVELS[idx]));
  map.setZoom(ZOOM_LEVELS[idx]);
  updateSliderUI(idx);
});

map.on('zoomend', () => {
  const current = map.getZoom();
  const idx = getNearestZoomIndex(current);
  localStorage.setItem(SAVED_ZOOM_KEY, String(ZOOM_LEVELS[idx]));
  updateSliderUI(idx);

  if (lastKnownPosition) {
    refreshNearbySpots();
  }
});

map.on('moveend', () => {
  if (lastKnownPosition) {
    refreshNearbySpots();
  }
});

updateSliderUI(getNearestZoomIndex(initialZoom));

async function refreshNearbySpots() {
  if (!lastKnownPosition) {
    return;
  }

  const center = map.getCenter();
  const result = await fetchNearbySpots(center.lat, center.lng);
  displayNearbyNotes(result.notes || []);
}

function applyLocationUpdate(lat, lon, recenter) {
  lastKnownPosition = { lat, lng: lon };

  if (userMarker) {
    map.removeLayer(userMarker);
  }

  if (contentRadiusCircle) {
    map.removeLayer(contentRadiusCircle);
  }

  userMarker = L.marker([lat, lon], { icon: makeYouIcon(), zIndexOffset: 1000 }).addTo(map);
  contentRadiusCircle = L.circle([lat, lon], {
    radius: CONTENT_UNLOCK_RADIUS_METRES,
    color: '#e8ff47',
    weight: 1.5,
    opacity: 0.9,
    dashArray: '6 6',
    fillColor: '#e8ff47',
    fillOpacity: 0.08,
    interactive: false
  }).addTo(map);

  if (recenter) {
    map.flyTo([lat, lon], map.getZoom(), { duration: 1.2 });
  }
  console.log("user location", lat, lon);
}

async function refreshUserLocation(options = {}) {
  const { recenter = false, refreshHotspots = false } = options;

  if (!navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      applyLocationUpdate(lat, lon, recenter);

      if (refreshHotspots) {
        await updateHotspots(lat, lon);
      }

      await refreshNearbySpots();
    },
    () => {
      if (recenter) {
        toast('Could not get location.');
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

setInterval(() => {
  refreshUserLocation();
}, LOCATION_REFRESH_MS);


// ── Locate user ──
function locateMe(options = {}) {
  const { recenter = true } = options;

  if (!navigator.geolocation) return toast('Geolocation not supported.');
  refreshUserLocation({ recenter, refreshHotspots: true });
}

// find nearby notes

async function fetchNearbySpots(lat, lon) {
  const bounds = map.getBounds();

  try {
    return await postJson(
      "/api/spots/nearby",
      {
        latitude: lat,
        longitude: lon,
        userLatitude: lastKnownPosition?.lat,
        userLongitude: lastKnownPosition?.lng,
        radiusMiles: getCurrentRadiusMiles(),
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      },
      "Failed to fetch spots"
    );
  } catch (error) {
    console.error("Error fetching nearby spots:", error);
    return { notes: [] };
  }
}

async function updateHotspots(lat, lon) {
  try {
    return await postJson(
      "/api/hotspots/update",
      { latitude: lat, longitude: lon },
      "Failed to update hotspots"
    );
  } catch (error) {
    console.error("Error updating hotspots:", error);
    return null;
  }
}


function displayNearbyNotes(notes) {
  // Remove old markers from the map
  markerClusterLayer.clearLayers();
  spotMarkers = [];

  // Add new markers
  notes.forEach(note => addMarker(createDisplayedSpot(note)));

  console.log(notes);
}



// ── Modal ──
function openSpotModal() {
  if (!lastKnownPosition) {
    toast('Getting your location, please wait...');
    locateMe();
    return;
  }

  pendingLatLng = lastKnownPosition;
  document.getElementById('modal-coords').textContent = 'at your current location';
  document.getElementById('spot-title').value = '';
  document.getElementById('spot-description').value = '';
  document.getElementById('spot-modal').classList.add('open');
  setTimeout(() => document.getElementById('spot-title').focus(), 150);
}

function closeModal() {
  document.getElementById('spot-modal').classList.remove('open');
  pendingLatLng = null;
}

// Close modal on overlay click
document.getElementById('spot-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Save spot ──

async function handleSaveSpot() {
  const title = document.getElementById('spot-title').value.trim();
  const description = document.getElementById('spot-description').value.trim();

  if (!title || !description) {
    toast("Add both a title and description.");
    return;
  }

  // Use your existing stored location
  const lat = lastKnownPosition.lat;
  const lon = lastKnownPosition.lng;

  const savedSpot = await saveSpot(title, description, lat, lon);

  if (!savedSpot) {
    return;
  }

  const spot = {
    id: Date.now(),
    lat: savedSpot.latitude,
    lng: savedSpot.longitude,
    title: savedSpot.title,
    text: savedSpot.description,
    createdAt: savedSpot.createdAt,
    hotspot: savedSpot.hotspot,
    isFresh: true
  };

  spots.push(spot);
  localStorage.setItem('geospots', JSON.stringify(spots));
  addMarker(spot);
  updateStats();
  toast("Spot saved! 📍");
  closeModal();
}

async function saveSpot(title, description, lat, lon) {
  try {
    const data = await postJson(
      "/api/spots",
      {
        title: title,
        description: description,
        latitude: lat,
        longitude: lon
      },
      "Failed to save spot"
    );
    return data.spot;
  } catch (error) {
    console.error("Error saving spot:", error);
    toast("Failed to save spot");
    return null;
  }
}

// ── Add Marker ──
function addMarker(spot) {
  const relativeTime = formatRelativeTime(spot.createdAt);
  const popupHtml = `
    ${buildExpandableText("popup-title", spot.title || "Nearby spot", 36)}
    ${buildExpandableText("popup-spot-text", spot.text || "", 120)}
    ${relativeTime ? `<div class="popup-meta">${escHtml(relativeTime)}</div>` : ""}
  `;

  const icon = spot.hotspot
    ? makeHotspotIcon()
    : spot.isFresh
      ? makePlacedSpotIcon()
      : makeSpotIcon();

  const marker = L.marker([spot.lat, spot.lng], { icon })
    .bindPopup(popupHtml);
  marker._isHotspot = Boolean(spot.hotspot);
  markerClusterLayer.addLayer(marker);
  marker._spotId = spot.id;
  spotMarkers.push(marker);
}

// ── Render Sidebar ──
function renderSidebar() {
  return;
}

function toggleDropdown() {
  document.getElementById('dropdown-menu').classList.toggle('open');
}

// Close if user clicks anywhere else on the page
document.addEventListener('click', (e) => {
  const wrapper = document.querySelector('.dropdown-wrapper');
  if (!wrapper.contains(e.target)) {
    document.getElementById('dropdown-menu').classList.remove('open');
  }
});

function accountSettings() {
  window.location.href = "/account";
  toggleDropdown();
}

function logOut() {
  window.location.href = "/logout";
}

function flyTo(lat, lng, id) {
  map.flyTo([lat, lng], 10, { duration: 0.8 });
  const marker = spotMarkers.find(m => m._spotId === id);
  if (marker) setTimeout(() => marker.openPopup(), 900);
}



function updateStats() {
  return;
}

// ── Clear All ──
// update to include backend

function clearAll() {
  if (!confirm('Delete all spots? This cannot be undone.')) return;
  spots = [];
  localStorage.removeItem('geospots');
  markerClusterLayer.clearLayers();
  spotMarkers = [];
  hotspotCircles.forEach(c => map.removeLayer(c));
  hotspotCircles = [];
  renderSidebar();
  updateStats();
  toast('All spots cleared.');
}

// ── Toast ──
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init: load saved spots ──
spots.forEach(n => addMarker(n));
renderSidebar();
updateStats();

// Auto-locate on load
locateMe();

// ── State ──
let spots = JSON.parse(localStorage.getItem('geospots') || '[]');
let pendingLatLng = null;
let map, userMarker, hotspotCircles = [], spotMarkers = [];
let lastKnownPosition = null;
const API_BASE_URL = "http://127.0.0.1:5000";

// ── Init Map ──
map = L.map('map', {
  center: [51.505, -0.09],
  zoom: 13,
  zoomControl: true,
  wheelDebounceTime: 80,
  wheelPxPerZoomLevel: 180,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© CartoDB',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);


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
    text: note.content || "Nearby spot",
    time: note.content || "",
    hotspot: note.hotspot,
    id: note.id || note.noteID || Date.now(),
  };
}

// ── Locate user ──
function locateMe() {
  if (!navigator.geolocation) return toast('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    lastKnownPosition = { lat, lng: lon };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lon], { icon: makeYouIcon(), zIndexOffset: 1000 }).addTo(map);
    map.flyTo([lat, lon], 15, { duration: 1.2 });
    toast('📍 Location found!');
    await updateHotspots(lat, lon);
    const result = await fetchNearbySpots(lat, lon);
    displayNearbyNotes(result.notes || []);
  }, () => toast('Could not get location.'));

    
}

// find nearby notes

async function fetchNearbySpots(lat, lon) {
  try {
    return await postJson(
      "/api/spots/nearby",
      { latitude: lat, longitude: lon },
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
  spotMarkers.forEach(m => map.removeLayer(m));
  spotMarkers = [];

  // Add new markers
  notes.forEach(note => addMarker(createDisplayedSpot(note)));

  console.log(notes);
  toast(`${notes.length} nearby notes added`);
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
  document.getElementById('spot-text').value = '';
  document.getElementById('spot-modal').classList.add('open');
  setTimeout(() => document.getElementById('spot-text').focus(), 150);
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
  const text = document.getElementById('spot-text').value.trim();

  if (!text) {
    toast("Please write something first!");
    return;
  }

  // Use your existing stored location
  const lat = lastKnownPosition.lat;
  const lon = lastKnownPosition.lng;

  const savedSpot = await saveSpot(text, lat, lon);

  if (!savedSpot) {
    return;
  }

  const spot = {
    id: Date.now(),
    lat: savedSpot.latitude,
    lng: savedSpot.longitude,
    text: savedSpot.content,
    time: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
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

async function saveSpot(content, lat, lon) {
  try {
    const data = await postJson(
      "/api/spots",
      {
        content: content,
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
  const popupHtml = `
    <div class="popup-spot-text">${escHtml(spot.text)}</div>
    <div class="popup-meta">${spot.time}</div>
  `;

  const icon = spot.hotspot
    ? makeHotspotIcon()
    : spot.isFresh
      ? makePlacedSpotIcon()
      : makeSpotIcon();

  const marker = L.marker([spot.lat, spot.lng], { icon })
    .addTo(map)
    .bindPopup(popupHtml);
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
  toast('Account settings coming soon.');
  window.location.href = "accountDetails.html";
  toggleDropdown();
}

function logOut() {
  window.location.href = "/logout";
}

function flyTo(lat, lng, id) {
  map.flyTo([lat, lng], 16, { duration: 0.8 });
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
  spotMarkers.forEach(m => map.removeLayer(m));
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

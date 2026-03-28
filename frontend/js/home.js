// ── State ──
let spots = JSON.parse(localStorage.getItem('geospots') || '[]');
let pendingLatLng = null;
let map, userMarker, hotspotCircles = [], spotMarkers = [];
let lastKnownPosition = null;

// ── Init Map ──
map = L.map('map', {
  center: [51.505, -0.09],
  zoom: 13,
  zoomControl: true,
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

function makeYouIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="you-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

// ── Locate user ──
function locateMe() {
  if (!navigator.geolocation) return toast('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    lastKnownPosition = { lat : lat, lng: lon};
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
        const response = await fetch("http://127.0.0.1:5000/api/spots/nearby", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                latitude: lat,
                longitude: lon
            })
        });

        if (!response.ok) {
            throw new Error("Failed to fetch spots");
        }

        const data = await response.json();
        return data;

    } catch (error) {
            console.error("Error fetching nearby spots:", error);
            return { notes: [] };
    }
}

async function updateHotspots(lat, lon) {
    try {
        const response = await fetch("http://127.0.0.1:5000/api/hotspots/update", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                latitude: lat,
                longitude: lon
            })
        });

        if (!response.ok) {
            throw new Error("Failed to update hotspots");
        }

        return await response.json();
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
    notes.forEach(note => addMarker({
      lat: note.latitude,
      lng: note.longitude,
      text: "Nearby spot",
      time: "Loaded from backend",
      hotspot: false
    }));

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

  const spot = {
    id: Date.now(),
    lat: lat,
    lng: lon,
    text: text,
    time: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
    hotspot: false
  };

  spots.push(spot);
  localStorage.setItem('geospots', JSON.stringify(spots));
  addMarker(spot);
  updateStats();
  toast("Spot saved! 📍");
  closeModal();
}

// ── Add Marker ──
function addMarker(spot) {
  const popupHtml = `
    <div class="popup-spot-text">${escHtml(spot.text)}</div>
    <div class="popup-meta">${spot.time}</div>
  `;
    if (spot.hotspot == true) {
    const marker = L.marker([spot.lat, spot.lng], { icon: makeHotspotIcon() })
        .addTo(map)
        .bindPopup(popupHtml);
    marker._spotId = spot.id;
    spotMarkers.push(marker);

    }
    else {
    const marker = L.marker([spot.lat, spot.lng], { icon: makeSpotIcon() })
        .addTo(map)
        .bindPopup(popupHtml);
    marker._spotId = spot.id;
    spotMarkers.push(marker);
    }
}

// ── Render Sidebar ──
function renderSidebar() {
  const list = document.getElementById('spots-list');
  if (spots.length == 0) {
    list.innerHTML = `<div class="empty-state"> </div>`;
    return;
  }
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
  // your logic here
  toast('Account settings coming soon.');
  window.location.href = "accountDetails.html";
  toggleDropdown();
}

function logOut() {
  // your logic here
  toast('Logged out.');
  toggleDropdown();
}

function flyTo(lat, lng, id) {
  map.flyTo([lat, lng], 16, { duration: 0.8 });
  const marker = spotMarkers.find(m => m._spotId === id);
  if (marker) setTimeout(() => marker.openPopup(), 900);
}



function updateStats() {
  document.getElementById('spot-count').textContent = spots.length;
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
  document.getElementById('hotspot-count').textContent = 0;
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

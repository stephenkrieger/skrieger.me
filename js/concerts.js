// ── Configuration ──
const API_KEY = "ITPPjNZjJ7cpmAnAVhJG3XEcPZnMOpDJ";

const DEFAULT_ARTISTS = [
  { name: "St. Lucia", keyword: "St. Lucia" },
  { name: "Arcade Fire", keyword: "Arcade Fire" },
  { name: "The War on Drugs", keyword: "The War on Drugs" },
];

const STORAGE_KEY = "concertTracker_artists";
const LOCATION_KEY = "concertTracker_location";
const RADIUS_KEY = "concertTracker_radius";

const DEFAULT_LOCATION = {
  name: "Richmond, VA",
  latlong: "37.5407,-77.4360",
};
const DEFAULT_RADIUS = 150;
const RADIUS_UNIT = "miles";

const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

// ── Auth State ──
let currentUser = null;

// ── In-memory prefs cache (populated from Firestore or localStorage) ──
let prefsCache = null;

// ── Firebase helpers ──
function isFirebaseAvailable() {
  return typeof firebase !== "undefined" && firebase.apps.length > 0 &&
    firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY";
}

function getUserDocRef(uid) {
  return db.collection("users").doc(uid);
}

// ── Load prefs from Firestore into cache + localStorage ──
async function loadPrefsFromFirestore(uid) {
  const doc = await getUserDocRef(uid).get();
  if (doc.exists) {
    const data = doc.data();
    prefsCache = {
      artists: data.artists || DEFAULT_ARTISTS,
      location: data.location || DEFAULT_LOCATION,
      radius: data.radius != null ? data.radius : DEFAULT_RADIUS,
      emailOptIn: data.emailOptIn || false,
    };
    // Sync back to localStorage for offline use
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefsCache.artists));
    localStorage.setItem(LOCATION_KEY, JSON.stringify(prefsCache.location));
    localStorage.setItem(RADIUS_KEY, prefsCache.radius);
    return true; // doc existed
  }
  return false; // first sign-in, no doc yet
}

// ── Save full prefs to Firestore ──
async function savePrefsToFirestore() {
  if (!currentUser) return;
  const data = {
    artists: getArtists(),
    location: getLocation(),
    radius: getRadius(),
    email: currentUser.email,
    displayName: currentUser.displayName || "",
    emailOptIn: prefsCache ? prefsCache.emailOptIn : false,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await getUserDocRef(currentUser.uid).set(data, { merge: true });
}

// ── Save a single field to Firestore ──
async function saveFieldToFirestore(field, value) {
  if (!currentUser) return;
  const update = {
    [field]: value,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await getUserDocRef(currentUser.uid).set(update, { merge: true });
}

// ── Artist Storage ──
function getArtists() {
  if (prefsCache) return prefsCache.artists;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ARTISTS));
  return DEFAULT_ARTISTS;
}

function saveArtists(artists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artists));
  if (prefsCache) prefsCache.artists = artists;
  if (currentUser) saveFieldToFirestore("artists", artists);
}

function addArtist(name, keyword) {
  const artists = getArtists();
  if (artists.some((a) => a.keyword.toLowerCase() === keyword.toLowerCase())) {
    return; // already tracked
  }
  artists.push({ name, keyword });
  saveArtists(artists);
  renderTrackedArtists();
  loadConcerts();
}

function removeArtist(keyword) {
  const artists = getArtists().filter(
    (a) => a.keyword.toLowerCase() !== keyword.toLowerCase()
  );
  saveArtists(artists);
  renderTrackedArtists();
  loadConcerts();
}

// ── Location & Radius Storage ──
function getLocation() {
  if (prefsCache) return prefsCache.location;
  const stored = localStorage.getItem(LOCATION_KEY);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(LOCATION_KEY, JSON.stringify(DEFAULT_LOCATION));
  return DEFAULT_LOCATION;
}

function saveLocation(location) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  if (prefsCache) prefsCache.location = location;
  if (currentUser) saveFieldToFirestore("location", location);
}

function getRadius() {
  if (prefsCache) return prefsCache.radius;
  const stored = localStorage.getItem(RADIUS_KEY);
  if (stored) return parseInt(stored, 10);
  localStorage.setItem(RADIUS_KEY, DEFAULT_RADIUS);
  return DEFAULT_RADIUS;
}

function saveRadius(radius) {
  localStorage.setItem(RADIUS_KEY, radius);
  if (prefsCache) prefsCache.radius = radius;
  if (currentUser) saveFieldToFirestore("radius", radius);
}

// ── Geocode city name via OpenStreetMap Nominatim ──
async function geocodeCity(cityName) {
  const params = new URLSearchParams({
    q: cityName,
    format: "json",
    limit: 1,
    countrycodes: "us",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { "User-Agent": "skrieger.me-concert-tracker" } }
  );

  if (!response.ok) throw new Error("Geocoding failed");

  const results = await response.json();
  if (results.length === 0) throw new Error("City not found");

  return {
    name: results[0].display_name.split(",").slice(0, 2).join(",").trim(),
    latlong: `${results[0].lat},${results[0].lon}`,
  };
}

// ── Ticketmaster: Fetch events for a single artist ──
async function fetchArtistEvents(artist) {
  const location = getLocation();
  const radius = getRadius();
  const params = new URLSearchParams({
    apikey: API_KEY,
    keyword: artist.keyword,
    latlong: location.latlong,
    radius: radius,
    unit: RADIUS_UNIT,
    classificationName: "music",
    sort: "date,asc",
    size: 20,
  });

  const response = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const events = data._embedded?.events || [];

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    date: event.dates?.start?.localDate || "TBD",
    time: event.dates?.start?.localTime || null,
    venue: event._embedded?.venues?.[0]?.name || "Venue TBA",
    city: event._embedded?.venues?.[0]?.city?.name || "",
    state: event._embedded?.venues?.[0]?.state?.stateCode || "",
    url: event.url,
  }));
}

// ── Ticketmaster: Search for artists ──
async function searchArtists(query) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    keyword: query,
    classificationName: "music",
    sort: "relevance,desc",
    size: 8,
  });

  const response = await fetch(
    `${TICKETMASTER_BASE}/attractions.json?${params}`
  );

  if (!response.ok) return [];

  const data = await response.json();
  return (data._embedded?.attractions || []).map((a) => ({
    name: a.name,
    id: a.id,
  }));
}

// ── Debounce helper ──
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Format a date string nicely ──
function formatDate(dateStr, timeStr) {
  if (dateStr === "TBD") return "Date TBD";

  const date = new Date(dateStr + "T" + (timeStr || "00:00:00"));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Render one artist's section ──
function renderArtistSection(artist, events) {
  const section = document.createElement("div");
  section.className = "artist-section";

  const heading = document.createElement("h2");
  heading.textContent = artist.name;
  section.appendChild(heading);

  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "no-events";
    empty.textContent = "No upcoming events found nearby.";
    section.appendChild(empty);
    return section;
  }

  for (const event of events) {
    const card = document.createElement("div");
    card.className = "event-card";

    card.innerHTML = `
      <div class="event-date">${formatDate(event.date, event.time)}</div>
      <div class="event-venue">${event.venue}</div>
      <div class="event-location">${event.city}${event.state ? ", " + event.state : ""}</div>
      ${event.url ? `<a class="event-link" href="${event.url}" target="_blank" rel="noopener">Get Tickets &rarr;</a>` : ""}
    `;

    section.appendChild(card);
  }

  return section;
}

// ── Render tracked artist chips ──
function renderTrackedArtists() {
  const container = document.getElementById("tracked-artists");
  const artists = getArtists();

  container.innerHTML = "";
  for (const artist of artists) {
    const chip = document.createElement("span");
    chip.className = "artist-chip";
    chip.innerHTML = `${artist.name}<button class="chip-remove" aria-label="Remove ${artist.name}">&times;</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      removeArtist(artist.keyword);
    });
    container.appendChild(chip);
  }
}

// ── Render search results dropdown ──
function renderSearchResults(results) {
  const container = document.getElementById("search-results");
  const tracked = getArtists();

  if (results.length === 0) {
    container.innerHTML = '<div class="search-no-results">No artists found</div>';
    container.classList.add("visible");
    return;
  }

  container.innerHTML = "";
  for (const result of results) {
    const alreadyTracked = tracked.some(
      (a) => a.keyword.toLowerCase() === result.name.toLowerCase()
    );
    const item = document.createElement("div");
    item.className = "search-result-item" + (alreadyTracked ? " already-tracked" : "");
    item.textContent = result.name;

    if (alreadyTracked) {
      const badge = document.createElement("span");
      badge.className = "tracked-badge";
      badge.textContent = "Added";
      item.appendChild(badge);
    } else {
      item.addEventListener("click", () => {
        addArtist(result.name, result.name);
        document.getElementById("artist-search").value = "";
        container.classList.remove("visible");
      });
    }

    container.appendChild(item);
  }
  container.classList.add("visible");
}

// ── Update the subtitle with current location/radius ──
function updateSubtitle() {
  const subtitle = document.getElementById("subtitle");
  if (!subtitle) return;
  const location = getLocation();
  const radius = getRadius();
  subtitle.textContent = `Currently viewing all shows within ${radius} miles of ${location.name}`;
}

// ── Auth UI ──
function setupAuth() {
  if (!isFirebaseAvailable()) {
    const overlay = document.getElementById("sidebar-overlay");
    if (overlay) overlay.classList.add("hidden");
    return;
  }

  const signInBtn = document.getElementById("sign-in-btn");
  const signOutBtn = document.getElementById("sign-out-btn");
  const userInfo = document.getElementById("user-info");
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");
  const emailOptInWrapper = document.getElementById("email-optin-wrapper");
  const emailOptIn = document.getElementById("email-optin");

  signInBtn.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider);
  });

  signOutBtn.addEventListener("click", () => {
    auth.signOut();
  });

  emailOptIn.addEventListener("change", (e) => {
    if (prefsCache) prefsCache.emailOptIn = e.target.checked;
    if (currentUser) {
      saveFieldToFirestore("emailOptIn", e.target.checked);
      saveFieldToFirestore("email", currentUser.email);
    }
  });

  const sidebarOverlay = document.getElementById("sidebar-overlay");

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      document.getElementById("signin-modal").classList.remove("hidden");
    });
    sidebarOverlay.style.cursor = "pointer";
  }

  document.getElementById("signin-modal-yes").addEventListener("click", () => {
    document.getElementById("signin-modal").classList.add("hidden");
    auth.signInWithPopup(googleProvider);
  });

  document.getElementById("signin-modal-no").addEventListener("click", () => {
    document.getElementById("signin-modal").classList.add("hidden");
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (user) {
      // Show user info, hide sign-in button
      signInBtn.style.display = "none";
      userInfo.style.display = "flex";
      userAvatar.src = user.photoURL || "";
      userAvatar.style.display = user.photoURL ? "block" : "none";
      userName.textContent = user.displayName || user.email;
      if (sidebarOverlay) sidebarOverlay.classList.add("hidden");
      closeMobileSidebar();

      // Load prefs from Firestore
      const existed = await loadPrefsFromFirestore(user.uid);

      if (!existed) {
        // First sign-in: migrate localStorage prefs up to Firestore
        prefsCache = {
          artists: getArtists(),
          location: getLocation(),
          radius: getRadius(),
          emailOptIn: false,
        };
        await savePrefsToFirestore();
      }

      // Update UI with loaded prefs
      emailOptIn.checked = prefsCache.emailOptIn;
      applyPrefsToUI();
      renderTrackedArtists();
      loadConcerts();
    } else {
      // Signed out
      signInBtn.style.display = "inline-flex";
      userInfo.style.display = "none";
      prefsCache = null;
      if (sidebarOverlay) sidebarOverlay.classList.remove("hidden");

      // Revert to localStorage prefs
      applyPrefsToUI();
      renderTrackedArtists();
      loadConcerts();
    }
  });
}

// ── Apply current prefs (from cache or localStorage) to sidebar UI ──
function applyPrefsToUI() {
  const locationInput = document.getElementById("location-input");
  const radiusSlider = document.getElementById("radius-slider");
  const radiusValue = document.getElementById("radius-value");

  const location = getLocation();
  const radius = getRadius();

  locationInput.value = location.name;
  radiusSlider.value = radius;
  radiusValue.textContent = `${radius} mi`;
  updateSubtitle();
}

// ── Setup sidebar interactions ──
function setupSidebar() {
  const searchInput = document.getElementById("artist-search");
  const resultsContainer = document.getElementById("search-results");

  // Artist search
  const handleSearch = debounce(async (query) => {
    if (query.length < 2) {
      resultsContainer.classList.remove("visible");
      return;
    }
    const results = await searchArtists(query);
    renderSearchResults(results);
  }, 350);

  searchInput.addEventListener("input", (e) => {
    handleSearch(e.target.value.trim());
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".artist-search-wrapper")) {
      resultsContainer.classList.remove("visible");
    }
  });

  // Location
  const locationInput = document.getElementById("location-input");
  const locationSetBtn = document.getElementById("location-set");
  const locationCurrent = document.getElementById("location-current");
  const location = getLocation();
  locationInput.value = location.name;
  locationCurrent.textContent = "";

  async function setLocation() {
    const city = locationInput.value.trim();
    if (!city) return;
    locationCurrent.textContent = "Looking up...";
    try {
      const loc = await geocodeCity(city);
      saveLocation(loc);
      locationInput.value = loc.name;
      locationCurrent.textContent = "";
      updateSubtitle();
      loadConcerts();
    } catch (err) {
      locationCurrent.textContent = "City not found. Try again.";
    }
  }

  locationSetBtn.addEventListener("click", setLocation);
  locationInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setLocation();
  });

  // Radius slider
  const radiusSlider = document.getElementById("radius-slider");
  const radiusValue = document.getElementById("radius-value");
  const currentRadius = getRadius();
  radiusSlider.value = currentRadius;
  radiusValue.textContent = `${currentRadius} mi`;

  radiusSlider.addEventListener("input", (e) => {
    radiusValue.textContent = `${e.target.value} mi`;
  });

  radiusSlider.addEventListener("change", (e) => {
    saveRadius(parseInt(e.target.value, 10));
    updateSubtitle();
    loadConcerts();
  });

  renderTrackedArtists();
  updateSubtitle();
}

// ── Main: load and render concerts ──
async function loadConcerts() {
  const container = document.getElementById("events");

  if (API_KEY === "YOUR_API_KEY_HERE") {
    container.innerHTML = `
      <div class="error-message">
        <strong>API key needed.</strong> Get a free key from
        <a href="https://developer.ticketmaster.com/" target="_blank" rel="noopener">developer.ticketmaster.com</a>
        and set it in <code>js/concerts.js</code>.
      </div>
    `;
    return;
  }

  const artists = getArtists();

  if (artists.length === 0) {
    container.innerHTML = '<div class="no-events">No artists tracked. Search for artists in the sidebar to get started.</div>';
    return;
  }

  container.innerHTML = '<div class="loading">Loading upcoming events&hellip;</div>';

  try {
    const results = await Promise.allSettled(
      artists.map((artist) =>
        fetchArtistEvents(artist).then((events) => ({ artist, events }))
      )
    );

    container.innerHTML = "";

    for (const result of results) {
      if (result.status === "fulfilled") {
        container.appendChild(
          renderArtistSection(result.value.artist, result.value.events)
        );
      } else {
        const artist = artists[results.indexOf(result)];
        const section = document.createElement("div");
        section.className = "artist-section";
        section.innerHTML = `
          <h2>${artist.name}</h2>
          <p class="error-message">Failed to load events. Try refreshing.</p>
        `;
        container.appendChild(section);
      }
    }
  } catch (err) {
    container.innerHTML = `<div class="error-message">Something went wrong loading events. Please try again later.</div>`;
  }
}

// ── Mobile Sidebar Toggle ──
function setupSidebarToggle() {
  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    toggle.classList.toggle("active");
  });

  // Close sidebar when tapping the backdrop (the ::before pseudo-element)
  sidebar.addEventListener("click", (e) => {
    if (e.target === sidebar) {
      sidebar.classList.remove("open");
      toggle.classList.remove("active");
    }
  });
}

function closeMobileSidebar() {
  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("open");
  if (toggle) toggle.classList.remove("active");
}

// ── Init ──
setupSidebar();
setupSidebarToggle();
setupAuth();
loadConcerts();

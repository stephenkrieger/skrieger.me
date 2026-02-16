// ── Configuration ──
const API_KEY = "ITPPjNZjJ7cpmAnAVhJG3XEcPZnMOpDJ";

const DEFAULT_ARTISTS = [
  { name: "St. Lucia", keyword: "St. Lucia" },
  { name: "Arcade Fire", keyword: "Arcade Fire" },
  { name: "The War on Drugs", keyword: "The War on Drugs" },
];

const STORAGE_KEY = "concertTracker_artists";

// Richmond, VA coordinates
const LATLONG = "37.5407,-77.4360";
const RADIUS = 150;
const RADIUS_UNIT = "miles";

const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

// ── Artist Storage ──
function getArtists() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ARTISTS));
  return DEFAULT_ARTISTS;
}

function saveArtists(artists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artists));
}

function addArtist(name, keyword) {
  const artists = getArtists();
  if (artists.some((a) => a.keyword.toLowerCase() === keyword.toLowerCase())) {
    return; // already tracked
  }
  artists.push({ name, keyword });
  saveArtists(artists);
  updateArtistsListText();
  renderTrackedArtists();
  loadConcerts();
}

function removeArtist(keyword) {
  const artists = getArtists().filter(
    (a) => a.keyword.toLowerCase() !== keyword.toLowerCase()
  );
  saveArtists(artists);
  updateArtistsListText();
  renderTrackedArtists();
  loadConcerts();
}

// ── Ticketmaster: Fetch events for a single artist ──
async function fetchArtistEvents(artist) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    keyword: artist.keyword,
    latlong: LATLONG,
    radius: RADIUS,
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

// ── Update the header artist list text ──
function updateArtistsListText() {
  const el = document.getElementById("artists-list");
  const artists = getArtists();
  el.textContent = artists.map((a) => a.name).join(" \u00B7 ") || "No artists tracked";
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

// ── Setup artist panel interactions ──
function setupArtistPanel() {
  const btn = document.getElementById("edit-artists-btn");
  const panel = document.getElementById("artist-panel");
  const searchInput = document.getElementById("artist-search");
  const resultsContainer = document.getElementById("search-results");

  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    btn.textContent = panel.classList.contains("open") ? "Done" : "Edit Artists";
  });

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

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".artist-search-wrapper")) {
      resultsContainer.classList.remove("visible");
    }
  });

  updateArtistsListText();
  renderTrackedArtists();
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
    container.innerHTML = '<div class="no-events">No artists tracked. Click "Edit Artists" to add some.</div>';
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

// ── Init ──
setupArtistPanel();
loadConcerts();

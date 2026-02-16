// ── Configuration ──
// Replace with your Ticketmaster API key from https://developer.ticketmaster.com/
const API_KEY = "ITPPjNZjJ7cpmAnAVhJG3XEcPZnMOpDJ";

const ARTISTS = [
  { name: "St. Lucia", keyword: "St. Lucia" },
  { name: "Arcade Fire", keyword: "Arcade Fire" },
  { name: "The War on Drugs", keyword: "The War on Drugs" },
];

// Richmond, VA coordinates
const LATLONG = "37.5407,-77.4360";
const RADIUS = 150;
const RADIUS_UNIT = "miles";

const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";

// ── Fetch events for a single artist ──
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

  const response = await fetch(`${TICKETMASTER_BASE}?${params}`);

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

// ── Main ──
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

  try {
    const results = await Promise.allSettled(
      ARTISTS.map((artist) =>
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
        const artist = ARTISTS[results.indexOf(result)];
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

loadConcerts();

# skrieger.me

Personal website hosted on GitHub Pages with a custom domain.

## Stack
- Pure HTML, CSS, vanilla JavaScript — no frameworks or build tools
- GitHub Pages for hosting
- Cloudflare for DNS

## Structure
```
index.html          # Landing page (skrieger.me)
concerts/index.html # Concert tracker (skrieger.me/concerts/)
css/style.css       # Shared styles (dark theme, responsive)
js/concerts.js      # Concert tracker logic
CNAME               # GitHub Pages custom domain
```

## Concert Tracker
- Uses Ticketmaster Discovery API (client-side, free tier)
- Shows upcoming events within 150 miles of Richmond, VA
- Default artists: St. Lucia, Arcade Fire, The War on Drugs
- API key is stored as a constant in js/concerts.js

### Artist Management
- Persistent left sidebar (220px) with search input and tracked artist chips (always visible)
- Main content area fills remaining browser width (no max-width cap)
- Search uses Ticketmaster `/discovery/v2/attractions` endpoint (debounced, 350ms)
- Tracked artists stored in **localStorage** (`concertTracker_artists` key)
- On first visit, localStorage is seeded with the 3 default artists
- Adding/removing an artist auto-saves and re-fetches events immediately
- On mobile (<640px), sidebar stacks above the main content

## Deployment
- Repo: https://github.com/stephenkrieger/skrieger.me
- Push to `main` triggers GitHub Pages rebuild
- DNS managed via Cloudflare (A records + CNAME, DNS only / grey cloud)
- HTTPS enforced via GitHub Pages settings

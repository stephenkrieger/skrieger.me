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
- Users can search, add, and remove tracked artists via an "Edit Artists" panel
- Search uses Ticketmaster `/discovery/v2/attractions` endpoint (debounced, 350ms)
- Tracked artists are stored in **localStorage** (`concertTracker_artists` key)
- On first visit, localStorage is seeded with the 3 default artists
- Adding/removing an artist auto-saves and re-fetches events immediately
- UI: toggle panel with "Edit Artists" button, search input with dropdown results, artist chips with remove buttons

## Deployment
- Repo: https://github.com/stephenkrieger/skrieger.me
- Push to `main` triggers GitHub Pages rebuild
- DNS managed via Cloudflare (A records + CNAME, DNS only / grey cloud)
- HTTPS enforced via GitHub Pages settings

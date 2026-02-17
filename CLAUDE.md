# skrieger.me

Personal website hosted on GitHub Pages with a custom domain.

## Stack
- Pure HTML, CSS, vanilla JavaScript — no frameworks or build tools
- GitHub Pages for hosting
- Cloudflare for DNS
- Firebase Spark (free): Auth (Google sign-in) + Firestore (user preferences)
- GitHub Actions: scheduled weekly email digest (Fridays 10am ET)
- Resend (free tier): sends digest emails

## Structure
```
index.html                         # Landing page (skrieger.me)
concerts/index.html                # Concert tracker (skrieger.me/concerts/)
css/style.css                      # Shared styles (dark theme, responsive)
js/firebase-config.js              # Public Firebase client config
js/concerts.js                     # Concert tracker logic + Firebase auth/sync
email/package.json                 # Digest script dependencies (firebase-admin, resend)
email/digest.mjs                   # Weekly digest: Firestore → Ticketmaster → Resend
.github/workflows/weekly-digest.yml # Cron job: every Friday 2pm UTC / 10am ET
CNAME                              # GitHub Pages custom domain
```

## Concert Tracker
The Concert Tracker is an attempt to very easily see favorite artists and upcoming concerts without having to subscribe to each individual artist's email distribution list. The app allows someone to authenticate, list their favorite artists, and then see if there are any upcoming shows within drivable distance (< 300 miles) from their selected location. Visitors also have the ability to receive a weekly email digest summarizing upcoming shows based on their search preferences.

- Uses Ticketmaster Discovery API (client-side, free tier)
- Shows upcoming events within 150 miles of Richmond, VA
- Default artists: St. Lucia, Arcade Fire, The War on Drugs
- Ticketmaster API key is stored as a constant in js/concerts.js

### Auth & Preference Sync
- Google sign-in via Firebase Auth (header button, avatar + name when signed in)
- Sidebar controls (artist search, tracking, location, distance, email opt-in) are visible but blocked by a semi-transparent blurred overlay until the user signs in
- Clicking the overlay opens a modal prompting the user to sign in with Google or dismiss
- Default artist events still load in the main area so visitors can preview the app
- If Firebase config is a placeholder, the overlay is hidden so localStorage dev flow still works
- Signed-in users' prefs sync to Firestore (`users/{uid}` doc)
- In-memory `prefsCache` populated from Firestore on sign-in
- `save*` functions dual-write to localStorage AND Firestore when signed in
- First sign-in migrates existing localStorage prefs up to Firestore
- Return sign-in loads Firestore prefs into cache + localStorage

### Artist Management
- Persistent left sidebar (220px) with search input and tracked artist chips (visible but gated behind sign-in overlay)
- Main content area fills remaining browser width (no max-width cap)
- Search uses Ticketmaster `/discovery/v2/attractions` endpoint (debounced, 350ms)
- Tracked artists stored in localStorage + Firestore (when signed in)
- On first visit, localStorage is seeded with the 3 default artists
- Adding/removing an artist auto-saves and re-fetches events immediately
- On mobile (≤640px), sidebar becomes a bottom-sheet drawer (fixed bottom, max-height 70vh, rounded top corners)
- Floating action button (52px circle, bottom-right) toggles the drawer open/closed
- Backdrop overlay dims background when drawer is open; tapping it dismisses the drawer
- Drawer auto-closes on sign-in so it doesn't block the main content
- All interactive elements meet 44px minimum touch target on mobile
- Sign-in modal has 1rem margin to prevent overflow on narrow (320px) screens
- Header row (← Home + auth button) is sticky at the top on mobile for always-accessible navigation

### Location & Distance
- Configurable location via city name input in the sidebar (default: Richmond, VA)
- Geocoding via OpenStreetMap Nominatim API (free, no key needed)
- Distance slider (25–300 miles, default 150)
- Both persist in localStorage + Firestore (when signed in)
- Subtitle updates dynamically to reflect current location and radius

### Weekly Email Digest
- Sidebar checkbox "Weekly digest of new shows" (only visible when signed in)
- `emailOptIn` boolean saved to Firestore user doc
- GitHub Actions cron runs `email/digest.mjs` every Friday 10am ET
- Script reads opted-in users from Firestore, queries Ticketmaster, diffs against `seenEvents/{uid}` to find new events, sends personalized HTML email via Resend
- Dark-themed email matching the site's look

### Firestore Schema
```
users/{uid}: artists, location, radius, email, emailOptIn, displayName, updatedAt
seenEvents/{uid}: eventIds[], updatedAt  (admin-only, written by digest script)
```

### GitHub Secrets Required
- `FIREBASE_SERVICE_ACCOUNT` — service account JSON for Firebase Admin SDK
- `RESEND_API_KEY` — Resend API key for sending emails
- `TICKETMASTER_API_KEY` — Ticketmaster Discovery API key

## Deployment
- Repo: https://github.com/stephenkrieger/skrieger.me
- Push to `main` triggers GitHub Pages rebuild
- DNS managed via Cloudflare (A records + CNAME, DNS only / grey cloud)
- HTTPS enforced via GitHub Pages settings

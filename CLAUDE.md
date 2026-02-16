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
- Artists: St. Lucia, Arcade Fire, The War on Drugs
- API key is stored as a constant in js/concerts.js

## Deployment
- Repo: https://github.com/stephenkrieger/skrieger.me
- Push to `main` triggers GitHub Pages rebuild
- DNS managed via Cloudflare (A records + CNAME, DNS only / grey cloud)
- HTTPS enforced via GitHub Pages settings

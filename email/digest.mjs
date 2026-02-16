import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";

// ── Config from environment ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const FROM_EMAIL = "Concert Tracker <concerts@skrieger.me>";
const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

// ── Init services ──
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const resend = new Resend(RESEND_API_KEY);

// ── Fetch events from Ticketmaster for one artist ──
async function fetchEvents(artist, location, radius) {
  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    keyword: artist.keyword,
    latlong: location.latlong,
    radius: String(radius),
    unit: "miles",
    classificationName: "music",
    sort: "date,asc",
    size: "20",
  });

  const res = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`);
  if (!res.ok) {
    console.error(`Ticketmaster error for "${artist.name}": ${res.status}`);
    return [];
  }

  const data = await res.json();
  return (data._embedded?.events || []).map((e) => ({
    id: e.id,
    name: e.name,
    date: e.dates?.start?.localDate || "TBD",
    time: e.dates?.start?.localTime || null,
    venue: e._embedded?.venues?.[0]?.name || "Venue TBA",
    city: e._embedded?.venues?.[0]?.city?.name || "",
    state: e._embedded?.venues?.[0]?.state?.stateCode || "",
    url: e.url,
    artist: artist.name,
  }));
}

// ── Format date for email ──
function formatDate(dateStr) {
  if (dateStr === "TBD") return "Date TBD";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Build HTML email ──
function buildEmailHtml(userName, newEvents) {
  const eventRows = newEvents
    .map(
      (e) => `<tr>
      <td style="padding:6px 16px;border-bottom:1px solid #2a2a2a;">
        <span style="color:#7eb8da;font-size:12px;font-weight:600;">${formatDate(e.date)}</span>
        <span style="color:#fff;font-size:13px;"> ${e.name}</span>
        <span style="color:#666;font-size:12px;"> — ${e.venue}, ${e.city}${e.state ? " " + e.state : ""}</span>
        ${e.url ? ` <a href="${e.url}" style="color:#7eb8da;font-size:12px;text-decoration:none;">[Tickets]</a>` : ""}
      </td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #2a2a2a;">
            <span style="color:#fff;font-size:16px;font-weight:700;">Concert Tracker</span>
            <span style="color:#888;font-size:13px;"> — Hey ${userName}, new shows for your artists:</span>
          </td>
        </tr>
        ${eventRows}
        <tr>
          <td style="padding:10px 16px;color:#555;font-size:11px;">
            Opted in at <a href="https://skrieger.me/concerts/" style="color:#7eb8da;text-decoration:none;">skrieger.me/concerts</a>. Uncheck "Weekly digest" to stop.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main ──
async function main() {
  console.log("Starting weekly digest...");

  // Get all opted-in users
  const usersSnap = await db
    .collection("users")
    .where("emailOptIn", "==", true)
    .get();

  if (usersSnap.empty) {
    console.log("No opted-in users. Done.");
    return;
  }

  console.log(`Found ${usersSnap.size} opted-in user(s).`);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const user = userDoc.data();
    const { artists = [], location, radius = 150, email, displayName } = user;

    if (!email || artists.length === 0) {
      console.log(`Skipping ${uid}: no email or artists.`);
      continue;
    }

    console.log(`Processing ${displayName || email} (${artists.length} artists)...`);

    // Fetch all events for this user's artists
    const allEvents = [];
    for (const artist of artists) {
      const events = await fetchEvents(artist, location, radius);
      allEvents.push(...events);
      // Small delay to respect Ticketmaster rate limits
      await new Promise((r) => setTimeout(r, 250));
    }

    // Get previously seen event IDs
    const seenDoc = await db.collection("seenEvents").doc(uid).get();
    const seenIds = new Set(seenDoc.exists ? seenDoc.data().eventIds || [] : []);

    // Filter to new events only
    const newEvents = allEvents.filter((e) => !seenIds.has(e.id));

    if (newEvents.length === 0) {
      console.log(`  No new events for ${displayName || email}.`);
    } else {
      console.log(`  ${newEvents.length} new event(s). Sending email...`);

      const html = buildEmailHtml(displayName || "there", newEvents);

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `${newEvents.length} new show${newEvents.length === 1 ? "" : "s"} near ${location?.name || "you"}`,
        html,
      });

      console.log(`  Email sent to ${email}.`);
    }

    // Update seen events with ALL current event IDs (new + old still active)
    const currentIds = allEvents.map((e) => e.id);
    await db.collection("seenEvents").doc(uid).set({
      eventIds: currentIds,
      updatedAt: new Date(),
    });
  }

  console.log("Weekly digest complete.");
}

main().catch((err) => {
  console.error("Digest failed:", err);
  process.exit(1);
});

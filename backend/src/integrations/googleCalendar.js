// The one deliberate exception to "no storage elsewhere": a Google OAuth
// refresh token has to live somewhere for the backend to act on your
// calendar without you re-authenticating on every request. It's stored as
// an environment variable on your hosting platform (Render/Railway) — not
// in a database, not duplicated anywhere — the same way GITHUB_TOKEN and
// NOTION_API_KEY already are. See README for the reasoning.

const { google } = require("googleapis");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
}

// Exchanges the one-time OAuth code for tokens. Call this once (via
// /auth/google/callback) and copy the returned refresh_token into
// GOOGLE_REFRESH_TOKEN in your hosting dashboard.
async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, ... }
}

function getAuthedClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN not set — complete the /auth/google flow first.");
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

async function listUpcomingEvents(maxResults = 20) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items || []).map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    link: e.htmlLink,
  }));
}

// Creates a calendar event for a study session or a topic's start date —
// called from routes/calendar.js, e.g. when a new topic is added.
async function createEvent({ title, description, startISO, endISO }) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    },
  });
  return res.data;
}

module.exports = { getAuthUrl, exchangeCodeForTokens, listUpcomingEvents, createEvent };

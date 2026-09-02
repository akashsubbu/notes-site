const express = require("express");
const gcal = require("../integrations/googleCalendar");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /auth/google — visit this URL in a browser (not from the frontend
// app) once, to authorize. No auth token needed here since you're not
// logged into your own API yet at this point.
router.get("/auth/google", (req, res) => {
  res.redirect(gcal.getAuthUrl());
});

// GET /auth/google/callback — Google redirects here after you approve
// access. Prints the refresh token once so you can copy it into
// GOOGLE_REFRESH_TOKEN in your hosting dashboard. It is NOT saved anywhere
// by this server — copy it immediately, then this page is useless.
router.get("/auth/google/callback", async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing ?code from Google.");
    const tokens = await gcal.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return res.send(
        "No refresh_token returned — Google only sends one the first time you authorize. " +
        "Revoke this app's access at https://myaccount.google.com/permissions and try /auth/google again."
      );
    }
    res.send(
      `<pre style="font-family:monospace;white-space:pre-wrap;padding:24px;">` +
      `Copy this into GOOGLE_REFRESH_TOKEN in your Render/Railway dashboard, then redeploy:\n\n` +
      `${tokens.refresh_token}\n\n` +
      `This page will not show it again.</pre>`
    );
  } catch (err) {
    next(err);
  }
});

// Everything below requires the API auth token (called from your frontend).
router.use("/api/calendar", requireAuth);

router.get("/api/calendar/events", async (req, res, next) => {
  try {
    res.json(await gcal.listUpcomingEvents());
  } catch (err) {
    next(err);
  }
});

// POST /api/calendar/events { title, description, startISO, endISO }
router.post("/api/calendar/events", async (req, res, next) => {
  try {
    const { title, description, startISO, endISO } = req.body;
    if (!title || !startISO || !endISO) {
      return res.status(400).json({ error: "title, startISO, endISO are required." });
    }
    const event = await gcal.createEvent({ title, description, startISO, endISO });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

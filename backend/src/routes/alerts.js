const express = require("express");
const notion = require("../integrations/notion");
const cache = require("../lib/cache");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const PUSHED_ALERTS_KEY = "alerts:pushed";
const PUSHED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — just so pushed alerts don't linger forever in memory

function getPushedAlerts() {
  return cache.get(PUSHED_ALERTS_KEY) || [];
}
function setPushedAlerts(list) {
  cache.set(PUSHED_ALERTS_KEY, list, PUSHED_TTL);
}

// Derives alert-worthy conditions from current Notion state. This is
// intentionally simple to start — extend the two checks below with
// whatever actually matters to you (e.g. read a topic's Post-Mortem.md via
// github.js and alert if the same mistake keeps recurring).
async function computeAlerts() {
  const courses = await notion.getCourses();
  const alerts = [];
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  for (const course of courses) {
    const { topics } = await notion.getTopicsForCourse(course.notionPageId);
    for (const t of topics) {
      if (t.status === "not started" && t.startDate) {
        const age = now - new Date(t.startDate).getTime();
        if (age > 3 * DAY) {
          alerts.push({
            id: `overdue:${t.notionPageId}`,
            type: "overdue_start",
            severity: "warning",
            course: course.name,
            topic: t.name,
            message: `"${t.name}" (${course.name}) was scheduled to start ${Math.floor(age / DAY)} day(s) ago and hasn't been started.`,
          });
        }
      }
      if (t.mastery === "none" && t.startDate) {
        const age = now - new Date(t.startDate).getTime();
        if (age > 7 * DAY) {
          alerts.push({
            id: `stuck:${t.notionPageId}`,
            type: "mastery_stuck",
            severity: "info",
            course: course.name,
            topic: t.name,
            message: `"${t.name}" (${course.name}) has been at mastery "none" for over a week.`,
          });
        }
      }
    }
  }
  return alerts;
}

// GET /api/alerts — have your local AI poll this (e.g. every 30 min). It
// decides how to actually notify you (voice, desktop toast, whatever) —
// this endpoint just tells it what's alert-worthy right now.
router.get("/", async (req, res, next) => {
  try {
    const computed = await computeAlerts();
    const pushed = getPushedAlerts();
    res.json([...computed, ...pushed]);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/webhook — your local AI calls this to push a custom
// alert (e.g. something it noticed scanning the vault that Notion doesn't
// track). Held in memory only, cleared on restart — not a database.
router.post("/webhook", (req, res) => {
  const { message, severity = "info", source = "local-ai" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required." });

  const alert = { id: `pushed:${Date.now()}`, type: "pushed", severity, source, message, createdAt: new Date().toISOString() };
  const list = getPushedAlerts();
  list.push(alert);
  setPushedAlerts(list);
  res.json({ ok: true, alert });
});

// POST /api/alerts/:id/ack — dismiss a pushed alert once handled.
router.post("/:id/ack", (req, res) => {
  const list = getPushedAlerts().filter((a) => a.id !== req.params.id);
  setPushedAlerts(list);
  res.json({ ok: true });
});

module.exports = router;

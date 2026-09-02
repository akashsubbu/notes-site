require("dotenv").config();
const express = require("express");
const cors = require("cors");

const coursesRoute = require("./routes/courses");
const topicsRoute = require("./routes/topics");
const calendarRoute = require("./routes/calendar");
const alertsRoute = require("./routes/alerts");
const quickNoteRoute = require("./routes/quickNote");

const app = express();

app.use(express.json({ limit: "15mb" })); // generous limit for post-mortem image uploads

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // Allow no-origin requests (curl, server-to-server, your local AI script).
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS.`));
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// topicsRoute mounted BEFORE coursesRoute deliberately: both share the
// `/api/courses` prefix, and courses.js's router.use(requireAuth) has no
// path filter, so it would otherwise intercept every request under that
// prefix — including deeply nested topic/attachment paths — before Express
// ever reaches topicsRoute's own (differently-authed) attachment route.
app.use("/api/courses/:courseName/topics", topicsRoute);
app.use("/api/courses", coursesRoute);
app.use("/api/quick-note", quickNoteRoute);
app.use("/api/alerts", alertsRoute);
app.use("/", calendarRoute); // mounts /auth/google, /auth/google/callback, /api/calendar/*

// Central error handler — every route above calls next(err) on failure.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notes site backend listening on port ${PORT}`);
});

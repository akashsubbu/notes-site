# Notes site backend

A stateless Express API that sits between your frontend (the React site) and
three external systems:

- **Notion** — course/topic tracking metadata only (status, mastery, dates).
- **GitHub** — your Obsidian vault, synced to a repo. This is where all
  actual note content lives, and the only place this backend writes new
  content to.
- **Google Calendar** — read/create events.
- **Your local AI** (e.g. Ollama) — polls `/api/alerts` and can push custom
  alerts back via a webhook.

## Why this architecture, specifically

You asked for Obsidian to be the *only* place memory/notes live, with no
duplicate storage elsewhere. Concretely, that means:

- There is **no database**. Nothing here is Postgres/Mongo/SQLite.
- The only "storage" is a tiny in-memory cache (`src/lib/cache.js`) with a
  60-second TTL, used purely to avoid hammering the Notion/GitHub APIs. It
  holds nothing that isn't already recoverable from Notion or GitHub, and it
  evaporates on every restart or redeploy.
- Every write (mastery, status, post-mortem entries, quick notes) goes
  either to Notion (metadata only) or as a real Git commit to your Obsidian
  vault repo (actual content). Nothing is copied into a separate store.
- The one necessary exception is credentials themselves (API keys, the
  Google refresh token) — those have to live somewhere for the server to
  authenticate on your behalf. They're environment variables on your hosting
  platform, not a database, and contain no note content.

## Setup

### 1. Notion

1. Go to https://www.notion.so/my-integrations, create an internal
   integration, copy the secret into `NOTION_API_KEY`.
2. Open your `Courses` and `Topics` databases in Notion, click **Share**,
   and add the integration to both.
3. Copy each database's ID from its URL (the 32-character string) into
   `NOTION_COURSES_DB_ID` / `NOTION_TOPICS_DB_ID`.

### 2. GitHub (your Obsidian vault)

This assumes your Obsidian vault already syncs to a GitHub repo (the
standard Obsidian Git plugin workflow) — per the site's schema, the vault
follows the `COMPUTING/<Course>/<Topic>/*.md` structure.

1. Create a fine-grained personal access token at
   https://github.com/settings/tokens with **Contents: Read and write**
   access scoped to just that one repo.
2. Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`.
3. Set `GITHUB_VAULT_ROOT` to the folder inside the repo that's the vault
   root (e.g. `COMPUTING`), or leave blank if the repo root *is* the vault.

### 3. Google Calendar

1. In https://console.cloud.google.com/apis/credentials, create an OAuth
   2.0 Client ID (type: **Web application**).
2. Add `https://<your-backend-url>/auth/google/callback` as an authorized
   redirect URI, and set the same value as `GOOGLE_REDIRECT_URI`.
3. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. **After deploying** (step 5 below), visit
   `https://<your-backend-url>/auth/google` in a browser, approve access,
   and copy the refresh token shown on the callback page into
   `GOOGLE_REFRESH_TOKEN` in your hosting dashboard, then redeploy.

### 4. Your local AI (alerts)

No credentials needed on the backend side. Point your local script at:

```
GET  https://<your-backend-url>/api/alerts
     Authorization: Bearer <API_AUTH_TOKEN>
```

Poll this on whatever cadence you want. It returns computed conditions
(topics overdue, mastery stuck) plus anything pushed via the webhook below.
Your local AI decides how to actually notify you — voice, desktop toast,
whatever you wire up locally; this backend only tells it what's alert-worthy.

To push a custom alert the other direction:

```
POST https://<your-backend-url>/api/alerts/webhook
     Authorization: Bearer <API_AUTH_TOKEN>
     Content-Type: application/json

     { "message": "...", "severity": "info" }
```

### 5. Deploy (Render or Railway)

Both work the same way for this project:

1. Push this `backend/` folder to a GitHub repo (can be the same repo as
   your frontend, or separate).
2. On Render: **New → Web Service** → connect the repo → set:
   - Build command: `npm install`
   - Start command: `npm start`
3. On Railway: **New Project → Deploy from GitHub repo** — it auto-detects
   Node and runs `npm start`.
4. In either dashboard, add every variable from `.env.example` under
   **Environment Variables** (do not commit a real `.env` file — it's
   already excluded from version control below).
5. Deploy. Your backend is now live at a URL like
   `https://your-app.onrender.com`, reachable from any device.
6. Set `ALLOWED_ORIGINS` to your frontend's actual URL once you know it, so
   only your site can call this API from a browser.

### 6. Point the frontend at it

The frontend (`frontend/src/api.js`, `App.jsx`) already calls this API for
real — no wiring needed. Set `VITE_API_BASE` (this backend's URL) and
`VITE_API_TOKEN` (matching `API_AUTH_TOKEN` above) as build-time values —
see the root `README.md`.

The API auth token has to live in the frontend's environment/build config —
since this is a personal site, embedding it in a client-side build is an
acceptable tradeoff, but be aware it's visible to anyone who inspects your
site's network requests. If that matters to you, the next step would be
adding a lightweight login (e.g. a password gate) in front of the frontend
itself.

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Uptime check |
| GET | `/api/courses` | Bearer | All courses + topic metadata |
| GET | `/api/courses/:courseName` | Bearer | One course + topics |
| GET | `/api/courses/:courseName/topics/:topicName` | Bearer | Topic metadata + all 4 note files from the vault |
| PATCH | `/api/courses/:courseName/topics/:topicName/mastery` | Bearer | `{ mastery }` → writes to Notion |
| PATCH | `/api/courses/:courseName/topics/:topicName/status` | Bearer | `{ status }` → writes to Notion |
| POST | `/api/courses/:courseName/topics/:topicName/post-mortem` | Bearer | `{ text?, file? }` → commits to the vault |
| DELETE | `/api/courses/:courseName/topics/:topicName/post-mortem/:entryId` | Bearer | Rewrites `Post-Mortem.md` in the vault minus that entry (and its attachment, if any) |
| POST | `/api/quick-note` | Bearer | `{ courseName, text }` → appends to `<course>/Inbox.md` in the vault |
| GET | `/api/alerts` | Bearer | Computed + pushed alerts, for your local AI to poll |
| POST | `/api/alerts/webhook` | Bearer | `{ message, severity? }` → push a custom alert |
| POST | `/api/alerts/:id/ack` | Bearer | Dismiss a pushed alert |
| GET | `/api/calendar/events` | Bearer | Upcoming Google Calendar events |
| POST | `/api/calendar/events` | Bearer | `{ title, description, startISO, endISO }` → create an event |
| GET | `/auth/google` | none (visit in browser once) | Starts the Google OAuth flow |
| GET | `/auth/google/callback` | none | Shows the refresh token to copy into your env vars |

## What's genuinely still open

- **Alert conditions are minimal on purpose.** Only "topic overdue" and
  "mastery stuck" are computed. Extend `computeAlerts()` in
  `src/routes/alerts.js` with whatever actually matters to you — e.g. reading
  a topic's `Post-Mortem.md` via `github.js` to alert on a recurring mistake.
- **Post-mortem entry ids are positional, not stored.** `removePostMortemEntry`
  really deletes from the vault (rewrites `Post-Mortem.md` minus the entry),
  but it matches by the "pm-N" id computed fresh from the current file on
  every parse. An entry added client-side earlier in the same session,
  before the topic is reloaded from the backend, won't have a matching id
  yet — the frontend surfaces this as an alert rather than silently
  no-op'ing. Giving entries a real stored id (e.g. a UUID in the heading
  line) would close this fully if it ever becomes annoying.
- **Frontend auth.** The bearer token protects the API; it doesn't put a
  login screen in front of the website itself — `VITE_API_TOKEN` is baked
  into the public build. Worth adding a login gate if this becomes
  reachable by anyone who finds the URL.

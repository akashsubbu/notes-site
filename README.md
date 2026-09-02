# COMPUTING notes site — combined project

```
notes-site-project/
├── frontend/     the React site (Vite) — currently runs on local seed data
├── backend/      the Express API — Notion + GitHub/Obsidian + Calendar + alerts
└── .github/workflows/deploy.yml    builds & deploys frontend/ to GitHub Pages
```

This README is the step-by-step for getting from "two folders of code" to
"a live website on any device, hosted via GitHub." Do the steps in order —
each one depends on the last.

## Step 1 — Push this to GitHub

```bash
cd notes-site-project
git init
git add .
git commit -m "Initial combined project"
gh repo create notes-site --public --source=. --push
# or, without the gh CLI: create a repo on github.com, then
#   git remote add origin https://github.com/<you>/notes-site.git
#   git push -u origin main
```

Note the repo name you chose — you'll need it twice below.

## Step 2 — Deploy the backend (Render or Railway)

Full detail is in `backend/README.md`; the short version:

1. On Render: **New → Web Service** → connect this repo → set **Root
   Directory** to `backend` → build command `npm install` → start command
   `npm start`.
   On Railway: **New Project → Deploy from GitHub repo** → set the service's
   root directory to `backend`.
2. Add every variable from `backend/.env.example` in the dashboard's
   environment variables screen (`NOTION_API_KEY`, `GITHUB_TOKEN`,
   `GOOGLE_CLIENT_ID`, `API_AUTH_TOKEN`, etc. — see `backend/README.md` for
   where each one comes from).
3. Deploy. You'll get a URL like `https://notes-site-backend.onrender.com`.
   **Copy this URL** — you need it in Step 4.
4. Visit `https://<that-url>/health` in a browser — you should see
   `{"ok":true,...}`. If not, check the platform's deploy logs.
5. Visit `https://<that-url>/auth/google` once to complete the Google
   Calendar OAuth flow, copy the refresh token it shows you into
   `GOOGLE_REFRESH_TOKEN` in the dashboard, redeploy.

## Step 3 — Set the GitHub Pages base path

Open `.github/workflows/deploy.yml` and change:

```yaml
BASE_PATH: /REPO_NAME/
```

to your actual repo name from Step 1, e.g. `/notes-site/`. Commit and push
that change.

## Step 4 — Add repo secrets (only needed once you wire in live data)

The workflow already passes `VITE_API_BASE` / `VITE_API_TOKEN` through as
build-time secrets, even though the site doesn't use them yet (see "Wiring
in live data" below). Set them now so they're ready:

1. On GitHub: repo → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. Add `VITE_API_BASE` = your backend URL from Step 2.
3. Add `VITE_API_TOKEN` = the same value as `API_AUTH_TOKEN` you set on the
   backend.

## Step 5 — Turn on GitHub Pages

1. Repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not
   "Deploy from a branch" — the workflow handles the build itself).
3. Push any commit to `main` (or go to **Actions** tab → select the
   workflow → **Run workflow**) to trigger the first deploy.
4. Once the workflow finishes (green check in the **Actions** tab), your
   site is live at:

   ```
   https://<your-github-username>.github.io/<repo-name>/
   ```

   That's a real public URL — open it on your phone, another laptop,
   anywhere. This is "launch it as a website," done.

## Step 6 — (Optional) custom domain

Repo → **Settings → Pages → Custom domain** → enter your domain, add the
DNS records GitHub shows you at your domain registrar. If you do this,
change `BASE_PATH` back to `/` in the workflow (custom domains serve from
the root, not a `/repo-name/` subpath) and re-run the workflow.

## Live data is wired in

`frontend/src/App.jsx` now talks to the real backend — this isn't future
work anymore. Concretely:

- On mount, it fetches real courses/topics from `/api/courses`. If
  `VITE_API_BASE` isn't set (or the request fails), it falls back to the
  built-in seed data automatically — the site never breaks, it just runs
  locally-only until the backend is configured.
- Opening a topic lazy-fetches its 4 note files + post-mortem entries via
  `/api/courses/:courseName/topics/:topicName` (note content still isn't
  bundled into the course list, by design — see `backend/README.md`).
- Mastery and status changes `PATCH` the backend immediately (optimistic —
  the local UI updates right away; if the save fails you'll see an alert,
  but the local value stays changed rather than silently reverting).
- Adding/deleting a course or topic, generating notes with AI, logging a
  post-mortem entry, and **deleting** a post-mortem entry all write straight
  to Notion/GitHub through the backend, with a local-only fallback when no
  backend is configured. Deleting a post-mortem entry rewrites
  `Post-Mortem.md` in the vault minus that entry (see `backend/README.md`
  for the one edge case worth knowing: an entry added earlier in the same
  session that hasn't been reloaded from the backend yet won't have a
  matching id to delete by until you reopen the topic).

**Frontend auth is a build-time secret, not a login screen:** the API token
lives in `VITE_API_TOKEN` and gets baked into the built JS bundle — anyone
who inspects your live site's network requests can see it. That's an
accepted tradeoff for a personal single-user site; if you want a real login
screen in front of the site instead, that's worth adding back.

To actually use this: set `VITE_API_BASE` (your deployed backend URL) and
`VITE_API_TOKEN` (matching `API_AUTH_TOKEN` on the backend) as GitHub repo
secrets — see Step 4 above — then redeploy.

## Keeping frontend and backend in sync going forward

- Any push to `main` that touches `frontend/**` re-triggers the GitHub Pages
  deploy automatically (see the `paths:` filter in the workflow).
- The backend redeploys automatically too, if your Render/Railway service
  is connected to this same repo with **Root Directory** set to `backend` —
  pushes to `backend/**` trigger their own redeploy independent of the
  frontend one.

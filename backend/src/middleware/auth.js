// Simple shared-secret auth. This is a personal, single-user backend, not a
// multi-tenant API — a bearer token is enough. Rotate API_AUTH_TOKEN in your
// hosting dashboard if it ever leaks; nothing else needs to change.

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!process.env.API_AUTH_TOKEN) {
    console.warn("[auth] API_AUTH_TOKEN is not set — refusing all requests until it is.");
    return res.status(500).json({ error: "Server misconfigured: API_AUTH_TOKEN not set." });
  }

  if (token !== process.env.API_AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized. Send 'Authorization: Bearer <API_AUTH_TOKEN>'." });
  }

  next();
}

module.exports = { requireAuth };

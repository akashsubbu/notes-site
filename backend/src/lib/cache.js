// A tiny in-memory, TTL-based cache — deliberately NOT a database.
// It exists only to avoid hammering the Notion/GitHub APIs on every request;
// it holds nothing that isn't already recoverable from Notion or GitHub, and
// it evaporates on every server restart or redeploy. This is the mechanism
// that lets the backend stay stateless: Obsidian (via GitHub) and Notion
// remain the only durable stores.

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { get, set, invalidate };

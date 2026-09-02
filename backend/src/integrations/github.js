// This module IS the connection to Obsidian. Your vault syncs to this GitHub
// repo (that's the standard Obsidian <-> Git workflow); the backend reads
// and writes files here directly, so the vault stays the single source of
// truth for all note content. Nothing gets copied into a separate database.

const { Octokit } = require("@octokit/rest");
const { parsePostMortemEntries, serializePostMortemEntries } = require("../lib/postMortemParser");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const VAULT_ROOT = process.env.GITHUB_VAULT_ROOT || "";

function vaultPath(...segments) {
  return [VAULT_ROOT, ...segments].filter(Boolean).join("/");
}

const NOTE_FILES = [
  "Summary and pointers.md",
  "Understanding and Edge Cases.md",
  "Active Recall Quiz.md",
  "Additional Pointers.md",
];

// Reads one file's raw text. Returns null if the file doesn't exist yet —
// per the schema, not every topic has all 4 files (e.g. assignments may
// skip the quiz), so a missing file is expected, not an error.
async function readFile(path) {
  try {
    const res = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    if (Array.isArray(res.data)) throw new Error(`${path} is a directory, not a file`);
    return Buffer.from(res.data.content, "base64").toString("utf-8");
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Fetches all 4 note files for one topic in parallel.
async function getTopicNotes(courseName, topicName) {
  const base = vaultPath(courseName, topicName);
  const entries = await Promise.all(
    NOTE_FILES.map(async (filename) => [filename.replace(".md", ""), await readFile(`${base}/${filename}`)])
  );
  return Object.fromEntries(entries);
}

// Writes/updates a single file. Used for mastery-driven quiz uploads, quick
// notes, and post-mortem entries — always a real commit to the vault repo,
// never a write to any other storage.
async function writeFile(path, content, message) {
  let sha;
  try {
    const existing = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    if (!Array.isArray(existing.data)) sha = existing.data.sha;
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  return octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: BRANCH,
    sha,
  });
}

// Appends a timestamped line to a quick-capture inbox file rather than
// creating a new file per note — mirrors jotting into a running Obsidian
// note during a lecture.
async function appendToInbox(courseName, text) {
  const path = vaultPath(courseName, "Inbox.md");
  const existing = (await readFile(path)) || `# Inbox\n\n`;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const updated = `${existing.trimEnd()}\n\n- **${stamp}** — ${text}\n`;
  await writeFile(path, updated, `Quick note: ${text.slice(0, 60)}`);
  return updated;
}

// Post-mortem entries (text + optional image/document) get committed
// straight into the vault under the topic's own Post-Mortem.md and an
// attachments folder — so mistake logs live in Obsidian too, not a database.
async function appendPostMortemEntry(courseName, topicName, { text, file }) {
  const notePath = vaultPath(courseName, topicName, "Post-Mortem.md");
  const existing = (await readFile(notePath)) || `# Post-Mortem\n\n`;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);

  let attachmentLine = "";
  if (file) {
    const attachmentPath = vaultPath(courseName, topicName, "attachments", file.name);
    const base64 = file.dataUrl.split(",")[1] || file.dataUrl; // strip data: URL prefix if present
    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: attachmentPath,
      message: `Post-mortem attachment: ${file.name}`,
      content: base64,
      branch: BRANCH,
    });
    attachmentLine = file.type === "image" ? `\n\n![[${file.name}]]` : `\n\n[[${file.name}]]`;
  }

  const updated = `${existing.trimEnd()}\n\n### ${stamp}\n${text || ""}${attachmentLine}\n`;
  await writeFile(notePath, updated, `Post-mortem entry — ${topicName}`);
  return updated;
}

// Deletes a single file if it exists; silently no-ops if it's already gone.
// Used to clean up a post-mortem attachment when its entry is removed.
async function deleteFile(path, message) {
  try {
    const existing = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    if (Array.isArray(existing.data)) return;
    await octokit.repos.deleteFile({ owner: OWNER, repo: REPO, path, message, sha: existing.data.sha, branch: BRANCH });
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

// Closes the gap flagged in the frontend (removePostMortemEntry previously
// only hid an entry in the browser): re-parses Post-Mortem.md fresh, drops
// the matching entry, and rewrites the whole file — entries are appended to
// one running file with no per-entry address, so a real delete means
// rebuilding the file minus one block, same approach writeTopicNotes uses
// for full-file rewrites elsewhere in this module.
//
// `entryId` is the positional "pm-N" id from parsePostMortemEntries. That id
// is recomputed on every parse rather than stored, so this only finds a
// match for entries the frontend actually loaded from the backend (via
// GET .../topics/:topicName) — an entry added client-side in the same
// session and not yet reloaded won't have a matching id yet. Returns null
// (not a thrown error) when no match is found, so the route can 404 cleanly
// instead of writing an unchanged file.
async function removePostMortemEntry(courseName, topicName, entryId) {
  const raw = await getPostMortemRaw(courseName, topicName);
  const entries = parsePostMortemEntries(raw);
  const target = entries.find((e) => e.id === entryId);
  if (!target) return null;

  const remaining = entries.filter((e) => e.id !== entryId);
  const notePath = vaultPath(courseName, topicName, "Post-Mortem.md");
  const rebuilt = serializePostMortemEntries(remaining);
  await writeFile(notePath, rebuilt, `Remove post-mortem entry — ${topicName}`);

  if (target.file) {
    // Best-effort: the entry itself is already gone from the file even if
    // this fails, so don't let an attachment cleanup error block the delete.
    await deleteFile(
      vaultPath(courseName, topicName, "attachments", target.file.name),
      `Remove post-mortem attachment: ${target.file.name}`
    ).catch((err) => console.warn(`Couldn't remove attachment ${target.file.name}:`, err.message));
  }

  return parsePostMortemEntries(rebuilt);
}

// Converts a structured quiz array back into the vault's actual markdown
// convention ([mcq]/[qa]/[flashcard] tags, per the schema) rather than
// dumping raw JSON into what's supposed to be a human-readable Obsidian
// note. Reasons are appended per option — an extension beyond the
// original schema example, matching the reasoned-MCQ requirement from the
// note-generation prompt.
function serializeQuizToMarkdown(questions) {
  return questions
    .map((q) => {
      if (q.type === "mcq") {
        const options = q.options
          .map((opt, i) => {
            const mark = i === q.answer ? "x" : " ";
            const reason = q.reasons?.[i] ? ` — ${q.reasons[i]}` : "";
            return `- [${mark}] ${opt}${reason}`;
          })
          .join("\n");
        return `## ${q.q} [mcq]\n${options}`;
      }
      if (q.type === "qa") {
        return `## ${q.q} [qa]\n> ${q.expected || ""}`;
      }
      if (q.type === "flashcard") {
        return `## ${q.front} [flashcard]\nFront: ${q.front}\nBack: ${q.back}`;
      }
      return `## ${q.q || q.front || "Untitled question"}`;
    })
    .join("\n\n");
}

// Writes any subset of the 4 note files for a topic in one call — used by
// the "Generate notes from lecture material" flow (writing all 4 at once)
// and by manual edits. The quiz array is serialized back into the vault's
// real markdown quiz format (see above), not JSON. Reading it back via
// getTopicNotes still returns raw markdown — it's the topics route
// (lib/quizParser.js) that turns it back into the structured array the
// frontend renders, keeping this module focused purely on vault I/O.
async function writeTopicNotes(courseName, topicName, notes) {
  const base = vaultPath(courseName, topicName);
  const entries = Object.entries(notes).filter(([, content]) => content !== undefined && content !== null);
  await Promise.all(
    entries.map(([section, content]) => {
      const text = Array.isArray(content) ? serializeQuizToMarkdown(content) : content;
      return writeFile(`${base}/${section}.md`, text, `Update ${section} — ${topicName}`);
    })
  );
  return getTopicNotes(courseName, topicName);
}

// Raw text of a topic's Post-Mortem.md, for the topics route to parse via
// lib/postMortemParser.js. Returns "" (not null) so the parser always gets
// a string to work with.
async function getPostMortemRaw(courseName, topicName) {
  const content = await readFile(vaultPath(courseName, topicName, "Post-Mortem.md"));
  return content || "";
}

const MIME_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Fetches a post-mortem attachment's raw bytes for the attachment-serving
// route. Returns null if it doesn't exist rather than throwing, same
// convention as readFile.
async function getAttachment(courseName, topicName, filename) {
  const path = vaultPath(courseName, topicName, "attachments", filename);
  try {
    const res = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    if (Array.isArray(res.data)) return null;
    const ext = filename.split(".").pop().toLowerCase();
    return {
      buffer: Buffer.from(res.data.content, "base64"),
      contentType: MIME_TYPES[ext] || "application/octet-stream",
    };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

module.exports = {
  getTopicNotes,
  readFile,
  writeFile,
  writeTopicNotes,
  appendToInbox,
  appendPostMortemEntry,
  removePostMortemEntry,
  getPostMortemRaw,
  getAttachment,
  NOTE_FILES,
};

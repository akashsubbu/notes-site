const express = require("express");
const notion = require("../integrations/notion");
const github = require("../integrations/github");
const cache = require("../lib/cache");
const { parseQuizMarkdown } = require("../lib/quizParser");
const { parsePostMortemEntries } = require("../lib/postMortemParser");
const { requireAuth } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

// GET /api/courses/:courseName/topics/:topicName/attachments/:filename
// Serves a post-mortem attachment's raw bytes. <img>/<a> tags can't send
// an Authorization header, so this route uses its own auth check (the
// token as ?token=... instead of a header) — it's registered BEFORE
// router.use(requireAuth) below on purpose, so the header-based middleware
// never gets a chance to reject a request that was never going to send a
// header in the first place.
router.get("/:topicName/attachments/:filename", async (req, res, next) => {
  try {
    if (req.query.token !== process.env.API_AUTH_TOKEN) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const { courseName, topicName, filename } = req.params;
    const file = await github.getAttachment(courseName, topicName, filename);
    if (!file) return res.status(404).json({ error: "Attachment not found." });
    res.setHeader("Content-Type", file.contentType);
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

// GET /api/courses/:courseName/topics/:topicName
// Merges Notion metadata (mastery/status/dates) with the 4 note files read
// straight from the Obsidian vault. Active Recall Quiz is parsed into the
// structured [mcq]/[qa]/[flashcard] array the frontend's quiz view expects
// — see lib/quizParser.js, the counterpart to writeTopicNotes' serializer.
router.get("/:topicName", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const found = await notion.findTopic(courseName, topicName);
    if (!found) return res.status(404).json({ error: "Topic not found." });

    const notes = await github.getTopicNotes(courseName, topicName);
    res.json({
      ...found.topic,
      notes: {
        ...notes,
        "Active Recall Quiz": parseQuizMarkdown(notes["Active Recall Quiz"]),
      },
      postMortem: parsePostMortemEntries(await github.getPostMortemRaw(courseName, topicName)),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses/:courseName/topics  { name, type }
// Creates a new Notion Topics row related to this course. Per the schema,
// `name` must exactly match the Obsidian subfolder you create for it.
router.post("/", async (req, res, next) => {
  try {
    const { courseName } = req.params;
    const { name, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required." });

    const courses = await notion.getCourses();
    const course = courses.find((c) => c.name === courseName);
    if (!course) return res.status(404).json({ error: "Course not found." });

    const existing = await notion.getTopicsForCourse(course.notionPageId);
    if (existing.topics.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(409).json({ error: "A topic with that name already exists in this course." });
    }

    const page = await notion.createTopic(course.notionPageId, { name: name.trim(), type });
    cache.invalidate("courses:");
    res.status(201).json({ ok: true, notionPageId: page.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/courses/:courseName/topics/:topicName
// Archives the Notion row (Notion has no permanent delete via API — this is
// the same mechanism Notion's own UI uses). Vault files are left alone;
// delete those directly in Obsidian/GitHub if you want them gone too.
router.delete("/:topicName", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const found = await notion.findTopic(courseName, topicName);
    if (!found) return res.status(404).json({ error: "Topic not found." });

    await notion.archiveTopic(found.topic.notionPageId);
    cache.invalidate("courses:");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/courses/:courseName/topics/:topicName/mastery  { mastery: "rookie" }
// The one Notion field the site is allowed to write, per the schema.
router.patch("/:topicName/mastery", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const { mastery } = req.body;
    if (!["none", "rookie", "ranger", "retire"].includes(mastery)) {
      return res.status(400).json({ error: "mastery must be one of none/rookie/ranger/retire." });
    }
    const found = await notion.findTopic(courseName, topicName);
    if (!found) return res.status(404).json({ error: "Topic not found." });

    await notion.updateTopicMastery(found.topic.notionPageId, mastery);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/courses/:courseName/topics/:topicName/status  { status: "in progress" }
router.patch("/:topicName/status", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const { status } = req.body;
    const found = await notion.findTopic(courseName, topicName);
    if (!found) return res.status(404).json({ error: "Topic not found." });

    await notion.updateTopicStatus(found.topic.notionPageId, status);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses/:courseName/topics/:topicName/notes
// { "Summary and pointers"?: string, "Understanding and Edge Cases"?: string,
//   "Active Recall Quiz"?: array, "Additional Pointers"?: string }
// Writes any subset of the 4 files into the vault — this is what
// "Generate notes from lecture material" calls once wired to live data,
// and the same path a manual edit would use. The quiz array gets
// serialized back into real markdown (github.js), not JSON.
router.post("/:topicName/notes", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const notes = req.body;
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
      return res.status(400).json({ error: "Body must be an object of section -> content." });
    }
    const updated = await github.writeTopicNotes(courseName, topicName, notes);
    res.json({
      ok: true,
      notes: { ...updated, "Active Recall Quiz": parseQuizMarkdown(updated["Active Recall Quiz"]) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses/:courseName/topics/:topicName/post-mortem
// { text?: string, file?: { name, type: "image"|"document", dataUrl } }
// Commits the entry (and any attachment) straight into the vault — no
// separate database, matching every other write path in this backend.
router.post("/:topicName/post-mortem", async (req, res, next) => {
  try {
    const { courseName, topicName } = req.params;
    const { text, file } = req.body;
    if (!text?.trim() && !file) {
      return res.status(400).json({ error: "Provide text and/or a file." });
    }
    const updated = await github.appendPostMortemEntry(courseName, topicName, { text, file });
    res.json({ ok: true, content: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/courses/:courseName/topics/:topicName/post-mortem/:entryId
// Actually rewrites Post-Mortem.md minus the given entry (and its
// attachment, if any) — this was previously a browser-only, non-persisted
// hide. entryId is the "pm-N" id from the entry as returned by GET
// .../topics/:topicName; entries added client-side but not yet reloaded
// from the backend won't have a matching id (see github.js for why), so a
// 404 here can legitimately mean "reload the topic first."
router.delete("/:topicName/post-mortem/:entryId", async (req, res, next) => {
  try {
    const { courseName, topicName, entryId } = req.params;
    const updated = await github.removePostMortemEntry(courseName, topicName, entryId);
    if (updated === null) {
      return res.status(404).json({ error: "Post-mortem entry not found. Try reloading the topic and deleting again." });
    }
    res.json({ ok: true, postMortem: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

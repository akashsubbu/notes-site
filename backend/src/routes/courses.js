const express = require("express");
const notion = require("../integrations/notion");
const github = require("../integrations/github");
const cache = require("../lib/cache");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/courses — course + topic metadata (mastery/status/dates) from
// Notion. Note CONTENT is intentionally not included here (it's fetched
// per-topic on demand via /api/courses/:courseName/topics/:topicName) —
// pulling all 4 files for every topic on the home page would mean needless
// GitHub calls for content nobody's about to read yet.
router.get("/", async (req, res, next) => {
  try {
    const cached = cache.get("courses:list");
    if (cached) return res.json(cached);

    const courses = await notion.getCourses();
    const withTopics = await Promise.all(
      courses.map(async (c) => {
        const { topics } = await notion.getTopicsForCourse(c.notionPageId);
        return {
          name: c.name,
          professor: c.professor,
          email: c.email,
          courseCode: c.courseCode,
          status: c.status,
          topics,
        };
      })
    );

    cache.set("courses:list", withTopics, 60_000);
    res.json(withTopics);
  } catch (err) {
    next(err);
  }
});

// GET /api/courses/:courseName — same shape, one course, always fresh
// (short cache) since this is the page someone's actively looking at.
router.get("/:courseName", async (req, res, next) => {
  try {
    const course = await notion.getCourseWithTopicsByName(req.params.courseName);
    if (!course) return res.status(404).json({ error: "Course not found." });
    res.json(course);
  } catch (err) {
    next(err);
  }
});

// POST /api/courses  { name, professor?, email?, courseCode? }
// Creates a new Notion Courses row. Per the schema, `name` must exactly
// match the Obsidian folder you create for it.
router.post("/", async (req, res, next) => {
  try {
    const { name, professor, email, courseCode } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required." });

    const existing = await notion.getCourses();
    if (existing.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(409).json({ error: "A course with that name already exists." });
    }

    const page = await notion.createCourse({ name: name.trim(), professor, email, courseCode });
    cache.invalidate("courses:");
    res.status(201).json({ ok: true, notionPageId: page.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/courses/:courseName
// Archives the course and every one of its topics (Notion has no permanent
// delete via API — archiving is the real mechanism). Vault files are left
// untouched; remove those directly in Obsidian/GitHub if wanted.
router.delete("/:courseName", async (req, res, next) => {
  try {
    const courses = await notion.getCourses();
    const course = courses.find((c) => c.name === req.params.courseName);
    if (!course) return res.status(404).json({ error: "Course not found." });

    await notion.archiveCourse(course.notionPageId);
    cache.invalidate("courses:");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

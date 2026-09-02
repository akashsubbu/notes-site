const express = require("express");
const github = require("../integrations/github");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/quick-note  { courseName: "Computing ILP", text: "..." }
// For jotting something down fast (mid-lecture, mid-thought) without
// picking a topic first. Lands in <course>/Inbox.md in the vault, ready to
// be sorted into a real topic file later — this is the "one place to
// capture a note" the frontend can point at, without adding a second
// storage system alongside Obsidian.
router.post("/", async (req, res, next) => {
  try {
    const { courseName, text } = req.body;
    if (!courseName || !text?.trim()) {
      return res.status(400).json({ error: "courseName and text are required." });
    }
    const updated = await github.appendToInbox(courseName, text.trim());
    res.json({ ok: true, content: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

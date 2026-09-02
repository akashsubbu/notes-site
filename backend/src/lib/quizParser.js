// Parses an Active Recall Quiz.md file's raw text into the structured
// question array the frontend's quiz view renders. This is the reverse of
// serializeQuizToMarkdown() in integrations/github.js — together they close
// the loop between "AI-generated/edited quiz" and "human-readable Obsidian
// file," which was flagged as an open gap since the original site schema.
//
// Expected format (blank-line-separated question blocks):
//
//   ## What does CPU stand for? [mcq]
//   - [ ] Central Process Unit
//   - [x] Central Processing Unit — Correct: that's what CPU stands for.
//   - [ ] Computer Personal Unit
//
//   ## What is a variable? [qa]
//   > A named storage location for a value that can change.
//
//   ## Algorithm [flashcard]
//   Front: What is an algorithm?
//   Back: A step-by-step procedure for solving a problem.
//
// The "— reason" suffix on mcq options is optional (the original schema
// example doesn't include it); questions with no recognizable [type] tag
// are skipped rather than guessed at.

function parseQuizMarkdown(text) {
  if (!text || !text.trim()) return [];

  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const questions = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const heading = lines[0] || "";
    const match = heading.match(/^#{1,4}\s*(.+?)\s*\[(mcq|qa|flashcard)\]\s*$/i);
    if (!match) continue;

    const [, title, rawType] = match;
    const type = rawType.toLowerCase();

    if (type === "mcq") {
      const options = [];
      const reasons = [];
      let answer = -1;
      lines.slice(1).forEach((line, i) => {
        const optMatch = line.match(/^-\s*\[( |x|X)\]\s*(.+)$/);
        if (!optMatch) return;
        const [, mark, rest] = optMatch;
        const [optionText, reasonText] = rest.split(/\s+—\s+/);
        options.push((optionText || rest).trim());
        reasons.push(reasonText ? reasonText.trim() : undefined);
        if (mark.toLowerCase() === "x") answer = options.length - 1;
      });
      if (options.length >= 2) {
        const q = { type: "mcq", q: title, options, answer };
        if (reasons.some(Boolean)) q.reasons = reasons.map((r) => r || "");
        questions.push(q);
      }
      continue;
    }

    if (type === "qa") {
      const quoteLine = lines.slice(1).find((l) => l.startsWith(">"));
      questions.push({ type: "qa", q: title, expected: quoteLine ? quoteLine.replace(/^>\s?/, "").trim() : "" });
      continue;
    }

    if (type === "flashcard") {
      const frontLine = lines.slice(1).find((l) => /^front:/i.test(l));
      const backLine = lines.slice(1).find((l) => /^back:/i.test(l));
      questions.push({
        type: "flashcard",
        front: frontLine ? frontLine.replace(/^front:\s*/i, "").trim() : title,
        back: backLine ? backLine.replace(/^back:\s*/i, "").trim() : "",
      });
    }
  }

  return questions;
}

module.exports = { parseQuizMarkdown };

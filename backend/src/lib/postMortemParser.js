// Parses a Post-Mortem.md file (written by appendPostMortemEntry in
// github.js) back into a structured entry list for the frontend to render.
// Entries look like:
//
//   ### 2026-08-31 14:22
//   Forgot to convert input() to int before multiplying.
//
//   ![[screenshot.png]]
//
// or with a document attachment: [[notes.pdf]] instead of ![[...]].
// Text-only entries (no attachment line) are just as valid.

function parsePostMortemEntries(text) {
  if (!text || !text.trim()) return [];

  const blocks = text.split(/\n(?=### )/).map((b) => b.trim()).filter((b) => b.startsWith("### "));

  return blocks.map((block, i) => {
    const lines = block.split("\n");
    const heading = lines[0].replace(/^###\s*/, "").trim();
    const rest = lines.slice(1).join("\n").trim();

    const attachmentMatch = rest.match(/(!)?\[\[([^\]]+)\]\]\s*$/);
    let text = rest;
    let file = null;
    if (attachmentMatch) {
      const [, isImage, filename] = attachmentMatch;
      file = { name: filename, type: isImage ? "image" : "document" };
      text = rest.slice(0, attachmentMatch.index).trim();
    }

    // `id` is positional (pm-0, pm-1, ...) and recomputed fresh on every
    // parse — it is NOT stored in the file. That's fine for a single-user
    // backend as long as delete requests are resolved against a fresh
    // parse (see github.js removePostMortemEntry), but it does mean an
    // entry added client-side and not yet reflected in a reload has no
    // matching id here until the topic is refetched.
    return { id: `pm-${i}`, createdAt: heading, text, file };
  });
}

// Inverse of parsePostMortemEntries — rebuilds the file's markdown from a
// (possibly filtered) entry list. Used by removePostMortemEntry in
// github.js to rewrite Post-Mortem.md minus one entry, the same way
// serializeQuizToMarkdown in github.js is the inverse of parseQuizMarkdown.
function serializePostMortemEntries(entries) {
  const header = "# Post-Mortem";
  if (!entries || entries.length === 0) return `${header}\n`;

  const blocks = entries.map((e) => {
    const attachmentLine = e.file
      ? e.file.type === "image"
        ? `\n\n![[${e.file.name}]]`
        : `\n\n[[${e.file.name}]]`
      : "";
    return `### ${e.createdAt}\n${e.text || ""}${attachmentLine}`;
  });

  return `${header}\n\n${blocks.join("\n\n")}\n`;
}

module.exports = { parsePostMortemEntries, serializePostMortemEntries };

import { useState, useMemo, useEffect } from "react";
import { Search, ChevronRight, ChevronDown, Menu, ArrowLeft, Plus, X, Trash2 } from "lucide-react";
import { api } from "./api.js";

const INK = "#EDE6D3";
const INK_DIM = "#9A9280";
const BG = "#14211C";
const BG_RAISED = "#1B2A24";
const LINE = "#33473C";

// Notion's actual light-mode palette — used only for the rendered note
// content (the 4 file tabs), while the rest of the app keeps its dark theme.
const NOTION_BG = "#191919";
const NOTION_BG_RAISED = "#2F2F2F";
const NOTION_TEXT = "#E9E9E7";
const NOTION_TEXT_DIM = "#9B9B9B";
const NOTION_BORDER = "#3A3A3A";
const NOTION_CODE_TEXT = "#EB7B6C";

const MASTERY = {
  none: { label: "none", color: "#D9776A" },
  rookie: { label: "rookie", color: "#D4A62B" },
  ranger: { label: "ranger", color: "#5FA47C" },
  retire: { label: "retire", color: "#9B7FD4" },
};
const LADDER = ["none", "rookie", "ranger", "retire"];

// Topic-level "status" mirrors Notion's Status select and is independent of mastery
// (e.g. a topic can be "in progress" while mastery is still "none").
const STATUS_OPTIONS = ["not started", "in progress", "complete", "archived"];

const INITIAL_COURSES = [
  {
    name: "Computing ILP",
    professor: undefined,
    email: undefined,
    courseCode: undefined,
    status: "not started",
    topics: [],
  },
  {
    name: "Python",
    professor: undefined,
    email: undefined,
    courseCode: undefined,
    status: "not started",
    topics: [],
  },
  {
    name: "Java",
    professor: undefined,
    email: undefined,
    courseCode: undefined,
    status: "not started",
    topics: [],
  },
  {
    name: "HTML",
    professor: undefined,
    email: undefined,
    courseCode: undefined,
    status: "not started",
    topics: [],
  },
];

// The 4 files every topic should have, per the Obsidian vault structure
// (Summary and pointers / Understanding and Edge Cases / Active Recall Quiz /
// Additional Pointers). A topic doesn't always have all 4 — e.g. assignment
// topics may not need a quiz — so completeness is shown, never assumed.
const NOTE_KEYS = ["Summary and pointers", "Understanding and Edge Cases", "Active Recall Quiz", "Additional Pointers"];

function hasContent(topic, key) {
  const val = topic?.notes?.[key];
  if (key === "Active Recall Quiz") return Array.isArray(val) && val.length > 0;
  return typeof val === "string" && val.trim().length > 0;
}

function noteCompletenessCount(topic) {
  return NOTE_KEYS.filter((k) => hasContent(topic, k)).length;
}

function NoteCompleteness({ topic, size = 6, showFraction = false }) {
  const filled = noteCompletenessCount(topic);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={`${filled}/4 sections filled`}>
      <div style={{ display: "flex", gap: 3 }}>
        {NOTE_KEYS.map((k) => {
          const on = hasContent(topic, k);
          return (
            <span
              key={k}
              style={{
                width: size, height: size, borderRadius: "50%",
                background: on ? "#2F9E5A" : "transparent",
                border: `1px solid ${on ? "#2F9E5A" : NOTION_BORDER}`,
                flexShrink: 0,
              }}
            />
          );
        })}
      </div>
      {showFraction && (
        <span style={{ fontSize: 11, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>{filled}/4</span>
      )}
    </div>
  );
}

function renderInline(str, keyPrefix) {
  const tokens = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (/^\*\*[^*]+\*\*$/.test(tok)) {
      return <strong key={`${keyPrefix}-b-${i}`} style={{ color: NOTION_TEXT, fontWeight: 600 }}>{tok.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(tok)) {
      return (
        <code key={`${keyPrefix}-c-${i}`} style={{ background: NOTION_BG_RAISED, border: `0.5px solid ${NOTION_BORDER}`, borderRadius: 4, padding: "1px 5px", fontFamily: "ui-monospace, monospace", fontSize: "0.9em", color: NOTION_CODE_TEXT }}>
          {tok.slice(1, -1)}
        </code>
      );
    }
    return tok;
  });
}

function renderMarkdownBlocks(text, keyBase) {
  const lines = text.split("\n");
  const nodes = [];
  let listItems = [];

  function flushList() {
    if (listItems.length) {
      nodes.push(
        <ul key={`${keyBase}-ul-${nodes.length}`} style={{ margin: "0 0 8px", paddingLeft: 20, color: NOTION_TEXT }}>
          {listItems.map((li, liIdx) => (
            <li key={liIdx} style={{ marginBottom: 4, lineHeight: 1.6 }}>{renderInline(li, `${keyBase}-li-${liIdx}`)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") { flushList(); i++; continue; }

    if (/^-{3,}$/.test(trimmed)) {
      flushList();
      nodes.push(<hr key={`${keyBase}-hr-${nodes.length}`} style={{ border: "none", borderTop: `1px solid ${NOTION_BORDER}`, margin: "20px 0" }} />);
      i++; continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const sizes = { 1: 22, 2: 19, 3: 16, 4: 14 };
      nodes.push(
        <p key={`${keyBase}-h-${nodes.length}`} style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: sizes[level] || 14, fontWeight: 600, color: NOTION_TEXT, margin: level <= 2 ? "20px 0 6px" : "16px 0 4px" }}>
          {renderInline(heading[2], `${keyBase}-h-${nodes.length}`)}
        </p>
      );
      i++; continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushList();
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      nodes.push(
        <blockquote key={`${keyBase}-bq-${nodes.length}`} style={{ margin: "0 0 8px", padding: "4px 14px", borderLeft: `3px solid ${NOTION_TEXT}`, color: NOTION_TEXT, fontSize: 15 }}>
          {renderInline(quoteLines.join(" "), `${keyBase}-bq-${nodes.length}`)}
        </blockquote>
      );
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      flushList();
      const tableLines = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const parseRow = (row) => row.slice(1, -1).split("|").map((c) => c.trim());
      const headerCells = parseRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseRow); // row[1] is the --- separator
      nodes.push(
        <div key={`${keyBase}-tbl-${nodes.length}`} style={{ overflowX: "auto", margin: "0 0 12px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {headerCells.map((c, ci) => (
                  <th key={ci} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${NOTION_BORDER}`, background: NOTION_BG_RAISED, color: NOTION_TEXT_DIM, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                    {renderInline(c, `${keyBase}-th-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} style={{ padding: "8px 10px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT, verticalAlign: "top" }}>
                      {renderInline(c, `${keyBase}-td-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      i++; continue;
    }

    // Notion treats every line as its own block by default (no soft-wrap
    // merging), so each plain-text line becomes its own paragraph here too —
    // this is what keeps "Concept:" / "Use case:" / "When to use:" on
    // separate lines instead of collapsing into one run-on paragraph.
    flushList();
    nodes.push(<p key={`${keyBase}-p-${nodes.length}`} style={{ margin: "0 0 6px", lineHeight: 1.6, color: NOTION_TEXT }}>{renderInline(trimmed, `${keyBase}-${nodes.length}`)}</p>);
    i++;
  }
  flushList();
  return nodes;
}

// Notion's own named text-color palette, reused here so highlighted code
// reads the same as it would inside a Notion code block.
const NOTION_COLORS = {
  comment: "#9B9A97",
  string: "#D9730D",
  number: "#0B6E99",
  keyword: "#9065B0",
  builtin: "#0F7B6C",
};

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);
const PY_BUILTINS = new Set([
  "print", "len", "range", "type", "int", "float", "str", "bool", "list", "dict", "set", "tuple",
  "input", "id", "abs", "min", "max", "sum", "sorted", "enumerate", "zip", "map", "filter", "open", "format",
]);

// One capturing group so split() cleanly alternates [plainText, token, plainText, token, ...]
const PY_TOKEN_RE = /(#.*$|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*\b|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b(?:print|len|range|type|int|float|str|bool|list|dict|set|tuple|input|id|abs|min|max|sum|sorted|enumerate|zip|map|filter|open|format)\b)/gm;

function classifyPyToken(tok) {
  if (tok[0] === "#") return "comment";
  if (tok[0] === '"' || tok[0] === "'") return "string";
  if (/^\d/.test(tok)) return "number";
  if (PY_KEYWORDS.has(tok)) return "keyword";
  if (PY_BUILTINS.has(tok)) return "builtin";
  return null;
}

function highlightPython(code) {
  const parts = code.split(PY_TOKEN_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (i % 2 === 0) return part; // plain text between tokens
    const cls = classifyPyToken(part);
    if (!cls) return part;
    const style = { color: NOTION_COLORS[cls] };
    if (cls === "comment") style.fontStyle = "italic";
    if (cls === "keyword") style.fontWeight = 600;
    return <span key={i} style={style}>{part}</span>;
  });
}

function markdownToJsx(text) {
  if (!text) return <p style={{ color: NOTION_TEXT_DIM }}>No content yet for this section.</p>;
  const fenceRe = /```(\w+)?\n([\s\S]*?)```/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<div key={key++}>{renderMarkdownBlocks(text.slice(lastIndex, match.index), `md-${key}`)}</div>);
    }
    const lang = (match[1] || "").toLowerCase();
    const code = match[2].trim();
    const isPython = lang === "" || lang === "python" || lang === "py";
    nodes.push(
      <pre key={key++} style={{ background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: "12px 14px", overflowX: "auto", fontFamily: "ui-monospace, monospace", fontSize: 13, color: NOTION_TEXT, margin: "12px 0" }}>
        {isPython ? highlightPython(code) : code}
      </pre>
    );
    lastIndex = fenceRe.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<div key={key++}>{renderMarkdownBlocks(text.slice(lastIndex), `md-${key}`)}</div>);
  }
  return nodes;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function MasteryDropdown({ level, onChange, size = "md" }) {
  const m = MASTERY[level];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        value={level}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none", background: "transparent",
          border: `1px solid ${m.color}`, borderRadius: 20, color: m.color,
          padding: size === "sm" ? "2px 24px 2px 10px" : "5px 30px 5px 14px",
          fontFamily: "ui-monospace, monospace", fontSize: size === "sm" ? 11 : 13, cursor: "pointer",
        }}
      >
        {LADDER.map((l) => (
          <option key={l} value={l} style={{ background: NOTION_BG_RAISED, color: NOTION_TEXT }}>{l}</option>
        ))}
      </select>
      <ChevronDown size={size === "sm" ? 11 : 13} color={m.color} style={{ position: "absolute", right: size === "sm" ? 8 : 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function StatusDropdown({ value, onChange, size = "md" }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none", background: "transparent",
          border: `1px solid ${NOTION_BORDER}`, borderRadius: 20, color: NOTION_TEXT_DIM,
          padding: size === "sm" ? "2px 22px 2px 10px" : "5px 28px 5px 14px",
          fontFamily: "ui-monospace, monospace", fontSize: size === "sm" ? 11 : 13, cursor: "pointer",
        }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s} style={{ background: NOTION_BG_RAISED, color: NOTION_TEXT }}>{s}</option>
        ))}
      </select>
      <ChevronDown size={size === "sm" ? 11 : 13} color={NOTION_TEXT_DIM} style={{ position: "absolute", right: size === "sm" ? 6 : 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function QuizView({ questions, currentMastery, onPass }) {
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [bumped, setBumped] = useState(false);
  const score = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    questions.forEach((q, i) => {
      if (q.type === "mcq" && answers[i] === q.answer) correct++;
      if ((q.type === "qa" || q.type === "flashcard") && revealed[i] === "got") correct++;
    });
    return Math.round((correct / questions.length) * 100);
  }, [submitted, answers, revealed, questions]);

  function handleSubmit() {
    setSubmitted(true);
    const s = (() => {
      let correct = 0;
      questions.forEach((q, i) => {
        if (q.type === "mcq" && answers[i] === q.answer) correct++;
        if ((q.type === "qa" || q.type === "flashcard") && revealed[i] === "got") correct++;
      });
      return Math.round((correct / questions.length) * 100);
    })();
    if (s >= 80 && !bumped) {
      const next = LADDER[Math.min(LADDER.indexOf(currentMastery) + 1, LADDER.length - 1)];
      if (next !== currentMastery) onPass?.(next);
      setBumped(true);
    }
  }

  if (!questions?.length) return <p style={{ color: NOTION_TEXT_DIM }}>No quiz for this topic yet.</p>;
  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${NOTION_BORDER}` }}>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM, margin: "0 0 6px" }}>{q.type}</p>
          {q.type === "mcq" && (
            <>
              <p style={{ margin: "0 0 10px", color: NOTION_TEXT, whiteSpace: "pre-wrap" }}>{q.q}</p>
              {q.options.map((opt, oi) => (
                <div key={oi}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: NOTION_TEXT_DIM }}>
                    <input type="radio" name={`q${i}`} disabled={submitted} checked={answers[i] === oi} onChange={() => setAnswers((a) => ({ ...a, [i]: oi }))} />
                    {opt}
                  </label>
                  {submitted && q.reasons?.[oi] && (
                    <p style={{ margin: "0 0 6px 26px", fontSize: 12, color: oi === q.answer ? "#2F9E5A" : NOTION_TEXT_DIM }}>{q.reasons[oi]}</p>
                  )}
                </div>
              ))}
            </>
          )}
          {q.type === "qa" && (
            <>
              <p style={{ margin: "0 0 10px", color: NOTION_TEXT, whiteSpace: "pre-wrap" }}>{q.q}</p>
              {!revealed[i] ? (
                <button onClick={() => setRevealed((r) => ({ ...r, [i]: "shown" }))} style={noteBtnStyle}>Show expected answer</button>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: NOTION_TEXT_DIM, fontStyle: "italic", margin: "0 0 8px" }}>Expected: {q.expected}</p>
                  {revealed[i] === "shown" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setRevealed((r) => ({ ...r, [i]: "got" }))} style={noteBtnStyle}>Got it</button>
                      <button onClick={() => setRevealed((r) => ({ ...r, [i]: "missed" }))} style={noteBtnStyle}>Didn't get it</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {q.type === "flashcard" && (
            <div onClick={() => setRevealed((r) => ({ ...r, [i]: r[i] || "flipped" }))} style={{ background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 8, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: 0, color: NOTION_TEXT }}>{revealed[i] ? q.back : q.front}</p>
              {!revealed[i] && <p style={{ margin: "8px 0 0", fontSize: 12, color: NOTION_TEXT_DIM }}>Click to flip</p>}
              {revealed[i] && revealed[i] !== "got" && revealed[i] !== "missed" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setRevealed((r) => ({ ...r, [i]: "got" }))} style={noteBtnStyle}>Got it</button>
                  <button onClick={() => setRevealed((r) => ({ ...r, [i]: "missed" }))} style={noteBtnStyle}>Didn't get it</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {!submitted ? (
        <button onClick={handleSubmit} style={{ ...noteBtnStyle, background: "#2F9E5A", color: "#FFFFFF", borderColor: "#2F9E5A" }}>Submit quiz</button>
      ) : (
        <div>
          <p style={{ color: NOTION_TEXT, fontFamily: "ui-monospace, monospace" }}>Score: {score}%</p>
          <p style={{ color: score >= 80 ? "#2F9E5A" : NOTION_TEXT_DIM, fontSize: 13 }}>
            {score >= 80 ? "80%+ — mastery bumped up a level and synced to Notion." : "Below 80% — mastery unchanged. Review and try again."}
          </p>
        </div>
      )}
    </div>
  );
}

const btnStyle = { background: "transparent", border: `1px solid ${LINE}`, color: INK, borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" };
// Light-themed counterpart to btnStyle, used only inside the note-content
// area (Notion-style light card) so the rest of the app's dark buttons are untouched.
const noteBtnStyle = { background: "transparent", border: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT, borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" };

// Matches the naming used in the note-generation prompt exactly, so the tab
// bar and the source-of-truth prompt never drift out of sync.
const FILE_LABELS = {
  "Summary and pointers": "Summary and pointers",
  "Understanding and Edge Cases": "Understanding and Edge Cases",
  "Active Recall Quiz": "Active Recall Quiz",
  "Additional Pointers": "Additional Pointers",
  "Post-Mortem": "Post-Mortem",
};

function TabBar({ tabs, current, onChange, accentColor }) {
  return (
    <div style={{ display: "flex", flexWrap: "nowrap", gap: 6, marginBottom: 20 }}>
      {tabs.map((t) => {
        const active = t === current;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0,
              background: active ? NOTION_BG_RAISED : "transparent",
              border: `1px solid ${active ? accentColor : NOTION_BORDER}`,
              borderRadius: 8, padding: "8px 10px", cursor: "pointer",
              fontFamily: "ui-monospace, monospace", fontSize: 12,
              color: active ? NOTION_TEXT : NOTION_TEXT_DIM,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? accentColor : NOTION_BORDER, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{FILE_LABELS[t] || t}</span>
          </button>
        );
      })}
    </div>
  );
}

function AddCourseCard({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [professor, setProfessor] = useState("");
  const [email, setEmail] = useState("");
  const [courseCode, setCourseCode] = useState("");

  const inputStyle = {
    width: "100%", background: NOTION_BG, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6,
    padding: "6px 8px", color: NOTION_TEXT, fontSize: 13, boxSizing: "border-box", marginBottom: 8,
  };

  function submit() {
    if (!name.trim()) return;
    onAdd({ name, professor, email, courseCode });
    setName(""); setProfessor(""); setEmail(""); setCourseCode(""); setOpen(false);
  }

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          border: `1px dashed ${NOTION_BORDER}`, borderRadius: 10, padding: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", minHeight: 84,
        }}
      >
        <p style={{ margin: 0, fontSize: 15, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>+ add language</p>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${NOTION_BORDER}`, borderRadius: 10, padding: 18, background: NOTION_BG_RAISED }}>
      <input autoFocus placeholder="Language / course name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <input placeholder="Professor (optional)" value={professor} onChange={(e) => setProfessor(e.target.value)} style={inputStyle} />
      <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      <input placeholder="Course code (optional)" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ ...noteBtnStyle, background: "#2F9E5A", color: "#FFFFFF", borderColor: "#2F9E5A" }}>Add language</button>
        <button onClick={() => setOpen(false)} style={noteBtnStyle}>Cancel</button>
      </div>
    </div>
  );
}

// The exact 4-file hybrid note-generation prompt, adapted to ask for structured
// JSON output so the result can be dropped straight into a topic's notes.
const NOTE_GEN_INSTRUCTIONS = `Using the lecture material provided by the user, generate a 4-file note set following this exact structure. Identify all sub-concepts in the lecture first, then apply the format below to each.

File 1 — Summary & Pointers
Break the lecture into its sub-concepts, numbered in the order they appear (e.g. "### 1. Concept Name", "### 2. Concept Name"). For each one, write, in this order:
- Code: a minimal working snippet illustrating the concept, with inline # comments showing what each line does and/or its output (not a separate prose explanation of the code).
- Concept: 1–2 sentence plain-language explanation.
- Use case: one short line — a real-world scenario where this applies.
- When to use: one short line of guidance on when to reach for it.
Keep Use case and When to use tight, one line each — no elaboration or "when NOT to use" needed here. Separate each sub-concept with a horizontal rule (---).

File 2 — Understanding & Edge Cases
- A single consolidated table listing Big-O complexity for every concept in the lecture, side by side, as one reference table.
- Common developer traps and edge cases per concept.
- A blank post-mortem table for the learner to fill in later (columns: Mistake / Why It Happened / Fix).

File 3 — Active Recall Quiz
Multiple-choice questions covering the key concepts and traps. For every answer option — correct and incorrect — include a one-line reason explaining why it's right or wrong.

File 4 — Additional Pointers
Only genuinely new material not captured in Files 1–3: activity-specific notes, stray insights, anything that doesn't fit elsewhere. Do NOT repeat File 2's traps/edge cases here.

Respond with ONLY a raw JSON object — no markdown fences, no commentary before or after — matching exactly this shape:
{
  "summary": "<File 1 as markdown: numbered sections in the Code/Concept/Use case/When to use order, separated by --- >",
  "understanding": "<File 2 as markdown: the consolidated complexity table, traps/edge cases, and a blank post-mortem table>",
  "quiz": [
    { "type": "mcq", "q": "<question>", "options": ["<option 1>", "<option 2>", "<option 3>"], "reasons": ["<why option 1 is right or wrong>", "<why option 2 is right or wrong>", "<why option 3 is right or wrong>"], "answer": <index of the correct option> }
  ],
  "additionalPointers": "<File 4 as markdown>"
}`;

// The prompt's own "Quick reference table" — surfaced in the panel so the
// canonical rules are visible without leaving the app.
const PROMPT_QUICK_REFERENCE = [
  { file: "1. Summary & Pointers", content: "Code / Concept / Use case / When to use per concept, all short", source: "Numbered sections, code with inline comments, --- separators" },
  { file: "2. Understanding & Edge Cases", content: "Consolidated complexity table + traps/edge cases + blank post-mortem table", source: "Notion template" },
  { file: "3. Active Recall Quiz", content: "MCQs with every option graded and reasoned", source: "Notion template" },
  { file: "4. Additional Pointers", content: "Only new/unclassified info, not a repeat of File 2", source: "New" },
];

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function PostMortemTab({ entries, onAdd, onRemove }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldStyle = {
    width: "100%", background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6,
    padding: "10px 12px", color: NOTION_TEXT, fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical",
  };

  async function submit() {
    if (!text.trim() && !file) return;
    setSubmitting(true);
    let fileData = null;
    if (file) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      fileData = { name: file.name, type: file.type.startsWith("image/") ? "image" : "document", dataUrl };
    }
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.trim(),
      file: fileData,
      createdAt: new Date().toISOString(),
    });
    setText(""); setFile(null); setSubmitting(false);
  }

  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: NOTION_TEXT_DIM }}>
        Log mistakes here as you make them — a photo of a whiteboard, a screenshot of an error, a doc, or just a note — so they're easy to find again later.
      </p>

      <div style={{ border: `1px solid ${NOTION_BORDER}`, borderRadius: 8, padding: 14, marginBottom: 20, background: NOTION_BG }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="What happened, why, and how you fixed it..."
          style={{ ...fieldStyle, marginBottom: 10 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label
            title="Attach a picture or document"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, flexShrink: 0, border: `1px dashed ${NOTION_BORDER}`, borderRadius: 6, cursor: "pointer",
            }}
          >
            <Plus size={16} color={NOTION_TEXT_DIM} />
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
          </label>
          {file && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: "5px 8px" }}>
              <span style={{ fontSize: 12, color: NOTION_TEXT, fontFamily: "ui-monospace, monospace", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </span>
              <button onClick={() => setFile(null)} style={{ background: "none", border: "none", color: NOTION_TEXT_DIM, cursor: "pointer", padding: 0, display: "flex" }}>
                <X size={12} />
              </button>
            </div>
          )}
          <button
            onClick={submit}
            disabled={submitting || (!text.trim() && !file)}
            style={{
              ...noteBtnStyle, marginLeft: "auto", background: "#2F9E5A", color: "#FFFFFF", borderColor: "#2F9E5A",
              opacity: submitting || (!text.trim() && !file) ? 0.6 : 1, cursor: submitting || (!text.trim() && !file) ? "default" : "pointer",
            }}
          >
            {submitting ? "Adding..." : "Add entry"}
          </button>
        </div>
      </div>

      {(!entries || entries.length === 0) ? (
        <p style={{ color: NOTION_TEXT_DIM, fontSize: 14 }}>No mistakes logged yet.</p>
      ) : (
        [...entries].reverse().map((entry) => (
          <div key={entry.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${NOTION_BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>{fmtDateTime(entry.createdAt)}</span>
              <button onClick={() => onRemove(entry.id)} style={{ background: "none", border: "none", color: NOTION_TEXT_DIM, cursor: "pointer", padding: 0, display: "flex" }}>
                <X size={13} />
              </button>
            </div>
            {entry.text && <p style={{ margin: "0 0 10px", lineHeight: 1.6, color: NOTION_TEXT, whiteSpace: "pre-wrap" }}>{entry.text}</p>}
            {entry.file?.type === "image" && (
              <img src={entry.file.dataUrl} alt={entry.file.name} style={{ maxWidth: "100%", borderRadius: 8, border: `1px solid ${NOTION_BORDER}` }} />
            )}
            {entry.file?.type === "document" && (
              <a
                href={entry.file.dataUrl}
                download={entry.file.name}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: "8px 12px", color: NOTION_TEXT, fontSize: 13, textDecoration: "none" }}
              >
                {entry.file.name}
              </a>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Cross-checks a generated note set against the prompt's own structural
// rules — this doesn't judge writing quality, only whether the required
// shape (numbered sections, tables, reasoned quiz options, etc.) is present.
function validateGeneratedNotes(parsed) {
  const issues = [];

  // File 1 — Summary & Pointers: numbered "### N." sections separated by ---,
  // each with Code / Concept / Use case / When to use, in that order.
  const summary = parsed.summary || "";
  if (!summary.trim()) {
    issues.push("File 1 (Summary & Pointers) is empty.");
  } else {
    const sections = summary.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean);
    const numbered = sections.filter((s) => /^#{2,4}\s*\d+[\.\)]/m.test(s) || /^\d+[\.\)]/m.test(s));
    if (numbered.length === 0) {
      issues.push("File 1: no numbered sub-concept headings found (expected e.g. \"### 1. Concept Name\").");
    }
    const requiredLabels = ["code:", "concept:", "use case:", "when to use:"];
    let sectionsMissingLabels = 0;
    numbered.forEach((s) => {
      const lower = s.toLowerCase();
      const missing = requiredLabels.filter((label) => !lower.includes(label));
      if (missing.length) sectionsMissingLabels++;
    });
    if (sectionsMissingLabels > 0) {
      issues.push(`File 1: ${sectionsMissingLabels} of ${numbered.length} section(s) are missing one of Code/Concept/Use case/When to use.`);
    }
    if (!/```/.test(summary)) {
      issues.push("File 1: no code blocks found — every sub-concept should include a code snippet.");
    }
  }

  // File 2 — Understanding & Edge Cases: one consolidated Big-O table, traps
  // per concept, and a blank post-mortem table (Mistake / Why It Happened / Fix).
  const understanding = parsed.understanding || "";
  if (!understanding.trim()) {
    issues.push("File 2 (Understanding & Edge Cases) is empty.");
  } else {
    const tables = understanding.match(/\|.+\|\n\|[\s:|-]+\|/g) || [];
    if (tables.length === 0) {
      issues.push("File 2: no markdown table found (expected a consolidated Big-O complexity table).");
    }
    const lower = understanding.toLowerCase();
    if (!lower.includes("mistake") || !lower.includes("why it happened") || !lower.includes("fix")) {
      issues.push("File 2: blank post-mortem table (Mistake / Why It Happened / Fix columns) not found.");
    }
    if (!/big-?o|complexity/i.test(understanding)) {
      issues.push("File 2: no Big-O/complexity reference found.");
    }
  }

  // File 3 — Active Recall Quiz: every option (right and wrong) needs a reason.
  const quiz = Array.isArray(parsed.quiz) ? parsed.quiz : [];
  if (quiz.length === 0) {
    issues.push("File 3 (Active Recall Quiz) has no questions.");
  } else {
    let badQuestions = 0;
    quiz.forEach((q, i) => {
      if (q.type !== "mcq") return;
      const optCount = Array.isArray(q.options) ? q.options.length : 0;
      const reasonCount = Array.isArray(q.reasons) ? q.reasons.length : 0;
      const answerValid = typeof q.answer === "number" && q.answer >= 0 && q.answer < optCount;
      if (optCount < 2 || reasonCount !== optCount || !answerValid) badQuestions++;
    });
    if (badQuestions > 0) {
      issues.push(`File 3: ${badQuestions} of ${quiz.length} question(s) are missing a reason for every option, or have an invalid answer index.`);
    }
  }

  // File 4 — Additional Pointers: should not just repeat File 2's traps/edge cases.
  const additional = parsed.additionalPointers || "";
  if (!additional.trim()) {
    issues.push("File 4 (Additional Pointers) is empty.");
  } else if (understanding) {
    const sig = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l.length > 25);
    const overlap = sig(additional).filter((line) => sig(understanding).includes(line));
    if (overlap.length > 0) {
      issues.push(`File 4: ${overlap.length} line(s) appear to duplicate File 2's traps/edge cases verbatim — the prompt says not to repeat these.`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function GenerateNotesPanel({ topicName, courseName, onGenerated }) {
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationIssues, setValidationIssues] = useState([]);
  const [showReference, setShowReference] = useState(false);

  async function generate() {
    if (!material.trim()) return;
    setLoading(true);
    setError("");
    setValidationIssues([]);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: NOTE_GEN_INSTRUCTIONS,
          messages: [
            { role: "user", content: `Topic: ${topicName} (course: ${courseName})\n\nLecture material:\n${material}` },
          ],
        }),
      });
      const data = await response.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      // Cross-check against the prompt's own structural rules before/after
      // applying — content is still written in either case since a partial
      // match is usually still useful, but any mismatch stays visible.
      const { valid, issues } = validateGeneratedNotes(parsed);
      onGenerated(parsed);
      setValidationIssues(issues);
      if (valid) {
        setOpen(false);
        setMaterial("");
      }
    } catch (e) {
      setError("Couldn't generate notes from that material — try again, or trim it down.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...noteBtnStyle, marginBottom: 16 }}>
        Generate notes from lecture material
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${NOTION_BORDER}`, borderRadius: 8, padding: 14, marginBottom: 16, background: NOTION_BG_RAISED }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: NOTION_TEXT_DIM }}>
        Paste the lecture transcript, slides, or notes for "{topicName}" below — this fills in all 4 files at once.
      </p>
      <button
        onClick={() => setShowReference((s) => !s)}
        style={{ background: "none", border: "none", color: NOTION_TEXT_DIM, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10, textDecoration: "underline" }}
      >
        {showReference ? "Hide" : "Show"} prompt reference
      </button>
      {showReference && (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT_DIM, fontWeight: 600 }}>File</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT_DIM, fontWeight: 600 }}>Content</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT_DIM, fontWeight: 600 }}>Source method</th>
              </tr>
            </thead>
            <tbody>
              {PROMPT_QUICK_REFERENCE.map((row) => (
                <tr key={row.file}>
                  <td style={{ padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT, verticalAlign: "top" }}>{row.file}</td>
                  <td style={{ padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT, verticalAlign: "top" }}>{row.content}</td>
                  <td style={{ padding: "6px 8px", borderBottom: `1px solid ${NOTION_BORDER}`, color: NOTION_TEXT_DIM, verticalAlign: "top" }}>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <textarea
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        rows={6}
        placeholder="Paste lecture material here..."
        style={{ width: "100%", background: NOTION_BG, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: 10, color: NOTION_TEXT, fontSize: 13, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }}
      />
      {error && <p style={{ color: MASTERY.none.color, fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
      {validationIssues.length > 0 && (
        <div style={{ border: `1px solid ${MASTERY.rookie.color}`, borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: MASTERY.rookie.color, fontFamily: "ui-monospace, monospace" }}>
            Applied, but doesn't fully match the prompt's format:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {validationIssues.map((issue, i) => (
              <li key={i} style={{ fontSize: 12, color: NOTION_TEXT_DIM, marginBottom: 3, lineHeight: 1.5 }}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={generate}
          disabled={loading || !material.trim()}
          style={{ ...noteBtnStyle, background: "#2F9E5A", color: "#FFFFFF", borderColor: "#2F9E5A", opacity: loading || !material.trim() ? 0.6 : 1, cursor: loading || !material.trim() ? "default" : "pointer" }}
        >
          {loading ? "Generating..." : validationIssues.length > 0 ? "Regenerate" : "Generate 4-file notes"}
        </button>
        <button onClick={() => { setOpen(false); setError(""); setValidationIssues([]); }} style={noteBtnStyle}>
          {validationIssues.length > 0 ? "Keep as-is" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// Best-effort match of an uploaded filename to one of the 4 note sections,
// e.g. "Summary and pointers.md" or "quiz.txt" -> the right notes key.
function matchNoteSection(filename) {
  const base = filename.replace(/\.[^/.]+$/, "").toLowerCase();
  if (base.includes("summary")) return "Summary and pointers";
  if (base.includes("understanding") || base.includes("edge case")) return "Understanding and Edge Cases";
  if (base.includes("quiz") || base.includes("recall")) return "Active Recall Quiz";
  if (base.includes("additional") || base.includes("pointer")) return "Additional Pointers";
  return null;
}

function AddTopicRow({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("lecture");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const fieldStyle = {
    background: NOTION_BG, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6,
    padding: "6px 8px", color: NOTION_TEXT, fontSize: 13, boxSizing: "border-box",
  };

  function addFiles(fileList) {
    setFiles((prev) => [...prev, ...Array.from(fileList || [])]);
  }
  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    const notesFromFiles = {};
    for (const f of files) {
      const key = matchNoteSection(f.name);
      // The Active Recall Quiz file needs the markdown [mcq]/[qa]/[flashcard]
      // parser (not built yet) before it can populate the structured quiz —
      // uploading it here is captured under the raw key but won't render as
      // quiz questions until that parser exists.
      if (key) notesFromFiles[key] = await f.text();
    }
    onAdd({ name: name.trim(), type, notesFromFiles });
    setName(""); setType("lecture"); setFiles([]); setSubmitting(false); setOpen(false);
  }

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{ padding: "12px 0", borderTop: `1px solid ${NOTION_BORDER}`, cursor: "pointer", color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
      >
        + add topic
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${NOTION_BORDER}` }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          autoFocus
          placeholder="Topic name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} style={fieldStyle}>
          <option value="lecture" style={{ background: NOTION_BG_RAISED, color: NOTION_TEXT }}>lecture</option>
          <option value="assignment" style={{ background: NOTION_BG_RAISED, color: NOTION_TEXT }}>assignment</option>
        </select>
        <label
          title="Upload note files (Summary and pointers, Understanding and Edge Cases, Active Recall Quiz, Additional Pointers)"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, flexShrink: 0, border: `1px dashed ${NOTION_BORDER}`, borderRadius: 6, cursor: "pointer",
          }}
        >
          <Plus size={14} color={NOTION_TEXT_DIM} />
          <input type="file" accept=".md,.txt" multiple onChange={(e) => addFiles(e.target.files)} style={{ display: "none" }} />
        </label>
      </div>

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {files.map((f, idx) => {
            const matched = matchNoteSection(f.name);
            return (
              <div
                key={`${f.name}-${idx}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  background: NOTION_BG, border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: "5px 8px",
                }}
              >
                <span style={{ fontSize: 12, color: NOTION_TEXT, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 11, color: matched ? "#2F9E5A" : NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
                  {matched || "unmatched"}
                </span>
                <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", color: NOTION_TEXT_DIM, cursor: "pointer", padding: 0, flexShrink: 0, display: "flex" }}>
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={submitting || !name.trim()}
          style={{ ...noteBtnStyle, background: "#2F9E5A", color: "#FFFFFF", borderColor: "#2F9E5A", opacity: submitting || !name.trim() ? 0.6 : 1, cursor: submitting || !name.trim() ? "default" : "pointer" }}
        >
          {submitting ? "Adding..." : "Add topic"}
        </button>
        <button onClick={() => { setOpen(false); setFiles([]); }} style={noteBtnStyle}>Cancel</button>
      </div>
    </div>
  );
}

export default function NotesSite() {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState("home"); // home | course | topic
  const [courseIdx, setCourseIdx] = useState(null);
  const [topicIdx, setTopicIdx] = useState(null);
  const [tab, setTab] = useState("Summary and pointers");
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [masteryState, setMasteryState] = useState({});
  const [statusState, setStatusState] = useState({});
  const [datesState, setDatesState] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const backendConfigured = Boolean(import.meta.env.VITE_API_BASE);

  function syncTrackingStateFrom(courseList) {
    const m = {}, s = {}, d = {};
    courseList.forEach((c) =>
      c.topics.forEach((t) => {
        const key = `${c.name}/${t.name}`;
        m[key] = t.mastery;
        s[key] = t.status;
        d[key] = { rookieDate: t.rookieDate, rangerDate: t.rangerDate, retireDate: t.retireDate };
      })
    );
    setMasteryState(m);
    setStatusState(s);
    setDatesState(d);
  }

  // On mount: pull real course/topic metadata from Notion via the backend.
  // Note CONTENT (the 4 files, post-mortem entries) is deliberately not
  // fetched here — that's lazy-loaded per topic in loadTopicContent below,
  // same as the backend's own design (see courses.js). If no backend is
  // configured, the site falls back to its local seed data exactly as it
  // has throughout development — nothing breaks.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!backendConfigured) {
        syncTrackingStateFrom(INITIAL_COURSES);
        setLoading(false);
        return;
      }
      try {
        const data = await api.getCourses();
        if (cancelled) return;
        const normalized = data.map((c) => ({
          ...c,
          topics: c.topics.map((t) => ({ ...t, notes: {}, postMortem: [] })),
        }));
        setCourses(normalized);
        syncTrackingStateFrom(normalized);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          syncTrackingStateFrom(INITIAL_COURSES);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-loads one topic's actual content (4 files + post-mortem entries)
  // from the backend once you open it — fired from goTopic below.
  async function loadTopicContent(ci, ti) {
    if (!backendConfigured) return;
    const c = courses[ci];
    const t = c?.topics[ti];
    if (!c || !t) return;
    try {
      const full = await api.getTopic(c.name, t.name);
      setCourses((prev) =>
        prev.map((course, cIdx) =>
          cIdx !== ci
            ? course
            : {
                ...course,
                topics: course.topics.map((top, tIdx) =>
                  tIdx !== ti ? top : { ...top, notes: full.notes, postMortem: full.postMortem || [] }
                ),
              }
        )
      );
    } catch (err) {
      console.error(`Failed to load "${t.name}":`, err.message);
    }
  }

  // Adds a new, empty language/course — mirrors what creating a new row in the
  // Notion `Courses` database + a matching Obsidian folder would produce.
  async function addCourse({ name, professor, email, courseCode }) {
    if (!name?.trim()) return;
    if (backendConfigured) {
      try {
        await api.createCourse({ name: name.trim(), professor, email, courseCode });
        const data = await api.getCourses();
        const normalized = data.map((c) => ({ ...c, topics: c.topics.map((t) => ({ ...t, notes: {}, postMortem: [] })) }));
        setCourses(normalized);
        syncTrackingStateFrom(normalized);
      } catch (err) {
        alert(`Couldn't create course: ${err.message}`);
      }
      return;
    }
    setCourses((prev) => [
      ...prev,
      { name: name.trim(), professor: professor?.trim() || undefined, email: email?.trim() || undefined, courseCode: courseCode?.trim() || undefined, status: "not started", topics: [] },
    ]);
  }

  // Adds a new topic to a course — mirrors a new `Topics` row related to that
  // course, with a matching Obsidian subfolder. Notion+Obsidian match by exact
  // name string, so duplicate topic names within a course are rejected here.
  async function addTopic(ci, { name, type, notesFromFiles }) {
    const c = courses[ci];
    if (!c || !name?.trim()) return;
    if (c.topics.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return;
    const topicName = name.trim();
    // Active Recall Quiz must stay a structured array for the quiz view to
    // render — raw uploaded quiz text needs the markdown parser, which now
    // lives on the backend (lib/quizParser.js) and only runs on GET, so an
    // uploaded quiz file is excluded here rather than stored in a shape
    // that would break the local-only fallback path.
    const safeFileNotes = { ...(notesFromFiles || {}) };
    delete safeFileNotes["Active Recall Quiz"];

    if (backendConfigured) {
      try {
        await api.createTopic(c.name, { name: topicName, type });
        if (Object.keys(safeFileNotes).length) {
          await api.writeTopicNotes(c.name, topicName, safeFileNotes);
        }
        const full = await api.getCourse(c.name);
        setCourses((prev) => prev.map((course, idx) => (idx === ci ? { ...full, topics: full.topics.map((t) => ({ ...t, notes: t.name === topicName ? safeFileNotes : {}, postMortem: [] })) } : course)));
        const key = `${c.name}/${topicName}`;
        setMasteryState((m) => ({ ...m, [key]: "none" }));
        setStatusState((s) => ({ ...s, [key]: "not started" }));
        setDatesState((d) => ({ ...d, [key]: { rookieDate: null, rangerDate: null, retireDate: null } }));
      } catch (err) {
        alert(`Couldn't create topic: ${err.message}`);
      }
      return;
    }

    const newTopic = {
      name: topicName, type, mastery: "none", status: "not started",
      startDate: new Date().toISOString().slice(0, 10),
      rookieDate: null, rangerDate: null, retireDate: null,
      notes: safeFileNotes,
      postMortem: [],
    };
    setCourses((prev) => prev.map((course, idx) => (idx === ci ? { ...course, topics: [...course.topics, newTopic] } : course)));
    const key = `${c.name}/${topicName}`;
    setMasteryState((m) => ({ ...m, [key]: "none" }));
    setStatusState((s) => ({ ...s, [key]: "not started" }));
    setDatesState((d) => ({ ...d, [key]: { rookieDate: null, rangerDate: null, retireDate: null } }));
  }

  // Removes a course entirely, along with every bit of state keyed to its
  // topics (mastery/status/dates/expanded folders). Navigates home first if
  // you're currently looking at the course being removed, so you never land
  // on a page for something that no longer exists.
  async function deleteCourse(ci) {
    const c = courses[ci];
    if (!c) return;
    if (!window.confirm(`Delete "${c.name}" and all its topics? This can't be undone.`)) return;

    if (backendConfigured) {
      try {
        await api.deleteCourse(c.name);
      } catch (err) {
        alert(`Couldn't delete course: ${err.message}`);
        return;
      }
    }

    if (courseIdx === ci) goHome();

    const keysToRemove = c.topics.map((t) => `${c.name}/${t.name}`);
    setMasteryState((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !keysToRemove.includes(k))));
    setStatusState((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !keysToRemove.includes(k))));
    setDatesState((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keysToRemove.includes(k))));
    setExpandedCourses((e) => {
      const next = { ...e };
      delete next[c.name];
      return next;
    });
    setCourses((prev) => prev.filter((_, idx) => idx !== ci));
  }

  // Removes a single topic/chapter from a course. Navigates back to the
  // course page first if you're currently viewing the topic being removed.
  async function deleteTopic(ci, ti) {
    const c = courses[ci];
    const t = c?.topics[ti];
    if (!c || !t) return;
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;

    if (backendConfigured) {
      try {
        await api.deleteTopic(c.name, t.name);
      } catch (err) {
        alert(`Couldn't delete topic: ${err.message}`);
        return;
      }
    }

    if (courseIdx === ci && topicIdx === ti) goCourse(ci);

    const key = `${c.name}/${t.name}`;
    setMasteryState((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });
    setStatusState((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    setDatesState((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    setCourses((prev) =>
      prev.map((course, idx) => (idx === ci ? { ...course, topics: course.topics.filter((_, tIdx) => tIdx !== ti) } : course))
    );
  }

  // Post-Mortem entries live separately from `notes` since they're a growing
  // log (text/image/document) rather than a single markdown file.
  async function addPostMortemEntry(ci, ti, entry) {
    const c = courses[ci];
    const t = c?.topics[ti];
    if (!c || !t) return;

    if (backendConfigured) {
      try {
        await api.addPostMortemEntry(c.name, t.name, entry);
      } catch (err) {
        alert(`Couldn't save post-mortem entry: ${err.message}`);
        return;
      }
    }

    setCourses((prev) =>
      prev.map((course, cIdx) =>
        cIdx !== ci
          ? course
          : {
              ...course,
              topics: course.topics.map((top, tIdx) =>
                tIdx !== ti ? top : { ...top, postMortem: [...(top.postMortem || []), entry] }
              ),
            }
      )
    );
  }
  // Rewrites Post-Mortem.md in the vault minus this entry (see github.js
  // removePostMortemEntry) — this used to only hide the entry in the
  // browser. entryId has to be one the backend actually knows (i.e. the
  // entry came from a GET .../topics/:topicName response); an entry added
  // this same session and not yet reloaded won't match yet, so that case
  // is surfaced with an alert rather than silently pretending it worked.
  async function removePostMortemEntry(ci, ti, entryId) {
    const c = courses[ci];
    const t = c?.topics[ti];
    if (!c || !t) return;

    if (backendConfigured) {
      try {
        await api.removePostMortemEntry(c.name, t.name, entryId);
      } catch (err) {
        alert(
          `Couldn't delete that entry: ${err.message}\n\n` +
            `If you just added it this session, reopen the topic first so it syncs a real id, then delete it.`
        );
        return;
      }
    }

    setCourses((prev) =>
      prev.map((course, cIdx) =>
        cIdx !== ci
          ? course
          : {
              ...course,
              topics: course.topics.map((t, tIdx) =>
                tIdx !== ti ? t : { ...t, postMortem: (t.postMortem || []).filter((e) => e.id !== entryId) }
              ),
            }
      )
    );
  }

  // Writes a generated 4-file note set (from GenerateNotesPanel) into a
  // specific topic — this is what actually populates what gets viewed.
  async function applyGeneratedNotes(ci, ti, generated) {
    const c = courses[ci];
    const t = c?.topics[ti];
    if (!c || !t) return;

    const notesPayload = {
      "Summary and pointers": generated.summary || "",
      "Understanding and Edge Cases": generated.understanding || "",
      "Active Recall Quiz": Array.isArray(generated.quiz) ? generated.quiz : [],
      "Additional Pointers": generated.additionalPointers || "",
    };

    if (backendConfigured) {
      try {
        // Use the backend's own response rather than notesPayload directly —
        // it writes the quiz as real markdown then parses it straight back,
        // so what lands in state matches exactly what's now in the vault.
        const result = await api.writeTopicNotes(c.name, t.name, notesPayload);
        setCourses((prev) =>
          prev.map((course, cIdx) =>
            cIdx !== ci
              ? course
              : { ...course, topics: course.topics.map((top, tIdx) => (tIdx !== ti ? top : { ...top, notes: result.notes })) }
          )
        );
      } catch (err) {
        alert(`Generated notes couldn't be saved to Obsidian: ${err.message}`);
      }
      return;
    }

    setCourses((prev) =>
      prev.map((course, cIdx) =>
        cIdx !== ci
          ? course
          : { ...course, topics: course.topics.map((top, tIdx) => (tIdx !== ti ? top : { ...top, notes: notesPayload })) }
      )
    );
  }

  const getMastery = (courseName, topicName) => masteryState[`${courseName}/${topicName}`];
  const getStatus = (courseName, topicName) => statusState[`${courseName}/${topicName}`];
  const getDates = (courseName, topicName) => datesState[`${courseName}/${topicName}`] || {};

  // Optimistic: local state updates immediately, the real write to Notion
  // fires alongside it. If the write fails, you'll see a console error and
  // an alert — the local value stays changed either way rather than
  // silently reverting, since re-fetching to "undo" would be jarring.
  function setStatus(courseName, topicName, val) {
    setStatusState((s) => ({ ...s, [`${courseName}/${topicName}`]: val }));
    if (backendConfigured) {
      api.setStatus(courseName, topicName, val).catch((err) => {
        console.error("Failed to save status:", err.message);
        alert(`Status changed locally, but saving to Notion failed: ${err.message}`);
      });
    }
  }
  function setMastery(courseName, topicName, val) {
    setMasteryState((m) => ({ ...m, [`${courseName}/${topicName}`]: val }));
    const dateKey = { rookie: "rookieDate", ranger: "rangerDate", retire: "retireDate" }[val];
    if (dateKey) {
      const key = `${courseName}/${topicName}`;
      setDatesState((d) => (d[key]?.[dateKey] ? d : { ...d, [key]: { ...d[key], [dateKey]: new Date().toISOString().slice(0, 10) } }));
    }
    if (backendConfigured) {
      api.setMastery(courseName, topicName, val).catch((err) => {
        console.error("Failed to save mastery:", err.message);
        alert(`Mastery changed locally, but saving to Notion failed: ${err.message}`);
      });
    }
  }

  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [masteryFlyout, setMasteryFlyout] = useState(null); // mastery level string, or null when closed
  const [topicContextMenu, setTopicContextMenu] = useState(null); // { x, y, ci, ti } or null

  function openTopicContextMenu(e, ci, ti) {
    e.preventDefault();
    setTopicContextMenu({ x: e.clientX, y: e.clientY, ci, ti });
  }

  useEffect(() => {
    if (!topicContextMenu) return;
    function close() {
      setTopicContextMenu(null);
    }
    // Right-clicking a different topic already calls preventDefault() in its
    // own handler and re-opens the menu at the new position — only close on
    // a right-click that nothing handled (i.e. blank space), so switching
    // between topics doesn't flicker closed first.
    function closeOnOtherContextMenu(e) {
      if (!e.defaultPrevented) close();
    }
    function closeOnEscape(e) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", closeOnOtherContextMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", closeOnOtherContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [topicContextMenu]);

  function toggleCourse(name) {
    setExpandedCourses((e) => ({ ...e, [name]: !e[name] }));
  }
  function toggleFolder(key) {
    setExpandedFolders((e) => ({ ...e, [key]: !e[key] }));
  }

  const selectedCourse = courseIdx !== null ? courses[courseIdx] : null;
  const selectedTopic = selectedCourse && topicIdx !== null ? selectedCourse.topics[topicIdx] : null;

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const hits = [];
    courses.forEach((c, ci) =>
      c.topics.forEach((t, ti) => {
        if (t.name.toLowerCase().includes(q)) hits.push({ ci, ti, course: c, topic: t, section: null, snippet: null });
        Object.entries(t.notes || {}).forEach(([section, content]) => {
          const text = typeof content === "string" ? content : JSON.stringify(content);
          if (text.toLowerCase().includes(q)) {
            const idx = text.toLowerCase().indexOf(q);
            hits.push({ ci, ti, course: c, topic: t, section, snippet: text.slice(Math.max(0, idx - 30), idx + 50) });
          }
        });
      })
    );
    return hits;
  }, [query]);

  function goHome() { setView("home"); setCourseIdx(null); setTopicIdx(null); }
  function goCourse(ci) {
    setView("course"); setCourseIdx(ci); setTopicIdx(null);
  }
  function openCourseExpanded(ci) {
    goCourse(ci);
    setExpandedCourses((e) => ({ ...e, [courses[ci].name]: true }));
  }
  function goTopic(ci, ti, section) {
    setView("topic"); setCourseIdx(ci); setTopicIdx(ti); setTab(section || "Summary and pointers"); setQuery("");
    const c = courses[ci], t = c.topics[ti];
    // Replace (not merge) so any previously expanded course/folder collapses
    // when a different topic is opened — only the active path stays open.
    setExpandedCourses({ [c.name]: true });
    setExpandedFolders({ [`${c.name}/${getMastery(c.name, t.name)}`]: true });
    loadTopicContent(ci, ti);
  }

  const tabs = ["Summary and pointers", "Understanding and Edge Cases", "Active Recall Quiz", "Additional Pointers", "Post-Mortem"];

  // Cross-course view: every topic grouped by mastery level, ordered by the
  // date that level was actually reached (rookieDate/rangerDate/retireDate),
  // falling back to startDate for topics still at "none".
  const globalMasteryGroups = useMemo(() => {
    const dateKeyFor = { none: null, rookie: "rookieDate", ranger: "rangerDate", retire: "retireDate" };
    return LADDER.map((level) => {
      const items = [];
      courses.forEach((c, ci) => {
        c.topics.forEach((t, ti) => {
          if (getMastery(c.name, t.name) !== level) return;
          const dateKey = dateKeyFor[level];
          const learnedDate = dateKey ? getDates(c.name, t.name)[dateKey] : t.startDate;
          items.push({ ci, ti, course: c, topic: t, learnedDate });
        });
      });
      items.sort((a, b) => {
        if (!a.learnedDate && !b.learnedDate) return 0;
        if (!a.learnedDate) return 1;
        if (!b.learnedDate) return -1;
        return a.learnedDate.localeCompare(b.learnedDate);
      });
      return { level, items };
    });
  }, [masteryState, datesState]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100%", alignItems: "center", justifyContent: "center", background: BG, color: INK_DIM, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
        Loading COMPUTING...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%" }}>
      {loadError && (
        <div style={{ background: "#4A1B0C", color: "#F09979", padding: "8px 16px", fontSize: 13, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
          Couldn't reach the backend ({loadError}) — showing local data instead.
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0, width: "100%", background: BG, fontFamily: "'Source Sans 3', system-ui, sans-serif", color: INK, fontSize: 16, position: "relative" }}>
      {/* Sidebar */}
      {!collapsed && (
        <>
        <div style={{ width: 220, borderRight: `0.5px solid ${LINE}`, padding: "18px 14px", flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", position: "relative" }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <button onClick={goHome} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: 22, color: INK, margin: 0 }}>COMPUTING</p>
            </button>
            <button onClick={() => setCollapsed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: INK_DIM }}>
              <Menu size={16} />
            </button>
          </div>
          {courses.map((c, ci) => {
            const isOpen = !!expandedCourses[c.name];
            const groups = LADDER.map((level) => ({
              level,
              topics: c.topics.filter((t) => getMastery(c.name, t.name) === level),
            }));

            return (
              <div key={c.name} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => { goCourse(ci); toggleCourse(c.name); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 9px", borderRadius: 6, cursor: "pointer", fontSize: 15,
                    background: courseIdx === ci && view !== "topic" ? BG_RAISED : "transparent",
                    color: courseIdx === ci ? INK : INK_DIM,
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0 }}>
                    <ChevronRight size={12} color={INK_DIM} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                  </span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                </div>

                {isOpen && (
                  <div style={{ marginLeft: 10, borderLeft: `1px solid ${LINE}`, paddingLeft: 10, marginTop: 2 }}>
                    {groups.map((g) => {
                      const folderKey = `${c.name}/${g.level}`;
                      const folderOpen = !!expandedFolders[folderKey];
                      return (
                        <div key={g.level} style={{ marginBottom: 2 }}>
                          <div
                            onClick={() => toggleFolder(folderKey)}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", cursor: "pointer" }}
                          >
                            <ChevronRight size={10} color={INK_DIM} style={{ transform: folderOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: MASTERY[g.level].color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: INK_DIM, fontFamily: "ui-monospace, monospace" }}>{MASTERY[g.level].label} ({g.topics.length})</span>
                          </div>
                          {folderOpen && (
                            <div style={{ marginLeft: 16 }}>
                              {g.topics.map((t) => {
                                const ti = c.topics.indexOf(t);
                                const isActive = ci === courseIdx && ti === topicIdx;
                                return (
                                  <div
                                    key={t.name}
                                    onClick={() => goTopic(ci, ti)}
                                    onContextMenu={(e) => openTopicContextMenu(e, ci, ti)}
                                    style={{ padding: "5px 0", fontSize: 14, cursor: "pointer", color: isActive ? INK : INK_DIM }}
                                  >
                                    {t.name}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </div>

          <div style={{ borderTop: `0.5px solid ${LINE}`, margin: "10px 0 10px", flexShrink: 0 }} />
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: INK_DIM, margin: "0 0 6px", padding: "0 9px", flexShrink: 0 }}>by mastery</p>
          <div style={{ flexShrink: 0 }}>
          {globalMasteryGroups.map((g) => {
            const isOpen = masteryFlyout === g.level;
            return (
              <div
                key={g.level}
                onClick={() => setMasteryFlyout((cur) => (cur === g.level ? null : g.level))}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", cursor: "pointer",
                  borderRadius: 6, background: isOpen ? BG_RAISED : "transparent",
                }}
              >
                <ChevronRight size={10} color={INK_DIM} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: MASTERY[g.level].color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: isOpen ? INK : INK_DIM, fontFamily: "ui-monospace, monospace" }}>{MASTERY[g.level].label} ({g.items.length})</span>
              </div>
            );
          })}
          </div>
        </div>

        {masteryFlyout && (() => {
          const group = globalMasteryGroups.find((g) => g.level === masteryFlyout);
          return (
            <div
              style={{
                position: "absolute", left: 220, top: 0, bottom: 0, width: 300, zIndex: 20,
                background: BG_RAISED, borderRight: `0.5px solid ${LINE}`, boxShadow: "4px 0 16px rgba(0,0,0,0.35)",
                display: "flex", flexDirection: "column", padding: "18px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: MASTERY[group.level].color, flexShrink: 0 }} />
                  <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 14, color: INK }}>{MASTERY[group.level].label} ({group.items.length})</p>
                </div>
                <button onClick={() => setMasteryFlyout(null)} style={{ background: "none", border: "none", color: INK_DIM, cursor: "pointer", padding: 0, display: "flex" }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {group.items.length === 0 && <p style={{ fontSize: 13, color: INK_DIM }}>No topics at this level yet.</p>}
                {group.items.map(({ ci, ti, course, topic, learnedDate }) => {
                  const isActive = ci === courseIdx && ti === topicIdx;
                  return (
                    <div
                      key={`${course.name}/${topic.name}`}
                      onClick={() => { goTopic(ci, ti); setMasteryFlyout(null); }}
                      onContextMenu={(e) => { openTopicContextMenu(e, ci, ti); setMasteryFlyout(null); }}
                      style={{ padding: "8px 0", cursor: "pointer", borderBottom: `0.5px solid ${LINE}` }}
                    >
                      <p style={{ margin: 0, fontSize: 14, color: isActive ? INK : "#D8D2C2" }}>{topic.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: INK_DIM, fontFamily: "ui-monospace, monospace" }}>{course.name} — {fmtDate(learnedDate)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        </>
      )}

      {/* Main */}
      <div style={{ flex: 1, padding: "20px 32px", minWidth: 0, overflowY: "auto", background: NOTION_BG, color: NOTION_TEXT }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{ background: "none", border: "none", cursor: "pointer", color: NOTION_TEXT_DIM }}>
              <Menu size={18} />
            </button>
          )}
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} color={NOTION_TEXT_DIM} style={{ position: "absolute", left: 12, top: 10 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all of COMPUTING..."
              style={{ width: "100%", background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 8, padding: "10px 12px 10px 34px", color: NOTION_TEXT, fontSize: 16, boxSizing: "border-box" }}
            />
            {query && (
              <div style={{ position: "absolute", zIndex: 10, width: "100%", marginTop: 6, background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
                {searchResults.length === 0 && <p style={{ padding: 12, fontSize: 13, color: NOTION_TEXT_DIM, margin: 0 }}>No matches.</p>}
                {searchResults.map((r, i) => (
                  <div key={i} onClick={() => goTopic(r.ci, r.ti, r.section)} style={{ padding: "10px 12px", borderBottom: `1px solid ${NOTION_BORDER}`, cursor: "pointer" }}>
                    <p style={{ margin: 0, fontSize: 14, color: NOTION_TEXT }}>{r.course.name} <ChevronRight size={11} style={{ display: "inline", verticalAlign: -1 }} /> {r.topic.name}{r.section ? <> <ChevronRight size={11} style={{ display: "inline", verticalAlign: -1 }} /> {r.section}</> : null}</p>
                    {r.snippet && <p style={{ margin: "2px 0 0", fontSize: 13, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>...{r.snippet}...</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {view === "home" && (
          <div>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM, margin: "0 0 4px" }}>home</p>
            <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 40, margin: "0 0 24px", fontWeight: 700, color: NOTION_TEXT }}>COMPUTING</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {courses.map((c, ci) => {
                const total = c.topics.length;
                const retired = c.topics.filter((t) => getMastery(c.name, t.name) === "retire").length;
                return (
                  <div key={c.name} onClick={() => openCourseExpanded(ci)} style={{ border: `1px solid ${NOTION_BORDER}`, borderRadius: 10, padding: 18, cursor: "pointer", background: NOTION_BG_RAISED, position: "relative" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCourse(ci); }}
                      title={`Delete "${c.name}"`}
                      style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: NOTION_TEXT_DIM, cursor: "pointer", padding: 4, display: "flex" }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 19, fontWeight: 700, color: NOTION_TEXT, margin: "0 0 6px" }}>{c.name}</p>
                      {c.courseCode && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM }}>{c.courseCode}</span>}
                    </div>
                    <p style={{ fontSize: 14, color: NOTION_TEXT_DIM, margin: "0 0 6px", fontFamily: "ui-monospace, monospace" }}>{total} topics — {retired} retired</p>
                    <p style={{ fontSize: 12, color: NOTION_TEXT_DIM, margin: 0 }}>{c.status}{c.professor ? ` · ${c.professor}` : ""}</p>
                  </div>
                );
              })}
              <AddCourseCard onAdd={addCourse} />
            </div>
          </div>
        )}

        {view === "course" && selectedCourse && (
          <div>
            <button onClick={goHome} style={{ ...noteBtnStyle, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <ArrowLeft size={13} /> COMPUTING
            </button>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 34, margin: 0, fontWeight: 700, color: NOTION_TEXT }}>{selectedCourse.name}</h1>
              <button
                onClick={() => deleteCourse(courseIdx)}
                title="Delete this course"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: "6px 10px", color: NOTION_TEXT_DIM, cursor: "pointer", fontSize: 12, flexShrink: 0 }}
              >
                <Trash2 size={13} /> Delete course
              </button>
            </div>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: NOTION_TEXT_DIM, margin: "0 0 20px" }}>
              {[selectedCourse.courseCode, selectedCourse.professor, selectedCourse.email, selectedCourse.status].filter(Boolean).join(" · ")}
            </p>
            <div style={{ borderTop: `1px solid ${NOTION_BORDER}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 32px", padding: "8px 0", fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM }}>
                <span>topic</span><span>status</span><span>mastery</span><span>started</span><span>type</span><span>notes</span><span></span>
              </div>
              {selectedCourse.topics.map((t, ti) => (
                <div key={t.name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 32px", alignItems: "center", padding: "12px 0", borderTop: `1px solid ${NOTION_BORDER}` }}>
                  <span onClick={() => goTopic(courseIdx, ti)} onContextMenu={(e) => openTopicContextMenu(e, courseIdx, ti)} style={{ cursor: "pointer", color: NOTION_TEXT }}>{t.name}</span>
                  <StatusDropdown size="sm" value={getStatus(selectedCourse.name, t.name)} onChange={(v) => setStatus(selectedCourse.name, t.name, v)} />
                  <MasteryDropdown size="sm" level={getMastery(selectedCourse.name, t.name)} onChange={(v) => setMastery(selectedCourse.name, t.name, v)} />
                  <span style={{ fontSize: 13, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>{fmtDate(t.startDate)}</span>
                  <span style={{ fontSize: 13, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>{t.type}</span>
                  <NoteCompleteness topic={t} showFraction />
                  <button
                    onClick={() => deleteTopic(courseIdx, ti)}
                    title={`Delete "${t.name}"`}
                    style={{ background: "none", border: "none", color: NOTION_TEXT_DIM, cursor: "pointer", padding: 4, display: "flex" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <AddTopicRow onAdd={(data) => addTopic(courseIdx, data)} />
            </div>
          </div>
        )}

        {view === "topic" && selectedTopic && (
          <div>
            <button onClick={() => goCourse(courseIdx)} style={{ ...noteBtnStyle, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <ArrowLeft size={13} /> {selectedCourse.name}
            </button>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
              <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 31, margin: 0, fontWeight: 700, color: NOTION_TEXT }}>{selectedTopic.name}</h1>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <StatusDropdown value={getStatus(selectedCourse.name, selectedTopic.name)} onChange={(v) => setStatus(selectedCourse.name, selectedTopic.name, v)} />
                <MasteryDropdown level={getMastery(selectedCourse.name, selectedTopic.name)} onChange={(v) => setMastery(selectedCourse.name, selectedTopic.name, v)} />
                <button
                  onClick={() => deleteTopic(courseIdx, topicIdx)}
                  title={`Delete "${selectedTopic.name}"`}
                  style={{ background: "none", border: `1px solid ${NOTION_BORDER}`, borderRadius: 6, padding: 6, color: NOTION_TEXT_DIM, cursor: "pointer", display: "flex" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM, margin: "0 0 4px" }}>
              {selectedTopic.type} — started {fmtDate(selectedTopic.startDate)}
            </p>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: NOTION_TEXT_DIM, margin: "0 0 10px" }}>
              rookie {fmtDate(getDates(selectedCourse.name, selectedTopic.name).rookieDate)} — ranger {fmtDate(getDates(selectedCourse.name, selectedTopic.name).rangerDate)} — retire {fmtDate(getDates(selectedCourse.name, selectedTopic.name).retireDate)}
            </p>
            <div style={{ marginBottom: 8 }}>
              <NoteCompleteness topic={selectedTopic} showFraction />
            </div>
            <GenerateNotesPanel
              topicName={selectedTopic.name}
              courseName={selectedCourse.name}
              onGenerated={(data) => applyGeneratedNotes(courseIdx, topicIdx, data)}
            />

            <TabBar
              tabs={tabs}
              current={tab}
              onChange={setTab}
              accentColor={MASTERY[getMastery(selectedCourse.name, selectedTopic.name)].color}
            />

            {/* Notion page title for the active file — matches how Notion renders
                a page's own title above its body content, full-bleed on the same
                page background rather than a separate bordered card. */}
            <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 40, fontWeight: 700, color: NOTION_TEXT, margin: "8px 0 20px" }}>
              {FILE_LABELS[tab] || tab}
            </h1>
            <div>
              {tab === "Active Recall Quiz" ? (
                <QuizView
                  questions={selectedTopic.notes["Active Recall Quiz"] || []}
                  currentMastery={getMastery(selectedCourse.name, selectedTopic.name)}
                  onPass={(next) => setMastery(selectedCourse.name, selectedTopic.name, next)}
                />
              ) : tab === "Post-Mortem" ? (
                <PostMortemTab
                  entries={selectedTopic.postMortem || []}
                  onAdd={(entry) => addPostMortemEntry(courseIdx, topicIdx, entry)}
                  onRemove={(entryId) => removePostMortemEntry(courseIdx, topicIdx, entryId)}
                />
              ) : (
                markdownToJsx(selectedTopic.notes[tab])
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {topicContextMenu && (() => {
        const course = courses[topicContextMenu.ci];
        const topic = course?.topics[topicContextMenu.ti];
        if (!topic) return null;
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", left: topicContextMenu.x, top: topicContextMenu.y, zIndex: 50,
              background: NOTION_BG_RAISED, border: `1px solid ${NOTION_BORDER}`, borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)", padding: 4, minWidth: 180,
            }}
          >
            <p style={{ margin: "4px 8px 6px", fontSize: 11, color: NOTION_TEXT_DIM, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {topic.name}
            </p>
            <button
              onClick={() => {
                goTopic(topicContextMenu.ci, topicContextMenu.ti);
                setTopicContextMenu(null);
              }}
              style={{ display: "flex", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 6, padding: "8px 8px", color: NOTION_TEXT, cursor: "pointer", fontSize: 13 }}
            >
              Open
            </button>
            <button
              onClick={() => {
                deleteTopic(topicContextMenu.ci, topicContextMenu.ti);
                setTopicContextMenu(null);
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 6, padding: "8px 8px", color: "#E5877A", cursor: "pointer", fontSize: 13 }}
            >
              <Trash2 size={13} /> Delete topic
            </button>
          </div>
        );
      })()}
      </div>
    </div>
  );
}

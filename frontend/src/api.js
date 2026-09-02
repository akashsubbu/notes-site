// Thin client for the backend. Wired into App.jsx — see main.jsx / App.jsx
// for how VITE_API_BASE / VITE_API_TOKEN get set at build time.

const API_BASE = import.meta.env.VITE_API_BASE; // e.g. https://your-backend.onrender.com
const API_TOKEN = import.meta.env.VITE_API_TOKEN; // matches API_AUTH_TOKEN on the backend

async function request(path, options = {}) {
  if (!API_BASE) throw new Error("VITE_API_BASE is not set — see .env.example.");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getCourses: () => request("/api/courses"),
  getCourse: (courseName) => request(`/api/courses/${encodeURIComponent(courseName)}`),
  createCourse: (course) => request("/api/courses", { method: "POST", body: JSON.stringify(course) }),
  deleteCourse: (courseName) => request(`/api/courses/${encodeURIComponent(courseName)}`, { method: "DELETE" }),

  getTopic: (courseName, topicName) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}`),
  createTopic: (courseName, topic) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics`, { method: "POST", body: JSON.stringify(topic) }),
  deleteTopic: (courseName, topicName) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}`, { method: "DELETE" }),

  // notes: { "Summary and pointers"?: string, "Understanding and Edge Cases"?: string,
  //          "Active Recall Quiz"?: array, "Additional Pointers"?: string }
  writeTopicNotes: (courseName, topicName, notes) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/notes`, {
      method: "POST",
      body: JSON.stringify(notes),
    }),

  setMastery: (courseName, topicName, mastery) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/mastery`, {
      method: "PATCH",
      body: JSON.stringify({ mastery }),
    }),
  setStatus: (courseName, topicName, status) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  addPostMortemEntry: (courseName, topicName, entry) =>
    request(`/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/post-mortem`, {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  // entryId must be one the entry actually has from the backend (the "pm-N"
  // id returned by getTopic) — see the route/github.js for why a freshly
  // client-added, not-yet-reloaded entry won't have a matching one yet.
  removePostMortemEntry: (courseName, topicName, entryId) =>
    request(
      `/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/post-mortem/${encodeURIComponent(entryId)}`,
      { method: "DELETE" }
    ),
  // <img>/<a> tags can't send an Authorization header — the attachment
  // route accepts the token as a query param instead (see backend README).
  attachmentUrl: (courseName, topicName, filename) =>
    `${API_BASE}/api/courses/${encodeURIComponent(courseName)}/topics/${encodeURIComponent(topicName)}/attachments/${encodeURIComponent(filename)}?token=${encodeURIComponent(API_TOKEN)}`,

  addQuickNote: (courseName, text) =>
    request("/api/quick-note", { method: "POST", body: JSON.stringify({ courseName, text }) }),
  getAlerts: () => request("/api/alerts"),
  ackAlert: (id) => request(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" }),
  getCalendarEvents: () => request("/api/calendar/events"),
  createCalendarEvent: (event) => request("/api/calendar/events", { method: "POST", body: JSON.stringify(event) }),
};

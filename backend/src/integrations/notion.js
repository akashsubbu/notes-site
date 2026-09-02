// Notion holds tracking metadata ONLY: course info, topic status/mastery,
// dates. It never stores the actual note text — that's the Obsidian vault's
// job, read and written via github.js. Notion is also the one place, per
// the site's schema, that the site is allowed to write back to (mastery),
// everything else here is read-only.
//
// IMPORTANT: since Notion API version 2025-09-03, a "database" is a
// container for one or more "data sources" — the actual queryable/writable
// thing is the data source, not the database itself. `databases.query`
// doesn't exist anymore; every read/write goes through `dataSources.*`
// with a data_source_id, resolved from a database_id via
// `databases.retrieve`. See https://developers.notion.com/docs/upgrade-guide-2025-09-03

const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY, notionVersion: "2025-09-03" });

// Data source IDs are effectively permanent for a given database, so this
// tiny in-memory cache avoids an extra API call on every single request.
const dataSourceIdCache = new Map();

// Accepts EITHER a database ID or a data source ID — Notion's UI makes it
// genuinely ambiguous which one you end up copying (a "linked view" of a
// database behaves differently from the database itself), so rather than
// require exactly one, this tries both: first as a database (the normal
// case), and if that has no data sources, falls back to treating the given
// ID as a data source ID directly.
async function resolveDataSourceId(rawId) {
  if (dataSourceIdCache.has(rawId)) return dataSourceIdCache.get(rawId);

  try {
    const db = await notion.databases.retrieve({ database_id: rawId });
    const dataSources = db.data_sources || [];
    if (dataSources.length > 0) {
      const id = dataSources[0].id;
      dataSourceIdCache.set(rawId, id);
      return id;
    }
  } catch (err) {
    // Not a valid database ID — fall through and try it as a data source ID.
  }

  try {
    await notion.dataSources.retrieve({ data_source_id: rawId });
    dataSourceIdCache.set(rawId, rawId);
    return rawId;
  } catch (err) {
    throw new Error(
      `"${rawId}" isn't a usable database ID or data source ID. In Notion, open the database's ••• menu → ` +
      `"Manage data sources" → "Copy data source ID" for the most reliable value.`
    );
  }
}

async function queryDataSource(dataSourceId) {
  const results = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

function plainText(richTextArray) {
  return (richTextArray || []).map((t) => t.plain_text).join("");
}

function propText(page, propName) {
  const prop = page.properties[propName];
  if (!prop) return undefined;
  if (prop.type === "title") return plainText(prop.title);
  if (prop.type === "rich_text") return plainText(prop.rich_text);
  if (prop.type === "email") return prop.email || undefined;
  if (prop.type === "url") return prop.url || undefined;
  if (prop.type === "select") return prop.select?.name;
  if (prop.type === "date") return prop.date?.start || null;
  return undefined;
}

async function getCourses() {
  const dataSourceId = await resolveDataSourceId(process.env.NOTION_COURSES_DB_ID);
  const results = await queryDataSource(dataSourceId);

  return results.map((page) => ({
    notionPageId: page.id,
    name: propText(page, "Name"),
    professor: propText(page, "professor"),
    email: propText(page, "email"),
    courseCode: propText(page, "course code"),
    websiteUrl: propText(page, "Notes website"),
    status: propText(page, "Status"),
  }));
}

// Each course page has its OWN local topics table embedded in it (not one
// shared database across all courses) — so instead of following a
// relation, this walks the course page's content blocks looking for an
// embedded database. Prefers one whose title contains "topics" (matching
// the "topics" tab seen in the real setup, alongside "review"/"assignments"
// tabs on the same page); falls back to the first database block found if
// no title match, so this doesn't break on a course page named slightly
// differently. Block reading is unaffected by the data-source change — it
// returns a database ID, which still needs resolving to a data source ID
// before it can actually be queried (see getTopicsForCourse).
async function getTopicsDatabaseIdForCourse(coursePageId) {
  const databaseBlocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: coursePageId, start_cursor: cursor });
    databaseBlocks.push(...res.results.filter((b) => b.type === "child_database"));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  if (databaseBlocks.length === 0) return null;
  const topicsBlock = databaseBlocks.find((b) => b.child_database?.title?.toLowerCase().includes("topic"));
  return (topicsBlock || databaseBlocks[0]).id;
}

async function getTopicsForCourse(coursePageId) {
  const topicsDbId = await getTopicsDatabaseIdForCourse(coursePageId);
  if (!topicsDbId) return { topicsDbId: null, topicsDataSourceId: null, topics: [] };

  const topicsDataSourceId = await resolveDataSourceId(topicsDbId);
  const results = await queryDataSource(topicsDataSourceId);

  const topics = results.map((page) => ({
    notionPageId: page.id,
    name: propText(page, "Name"),
    type: propText(page, "type"),
    mastery: propText(page, "mastery") || "none",
    status: propText(page, "Status") || "not started",
    startDate: propText(page, "Start date"),
    rookieDate: propText(page, "rookie"),
    rangerDate: propText(page, "ranger"),
    retireDate: propText(page, "retire"),
    details: propText(page, "details"),
  }));
  return { topicsDbId, topicsDataSourceId, topics };
}

// The schema's one read+write exception: mastery. Page-level updates
// (writing properties on an existing page) are unaffected by the
// data-source change — only container-level operations needed migrating.
// rookie/ranger/retire exist in Notion as Button properties (manual
// shortcuts that also set this same select field), not separate Date
// properties the API can write milestone dates into — so there's nothing
// further to stamp here.
async function updateTopicMastery(topicPageId, newMastery) {
  return notion.pages.update({
    page_id: topicPageId,
    properties: { mastery: { select: { name: newMastery } } },
  });
}

async function updateTopicStatus(topicPageId, newStatus) {
  return notion.pages.update({
    page_id: topicPageId,
    properties: { Status: { select: { name: newStatus } } },
  });
}

async function getCourseWithTopicsByName(courseName) {
  const courses = await getCourses();
  const course = courses.find((c) => c.name === courseName);
  if (!course) return null;
  const { topics } = await getTopicsForCourse(course.notionPageId);
  return { ...course, topics };
}

async function findTopic(courseName, topicName) {
  const course = await getCourseWithTopicsByName(courseName);
  if (!course) return null;
  const topic = course.topics.find((t) => t.name === topicName);
  if (!topic) return null;
  return { course, topic };
}

// Creates a new Courses row. Per the schema, `Name` must exactly match the
// Obsidian folder name you create alongside it — this function only creates
// the Notion side; creating the matching vault folder is a manual step
// (or could be automated via github.js if you want that later). Page
// creation now targets a data_source_id parent, not a database_id.
async function createCourse({ name, professor, email, courseCode }) {
  const dataSourceId = await resolveDataSourceId(process.env.NOTION_COURSES_DB_ID);
  const properties = { Name: { title: [{ text: { content: name } }] } };
  if (professor) properties["professor"] = { rich_text: [{ text: { content: professor } }] };
  if (email) properties["email"] = { email };
  if (courseCode) properties["course code"] = { rich_text: [{ text: { content: courseCode } }] };
  properties["Status"] = { select: { name: "not started" } };

  const page = await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties,
  });
  return page;
}

// Creates a new topic in a course's OWN local topics table — no shared
// database, no relation to set. If a course page doesn't have a topics
// table yet, this throws with a clear message rather than silently
// creating one somewhere unexpected.
async function createTopic(coursePageId, { name, type }) {
  const topicsDbId = await getTopicsDatabaseIdForCourse(coursePageId);
  if (!topicsDbId) {
    throw new Error("This course has no topics table yet — add one in Notion first (a database titled \"topics\" inside the course page).");
  }
  const dataSourceId = await resolveDataSourceId(topicsDbId);
  const page = await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      type: { select: { name: type || "lecture" } },
      mastery: { select: { name: "none" } },
      Status: { select: { name: "not started" } },
      "Start date": { date: { start: new Date().toISOString().slice(0, 10) } },
    },
  });
  return page;
}

// Notion's API has no permanent delete — archiving is the real mechanism,
// and it's what "Delete" in Notion's own UI does under the hood too.
// Page-level, unaffected by the data-source change.
async function archiveTopic(topicPageId) {
  return notion.pages.update({ page_id: topicPageId, archived: true });
}

async function archiveCourse(coursePageId) {
  const { topics } = await getTopicsForCourse(coursePageId);
  await Promise.all(topics.map((t) => archiveTopic(t.notionPageId)));
  return notion.pages.update({ page_id: coursePageId, archived: true });
}

module.exports = {
  getCourses,
  getTopicsForCourse,
  updateTopicMastery,
  updateTopicStatus,
  getCourseWithTopicsByName,
  findTopic,
  createCourse,
  createTopic,
  archiveTopic,
  archiveCourse,
};

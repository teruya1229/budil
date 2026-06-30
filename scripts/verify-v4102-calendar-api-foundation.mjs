/**
 * Budil v4.10.2 Phase 1 — hub calendar export API foundation verification.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hubLib = join(root, "hub/functions/lib");
const load = (path) => readFileSync(join(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function importHub(moduleName) {
  return import(pathToFileURL(join(hubLib, moduleName)).href);
}

console.log("== v4.10.2 calendar API foundation ==");

execSync("node --check hub/functions/api.js", { cwd: root, stdio: "inherit" });
for (const file of [
  "calendarDates.js",
  "descriptionExtract.js",
  "budilCalendarTransform.js",
  "googleCalendar.js",
  "exportCalendarForBudil.js"
]) {
  execSync(`node --check hub/functions/lib/${file}`, { cwd: root, stdio: "inherit" });
}

const apiJs = load("hub/functions/api.js");
const readme = load("hub/README.md");
const gitignore = load("hub/functions/.gitignore");

assert(apiJs.includes('action === "exportCalendarForBudil"'), "api.js should route exportCalendarForBudil");
assert(apiJs.includes("handleExportCalendarForBudil"), "api.js should call calendar handler");
assert(!apiJs.includes("err.message"), "api.js should not expose raw error messages");
assert(readme.includes("exportCalendarForBudil"), "hub README should document calendar action");
assert(readme.includes("GOOGLE_CALENDAR_SA_JSON"), "hub README should mention calendar secret");
assert(gitignore.includes(".env"), "functions .gitignore should exclude .env");
assert(gitignore.includes("credentials/"), "functions .gitignore should exclude credentials");

const indexHtml = load("index.html");
const appJs = load("js/app.js");
assert(!indexHtml.includes("exportCalendarForBudil"), "Budil index.html should not reference calendar API yet");
assert(!appJs.includes("exportCalendarForBudil"), "Budil app.js should not reference calendar API yet");

const { validateDateRange, daysInclusive } = await importHub("calendarDates.js");
const overRange = validateDateRange("2026-01-01", "2026-06-01");
assert(!overRange.ok && overRange.status === 400, "90+ day range should return 400");
assert(daysInclusive("2026-01-01", "2026-03-31") === 90, "90 day inclusive count");
const invalid = validateDateRange("2026-13-01", "2026-01-31");
assert(!invalid.ok && invalid.status === 400, "invalid date should return 400");

const { buildDedupeKey, mapGoogleEventToApiItem, buildCalendarExportResponse } =
  await importHub("budilCalendarTransform.js");

assert(
  buildDedupeKey("cal-123", "evt-456") === "google_calendar|cal-123|evt-456",
  "dedupeKey format"
);

const mockEvent = {
  id: "evt-mock-001",
  summary: "テスト様 エアコンクリーニング",
  location: "沖縄県南城市",
  description: "氏名：テスト様\n金額：12,000円\n電話：090-1234-5678\n住所：沖縄県南城市",
  start: { dateTime: "2026-07-05T10:00:00+09:00", timeZone: "Asia/Tokyo" },
  end: { dateTime: "2026-07-05T12:00:00+09:00", timeZone: "Asia/Tokyo" }
};

const item = mapGoogleEventToApiItem(mockEvent, {
  calendarId: "primary",
  timezone: "Asia/Tokyo"
});
assert(item.title.includes("テスト様"), "title should map");
assert(item.date === "2026-07-05", "date should map in JST");
assert(item.start.time === "10:00" && item.end.time === "12:00", "start/end time");
assert(item.start.isAllDay === false, "timed event is not all-day");
assert(item.location === "沖縄県南城市", "location");
assert(item.extracted.amount === 12000, "extracted.amount");
assert(item.extracted.customerName === "テスト様", "extracted.customerName");
assert(item.extracted.phone === "090-1234-5678", "extracted.phone");
assert(
  item.budilImport.dedupeKey === "google_calendar|primary|evt-mock-001",
  "budilImport.dedupeKey required"
);
assert(item.budilImport.source === "google_calendar", "budilImport.source");

const payload = buildCalendarExportResponse({
  events: [mockEvent],
  calendarId: "primary",
  timezone: "Asia/Tokyo",
  periodFrom: "2026-07-01",
  periodTo: "2026-07-31",
  fetchedAtIso: "2026-06-30T00:00:00.000Z"
});
assert(payload.ok === true, "response ok");
assert(payload.source === "google_calendar", "response source");
assert(payload.schemaVersion === 1, "schemaVersion");
assert(payload.targetPeriod.from === "2026-07-01", "targetPeriod.from");
assert(payload.meta.itemCount === 1, "meta.itemCount");
assert(Array.isArray(payload.items) && payload.items.length === 1, "items array");

const parsedForBudil = JSON.stringify({ items: payload.items });
const calendarBrain = load("js/calendar-candidate-brain.js");
assert(calendarBrain.includes("parseBudilCalendarEventsJson"), "Budil parser exists for compatibility check");

const { isCalendarConfigured, getCalendarConfig } = await importHub("googleCalendar.js");
const prevSa = process.env.GOOGLE_CALENDAR_SA_JSON;
const prevCal = process.env.GOOGLE_CALENDAR_ID;
delete process.env.GOOGLE_CALENDAR_SA_JSON;
delete process.env.GOOGLE_CALENDAR_ID;
assert(isCalendarConfigured() === false, "calendar should be unconfigured without secret");
assert(getCalendarConfig().calendarId === "primary", "default calendar id is primary");
process.env.GOOGLE_CALENDAR_SA_JSON = prevSa;
process.env.GOOGLE_CALENDAR_ID = prevCal;

const { handleExportCalendarForBudil } = await importHub("exportCalendarForBudil.js");
const logs = [];
const fakeLog = {
  info(tag, data) {
    logs.push({ tag, data });
  }
};
delete process.env.GOOGLE_CALENDAR_SA_JSON;
const unconfigured = await handleExportCalendarForBudil(
  { from: "2099-01-01", to: "2099-01-31" },
  fakeLog
);
assert(unconfigured.status === 503, "unconfigured calendar returns 503");
assert(unconfigured.body.error === "Calendar not configured", "503 error message");
assert(!JSON.stringify(logs).includes("テスト様"), "logs must not contain PII from mocks");
assert(!logs.some((entry) => entry.data && entry.data.items), "logs must not include items array");
process.env.GOOGLE_CALENDAR_SA_JSON = prevSa;

const badRange = await handleExportCalendarForBudil(
  { from: "2099-01-01", to: "2099-06-01" },
  fakeLog
);
assert(badRange.status === 400, "over 90 days returns 400");
assert(badRange.body.error === "Invalid date range", "400 error message");

console.log("All v4.10.2 calendar API foundation checks passed.");

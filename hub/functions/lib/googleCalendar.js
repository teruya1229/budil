import { google } from "googleapis";
import { toRangeBounds } from "./calendarDates.js";

export function getCalendarConfig() {
  const saJson = process.env.GOOGLE_CALENDAR_SA_JSON || "";
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || "primary").trim() || "primary";
  return { saJson: saJson.trim(), calendarId };
}

export function isCalendarConfigured() {
  const { saJson } = getCalendarConfig();
  if (!saJson) return false;
  try {
    JSON.parse(saJson);
    return true;
  } catch {
    return false;
  }
}

async function createCalendarClient() {
  const { saJson } = getCalendarConfig();
  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
  });
  const authClient = await auth.getClient();
  return google.calendar({ version: "v3", auth: authClient });
}

async function listAllCalendarEvents(calendar, { calendarId, timeMin, timeMax }) {
  const events = [];
  let pageToken;

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken
    });
    events.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return events;
}

export async function fetchCalendarEvents({ periodFrom, periodTo }) {
  const { calendarId } = getCalendarConfig();
  const calendar = await createCalendarClient();
  const { timeMin, timeMax } = toRangeBounds(periodFrom, periodTo);
  return listAllCalendarEvents(calendar, { calendarId, timeMin, timeMax });
}

export function mapGoogleError(err) {
  const code = err && (err.code || err.response?.status);
  if (code === 403 || code === 404) {
    return { status: 403, error: "Calendar access denied" };
  }
  if (code === 429) {
    return { status: 429, error: "Rate limit exceeded" };
  }
  return { status: 500, error: "Internal error" };
}

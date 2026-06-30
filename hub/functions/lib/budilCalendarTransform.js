import { extractReceptionFields } from "./descriptionExtract.js";

function formatDateOnlyInTimezone(dateInput, timezone) {
  return new Date(dateInput).toLocaleDateString("sv-SE", { timeZone: timezone });
}

function formatTimeInTimezone(dateTimeText, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(dateTimeText));
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function mapDateTimeBoundary(raw, timezone) {
  if (!raw || typeof raw !== "object") {
    return { time: null, isAllDay: false, date: null };
  }
  if (raw.date && !raw.dateTime) {
    return { time: null, isAllDay: true, date: raw.date };
  }
  if (raw.dateTime) {
    return {
      time: formatTimeInTimezone(raw.dateTime, timezone),
      isAllDay: false,
      date: formatDateOnlyInTimezone(raw.dateTime, timezone)
    };
  }
  return {
    time: null,
    isAllDay: Boolean(raw.date),
    date: raw.date || null
  };
}

export function buildDedupeKey(calendarId, calendarEventId) {
  const cal = String(calendarId || "").trim();
  const ev = String(calendarEventId || "").trim();
  if (!cal || !ev) return "";
  return `google_calendar|${cal}|${ev}`;
}

export function mapGoogleEventToApiItem(event, { calendarId, timezone }) {
  const description = event.description ?? "";
  const title = event.summary || "(no title)";
  const location = event.location || "";
  const extracted = extractReceptionFields(description, { title, location });
  const start = mapDateTimeBoundary(event.start, timezone);
  const end = mapDateTimeBoundary(event.end, timezone);
  const date = start.date || end.date || "";
  const calendarEventId = event.id || "";
  const dedupeKey = buildDedupeKey(calendarId, calendarEventId);

  return {
    title,
    date,
    start: { time: start.time, isAllDay: start.isAllDay },
    end: { time: end.time, isAllDay: end.isAllDay },
    location,
    description,
    extracted: {
      customerName: extracted.customerName || null,
      amount: extracted.amount ?? null,
      address: extracted.address || null,
      phone: extracted.phone || null,
      requestSource: extracted.requestSource || null,
      workType: extracted.workType || null,
      workDetails: extracted.workDetails || null
    },
    budilImport: {
      dedupeKey,
      source: "google_calendar"
    }
  };
}

export function buildCalendarExportResponse({
  events,
  calendarId,
  timezone,
  periodFrom,
  periodTo,
  fetchedAtIso
}) {
  const items = (events || []).map((event) =>
    mapGoogleEventToApiItem(event, { calendarId, timezone })
  );

  items.sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    const aTime = a.start && a.start.time ? a.start.time : "00:00";
    const bTime = b.start && b.start.time ? b.start.time : "00:00";
    return aTime.localeCompare(bTime);
  });

  return {
    ok: true,
    source: "google_calendar",
    schemaVersion: 1,
    fetchedAt: fetchedAtIso,
    timezone,
    targetPeriod: {
      from: periodFrom,
      to: periodTo
    },
    items,
    meta: {
      itemCount: items.length,
      calendarId
    }
  };
}

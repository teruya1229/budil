import {
  resolveDateRange,
  validateDateRange,
  DEFAULT_TIMEZONE
} from "./calendarDates.js";
import { buildCalendarExportResponse } from "./budilCalendarTransform.js";
import {
  fetchCalendarEvents,
  getCalendarConfig,
  isCalendarConfigured,
  mapGoogleError
} from "./googleCalendar.js";

export async function handleExportCalendarForBudil(body = {}, log = console) {
  const started = Date.now();
  const input = body && typeof body === "object" ? body : {};
  const { from, to, timezone } = resolveDateRange({
    from: input.from,
    to: input.to,
    timezone: input.timezone || DEFAULT_TIMEZONE
  });

  const rangeCheck = validateDateRange(from, to);
  if (!rangeCheck.ok) {
    log.info("exportCalendarForBudil", {
      action: "exportCalendarForBudil",
      from,
      to,
      errorCode: rangeCheck.error,
      durationMs: Date.now() - started
    });
    return { status: rangeCheck.status, body: { ok: false, error: rangeCheck.error } };
  }

  if (!isCalendarConfigured()) {
    log.info("exportCalendarForBudil", {
      action: "exportCalendarForBudil",
      from,
      to,
      errorCode: "Calendar not configured",
      durationMs: Date.now() - started
    });
    return {
      status: 503,
      body: { ok: false, error: "Calendar not configured" }
    };
  }

  const { calendarId } = getCalendarConfig();

  try {
    const events = await fetchCalendarEvents({ periodFrom: from, periodTo: to });
    const fetchedAtIso = new Date().toISOString();
    const response = buildCalendarExportResponse({
      events,
      calendarId,
      timezone,
      periodFrom: from,
      periodTo: to,
      fetchedAtIso
    });

    log.info("exportCalendarForBudil", {
      action: "exportCalendarForBudil",
      from,
      to,
      itemCount: response.meta.itemCount,
      durationMs: Date.now() - started
    });

    return { status: 200, body: response };
  } catch (err) {
    const mapped = mapGoogleError(err);
    log.info("exportCalendarForBudil", {
      action: "exportCalendarForBudil",
      from,
      to,
      errorCode: mapped.error,
      durationMs: Date.now() - started
    });
    return { status: mapped.status, body: { ok: false, error: mapped.error } };
  }
}

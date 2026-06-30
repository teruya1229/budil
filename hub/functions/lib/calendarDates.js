export const DEFAULT_TIMEZONE = "Asia/Tokyo";
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 90;

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayInTimezone(timezone) {
  return new Date().toLocaleDateString("sv-SE", { timeZone: timezone || DEFAULT_TIMEZONE });
}

export function addDaysToDateString(dateStr, days, timezone) {
  const base = new Date(`${dateStr}T00:00:00+09:00`);
  base.setDate(base.getDate() + days);
  return base.toLocaleDateString("sv-SE", { timeZone: timezone || DEFAULT_TIMEZONE });
}

export function daysInclusive(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const diff = Math.floor((end - start) / 86400000);
  return diff + 1;
}

export function resolveDateRange(input = {}) {
  const timezone = String(input.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const today = todayInTimezone(timezone);
  const from = String(input.from || today).trim();
  const to = String(input.to || addDaysToDateString(from, DEFAULT_RANGE_DAYS, timezone)).trim();
  return { from, to, timezone };
}

export function validateDateRange(from, to) {
  if (!isValidDateString(from) || !isValidDateString(to)) {
    return { ok: false, status: 400, error: "Invalid date range" };
  }
  if (from > to) {
    return { ok: false, status: 400, error: "Invalid date range" };
  }
  if (daysInclusive(from, to) > MAX_RANGE_DAYS) {
    return { ok: false, status: 400, error: "Invalid date range" };
  }
  return { ok: true };
}

export function toRangeBounds(periodFrom, periodTo) {
  const timeMin = new Date(`${periodFrom}T00:00:00+09:00`).toISOString();
  const endExclusive = new Date(`${periodTo}T00:00:00+09:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const timeMax = endExclusive.toISOString();
  return { timeMin, timeMax };
}

/** Pure helpers for budil-backups (no secrets / no PII / no payload logging). */

export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // 8 MiB — see report for basis.

const CANONICAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MAX_VERSION_LEN = 32;

/** Returns canonical lowercase UUID, or null if missing/blank, or false if invalid. */
export function normalizeIdempotencyKey(
  raw: string | null,
): string | null | false {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (!CANONICAL_UUID_RE.test(lower)) return false;
  return lower;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortValue(obj[key]);
  }
  return sorted;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ExportPayloadValidation =
  | { valid: true; appVersion: string; backupVersion: string; exportedAt: string }
  | { valid: false };

/**
 * Validates the shape of DataBackup.exportPayload() output.
 * Never inspects payload.data contents (no PII access, no schema coupling).
 */
export function validateExportPayloadShape(body: unknown): ExportPayloadValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false };
  }
  const obj = body as Record<string, unknown>;

  const appVersion = obj.appVersion;
  if (
    typeof appVersion !== "string" ||
    appVersion.trim().length === 0 ||
    appVersion.length > MAX_VERSION_LEN
  ) {
    return { valid: false };
  }

  const backupVersion = obj.backupVersion;
  if (
    typeof backupVersion !== "string" ||
    backupVersion.trim().length === 0 ||
    backupVersion.length > MAX_VERSION_LEN
  ) {
    return { valid: false };
  }

  const exportedAt = obj.exportedAt;
  if (typeof exportedAt !== "string" || Number.isNaN(Date.parse(exportedAt))) {
    return { valid: false };
  }

  const data = obj.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false };
  }

  return { valid: true, appVersion, backupVersion, exportedAt };
}

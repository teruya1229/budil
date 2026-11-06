import { createSupabaseContext } from "npm:@supabase/server@1.3.0";
import {
  MAX_PAYLOAD_BYTES,
  normalizeIdempotencyKey,
  sha256Hex,
  stableStringify,
  validateExportPayloadShape,
} from "./helpers.ts";

// Budil v4.13.0 Phase 1: cloud backup snapshot API.
// POST   /functions/v1/budil-backups         -> create an immutable snapshot
// GET    /functions/v1/budil-backups/latest  -> latest snapshot metadata only
//
// Exact-match CORS only (no wildcard). Never logs payload / PII / secrets.

const ALLOWED_ORIGINS = new Set([
  "https://teruya1229.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-idempotency-key";
const CORS_ALLOW_METHODS = "POST, GET, OPTIONS";

function baseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function corsHeadersFor(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function jsonError(
  status: number,
  code: string,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: baseHeaders(extraHeaders),
  });
}

function jsonOk(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: baseHeaders(extraHeaders),
  });
}

function logEvent(event: string, detail?: string): void {
  // Never log payload contents, PII, tokens, or API keys — code + safe detail only.
  if (detail) {
    console.error(event, detail);
  } else {
    console.error(event);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const origin = request.headers.get("Origin");
    const pathname = new URL(request.url).pathname;
    const isLatestRoute = pathname.endsWith("/latest");
    const isDownloadRoute = pathname.endsWith("/latest/payload");

    let responseCors: HeadersInit | undefined;

    // 1. Origin allow-list (exact match only)
    if (origin !== null) {
      if (!ALLOWED_ORIGINS.has(origin)) {
        return jsonError(403, "origin_not_allowed", {
          "Vary": "Origin",
          "Cache-Control": "no-store",
        });
      }
      responseCors = corsHeadersFor(origin);
    }

    if (method === "OPTIONS") {
      if (origin !== null && responseCors) {
        return new Response(null, {
          status: 204,
          headers: new Headers(responseCors),
        });
      }
      return jsonError(403, "origin_not_allowed", {
        "Cache-Control": "no-store",
      });
    }

    if (isLatestRoute || isDownloadRoute) {
      if (method !== "GET") {
        return jsonError(405, "method_not_allowed", responseCors);
      }
    } else if (method !== "POST") {
      return jsonError(405, "method_not_allowed", responseCors);
    }

    // 2. JWT
    const { data: ctx, error: authError } = await createSupabaseContext(
      request,
      { auth: "user" },
    );

    if (authError || !ctx?.userClaims?.id) {
      return jsonError(401, "unauthorized", responseCors);
    }

    const userId = ctx.userClaims.id;

    // 3. active membership: exactly one allowed
    const {
      data: memberships,
      error: membershipError,
    } = await ctx.supabaseAdmin
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(2);

    if (membershipError) {
      logEvent("dependency_unavailable", "membership_lookup");
      return jsonError(503, "dependency_unavailable", responseCors);
    }

    if (!Array.isArray(memberships) || memberships.length !== 1) {
      return jsonError(403, "active_membership_required", responseCors);
    }

    const membershipTenantId = memberships[0].tenant_id;

    // 4. active tenant (server-derived only; client never supplies tenant_id/tenant_code)
    const { data: tenant, error: tenantError } = await ctx.supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("id", membershipTenantId)
      .eq("status", "active")
      .maybeSingle();

    if (tenantError) {
      logEvent("dependency_unavailable", "tenant_lookup");
      return jsonError(503, "dependency_unavailable", responseCors);
    }

    if (!tenant?.id) {
      return jsonError(403, "active_tenant_required", responseCors);
    }

    // ---------------------------------------------------------------------
    // GET /latest
    // ---------------------------------------------------------------------
    if (isLatestRoute || isDownloadRoute) {
      const { data: latest, error: latestError } = await ctx.supabaseAdmin
        .from("budil_snapshots")
        .select(isDownloadRoute ? "id, created_at, app_version, backup_version, content_hash, payload" : "id, created_at, app_version, backup_version, content_hash")
        .eq("tenant_id", membershipTenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        logEvent("dependency_unavailable", "latest_lookup");
        return jsonError(503, "dependency_unavailable", responseCors);
      }

      if (!latest) {
        return jsonOk(200, { latest: null }, responseCors);
      }

      // Full payload is returned ONLY to the authenticated, single-tenant
      // owner, never in logs. It is not automatically applied to this device.
      if (isDownloadRoute) {
        if (!latest.payload || typeof latest.payload !== "object") {
          return jsonError(503, "snapshot_unavailable", responseCors);
        }
        return jsonOk(200, {
          latest: {
            snapshotId: latest.id,
            createdAt: latest.created_at,
            appVersion: latest.app_version,
            backupVersion: latest.backup_version,
            contentHash: latest.content_hash,
            payload: latest.payload,
          },
        }, responseCors);
      }
      return jsonOk(200, {
        latest: {
          snapshotId: latest.id,
          createdAt: latest.created_at,
          appVersion: latest.app_version,
          backupVersion: latest.backup_version,
          contentHash: latest.content_hash,
        },
      }, responseCors);
    }

    // ---------------------------------------------------------------------
    // POST create snapshot
    // ---------------------------------------------------------------------
    const idempotencyRaw = request.headers.get("x-idempotency-key");
    const normalizedKey = normalizeIdempotencyKey(idempotencyRaw);
    if (normalizedKey === null) {
      return jsonError(400, "idempotency_key_required", responseCors);
    }
    if (normalizedKey === false) {
      return jsonError(400, "invalid_idempotency_key", responseCors);
    }

    // 5. size guard — read as text first so an oversized body never reaches JSON.parse
    const rawText = await request.text();
    const byteLength = new TextEncoder().encode(rawText).length;
    if (byteLength > MAX_PAYLOAD_BYTES) {
      return jsonError(413, "payload_too_large", responseCors);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return jsonError(400, "invalid_json", responseCors);
    }

    const validation = validateExportPayloadShape(payload);
    if (!validation.valid) {
      return jsonError(400, "invalid_backup_payload", responseCors);
    }

    // 6. content hash — always server-computed; client-supplied hash fields are ignored.
    const contentHash = await sha256Hex(stableStringify(payload));

    // 7. atomic insert (unique on tenant_id + idempotency_key prevents double-create)
    const { data: inserted, error: insertError } = await ctx.supabaseAdmin
      .from("budil_snapshots")
      .insert({
        tenant_id: membershipTenantId,
        created_by: userId,
        app_version: validation.appVersion,
        backup_version: validation.backupVersion,
        exported_at: validation.exportedAt,
        payload,
        content_hash: contentHash,
        idempotency_key: normalizedKey,
      })
      .select("id, created_at, app_version")
      .maybeSingle();

    if (insertError) {
      // unique conflict → inspect existing (never auto-overwrite, never duplicate)
      if (insertError.code === "23505") {
        const { data: existing, error: existingError } = await ctx.supabaseAdmin
          .from("budil_snapshots")
          .select("id, created_at, app_version, content_hash")
          .eq("tenant_id", membershipTenantId)
          .eq("idempotency_key", normalizedKey)
          .maybeSingle();

        if (existingError || !existing) {
          logEvent("dependency_unavailable", "idempotency_lookup");
          return jsonError(503, "dependency_unavailable", responseCors);
        }

        if (existing.content_hash !== contentHash) {
          return jsonError(409, "idempotency_conflict", responseCors);
        }

        return jsonOk(200, {
          snapshotId: existing.id,
          createdAt: existing.created_at,
          contentHash: existing.content_hash,
          appVersion: existing.app_version,
        }, responseCors);
      }

      logEvent("dependency_unavailable", "snapshot_insert");
      return jsonError(503, "dependency_unavailable", responseCors);
    }

    if (!inserted?.id) {
      logEvent("dependency_unavailable", "snapshot_insert_empty");
      return jsonError(503, "dependency_unavailable", responseCors);
    }

    return jsonOk(201, {
      snapshotId: inserted.id,
      createdAt: inserted.created_at,
      contentHash,
      appVersion: inserted.app_version,
    }, responseCors);
  },
};

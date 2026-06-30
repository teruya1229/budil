/**
 * Budil BT Hub — Cloud Functions（v2）
 * 受付 intake の Budil 取り込み・一覧・確認済み
 */
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { handleExportCalendarForBudil } from "./lib/exportCalendarForBudil.js";

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const COL = "receptionIntakes";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
};

function json(res, status, body) {
  res.set(CORS);
  res.status(status).json(body);
}

function getApiKey(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return (req.headers["x-api-key"] || req.query.apiKey || "").toString().trim();
}

function requireKey(req, res) {
  const expected = process.env.BUDIL_HUB_API_KEY || "";
  if (!expected) {
    json(res, 503, { ok: false, error: "BUDIL_HUB_API_KEY not configured" });
    return false;
  }
  const key = getApiKey(req);
  if (!key || key !== expected) {
    json(res, 401, { ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function stableId(raw) {
  return createHash("sha256").update(String(raw)).digest("hex").slice(0, 16);
}

function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

function mapDoc(id, data) {
  const d = data || {};
  return {
    id,
    customerName: d.customerName || "",
    source: d.source || "",
    phone: d.phone || "",
    address: d.address || "",
    serviceText: d.serviceText || "",
    memo: d.memo || "",
    estimateAmount: Number(d.estimateAmount) || 0,
    status: d.status || "new",
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    importedToBudil: d.importedToBudil === true,
    importedAt: d.importedAt || null,
    budilIntakeId: d.budilIntakeId || ""
  };
}

function budilPayloadFromHub(item) {
  const now = new Date().toISOString();
  return {
    id: "hub-" + stableId(item.id),
    customerName: item.customerName,
    source: item.source,
    phone: item.phone,
    address: item.address,
    serviceText: item.serviceText,
    memo: item.memo,
    estimateAmount: item.estimateAmount,
    preferredDatesText: "",
    handlingStatus: "",
    status: "new",
    relatedLeadId: "",
    relatedRevenueId: "",
    relatedWorkOrderId: "",
    relatedWorkOrderIds: [],
    relatedTaskIds: [],
    createdAt: item.createdAt || now,
    updatedAt: now,
    hubSourceId: item.id
  };
}

export const api = onRequest({ cors: false, maxInstances: 10 }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set(CORS);
    res.status(204).send("");
    return;
  }
  if (!requireKey(req, res)) return;

  const action = (req.query.action || req.body?.action || "").toString();

  try {
    if (action === "listIntakes") {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const snap = await db.collection(COL).orderBy("createdAt", "desc").limit(limit).get();
      const items = snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
      json(res, 200, { ok: true, items });
      return;
    }

    if (action === "listPendingIntakes") {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const snap = await db
        .collection(COL)
        .where("importedToBudil", "==", false)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      const items = snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
      json(res, 200, { ok: true, items });
      return;
    }

    if (action === "exportForBudil") {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      let items = [];
      if (ids.length) {
        const snaps = await Promise.all(
          ids.map((id) => db.collection(COL).doc(id).get())
        );
        items = snaps.filter((s) => s.exists).map((s) => mapDoc(s.id, s.data()));
      } else {
        const snap = await db
          .collection(COL)
          .where("importedToBudil", "==", false)
          .orderBy("createdAt", "desc")
          .limit(50)
          .get();
        items = snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
      }
      const intakes = items.map(budilPayloadFromHub);
      json(res, 200, { ok: true, intakes, hubIds: items.map((i) => i.id) });
      return;
    }

    if (action === "markImported") {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (!ids.length) {
        json(res, 400, { ok: false, error: "ids required" });
        return;
      }
      const batch = db.batch();
      const now = new Date().toISOString();
      ids.forEach((id) => {
        batch.update(db.collection(COL).doc(id), {
          importedToBudil: true,
          importedAt: now,
          updatedAt: now,
          budilIntakeId: "hub-" + stableId(id)
        });
      });
      await batch.commit();
      json(res, 200, { ok: true, marked: ids.length });
      return;
    }

    if (action === "exportCalendarForBudil") {
      const result = await handleExportCalendarForBudil(req.body || {}, console);
      json(res, result.status, result.body);
      return;
    }

    json(res, 400, {
      ok: false,
      error: "Unknown action",
      allowed: [
        "listIntakes",
        "listPendingIntakes",
        "exportForBudil",
        "markImported",
        "exportCalendarForBudil"
      ]
    });
  } catch (err) {
    console.error("api error", { action: req.query.action || req.body?.action || "" });
    json(res, 500, { ok: false, error: "Internal error" });
  }
});

#!/usr/bin/env node
/**
 * Budil backup JSON READ CLI.
 * DataBackup.validatePayload + RevenueConfirmationQueue.collect を READ 専用実行する。
 * localStorage / 入力JSON / Chrome への書込なし。処理前後のファイル hash を比較する。
 *
 *   node scripts/budil-backup-read-cli.mjs --file <path> [--today YYYY-MM-DD] [--now ISO]
 *   node scripts/budil-backup-read-cli.mjs --dir <dir>
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const STALE_HOURS = 24;
const BACKUP_NAME_RE = /^budil-backup-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.json$/i;
const AI_SNAPSHOT_NAME_RE = /^budil-ai-snapshot-\d{4}-\d{2}-\d{2}-\d{6}(?: \(\d+\))?\.json$/i;
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USER_ACTION = 2;

function sha256Buf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function loadJs(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = val;
        i += 1;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

function printResult(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function fail(code, payload, exitCode) {
  printResult({ ok: false, write: 0, code, ...payload });
  process.exit(exitCode);
}

function createBrainContext() {
  const ctx = createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    RegExp,
    BigInt,
    module: { exports: {} },
    exports: {},
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error('WRITE_FORBIDDEN'); },
      removeItem() { throw new Error('WRITE_FORBIDDEN'); },
      clear() { throw new Error('WRITE_FORBIDDEN'); }
    }
  });
  runInContext(loadJs('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(loadJs('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(loadJs('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(loadJs('js/revenue-confirmation-queue.js'), ctx, { filename: 'revenue-confirmation-queue.js' });
  runInContext(loadJs('js/data-backup.js'), ctx, { filename: 'data-backup.js' });
  runInContext(
    'this.CalendarCandidateBrain = CalendarCandidateBrain;'
    + ' this.WorkOrderBrain = WorkOrderBrain;'
    + ' this.WorkCompletionBrain = WorkCompletionBrain;'
    + ' this.RevenueConfirmationQueue = RevenueConfirmationQueue;'
    + ' this.DataBackup = DataBackup;',
    ctx
  );
  return ctx;
}

function assertSafeFilePath(pathText) {
  const resolved = resolve(String(pathText));
  if (!resolved || resolved.includes('\0')) throw new Error('path_rejected');
  if (String(pathText).includes('..') || String(pathText).startsWith('\\\\')) {
    throw new Error('path_rejected');
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error('backup_file_missing');
  }
  const size = statSync(resolved).size;
  if (size <= 0 || size > MAX_FILE_BYTES) throw new Error('backup_file_size');
  return resolved;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function nonempty(v) {
  return v != null && String(v).trim() !== '';
}

function assessNaturalness(validation, bytes) {
  const data = validation.data || {};
  const keys = Array.isArray(validation.dataKeys) ? validation.dataKeys : Object.keys(data);
  const revenues = asList(data.budil_revenue_records);
  const workOrders = asList(data.budil_work_orders);
  const documents = asList(data.budil_documents);
  const leads = asList(data.budil_leads);
  const expenses = asList(data.budil_expense_records);
  const keyCount = keys.filter((k) => String(k).startsWith('budil_')).length;
  const recordMass = revenues.length + workOrders.length + documents.length + leads.length + expenses.length;
  const reasons = [];

  if (!validation.valid) {
    return { natural: false, code: 'invalid_payload', reasons: [validation.error || 'invalid_payload'], keyCount, recordMass };
  }
  if (!keys.includes('budil_revenue_records') || !keys.includes('budil_work_orders')) {
    reasons.push('missing_core_keys');
  }
  const emptyLab = revenues.length === 0 && workOrders.length <= 1;
  if (emptyLab && (keyCount < 10 || bytes < 250000 || documents.length === 0)) {
    reasons.push('empty_or_lab_snapshot');
  }
  if (recordMass === 0) reasons.push('zero_records');
  if (reasons.length) {
    return { natural: false, code: reasons[0], reasons, keyCount, recordMass };
  }
  return { natural: true, code: 'ok', reasons: [], keyCount, recordMass };
}

function projectRevenue(row) {
  const r = row && typeof row === 'object' ? row : {};
  return {
    id: String(r.id || ''),
    customerName: String(r.customerName || ''),
    workDate: String(r.workDate || ''),
    amount: r.amount,
    paymentMethod: String(r.paymentMethod || ''),
    status: String(r.status || ''),
    isConfirmedRevenue: r.isConfirmedRevenue === true,
    sourceWorkOrderId: String(r.sourceWorkOrderId || r.workOrderId || ''),
    linkedDocumentId: String(r.linkedDocumentId || '')
  };
}

function projectWorkOrder(row) {
  const w = row && typeof row === 'object' ? row : {};
  return {
    id: String(w.id || ''),
    customer: String(w.customerName || ''),
    scheduledDate: String(w.scheduledDate || ''),
    amount: w.estimateAmount,
    actualRevenueId: String(w.actualRevenueId || ''),
    status: String(w.status || '')
  };
}

function projectDocument(row) {
  const d = row && typeof row === 'object' ? row : {};
  const amount = d.total != null && d.total !== '' ? d.total : d.amount;
  return {
    id: String(d.id || ''),
    type: String(d.type || ''),
    linkedRevenueId: String(d.linkedRevenueId || ''),
    customer: String(d.customerName || ''),
    amount
  };
}

function paymentForWorkOrder(woId, revenues) {
  const id = String(woId || '').trim();
  if (!id) return '';
  const hit = (revenues || []).find((r) => {
    if (!r || typeof r !== 'object') return false;
    return String(r.sourceWorkOrderId || r.workOrderId || '').trim() === id;
  });
  return hit ? String(hit.paymentMethod || '') : '';
}

function parseExportedAt(iso) {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function localDateFromIso(iso, now) {
  const d = parseExportedAt(iso) || now;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayFromNow(now) {
  return localDateFromIso(now.toISOString(), now);
}

function listBackupCandidates(dirPath) {
  const resolved = resolve(String(dirPath));
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error('backup_dir_missing');
  }
  const names = readdirSync(resolved);
  const ai = names
    .filter((name) => AI_SNAPSHOT_NAME_RE.test(name))
    .map((name) => join(resolved, name));
  if (ai.length) {
    return { dir: resolved, files: ai, kind: 'ai-snapshot' };
  }
  const regular = names
    .filter((name) => BACKUP_NAME_RE.test(name))
    .map((name) => join(resolved, name));
  return { dir: resolved, files: regular, kind: 'backup' };
}

function inspectFile(ctx, filePath) {
  const resolved = assertSafeFilePath(filePath);
  const st = statSync(resolved);
  const buf = readFileSync(resolved);
  const hashBefore = sha256Buf(buf);
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch {
    return {
      path: resolved,
      name: basename(resolved),
      bytes: st.size,
      mtimeMs: st.mtimeMs,
      hashBefore,
      hashAfter: sha256Buf(readFileSync(resolved)),
      validation: { valid: false, error: 'JSONの形式が正しくありません' },
      natural: { natural: false, code: 'invalid_json', reasons: ['invalid_json'] }
    };
  }
  const validation = runInContext(
    'DataBackup.validatePayload(payload)',
    Object.assign(ctx, { payload: parsed })
  );
  const natural = assessNaturalness(validation, st.size);
  const hashAfter = sha256Buf(readFileSync(resolved));
  return {
    path: resolved,
    name: basename(resolved),
    bytes: st.size,
    mtimeMs: st.mtimeMs,
    hashBefore,
    hashAfter,
    hashUnchanged: hashBefore === hashAfter,
    exportedAt: parsed && parsed.exportedAt ? String(parsed.exportedAt) : null,
    backupVersion: parsed && (parsed.backupVersion || parsed.appVersion) ? String(parsed.backupVersion || parsed.appVersion) : null,
    appVersion: parsed && parsed.appVersion ? String(parsed.appVersion) : null,
    validation,
    natural,
    parsed
  };
}

function pickLatestNatural(inspected) {
  const rejected = [];
  const usable = [];
  for (const item of inspected) {
    if (!item.hashUnchanged) {
      rejected.push({ name: item.name, code: 'hash_changed' });
      continue;
    }
    if (!item.validation || item.validation.valid !== true) {
      rejected.push({ name: item.name, code: 'invalid_payload' });
      continue;
    }
    if (!item.natural.natural) {
      rejected.push({ name: item.name, code: item.natural.code, reasons: item.natural.reasons });
      continue;
    }
    usable.push(item);
  }
  usable.sort((a, b) => {
    const ae = parseExportedAt(a.exportedAt);
    const be = parseExportedAt(b.exportedAt);
    const at = ae ? ae.getTime() : 0;
    const bt = be ? be.getTime() : 0;
    if (at !== bt) return bt - at;
    return (b.mtimeMs || 0) - (a.mtimeMs || 0);
  });
  return { chosen: usable[0] || null, rejected, usableCount: usable.length };
}

function buildReadResult(ctx, inspected, now, todayOverride, selectionMeta) {
  if (!inspected.hashUnchanged) {
    return {
      ok: false,
      status: 'USER_ACTION_REQUIRED',
      code: 'hash_changed',
      write: 0
    };
  }
  const validation = inspected.validation;
  const data = validation.data || {};
  const revenuesRaw = asList(data.budil_revenue_records);
  const workOrdersRaw = asList(data.budil_work_orders);
  const documentsRaw = asList(data.budil_documents);
  const exportedAt = inspected.exportedAt;
  const exportedDate = parseExportedAt(exportedAt);
  const ageMs = exportedDate ? Math.max(0, now.getTime() - exportedDate.getTime()) : null;
  const ageHours = ageMs == null ? null : ageMs / 3600000;
  const freshness = ageHours == null || ageHours > STALE_HOURS ? 'STALE_SNAPSHOT' : 'CURRENT';
  const snapshotDate = exportedDate
    ? localDateFromIso(exportedAt, now)
    : null;
  const today = todayOverride || todayFromNow(now);

  const queue = runInContext(
    'RevenueConfirmationQueue.collect(workOrders, revenues, today, opts)',
    Object.assign(ctx, {
      workOrders: workOrdersRaw,
      revenues: revenuesRaw,
      today,
      opts: { scheduleMode: false, previewLimit: 10000, pastRecoveryUiEnabled: false }
    })
  );

  const revenues = revenuesRaw.map(projectRevenue);
  const workOrders = workOrdersRaw.map(projectWorkOrder);
  const documents = documentsRaw.map(projectDocument);
  const pending = (queue.items || []).map((item) => ({
    customer: String(item.customerName || ''),
    scheduledDate: String(item.scheduledDate || ''),
    amount: item.amount,
    paymentMethod: paymentForWorkOrder(item.id, revenuesRaw),
    workOrderId: String(item.id || ''),
    reason: String(item.statusLabel || ''),
    type: String(item.type || 'work-order')
  }));
  const confirmed = revenues.filter((r) => {
    const status = String(r.status || '');
    return status === '確定' || status === '完了' || r.isConfirmedRevenue === true;
  });
  const wcSummary = runInContext(
    'WorkCompletionBrain.summarizeTargets(workOrders, revenues, today)',
    Object.assign(ctx, {
      workOrders: workOrdersRaw,
      revenues: revenuesRaw,
      today
    })
  );

  return {
    ok: true,
    status: freshness === 'STALE_SNAPSHOT' ? 'STALE_SNAPSHOT' : 'ok',
    freshness,
    pendingAsCurrent: freshness === 'CURRENT',
    write: 0,
    snapshot: {
      path: inspected.path,
      name: inspected.name,
      exportedAt,
      snapshotDate,
      snapshotAgeHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
      snapshotAgeDays: ageHours == null ? null : Math.floor(ageHours / 24),
      backupVersion: inspected.backupVersion,
      appVersion: inspected.appVersion,
      bytes: inspected.bytes,
      sha256: inspected.hashBefore,
      hashUnchanged: true,
      asOfToday: today
    },
    selection: selectionMeta || { auto: false, rejected: [] },
    counts: {
      revenue: revenues.length,
      workOrders: workOrders.length,
      documents: documents.length,
      pending: pending.length,
      confirmed: confirmed.length,
      workCompletionPending: wcSummary && wcSummary.pendingConfirmCount != null
        ? wcSummary.pendingConfirmCount
        : null
    },
    revenues,
    workOrders,
    documents,
    pending,
    confirmedRevenues: confirmed,
    queue: {
      totalCount: queue.totalCount,
      workOrderCount: queue.workOrderCount,
      pastRecoveryCount: queue.pastRecoveryCount
    },
    natural: inspected.natural
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['input-json']) {
    fail('input_json_rejected', { message: '--input-json は使えません' }, EXIT_USER_ACTION);
  }
  const now = args.now ? new Date(String(args.now)) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail('invalid_now', { message: '--now が不正です' }, EXIT_FAIL);
  }
  const todayOverride = args.today ? String(args.today).trim() : '';
  if (todayOverride && !/^\d{4}-\d{2}-\d{2}$/.test(todayOverride)) {
    fail('invalid_today', { message: '--today は YYYY-MM-DD です' }, EXIT_FAIL);
  }

  const ctx = createBrainContext();
  let inspected;
  let selectionMeta = { auto: false, rejected: [] };

  if (args.file) {
    inspected = inspectFile(ctx, args.file);
    if (!inspected.hashUnchanged) {
      fail('hash_changed', { write: 0, status: 'USER_ACTION_REQUIRED' }, EXIT_USER_ACTION);
    }
    if (!inspected.validation.valid) {
      fail('invalid_payload', {
        write: 0,
        status: 'USER_ACTION_REQUIRED',
        message: inspected.validation.error || 'invalid_payload'
      }, EXIT_USER_ACTION);
    }
    if (!inspected.natural.natural) {
      fail('USER_ACTION_REQUIRED', {
        write: 0,
        status: 'USER_ACTION_REQUIRED',
        code: 'empty_or_lab_snapshot',
        reasons: inspected.natural.reasons,
        file: inspected.name
      }, EXIT_USER_ACTION);
    }
  } else {
    const dir = args.dir || join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
    let listed;
    try {
      listed = listBackupCandidates(dir);
    } catch (err) {
      fail('backup_dir_missing', {
        write: 0,
        status: 'USER_ACTION_REQUIRED',
        message: String(err && err.message || err)
      }, EXIT_USER_ACTION);
    }
    const files = listed.files;
    if (!files.length) {
      fail('USER_ACTION_REQUIRED', {
        write: 0,
        status: 'USER_ACTION_REQUIRED',
        code: 'no_backup_candidates',
        dir
      }, EXIT_USER_ACTION);
    }
    // newest-first; stop at first natural+CURRENT (skip remaining AI/backup and Browser)
    const ordered = files.slice().sort((a, b) => {
      try {
        const am = statSync(a).mtimeMs || 0;
        const bm = statSync(b).mtimeMs || 0;
        if (am !== bm) return bm - am;
      } catch (_) {}
      return String(b).localeCompare(String(a));
    });
    const rejected = [];
    let chosen = null;
    let earlyStopUsed = false;
    let inspectedCount = 0;
    for (const f of ordered) {
      const item = inspectFile(ctx, f);
      inspectedCount += 1;
      if (!item.hashUnchanged) {
        rejected.push({ name: item.name, code: 'hash_changed' });
        continue;
      }
      if (!item.validation || item.validation.valid !== true) {
        rejected.push({ name: item.name, code: 'invalid_payload' });
        continue;
      }
      if (!item.natural.natural) {
        rejected.push({ name: item.name, code: item.natural.code, reasons: item.natural.reasons });
        continue;
      }
      const exportedDate = parseExportedAt(item.exportedAt);
      const ageMs = exportedDate ? Math.max(0, now.getTime() - exportedDate.getTime()) : null;
      const ageHours = ageMs == null ? null : ageMs / 3600000;
      const freshness = ageHours == null || ageHours > STALE_HOURS ? 'STALE_SNAPSHOT' : 'CURRENT';
      chosen = item;
      if (freshness === 'CURRENT') {
        earlyStopUsed = inspectedCount < ordered.length || listed.kind === 'ai-snapshot';
        break;
      }
      // STALE natural: keep as fallback but continue looking for newer CURRENT
      // (ordered newest-first, so first natural is newest; if STALE, remaining are older)
      earlyStopUsed = listed.kind === 'ai-snapshot';
      break;
    }
    selectionMeta = {
      auto: true,
      rejected,
      usableCount: chosen ? 1 : 0,
      dir,
      kind: listed.kind,
      earlyStopUsed,
      inspectedCount,
      candidateCount: ordered.length,
      skippedRegularBackup: listed.kind === 'ai-snapshot',
      browserCalls: 0
    };
    if (!chosen) {
      fail('USER_ACTION_REQUIRED', {
        write: 0,
        status: 'USER_ACTION_REQUIRED',
        code: 'no_natural_snapshot',
        selection: selectionMeta
      }, EXIT_USER_ACTION);
    }
    inspected = chosen;
  }

  const result = buildReadResult(ctx, inspected, now, todayOverride || '', selectionMeta);
  const hashFinal = sha256Buf(readFileSync(inspected.path));
  if (hashFinal !== inspected.hashBefore) {
    fail('hash_changed', { write: 0, status: 'USER_ACTION_REQUIRED' }, EXIT_USER_ACTION);
  }
  printResult(result);
  process.exit(EXIT_OK);
}

try {
  main();
} catch (err) {
  const message = String(err && err.message || err);
  const code = message === 'path_rejected' || message === 'backup_file_missing' || message === 'backup_file_size'
    ? EXIT_USER_ACTION
    : EXIT_FAIL;
  printResult({
    ok: false,
    write: 0,
    status: code === EXIT_USER_ACTION ? 'USER_ACTION_REQUIRED' : 'fail',
    code: message,
    message
  });
  process.exit(code);
}

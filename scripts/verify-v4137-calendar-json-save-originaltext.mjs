/**
 * Budil v4.13.7 hotfix - calendar JSON/API save must not embed full payload rawText
 *
 * Bug: resolveCalendarCandidateSaveExtras copied preview.rawText (entire sync JSON
 * including rawEvent) into every work order candidateMeta.originalText, causing
 * QuotaExceededError on individual/bulk/Google-update save paths.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const { createContext, runInContext } = vm;
const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

for (const file of [
  'js/app.js',
  'js/storage.js',
  'js/calendar-candidate-brain.js',
  'js/work-order-brain.js'
]) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const appJs = load('js/app.js');
const brainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const workOrderBrainJs = load('js/work-order-brain.js');

console.log('== source contract ==');
assert(appJs.includes("preview.sourceFormat === 'budil-calendar-json'"), 'json import sourceFormat check remains');
assert(appJs.includes('isJsonImport'), 'isJsonImport guard exists');
assert(
  /originalText:\s*isJsonImport\s*\?\s*''\s*:/.test(appJs),
  'JSON import originalText is empty string'
);
assert(
  appJs.includes('localStorage 容量超過') || appJs.includes('rawEvent'),
  'capacity / rawEvent rationale comment present'
);
assert(
  !/originalText:\s*preview\s*\?\s*preview\.rawText\s*:\s*''/.test(appJs),
  'unconditional preview.rawText originalText assignment removed'
);
assert(appJs.includes('commitSavableCalendarCandidates'), 'shared commit helper remains');
assert(appJs.includes('handleCalendarExportLatestClick'), 'google update handler remains');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

function makeStore(seed = {}, options = {}) {
  const data = { ...seed };
  const quota = Number.isFinite(options.quotaBytes) ? options.quotaBytes : null;
  const totalBytes = () => Object.keys(data).reduce((sum, key) => sum + String(data[key] || '').length, 0);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      const next = String(value);
      const without = totalBytes() - (Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]).length : 0);
      if (quota != null && without + next.length > quota) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data[key] = next;
    },
    removeItem(key) {
      delete data[key];
    },
    key(i) {
      return Object.keys(data)[i] || null;
    },
    get length() {
      return Object.keys(data).length;
    },
    _data: data,
    _totalBytes: totalBytes
  };
}

function createSandbox(seed = {}, options = {}) {
  const localStorage = makeStore({
    budil_work_orders: JSON.stringify(seed.budil_work_orders || []),
    budil_revenue_records: JSON.stringify(seed.budil_revenue_records || []),
    budil_safety_backups: JSON.stringify(seed.budil_safety_backups || []),
    budil_operation_logs: JSON.stringify(seed.budil_operation_logs || []),
    budil_migrated_v2: '1'
  }, options);
  const ctx = createContext({
    localStorage,
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    parseInt,
    isNaN,
    MapBrain: { detectAreaFromAddress: () => '' },
    ReceptionBrain: { matchRevenueSource: (v) => v, matchRevenueService: (v) => v },
    RevenueBrain: { getDefaultGrossProfitRateBySource: () => null }
  });
  runInContext(workOrderBrainJs, ctx, { filename: 'work-order-brain.js' });
  runInContext(brainJs, ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(storageJs, ctx, { filename: 'storage.js' });
  runInContext(
    'this.WorkOrderBrain = WorkOrderBrain; this.CalendarCandidateBrain = CalendarCandidateBrain; this.Storage = Storage;',
    ctx
  );
  return ctx;
}

function buildFixturePayload() {
  const mk = (id, opts) => {
    const o = opts || {};
    return {
      source: 'google_calendar',
      calendarId: 'fixture@example.com',
      calendarEventId: id,
      title: o.title || `fixture ${id}`,
      date: o.date,
      isAllDay: o.isAllDay === true,
      endDateInclusive: o.endDateInclusive || null,
      start: {
        date: o.date,
        time: o.isAllDay ? null : (o.startTime || '10:00'),
        isAllDay: o.isAllDay === true
      },
      end: {
        date: o.isAllDay ? (o.exclusiveEnd || o.date) : o.date,
        time: o.isAllDay ? null : (o.endTime || '12:00'),
        isAllDay: o.isAllDay === true
      },
      location: o.address || '',
      description: o.description || '',
      extracted: {
        customerName: o.customerName || null,
        requestSource: o.source || '直受け',
        address: o.address || null,
        amount: o.amount != null ? o.amount : null,
        amountText: o.amountText || null,
        workType: o.service || o.title || id,
        confirmationStatus: o.confirmationStatus || '確定'
      },
      budilImport: {
        candidateType: 'revenue_candidate',
        dedupeKey: `google_calendar|fixture@example.com|${id}`,
        status: 'candidate'
      },
      // Inflate payload like real worker responses (must NOT be saved into each WO)
      rawEvent: {
        id,
        summary: o.title || id,
        description: o.description || '',
        padding: 'Z'.repeat(8000)
      }
    };
  };

  const items = [
    mk('savable-1', {
      date: '2026-09-10',
      customerName: '保存太郎',
      amount: 12000,
      amountText: '12,000円',
      service: 'N1',
      address: '那覇市テスト1'
    }),
    mk('savable-2', {
      date: '2026-09-11',
      customerName: '保存花子',
      amount: 22000,
      amountText: '22,000円',
      service: 'N2',
      address: '那覇市テスト2'
    }),
    mk('savable-3', {
      date: '2026-09-12',
      customerName: '保存次郎',
      amount: 33000,
      amountText: '33,000円',
      service: 'R1',
      address: '糸満市テスト3'
    }),
    mk('savable-4', {
      date: '2026-09-13',
      customerName: '保存三郎',
      amount: 44000,
      amountText: '44,000円',
      service: 'KN1',
      address: '南城市テスト4'
    }),
    mk('savable-allday', {
      date: '2026-09-14',
      exclusiveEnd: '2026-09-18',
      endDateInclusive: '2026-09-17',
      isAllDay: true,
      customerName: 'Sakiさん',
      title: 'Sakiさん引越しエアコン',
      description: '320,000円',
      amount: 320000,
      amountText: '320,000円',
      service: '引越しエアコン',
      address: '那覇市テスト終日'
    }),
    mk('excluded-zero', {
      date: '2026-09-15',
      customerName: '対象外ゼロ',
      amount: 0,
      amountText: '',
      description: '金額なし予定',
      service: '見積のみ',
      confirmationStatus: '未確定'
    }),
    mk('excluded-rest', {
      date: '2026-09-16',
      title: '休み 夕涼み会',
      customerName: '',
      amount: null,
      description: '休み希望',
      service: '休み 夕涼み会'
    }),
    mk('excluded-empty', {
      date: '2026-09-17',
      title: 'エイサー',
      customerName: '',
      amount: null,
      description: '',
      service: 'エイサー'
    })
  ];

  // Pad to resemble linkedDedupeKeys-merged responses (~dozens of items)
  for (let i = 0; i < 40; i += 1) {
    items.push(mk(`pad-${i}`, {
      date: '2026-10-01',
      title: `pad ${i}`,
      customerName: '',
      amount: null,
      description: '休み',
      service: `休み pad ${i}`
    }));
  }

  return {
    source: 'google_calendar',
    schemaVersion: 1,
    fetchedAt: '2026-08-27T12:00:00.000Z',
    timezone: 'Asia/Tokyo',
    targetPeriod: { from: '2026-08-27', to: '2026-09-26' },
    items
  };
}

function resolveExtrasFixed(item, preview) {
  const isJsonImport = preview && preview.sourceFormat === 'budil-calendar-json';
  return {
    originalText: isJsonImport ? '' : (preview ? preview.rawText : ''),
    candidateStatus: '作業予定に追加済み',
    calendarDedupeKey: (item.candidate && item.candidate.calendarDedupeKey) || '',
    importSource: isJsonImport
      ? 'calendar-json-file'
      : 'calendar-paste'
  };
}

function resolveExtrasBuggy(item, preview) {
  return {
    originalText: preview ? preview.rawText : '',
    candidateStatus: '作業予定に追加済み',
    calendarDedupeKey: (item.candidate && item.candidate.calendarDedupeKey) || '',
    importSource: 'calendar-json-file'
  };
}

function commitLikeApp(ctx, preview, extrasResolver) {
  const scheduleUpdated = { count: 0 };
  preview.items.forEach((item) => {
    if (item.importKind !== 'schedule-update' || !item.scheduleUpdate || !item.scheduleUpdate.target) return;
    const target = item.scheduleUpdate.target;
    const nextSchedule = item.scheduleUpdate.nextSchedule;
    const syncResult = ctx.Storage.syncWorkOrderScheduleFromCalendar(
      target.id,
      target.calendarDedupeKey,
      nextSchedule
    );
    if (syncResult && syncResult.ok && !syncResult.unchanged) scheduleUpdated.count += 1;
  });

  let saved = 0;
  const beforeIds = new Set(ctx.Storage.getWorkOrders().map((w) => w.id));
  preview.items.forEach((item) => {
    if (!ctx.CalendarCandidateBrain.isFutureImportSavable(item, false)) return;
    if (item.isDuplicate) return;
    if (item.importKind === 'schedule-update' || item.importKind === 'unchanged' || item.importKind === 'update-blocked') return;
    const payload = ctx.CalendarCandidateBrain.createWorkOrderPayload(
      item.candidate,
      extrasResolver(item, preview)
    );
    payload.isTest = true;
    ctx.Storage.addWorkOrder(payload);
    saved += 1;
  });
  const after = ctx.Storage.getWorkOrders();
  const added = after.filter((w) => !beforeIds.has(w.id));
  return { saved, added, scheduleUpdated: scheduleUpdated.count, revenues: ctx.Storage.getRevenueRecords() };
}

const fixturePayload = buildFixturePayload();
const fixtureJson = JSON.stringify(fixturePayload);
assert(fixtureJson.length > 200000, `fixture JSON is large enough (${fixtureJson.length})`);

console.log('== buggy path reproduces QuotaExceeded ==');
{
  const polluted = [];
  for (let i = 0; i < 4; i += 1) {
    polluted.push({
      id: `work-polluted-${i}`,
      customerName: `既存${i}`,
      scheduledDate: '2026-08-01',
      startTime: '10:00',
      endTime: '12:00',
      estimateAmount: 10000,
      status: 'confirmed',
      calendarDedupeKey: `google_calendar|fixture@example.com|old-${i}`,
      candidateMeta: {
        importSource: 'calendar-json-file',
        originalText: fixtureJson,
        candidateStatus: '作業予定に追加済み',
        importedAt: '2026-08-01T00:00:00.000Z',
        confirmedRevenue: false,
        sourceType: 'google',
        estimatedAmount: '10000'
      },
      isTest: true
    });
  }
  const ctx = createSandbox({ budil_work_orders: polluted }, { quotaBytes: 1_800_000 });
  const parsed = ctx.CalendarCandidateBrain.parseBudilCalendarEventsJson(fixtureJson);
  assert(!(parsed.errors || []).length, 'parser accepts fixture payload');
  assert(parsed.sourceFormat === 'budil-calendar-json', 'sourceFormat is budil-calendar-json');
  assert((parsed.rawText || '').length === fixtureJson.length, 'rawText keeps full JSON');
  const preview = ctx.CalendarCandidateBrain.attachFutureImportPreview(
    ctx.CalendarCandidateBrain.buildImportPreview(parsed, ctx.Storage.getWorkOrders(), { revenues: [] }),
    '2026-08-27'
  );
  let threw = null;
  try {
    commitLikeApp(ctx, preview, resolveExtrasBuggy);
  } catch (error) {
    threw = error;
  }
  assert(threw && threw.name === 'QuotaExceededError', 'buggy originalText=rawText throws QuotaExceededError');
}

console.log('== fixed path saves under same quota ==');
{
  const polluted = [];
  for (let i = 0; i < 4; i += 1) {
    polluted.push({
      id: `work-polluted-${i}`,
      customerName: `既存${i}`,
      scheduledDate: '2026-08-01',
      startTime: '10:00',
      endTime: '12:00',
      estimateAmount: 10000,
      status: 'confirmed',
      calendarDedupeKey: `google_calendar|fixture@example.com|old-${i}`,
      candidateMeta: {
        importSource: 'calendar-json-file',
        originalText: fixtureJson,
        candidateStatus: '作業予定に追加済み',
        importedAt: '2026-08-01T00:00:00.000Z',
        confirmedRevenue: false,
        sourceType: 'google',
        estimatedAmount: '10000'
      },
      isTest: true
    });
  }
  const beforeCount = polluted.length;
  const ctx = createSandbox({ budil_work_orders: polluted }, { quotaBytes: 1_800_000 });
  const parsed = ctx.CalendarCandidateBrain.parseBudilCalendarEventsJson(fixtureJson);
  const preview = ctx.CalendarCandidateBrain.attachFutureImportPreview(
    ctx.CalendarCandidateBrain.buildImportPreview(parsed, ctx.Storage.getWorkOrders(), { revenues: [] }),
    '2026-08-27'
  );
  const summary = ctx.CalendarCandidateBrain.summarizeFutureImportPreview(preview);
  assert(summary.savableCount === 5, `savableCount is 5 (got ${summary.savableCount})`);
  assert(summary.excludedCount >= 3, `excludedCount includes at least the 3 primary exclusions (got ${summary.excludedCount})`);
  const primaryExcludedKeys = [
    'google_calendar|fixture@example.com|excluded-zero',
    'google_calendar|fixture@example.com|excluded-rest',
    'google_calendar|fixture@example.com|excluded-empty'
  ];
  for (const key of primaryExcludedKeys) {
    const hit = preview.items.find((item) => item.candidate && item.candidate.calendarDedupeKey === key);
    assert(hit && hit.futureImport && hit.futureImport.status === 'excluded', `${key} stays excluded`);
  }

  const one = preview.items.find((item) => item.candidate && item.candidate.calendarDedupeKey && item.candidate.calendarDedupeKey.endsWith('|savable-1'));
  assert(!!one, 'savable-1 item exists');
  const onePayload = ctx.CalendarCandidateBrain.createWorkOrderPayload(
    one.candidate,
    resolveExtrasFixed(one, preview)
  );
  assert(onePayload.candidateMeta.originalText === '', 'fixed individual extras originalText empty');
  assert(JSON.stringify(onePayload.candidateMeta).length < 2000, 'fixed candidateMeta stays small');
  onePayload.isTest = true;
  ctx.Storage.addWorkOrder(onePayload);
  assert(ctx.Storage.getWorkOrders().length === beforeCount + 1, 'individual save adds exactly 1');

  // duplicate re-save should be classified duplicate after rebuild
  const preview2 = ctx.CalendarCandidateBrain.attachFutureImportPreview(
    ctx.CalendarCandidateBrain.buildImportPreview(parsed, ctx.Storage.getWorkOrders(), { revenues: [] }),
    '2026-08-27'
  );
  const again = preview2.items.find((item) => item.candidate && item.candidate.calendarDedupeKey && item.candidate.calendarDedupeKey.endsWith('|savable-1'));
  assert(again && (again.isDuplicate || again.importKind === 'unchanged' || again.importKind === 'schedule-update'), 're-save of same key is not a new savable');

  const beforeBulk = ctx.Storage.getWorkOrders().length;
  const bulkPreview = preview2;
  const bulkResult = commitLikeApp(ctx, bulkPreview, resolveExtrasFixed);
  assert(bulkResult.saved === 4, `bulk saves remaining 4 savable (got ${bulkResult.saved})`);
  assert(ctx.Storage.getWorkOrders().length === beforeBulk + 4, 'bulk increases by 4 only');
  assert(bulkResult.revenues.length === 0, 'no revenue auto-created');

  const names = ctx.Storage.getWorkOrders().map((w) => w.customerName);
  assert(names.includes('保存太郎'), 'saved 保存太郎 visible in work orders');
  assert(names.includes('Sakiさん'), 'saved all-day Sakiさん');
  assert(!names.includes('対象外ゼロ'), 'excluded zero-amount not saved');
  assert(!names.includes('休み 夕涼み会') && !ctx.Storage.getWorkOrders().some((w) => (w.serviceText || '').includes('休み pad')), 'excluded/pad rest days not saved as work names from excluded set');

  const saki = ctx.Storage.getWorkOrders().find((w) => w.customerName === 'Sakiさん');
  assert(saki && saki.isAllDay === true, 'all-day flag preserved');
  assert(saki.scheduledEndDate === '2026-09-17', 'all-day inclusive end preserved');
  assert(Number(saki.estimateAmount) === 320000, 'bare 320,000円 amount preserved');
  assert(!saki.startTime && !saki.endTime, 'all-day has no fake clock times');
  assert(saki.candidateMeta.originalText === '', 'saved meta originalText empty for JSON import');
  assert(!String(saki.candidateMeta.originalText || '').includes('rawEvent'), 'rawEvent not embedded in saved meta');
}

console.log('== paste import still keeps rawText originalText ==');
{
  const pasteText = [
    '【カレンダー予定】',
    '日付：2026-09-20',
    '開始時間：10:00',
    '終了時間：12:00',
    'お客様名：貼付太郎',
    '作業内容：N1',
    '予定金額：15000',
    '依頼元：直受け'
  ].join('\n');
  const preview = {
    sourceFormat: 'structured',
    rawText: pasteText,
    items: [{
      candidate: {
        customerName: '貼付太郎',
        scheduledDate: '2026-09-20',
        startTime: '10:00',
        endTime: '12:00',
        estimateAmount: 15000,
        serviceText: 'N1',
        source: '直受け',
        calendarDedupeKey: 'paste|2026-09-20|貼付太郎|15000'
      },
      importKind: 'new',
      isDuplicate: false,
      futureImport: { status: 'eligible', savable: true, reasons: [], signals: [] }
    }]
  };
  const extras = resolveExtrasFixed(preview.items[0], preview);
  assert(extras.originalText === pasteText, 'paste import still stores rawText');
}

console.log('== failure mid-save does not wipe existing ==');
{
  const existing = [{
    id: 'work-keep-me',
    customerName: '既存維持',
    scheduledDate: '2026-08-05',
    startTime: '09:00',
    endTime: '11:00',
    estimateAmount: 9000,
    status: 'confirmed',
    calendarDedupeKey: 'google_calendar|fixture@example.com|keep',
    isTest: true
  }];
  const ctx = createSandbox({ budil_work_orders: existing }, { quotaBytes: 25000 });
  const before = JSON.stringify(ctx.Storage.getWorkOrders());
  const parsed = ctx.CalendarCandidateBrain.parseBudilCalendarEventsJson(fixtureJson);
  const preview = ctx.CalendarCandidateBrain.attachFutureImportPreview(
    ctx.CalendarCandidateBrain.buildImportPreview(parsed, ctx.Storage.getWorkOrders(), { revenues: [] }),
    '2026-08-27'
  );
  let failed = false;
  try {
    // Force failure by using buggy extras under tiny quota
    commitLikeApp(ctx, preview, resolveExtrasBuggy);
  } catch {
    failed = true;
  }
  assert(failed, 'tiny quota forces failure with buggy extras');
  const after = ctx.Storage.getWorkOrders();
  assert(after.some((w) => w.id === 'work-keep-me'), 'existing work order remains after failed save');
  assert(after.find((w) => w.id === 'work-keep-me').customerName === '既存維持', 'existing record not overwritten');
  // Existing row JSON identity may gain updatedAt only if touched; ensure keep id untouched content essentials
  assert(before.includes('work-keep-me'), 'before snapshot had keep id');
}

console.log('OK: verify-v4137-calendar-json-save-originaltext');

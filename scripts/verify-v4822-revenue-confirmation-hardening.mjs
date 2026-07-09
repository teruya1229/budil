/**
 * Budil v4.8.30 revenue confirmation flow hardening verification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    _data: data
  };
}

function parse(localStorage, key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function createSandbox(seed = {}, extraBrains = []) {
  const localStorage = makeStore(seed);
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
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined
  });
  const brains = [
    'revenue-brain.js',
    'reception-brain.js',
    'follow-up-brain.js',
    'work-order-brain.js',
    'calendar-candidate-brain.js',
  ].concat(extraBrains);
  for (const file of brains) {
    runInContext(load(`js/${file}`), ctx, { filename: file });
  }
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

function readSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (rel.startsWith('.git/') || rel.startsWith('recovery/')) continue;
    if (rel.startsWith('scripts/')) continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

for (const file of ['app.js', 'storage.js', 'work-completion-brain.js', 'calendar-candidate-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');

console.log('== v4.8.30 revenue confirmation hardening ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.3'), 'header version should be v4.8.30');
assert(indexHtml.includes('Budil v4.12.3'), 'sidebar version should be v4.8.30');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.8.30');

assert(appJs.includes('getRevenueConfirmationWorkOrderIds'), 'revenue queue work-order id helper should exist');
assert(appJs.includes('isDailyTaskLinkedToRevenueQueueWorkOrder'), 'daily task revenue queue link helper should exist');
assert(appJs.includes('revenueConfirmWoIds.has(p.workOrderId)'), 'daily priority should exclude revenue queue work orders');
assert(appJs.includes('isDailyTaskLinkedToRevenueQueueWorkOrder(t, revenueConfirmWoIds)'), 'urgent daily tasks should exclude revenue queue work orders');
assert(appJs.includes('followMemo: input.followMemo'), 'past recovery modal should pass follow memo');
assert(appJs.includes('paymentStatus: input.paymentStatus'), 'past recovery modal should pass payment status');
assert(appJs.includes('wo.actualRevenueId && wo.actualRevenueId !== id'), 'revenue form should block duplicate work-order revenue before add');
assert(!appJs.match(/newRecord = Storage\.addRevenueRecord[\s\S]{0,400}actualRevenueId && wo\.actualRevenueId !== id/),
  'actualRevenueId duplicate check should run before addRevenueRecord');

assert(storageJs.includes('o.service || o.actualService'), 'past recovery overrides should accept actualService');
assert(storageJs.includes('o.paymentStatus'), 'past recovery overrides should accept paymentStatus');
assert(storageJs.includes('o.followMemo'), 'past recovery overrides should accept followMemo');

assert(appJs.includes('external-check-dash-brief'), 'v4.8.20 external check summary should remain');
assert(appJs.includes('renderDashExternalCheckDetailsBody'), 'external check details should remain');
assert(appJs.includes('AnalyticsBrain'), 'analytics brain usage should remain');
assert(storageJs.includes('PROTECTED_DELETE_KEYS'), 'v4.8.8 protected delete keys should remain');
assert(indexHtml.includes('calendar-candidate-notice'), 'v4.8.12 past recovery safety notice should remain');
assert(storageJs.includes('bulkConvertCalendarPastCandidatesToRevenue'), 'bulk past recovery convert should remain');
assert(storageJs.includes('_convertPastCandidateWorkOrderToRevenue'), 'shared past recovery helper should remain');

const calendarMeta = {
  importSource: 'calendar-paste',
  sourceType: 'work-order-candidate',
  candidateStatus: '売上実績候補',
  estimatedAmount: '20000'
};

console.log('-- A. work-order revenue confirmation (dynamic) --');
{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify([{
      id: 'wo-confirm-1',
      customerName: '田中様',
      serviceText: 'エアコンクリーニング',
      source: 'LP',
      scheduledDate: '2026-06-20',
      estimateAmount: 18000,
      status: 'completed'
    }]),
    budil_revenue_records: JSON.stringify([])
  }, ['work-completion-brain.js']);
  runInContext(`
    var wo = Storage.getWorkOrders()[0];
    var input = {
      workDate: '2026-06-20',
      customerName: '田中様',
      actualService: 'エアコンクリーニング',
      service: 'エアコンクリーニング',
      source: 'LP',
      amount: 18500,
      paymentStatus: '未入金',
      actualMemo: 'テスト確定',
      followMemo: ''
    };
    var payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
    var record = Storage.addRevenueRecord(payload);
    var patch = WorkCompletionBrain.markWorkOrderCompleted(wo, record, input);
    Storage.updateWorkOrder(wo.id, patch);
    var updatedWo = Storage.getWorkOrders().find(w => w.id === wo.id);
    var queueEligible = WorkCompletionBrain.needsCompletionConfirm(updatedWo, '2026-06-28');
  `, ctx);
  const revenues = parse(localStorage, 'budil_revenue_records', []);
  const workOrders = parse(localStorage, 'budil_work_orders', []);
  const record = revenues[0];
  const wo = workOrders[0];
  assert(revenues.length === 1, 'one revenue should be added from work order');
  assert(record.sourceWorkOrderId === 'wo-confirm-1', 'revenue should keep sourceWorkOrderId');
  assert(record.confirmedFrom === 'work-order', 'revenue should mark work-order confirmation');
  assert(record.isConfirmedRevenue === true, 'revenue should be confirmed');
  assert(wo.actualRevenueId === record.id, 'work order actualRevenueId should match revenue id');
  assert(ctx.queueEligible === false, 'confirmed work order should not stay in revenue queue');
}

console.log('-- B. daily priority dedupe (dynamic) --');
{
  const { ctx } = createSandbox({
    budil_work_orders: JSON.stringify([{
      id: 'wo-dup-1',
      customerName: '山田様',
      serviceText: '浴室清掃',
      source: 'LP',
      scheduledDate: '2026-06-28',
      estimateAmount: 12000,
      status: 'confirmed'
    }]),
    budil_revenue_records: JSON.stringify([])
  }, ['work-completion-brain.js']);
  runInContext(`
    var today = '2026-06-28';
    var wo = WorkOrderBrain.normalizeWorkOrder(Storage.getWorkOrders()[0]);
    var inQueue = WorkCompletionBrain.needsCompletionConfirm(wo, today);
    var queueIds = new Set();
    Storage.getWorkOrders().forEach(function(raw) {
      var w = WorkOrderBrain.normalizeWorkOrder(raw);
      if (WorkCompletionBrain.needsCompletionConfirm(w, today)) queueIds.add(w.id);
    });
    var wouldShowInPriority = !queueIds.has(wo.id);
  `, ctx);
  assert(ctx.inQueue === true, 'past/today unregistered work should be in revenue queue');
  assert(ctx.wouldShowInPriority === false, 'same work should be excluded from today priority filter');
}

console.log('-- C. past recovery single convert input reflection (dynamic) --');
{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify([{
      id: 'work-eligible-v4822',
      customerName: '旧顧客名',
      serviceText: 'エアコンクリーニング',
      source: 'LP',
      scheduledDate: '2026-04-15',
      estimateAmount: 20000,
      status: 'tentative',
      candidateMeta: calendarMeta
    }]),
    budil_revenue_records: JSON.stringify([])
  });
  runInContext(`
    var result = Storage.convertCalendarPastCandidateToRevenue('work-eligible-v4822', {
      today: '2026-06-28',
      override: {
        workDate: '2026-04-16',
        customerName: '修正顧客名',
        service: 'エアコン通常',
        actualService: 'エアコン通常クリーニング',
        amount: 21000,
        memo: 'モーダルメモ',
        paymentStatus: '入金済',
        paymentMethod: '現金',
        grossMarginRate: 55,
        followMemo: 'フォローメモ',
        singleConvert: true
      }
    });
  `, ctx);
  assert(ctx.result.ok === true && ctx.result.added === 1, 'single past recovery convert should succeed');
  const revenues = parse(localStorage, 'budil_revenue_records', []);
  const workOrders = parse(localStorage, 'budil_work_orders', []);
  const added = revenues[0];
  const converted = workOrders.find(w => w.id === 'work-eligible-v4822');
  assert(added.workDate === '2026-04-16', 'workDate should reflect modal input');
  assert(added.customerName === '修正顧客名', 'customerName should reflect modal input');
  assert(added.service === 'エアコン通常', 'service should reflect modal input');
  assert(added.amount === 21000, 'amount should reflect modal input');
  assert(/モーダルメモ/.test(added.memo || ''), 'memo should reflect modal input');
  assert(added.paymentStatus === '入金済', 'paymentStatus should reflect modal input');
  assert(added.paymentMethod === '現金', 'paymentMethod should reflect modal input');
  assert(added.grossMarginRate === 55, 'grossMarginRate should reflect modal input');
  assert(added.followUp && added.followUp.memo === 'フォローメモ', 'followMemo should reflect modal input');
  assert(added.sourceCandidateId === 'work-eligible-v4822', 'sourceCandidateId should remain');
  assert(!!added.calendarDedupeKey, 'calendarDedupeKey should remain');
  assert(converted.candidateMeta.confirmedRevenue === true, 'candidateMeta.confirmedRevenue should remain');
  assert(converted.candidateMeta.convertedRevenueId === added.id, 'candidateMeta.convertedRevenueId should remain');
  assert(converted.candidateMeta.candidateStatus === 'converted', 'candidate should be converted not deleted');
  assert(workOrders.length === 1, 'candidate work order should not be deleted');
}

console.log('-- D. exclusion conditions (dynamic) --');
{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify([
      {
        id: 'wo-has-revenue',
        customerName: '確定済',
        serviceText: '清掃',
        scheduledDate: '2026-06-01',
        estimateAmount: 10000,
        status: 'completed',
        actualRevenueId: 'rev-existing'
      },
      {
        id: 'wo-future',
        customerName: '未来',
        serviceText: '清掃',
        scheduledDate: '2026-07-01',
        estimateAmount: 10000,
        status: 'confirmed'
      },
      {
        id: 'wo-cancelled',
        customerName: '取消',
        serviceText: '清掃',
        scheduledDate: '2026-06-01',
        estimateAmount: 10000,
        status: 'cancelled'
      },
      {
        id: 'wo-no-amount',
        customerName: '金額なし',
        serviceText: '清掃',
        scheduledDate: '2026-06-01',
        estimateAmount: 0,
        status: 'tentative',
        candidateMeta: { ...calendarMeta, estimatedAmount: '' }
      },
      {
        id: 'wo-converted',
        customerName: '変換済',
        serviceText: '清掃',
        scheduledDate: '2026-06-01',
        estimateAmount: 10000,
        status: 'completed',
        actualRevenueId: 'rev-old',
        candidateMeta: { ...calendarMeta, candidateStatus: 'converted', convertedRevenueId: 'rev-old', confirmedRevenue: true }
      }
    ]),
    budil_revenue_records: JSON.stringify([
      {
        id: 'rev-existing',
        workDate: '2026-06-01',
        customerName: '確定済',
        service: '清掃',
        amount: 10000,
        status: '確定'
      },
      {
        id: 'rev-old',
        workDate: '2026-06-01',
        customerName: '変換済',
        service: '清掃',
        amount: 10000,
        status: '確定'
      }
    ])
  }, ['work-completion-brain.js']);
  runInContext(`
    var today = '2026-06-28';
    var revenues = Storage.getRevenueRecords();
    var queue = [];
    Storage.getWorkOrders().forEach(function(raw) {
      var wo = WorkOrderBrain.normalizeWorkOrder(raw);
      if (WorkCompletionBrain.needsCompletionConfirm(wo, today)) queue.push(wo.id);
      if (CalendarCandidateBrain.isCalendarCandidateWorkOrder(wo)) {
        if ((wo.candidateMeta && wo.candidateMeta.importSource) !== CalendarCandidateBrain.IMPORT_SOURCE) return;
        if (CalendarCandidateBrain.getCandidateStatus(wo) === CalendarCandidateBrain.PAST_RECOVERY_CONVERTED) return;
        if (wo.actualRevenueId) return;
        if (wo.scheduledDate && wo.scheduledDate > today) return;
        var cls = CalendarCandidateBrain.classifyPastRecoveryCandidate(wo, revenues, { today: today });
        if (cls.status === CalendarCandidateBrain.PAST_RECOVERY_REVENUE_CANDIDATE) queue.push('past:' + wo.id);
      }
    });
  `, ctx);
  const queue = ctx.queue || [];
  assert(!queue.includes('wo-has-revenue'), 'actualRevenueId work order should be excluded');
  assert(!queue.includes('wo-future'), 'future work order should be excluded from completion queue');
  assert(!queue.includes('wo-cancelled'), 'cancelled work order should be excluded');
  assert(!queue.includes('past:wo-no-amount'), 'no-amount past recovery should be excluded');
  assert(!queue.includes('past:wo-converted'), 'converted past recovery should be excluded');
}

console.log('-- E. safety guards (static) --');
const sourceText = readSourceFiles(root).map(p => readFileSync(p, 'utf8')).join('\n');
assert(!(new RegExp('localStorage' + '\\.clear\\s*\\(')).test(sourceText), 'direct localStorage clear must not exist');
assert(storageJs.includes('PROTECTED_DELETE_KEYS'), 'PROTECTED_DELETE_KEYS should remain');
assert(indexHtml.includes('\u4e00\u62ec\u58f2\u4e0a\u78ba\u5b9a\u306e\u524d\u306b\u5b89\u5168\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4f5c\u6210\u3057\u307e\u3059'),
  'bulk past recovery safety note should remain');
assert(appJs.includes('external-check-dash-brief'), 'v4.8.20 external check summary should remain');

console.log('All v4.8.30 revenue confirmation hardening checks passed.');

/**
 * Budil v4.13.17 - 実経費固定項目化＋予定利益集計整理
 * Isolated fixtures only. No production localStorage.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = file => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

for (const file of [
  'js/calendar-candidate-brain.js',
  'js/work-order-brain.js',
  'js/work-completion-brain.js',
  'js/profit-brain.js',
  'js/revenue-brain.js',
  'js/storage.js',
  'js/app.js'
]) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const index = load('index.html');
const app = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');
const calendarJs = load('js/calendar-candidate-brain.js');
const workOrderJs = load('js/work-order-brain.js');
const workCompletionJs = load('js/work-completion-brain.js');
const profitJs = load('js/profit-brain.js');
const revenueBrainSrc = load('js/revenue-brain.js');
const css = load('css/style.css');

console.log('== version ==');
assert(index.includes('Budil v4.13.17'), 'index shows Budil v4.13.17');
assert(index.includes('js/app.js?v=4.13.17'), 'app.js cache buster is 4.13.17');
assert(index.includes('js/work-completion-brain.js?v=4.13.17'), 'work-completion-brain cache buster is 4.13.17');
assert(index.includes('js/profit-brain.js?v=4.13.17'), 'profit-brain cache buster is 4.13.17');
assert(index.includes('css/style.css?v=4.13.17'), 'style.css cache buster is 4.13.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.17'"), 'storage version is v4.13.17');
assert(dataBackup.includes("APP_VERSION: 'v4.13.17'"), 'data-backup version is v4.13.17');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.17'"), 'verify-current pins v4.13.17');
assert(statusMd.includes('v4.13.17'), 'status.md documents v4.13.17');
assert(handoffMd.includes('v4.13.17'), 'handoff.md documents v4.13.17');
assert(decisionLog.includes('v4.13.17'), 'decision-log.md records v4.13.17');

console.log('== wiring / safety ==');
assert(index.includes('id="work-completion-cost-labor"'), 'completion modal has 人件費 field');
assert(index.includes('id="work-completion-cost-outsourcing"'), 'completion modal has 外注費 field');
assert(index.includes('id="work-completion-cost-purchase"'), 'completion modal has 仕入れ値 field');
assert(index.includes('id="work-completion-cost-materials"'), 'completion modal has 材料費 field');
assert(index.includes('実績売上金額'), 'completion modal shows 実績売上金額');
assert(index.includes('その他経費（任意）'), 'other expense input remains');
assert(index.includes('id="work-completion-inline-expense-list"'), 'other expense list remains');
assert(workCompletionJs.includes('FIXED_ACTUAL_COST_FIELDS'), 'brain defines fixed actual cost fields');
assert(workCompletionJs.includes('sumActualCostPrefillFromPlanned'), 'brain maps planned types to fixed fields');
assert(workCompletionJs.includes('buildWorkCompletionExpenseState'), 'brain merges fixed + other expenses');
assert(workCompletionJs.includes('MAX_INLINE_EXPENSE_LINES: 3'), 'other expenses stay max 3');
assert(app.includes('applyFixedActualCostPrefill'), 'app prefills fixed actual cost fields');
assert(app.includes('readFixedActualCostRows'), 'app reads fixed actual cost fields');
assert(app.includes("label: '予定利益率'"), 'profit summary shows 予定利益率');
assert(app.includes("label: '予定経費'"), 'profit summary still shows 予定経費');
assert(app.includes('Storage.addExpenseRecords('), 'batch expense save kept');
assert(app.includes('売上は保存済み、今回の経費'), 'all-failed copy kept');
assert(profitJs.includes('plannedNetProfitRate'), 'profit summary exposes plannedNetProfitRate');
assert(profitJs.includes('formatPlannedNetProfitRate'), 'profit brain formats planned profit rate');
assert(css.includes('.work-completion-actual-cost-grid'), 'scoped CSS for fixed cost grid exists');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');
assert(!workCompletionJs.includes('localStorage.clear('), 'completion brain has no localStorage.clear');

console.log('== fixtures ==');
const ctx = createContext({
  console,
  Date,
  Number,
  String,
  Array,
  Object,
  JSON,
  Math,
  parseInt,
  parseFloat,
  isNaN,
  undefined,
  RegExp,
  MapBrain: { detectAreaFromAddress: () => '', classifyAreaDistance: () => 'near', getDistanceLabel: () => '', buildGoogleMapSearchUrl: () => '' },
  RevenueBrain: {
    formatYen: (n) => `${Number(n) || 0}円`,
    SERVICES: ['エアコン'],
    SOURCES: ['直受け'],
    resolveGrossMarginRate: () => null,
    computeMarginProfit: (amount) => Number(amount) || 0,
    activeRecords: (list) => list || [],
    normalizeRevenueRecords: (list) => list || [],
    isConfirmedRevenueStatus: (s) => s === '確定' || s === '完了'
  },
  ReceptionBrain: {
    matchRevenueService: (s) => s || '',
    matchRevenueSource: (s) => s || '直受け'
  },
  FollowUpBrain: { normalizeFollowUp: (v) => v },
  WorkCompletionBrain: null,
  CalendarCandidateBrain: null,
  WorkOrderBrain: null,
  ProfitBrain: null,
  RevenueSummaryBrain: {
    getScheduleEstimateAmount: (wo) => Number(wo && wo.estimateAmount) || 0,
    normalizeScheduleWorkOrder: (wo) => wo,
    isUpcomingRevenueScheduleWorkOrder: (wo) => !!(wo && !wo.actualRevenueId && wo.status !== 'completed')
  }
});

runInContext(calendarJs + '\nthis.CalendarCandidateBrain = CalendarCandidateBrain;', ctx);
runInContext(workOrderJs + '\nthis.WorkOrderBrain = WorkOrderBrain;', ctx);
runInContext(workCompletionJs + '\nthis.WorkCompletionBrain = WorkCompletionBrain;', ctx);
runInContext(profitJs + '\nthis.ProfitBrain = ProfitBrain;', ctx);

const Cal = ctx.CalendarCandidateBrain;
const WO = ctx.WorkOrderBrain;
const WC = ctx.WorkCompletionBrain;
const Profit = ctx.ProfitBrain;

const case1Lines = [
  { type: 'labor', name: '予定人件費', amount: 20000 },
  { type: 'outsourcing', name: '予定外注費', amount: 30000 },
  { type: 'purchase', name: '予定仕入', amount: 85000 },
  { type: 'materials', name: '予定材料費', amount: 5000 }
];
const case1Wo = WO.normalizeWorkOrder({
  id: 'wo-case1',
  scheduledDate: '2026-09-20',
  startTime: '10:00',
  endTime: '12:00',
  customerName: 'テスト顧客',
  serviceText: 'エアコン販売',
  estimateAmount: 180000,
  status: 'confirmed',
  plannedExpenseLines: case1Lines,
  plannedExpenseTotal: 140000
});

console.log('== CASE1 prefill, no save ==');
const case1Defaults = WC.buildCompletionFormDefaults(case1Wo, { today: '2026-09-12' });
assert(case1Defaults.amount === 180000, 'CASE1 実績売上金額 initial is 180000');
const prefillByType = Object.fromEntries((case1Defaults.actualCostPrefill || []).map(line => [line.type, line.amount]));
assert(prefillByType.labor === 20000, 'CASE1 人件費 prefill 20000');
assert(prefillByType.outsourcing === 30000, 'CASE1 外注費 prefill 30000');
assert(prefillByType.purchase === 85000, 'CASE1 仕入れ値 prefill 85000');
assert(prefillByType.materials === 5000, 'CASE1 材料費 prefill 5000');
assert(case1Defaults.actualCostPrefill.length === 4, 'CASE1 maps all 4 planned types');
const case1EmptyState = WC.buildWorkCompletionExpenseState(
  case1Defaults.actualCostPrefill.map(line => ({ ...line, amountRaw: String(line.amount) })),
  [{ name: '', amountRaw: '' }]
);
assert(case1EmptyState.ok && case1EmptyState.shouldCreate === true, 'CASE1 candidate lines are not yet saved expenses');
assert(case1Wo.plannedExpenseTotal === 140000, 'CASE1 planned total unchanged by defaults');

const summed = WC.sumActualCostPrefillFromPlanned([
  { type: 'purchase', name: '予定仕入A', amount: 50000 },
  { type: 'purchase', name: '予定仕入B', amount: 35000 }
]);
assert(summed.find(line => line.type === 'purchase').amount === 85000, 'same type purchase lines are summed to 85000');

console.log('== CASE2 confirm then 4 expenses ==');
const case2Fixed = [
  { type: 'labor', name: '人件費', amountRaw: '18000' },
  { type: 'outsourcing', name: '外注費', amountRaw: '30000' },
  { type: 'purchase', name: '仕入れ値', amountRaw: '83500' },
  { type: 'materials', name: '材料費', amountRaw: '6200' }
];
const case2State = WC.buildWorkCompletionExpenseState(case2Fixed, [{ name: '', amountRaw: '' }]);
assert(case2State.ok && case2State.items.length === 4 && case2State.amount === 137700, 'CASE2 keeps 4 actual cost items totaling 137700');
assert(case2State.items.map(item => item.amount).join(',') === '18000,30000,83500,6200', 'CASE2 amounts are the edited values');
const case2Snap = WC.createRevenueConfirmationSnapshot(case1Wo, {
  workDate: '2026-09-20',
  customerName: 'テスト顧客',
  actualService: 'エアコン販売',
  service: 'エアコン',
  source: '直受け',
  amount: 180000,
  paymentStatus: '未入金',
  paymentDate: '2026-10-31',
  paymentMethod: '',
  paymentConcern: false,
  actualMemo: '',
  followMemo: ''
}, { shouldCreate: case2State.shouldCreate, items: case2State.items });
const case2Msg = WC.formatRevenueConfirmationMessage(case2Snap);
assert(case2Msg.includes('18,000円'), 'CASE2 confirm shows edited 人件費');
assert(case2Msg.includes('83,500円'), 'CASE2 confirm shows edited 仕入れ値');
assert(case2Msg.includes('6,200円'), 'CASE2 confirm shows edited 材料費');
assert(case2Snap.payload.expenseLines.length === 4, 'CASE2 payload has 4 expenseLines');
assert(case2Snap.payload.expenseTotal === 137700, 'CASE2 payload expenseTotal 137700');
assert(case1Wo.plannedExpenseTotal === 140000, 'CASE2 planned values stay 140000 after snapshot');
assert(JSON.stringify(case1Wo.plannedExpenseLines) === JSON.stringify(case1Lines), 'CASE2 planned lines are unchanged');

console.log('== CASE3 zero items skipped ==');
const case3State = WC.buildWorkCompletionExpenseState([
  { type: 'labor', amountRaw: '0' },
  { type: 'outsourcing', amountRaw: '0' },
  { type: 'purchase', amountRaw: '85000' },
  { type: 'materials', amountRaw: '0' }
], [{ name: '', amountRaw: '' }]);
assert(case3State.ok && case3State.items.length === 1 && case3State.items[0].amount === 85000, 'CASE3 saves only 仕入れ値 85000');
assert(case3State.items[0].name === '仕入れ値', 'CASE3 remaining item is 仕入れ値');

console.log('== CASE5 no planned expenses ==');
const case5Wo = WO.normalizeWorkOrder({
  scheduledDate: '2026-09-22',
  customerName: '従来顧客',
  serviceText: '清掃',
  estimateAmount: 15000,
  status: 'confirmed'
});
const case5Defaults = WC.buildCompletionFormDefaults(case5Wo, { today: '2026-09-12' });
assert(case5Defaults.actualCostPrefill.every(line => line.amount === 0), 'CASE5 fixed cost prefill is 0');
const case5State = WC.buildWorkCompletionExpenseState(case5Defaults.actualCostPrefill, [{ name: '', amountRaw: '' }]);
assert(case5State.ok && case5State.shouldCreate === false && case5State.items.length === 0, 'CASE5 no expense records when all 0');
const case5Snap = WC.createRevenueConfirmationSnapshot(case5Wo, {
  workDate: '2026-09-22',
  customerName: '従来顧客',
  actualService: '清掃',
  service: 'その他',
  source: '直受け',
  amount: 15000,
  paymentStatus: '未入金',
  paymentDate: '2026-10-31',
  paymentMethod: '',
  paymentConcern: false,
  actualMemo: '',
  followMemo: ''
}, { shouldCreate: false, items: [] });
assert(case5Snap.payload.amount === 15000, 'CASE5 existing revenue confirmation still works');
assert(case5Snap.expense.shouldCreate === false, 'CASE5 snapshot has no expenses');

console.log('== CASE6 / CASE7 planned profit summary ==');
const case6Wo = WO.normalizeWorkOrder({
  scheduledDate: '2026-09-20',
  customerName: '今月予定',
  serviceText: '設備',
  estimateAmount: 620000,
  status: 'confirmed',
  plannedExpenseLines: [{ type: 'purchase', name: '予定仕入', amount: 350000 }],
  plannedExpenseTotal: 350000
});
const monthSummary = Profit.getPeriodProfitSummary({
  today: '2026-09-12',
  monthKey: '2026-09',
  revenues: [],
  expenses: [],
  workOrders: [case6Wo]
});
assert(monthSummary.plannedRevenueEstimate === 620000, 'CASE6 予定売上 620000');
assert(monthSummary.plannedExpenseEstimate === 350000, 'CASE6 予定経費 350000');
assert(monthSummary.plannedNetProfit === 270000, 'CASE6 予定利益 270000');
assert(Math.round(monthSummary.plannedNetProfitRate * 10) / 10 === 43.5, 'CASE6 予定利益率 ~43.5%');
assert(Profit.formatPlannedNetProfitRate(270000, 620000) === '43.5%', 'CASE6 formatted rate is 43.5%');
assert(monthSummary.monthExpense === 0, 'CASE6 planned expenses are not added to actual monthExpense');

const case7Wo = WO.normalizeWorkOrder({
  scheduledDate: '2026-09-25',
  customerName: '赤字予定',
  serviceText: '設備',
  estimateAmount: 100000,
  status: 'confirmed',
  plannedExpenseLines: [{ type: 'purchase', name: '予定仕入', amount: 120000 }],
  plannedExpenseTotal: 120000
});
assert(WO.getPlannedProfit(case7Wo) === -20000, 'CASE7 planned profit can be negative');
const case7Summary = Profit.getPeriodProfitSummary({
  today: '2026-09-12',
  monthKey: '2026-09',
  revenues: [],
  expenses: [],
  workOrders: [case7Wo]
});
assert(case7Summary.plannedNetProfit === -20000, 'CASE7 summary shows -20000');
assert(case7Summary.plannedNetProfitRate === -20, 'CASE7 planned profit rate -20');
assert(Profit.formatPlannedNetProfitRate(-20000, 100000) === '-20.0%', 'CASE7 formatted deficit rate is shown');
assert(Profit.formatPlannedNetProfitRate(0, 0) === '—', 'planned rate is — when planned revenue is 0');

console.log('== CASE8 completed excluded, no double count ==');
const completedWo = WO.normalizeWorkOrder({
  id: 'wo-done',
  scheduledDate: '2026-09-20',
  customerName: '確定済み顧客',
  serviceText: 'エアコン販売',
  estimateAmount: 180000,
  status: 'completed',
  actualRevenueId: 'rev-done',
  plannedExpenseLines: case1Lines,
  plannedExpenseTotal: 140000
});
const remainingWo = WO.normalizeWorkOrder({
  id: 'wo-open',
  scheduledDate: '2026-09-28',
  customerName: '未完了顧客',
  serviceText: '清掃',
  estimateAmount: 15000,
  status: 'confirmed',
  plannedExpenseLines: [],
  plannedExpenseTotal: 0
});
const case8Summary = Profit.getPeriodProfitSummary({
  today: '2026-09-12',
  monthKey: '2026-09',
  revenues: [{ id: 'rev-done', workDate: '2026-09-20', amount: 180000, status: '確定', source: '直受け' }],
  expenses: [{ id: 'exp-done', date: '2026-09-20', amount: 137700, category: 'その他', relatedRevenueId: 'rev-done' }],
  workOrders: [completedWo, remainingWo]
});
assert(case8Summary.plannedRevenueEstimate === 15000, 'CASE8 completed work order is excluded from planned revenue');
assert(case8Summary.plannedExpenseEstimate === 0, 'CASE8 completed planned expenses are not in planned total');
assert(case8Summary.confirmedRevenue === 180000, 'CASE8 actual revenue is counted separately');
assert(case8Summary.monthExpense === 137700, 'CASE8 actual expenses are counted separately');
assert(case8Summary.plannedExpenseEstimate + case8Summary.monthExpense === 137700, 'CASE8 no planned+actual double count of 140000+137700');

const otherStillCapped = WC.validateInlineExpenseLines([
  { name: 'A', amountRaw: '1' },
  { name: 'B', amountRaw: '2' },
  { name: 'C', amountRaw: '3' },
  { name: 'D', amountRaw: '4' }
]);
assert(otherStillCapped.ok === false, 'other free-form expenses remain capped at 3');

console.log('== CASE4 atomic save failure ==');
const extractFn = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

const localStore = new Map();
let failIfExpenseLengthOver = null;
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => {
      if (k === 'budil_expense_records') {
        const parsed = JSON.parse(String(v));
        if (failIfExpenseLengthOver != null && parsed.length > failIfExpenseLengthOver) {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
      }
      localStore.set(k, String(v));
    },
    removeItem: (k) => localStore.delete(k)
  },
  window: {},
  document: { createElement: () => ({}) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(revenueBrainSrc + '\n;this.RevenueBrain = RevenueBrain;', sandbox);
vm.runInContext(profitJs + '\n;this.ProfitBrain = ProfitBrain;', sandbox);
vm.runInContext(storageJs + '\n;this.Storage = Storage;', sandbox);
const { Storage } = sandbox;
Storage.addExpenseRecord({
  id: 'expense-existing-keep',
  date: '2026-08-01',
  category: '広告費',
  amount: 3000,
  memo: '既存経費は変更しない',
  relatedRevenueId: 'rev-old-keep',
  source: 'manual'
});
const saveFnSrc = extractFn(app, 'saveInlineExpensesForRevenue');
const payloadFnSrc = extractFn(app, 'buildInlineExpenseSavePayload');
const memoFnSrc = extractFn(app, 'buildDailyExpenseMemo');
vm.runInContext(
  `${memoFnSrc}\n${payloadFnSrc}\n${saveFnSrc}\n` +
    'this.saveInlineExpensesForRevenue = saveInlineExpensesForRevenue;\n' +
    'this.TODAY = function(){ return "2026-09-20"; };',
  sandbox
);

const fourItems = case2State.items;
const beforeFailCount = Storage.getExpenseRecords().length;
const beforeFailIds = new Set(Storage.getExpenseRecords().map(e => e.id));
failIfExpenseLengthOver = beforeFailCount + 1;
const failResult = sandbox.saveInlineExpensesForRevenue('rev-atomic-4', '2026-09-20', fourItems);
failIfExpenseLengthOver = null;
assert(failResult && failResult.ok === false, 'CASE4 quota failure returns not ok');
assert(Storage.getExpenseRecords().length === beforeFailCount, 'CASE4 adds 0 expenses');
assert(Storage.getExpenseRecords().every(e => beforeFailIds.has(e.id)), 'CASE4 leaves no partial new ids');
assert(!Storage.getExpenseRecords().some(e => e.relatedRevenueId === 'rev-atomic-4'), 'CASE4 leaves no linked new expenses');

const retry = sandbox.saveInlineExpensesForRevenue('rev-atomic-4', '2026-09-20', fourItems);
assert(retry.ok && retry.expenses.length === 4, 'CASE4 retry saves all 4');
assert(Storage.getExpenseRecords().filter(e => e.relatedRevenueId === 'rev-atomic-4').length === 4, 'CASE4 retry is exactly 4, not leftover plus 4');

console.log('\nAll v4.13.17 fixed actual cost checks passed.');

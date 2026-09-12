/**
 * Budil v4.13.18 - 予定経費・予定利益連携
 * Isolated fixtures only. No production localStorage.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
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

console.log('== version ==');
assert(index.includes('Budil v4.13.18'), 'index shows Budil v4.13.18');
assert(index.includes('js/app.js?v=4.13.18'), 'app.js cache buster is 4.13.18');
assert(index.includes('js/calendar-candidate-brain.js?v=4.13.18'), 'calendar-candidate cache buster is 4.13.18');
assert(index.includes('js/work-order-brain.js?v=4.13.18'), 'work-order-brain cache buster is 4.13.18');
assert(index.includes('js/work-completion-brain.js?v=4.13.18'), 'work-completion-brain cache buster is 4.13.18');
assert(index.includes('js/profit-brain.js?v=4.13.18'), 'profit-brain cache buster is 4.13.18');
assert(index.includes('css/style.css?v=4.13.18'), 'style.css cache buster is 4.13.18');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.18'"), 'storage version is v4.13.18');
assert(dataBackup.includes("APP_VERSION: 'v4.13.18'"), 'data-backup version is v4.13.18');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.18'"), 'verify-current pins v4.13.18');
assert(statusMd.includes('v4.13.18'), 'status.md documents v4.13.18');
assert(handoffMd.includes('v4.13.18'), 'handoff.md documents v4.13.18');
assert(decisionLog.includes('v4.13.18'), 'decision-log.md records v4.13.18');

console.log('== wiring / safety ==');
assert(calendarJs.includes('PLANNED_EXPENSE_LABELS'), 'calendar brain defines planned expense labels');
assert(calendarJs.includes('extractPlannedExpenseLinesFromText'), 'calendar brain extracts planned expenses');
assert(workOrderJs.includes('plannedExpenseLines'), 'work-order normalize keeps plannedExpenseLines');
assert(workOrderJs.includes('getPlannedProfit'), 'work-order computes planned profit');
assert(workCompletionJs.includes('plannedExpenseCandidates'), 'completion defaults expose planned candidates');
assert(workCompletionJs.includes('inlineExpensePrefill'), 'completion defaults expose inline prefill');
assert(app.includes('applyInlineExpensePrefill'), 'app can prefill inline expenses from planned');
assert(app.includes('renderWorkCompletionPlannedExpenseHint'), 'app shows planned expense hint');
assert(app.includes('renderWorkOrderPlannedProfitBlock'), 'app shows planned profit on work-order cards');
assert(app.includes("label: '予定経費'"), 'profit summary shows 予定経費');
assert(profitJs.includes('plannedExpenseEstimate'), 'profit summary exposes plannedExpenseEstimate');
assert(profitJs.includes('plannedNetProfit'), 'profit summary exposes plannedNetProfit');
assert(storageJs.includes('plannedExpenseUpdated'), 'schedule sync can update planned expenses');
assert(index.includes('work-completion-planned-expense-hint'), 'completion modal has planned expense hint');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');
assert(!calendarJs.includes('localStorage.clear('), 'calendar brain has no localStorage.clear');

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
    isUpcomingRevenueScheduleWorkOrder: (wo) => !!(wo && !wo.actualRevenueId)
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

const case1Text = [
  '金額：180000円',
  '予定人件費：20000円',
  '予定外注費：30000円',
  '予定仕入：85000円',
  '予定材料費：5000円'
].join('\n');

const case1Lines = Cal.extractPlannedExpenseLinesFromText(case1Text);
assert(case1Lines.length === 4, 'CASE1 extracts 4 planned expense lines');
assert(Cal.sumPlannedExpenseTotal(case1Lines) === 140000, 'CASE1 plannedExpenseTotal is 140000');

const case1Candidate = Cal.normalizeCandidate({
  scheduledDate: '2026-09-20',
  startTime: '10:00',
  endTime: '12:00',
  customerName: 'テスト顧客',
  serviceText: 'エアコン販売',
  estimateAmount: 180000,
  memo: case1Text,
  calendarDedupeKey: 'google_calendar|evt-case1'
}, case1Text);
assert(case1Candidate.plannedExpenseTotal === 140000, 'CASE1 candidate plannedExpenseTotal 140000');

const case1Wo = WO.normalizeWorkOrder(Cal.createWorkOrderPayload(case1Candidate));
assert(Array.isArray(case1Wo.plannedExpenseLines) && case1Wo.plannedExpenseLines.length === 4,
  'CASE1 work order stores plannedExpenseLines');
assert(case1Wo.plannedExpenseTotal === 140000, 'CASE1 work order plannedExpenseTotal 140000');
assert(WO.getPlannedProfit(case1Wo) === 40000, 'CASE1 planned profit 40000');
assert(Math.round(WO.getPlannedProfitRate(case1Wo) * 10) / 10 === 22.2,
  'CASE1 planned profit rate ~22.2%');

const case2Wo = WO.normalizeWorkOrder({
  scheduledDate: '2026-09-21',
  customerName: '既存顧客',
  serviceText: '清掃',
  estimateAmount: 15000,
  status: 'confirmed'
});
assert(Array.isArray(case2Wo.plannedExpenseLines) && case2Wo.plannedExpenseLines.length === 0,
  'CASE2 missing plannedExpenseLines becomes empty array');
assert(case2Wo.plannedExpenseTotal === 0, 'CASE2 plannedExpenseTotal 0');
assert(WO.getPlannedProfit(case2Wo) === 15000, 'CASE2 planned profit equals estimate');

const case3Lines = Cal.extractPlannedExpenseLinesFromText('予定仕入：85000円');
assert(case3Lines.length === 1 && case3Lines[0].type === 'purchase', 'CASE3 one purchase line');
assert(Cal.sumPlannedExpenseTotal(case3Lines) === 85000, 'CASE3 total 85000');

const case4Lines = Cal.extractPlannedExpenseLinesFromText('予定仕入：85,000円');
assert(case4Lines.length === 1 && case4Lines[0].amount === 85000, 'CASE4 comma amount parses to 85000');

const ambiguous = Cal.extractPlannedExpenseLinesFromText('仕入はだいたい8万円くらい');
assert(ambiguous.length === 0, 'ambiguous text without explicit label is ignored');

const amountOnly = Cal.parseCandidateBlock('日付：2026-09-22\n金額：180000円\nお客様名：A様\n作業内容：工事');
assert(amountOnly.estimateAmount === 180000, 'existing 金額： parsing unchanged');
assert(amountOnly.plannedExpenseTotal === 0, 'amount-only block has no planned expenses');

const case5Existing = WO.normalizeWorkOrder({
  id: 'wo-completed',
  scheduledDate: '2026-09-10',
  startTime: '09:00',
  endTime: '11:00',
  customerName: '完了顧客',
  serviceText: '工事',
  estimateAmount: 100000,
  status: 'completed',
  actualRevenueId: 'rev-1',
  plannedExpenseLines: [{ type: 'purchase', name: '予定仕入', amount: 50000 }],
  plannedExpenseTotal: 50000,
  calendarDedupeKey: 'google_calendar|evt-done',
  candidateMeta: { confirmedRevenue: true, importSource: 'calendar-json-file', sourceType: 'work-order-candidate' }
});
const case5Candidate = Cal.normalizeCandidate({
  ...case5Existing,
  memo: '予定仕入：90000円',
  plannedExpenseLines: [{ type: 'purchase', name: '予定仕入', amount: 90000 }],
  estimateAmount: 100000
}, '予定仕入：90000円');
const blocked = Cal.isScheduleSyncBlocked(case5Existing, [{ id: 'rev-1', sourceWorkOrderId: 'wo-completed', amount: 100000 }]);
assert(blocked.blocked === true, 'CASE5 completed/revenue-linked sync is blocked');
const classified = Cal.classifyStableCalendarImportItem(case5Candidate, [case5Existing], [{ id: 'rev-1', sourceWorkOrderId: 'wo-completed' }]);
assert(classified && classified.kind === 'update-blocked', 'CASE5 classify is update-blocked');

const case6Defaults = WC.buildCompletionFormDefaults(case1Wo, { today: '2026-09-20' });
assert(case6Defaults.plannedExpenseCandidates.length === 4, 'CASE6 shows 4 planned candidates');
assert(case6Defaults.inlineExpensePrefill.length === 3, 'CASE6 prefills at most 3 inline expense rows');
assert(case6Defaults.inlineExpensePrefill[0].amount === 20000, 'CASE6 prefill keeps planned amount as candidate');
assert(case1Wo.plannedExpenseTotal === 140000, 'CASE6 work-order planned total remains unchanged by defaults');

const case7Wo = WO.normalizeWorkOrder({
  scheduledDate: '2026-09-25',
  customerName: '赤字予定',
  serviceText: '設備',
  estimateAmount: 100000,
  plannedExpenseLines: [
    { type: 'purchase', name: '予定仕入', amount: 120000 }
  ]
});
assert(WO.getPlannedProfit(case7Wo) === -20000, 'CASE7 planned profit can be negative');
assert(WO.getPlannedProfitRate(case7Wo) === -20, 'CASE7 planned profit rate -20%');

const monthSummary = Profit.getPeriodProfitSummary({
  today: '2026-09-15',
  monthKey: '2026-09',
  revenues: [{ id: 'rev-a', workDate: '2026-09-01', amount: 450000, status: '確定', source: '直受け' }],
  expenses: [{ id: 'exp-a', date: '2026-09-01', amount: 120000, category: '外注費', relatedRevenueId: 'rev-a' }],
  workOrders: [case1Wo, case2Wo]
});
assert(monthSummary.plannedExpenseEstimate === 140000, 'month plannedExpenseEstimate excludes actual expenses');
assert(monthSummary.plannedNetProfit === (180000 + 15000) - 140000, 'month plannedNetProfit is estimate - plannedExpense');
assert(monthSummary.monthExpense === 120000, 'actual monthExpense remains separate');
assert(monthSummary.confirmedRevenue === 450000, 'confirmed revenue remains separate');

const workerMapped = Cal.mapWorkerItemToCandidate({
  title: '販売 / 山田様 / エアコン',
  description: '金額：180,000円\n予定仕入：85,000円\n予定外注費：30,000円',
  date: '2026-09-30',
  start: { date: '2026-09-30', time: '13:00' },
  end: { date: '2026-09-30', time: '15:00' },
  extracted: { customerName: '山田様', workType: 'エアコン', amount: 180000 },
  budilImport: { dedupeKey: 'google_calendar|evt-worker', source: 'google_calendar' }
});
assert(workerMapped.estimateAmount === 180000, 'worker amount parsing unchanged');
assert(workerMapped.plannedExpenseTotal === 115000, 'worker description planned expenses parsed');

console.log('\nAll v4.13.18 planned expense checks passed.');

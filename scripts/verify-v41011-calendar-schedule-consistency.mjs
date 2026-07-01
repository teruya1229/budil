/**
 * Budil v4.10.20 — calendar import vs upcoming schedule consistency verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function createSandbox() {
  const ctx = createContext({
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
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  return ctx;
}

console.log('== v4.10.20 calendar schedule consistency ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueSummaryBrain = load('js/revenue-summary-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.21'), 'index.html should show v4.10.21');
assert(indexHtml.includes('js/app.js?v=4.10.21'), 'app.js cache buster should be v4.10.21');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.21'"), 'storage.js version should be v4.10.21');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.21'"), 'data-backup version should be v4.10.21');

assert(revenueSummaryBrain.includes('getScheduleEstimateAmount'), 'brain should resolve schedule amounts');
assert(revenueSummaryBrain.includes('isCalendarUpcomingScheduleWorkOrder'), 'brain should treat calendar candidates as upcoming');
assert(revenueSummaryBrain.includes('hasFutureImportExcludedWord'), 'upcoming exclusion should use future import words');
assert(!revenueSummaryBrain.includes('hasPastRecoveryExcludedWord(wo)'), 'upcoming exclusion must not use past recovery words');
assert(!revenueSummaryBrain.includes('eligible.slice(0, 3)'), 'upcoming list must not hard-cap at 3 in brain');
assert(appJs.includes('buildUpcomingRevenueScheduleSummary'), 'app should use shared upcoming summary');
assert(appJs.includes('exec-home-upcoming-schedule-main'), 'executive home should render upcoming schedule');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
  '+ 新規登録',
  '売上を登録',
  '売上を1件登録'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

const today = '2026-06-30';
const calendarMeta = {
  importSource: 'calendar-json-file',
  sourceType: 'work-order-candidate',
  candidateStatus: '作業予定に追加済み'
};
const workOrders = [
  {
    id: 'wo-yamada',
    customerName: 'ヤマダ案件',
    serviceText: 'エアコンクリーニング',
    scheduledDate: '2026-07-01',
    estimateAmount: 25300,
    source: 'ヤマダ',
    status: 'tentative',
    candidateMeta: { ...calendarMeta, confidence: '未確定' },
    calendarDedupeKey: 'cal-yamada'
  },
  {
    id: 'wo-genchi',
    customerName: '現地確認',
    serviceText: '現地確認',
    scheduledDate: '2026-07-02',
    estimateAmount: 22000,
    source: '直安',
    status: 'confirmed',
    candidateMeta: { ...calendarMeta },
    calendarDedupeKey: 'cal-genchi'
  },
  {
    id: 'wo-coop',
    customerName: 'コープ案件',
    serviceText: '洗濯機クリーニング',
    scheduledDate: '2026-07-03',
    estimateAmount: 0,
    source: 'コープ',
    status: 'tentative',
    candidateMeta: { ...calendarMeta, estimatedAmount: '18500' },
    calendarDedupeKey: 'cal-coop'
  },
  {
    id: 'wo-later',
    customerName: '予定',
    serviceText: 'レンジフード',
    scheduledDate: '2026-07-08',
    estimateAmount: 15000,
    source: 'LP',
    status: 'tentative',
    candidateMeta: { ...calendarMeta },
    calendarDedupeKey: 'cal-later'
  }
];

{
  const ctx = createSandbox();
  runInContext(`
    var summary = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(${JSON.stringify(workOrders)}, ${JSON.stringify(today)});
    var yamada = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(workOrders[0])}, ${JSON.stringify(today)});
    var coop = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(workOrders[2])}, ${JSON.stringify(today)});
  `, ctx);
  const s = ctx.summary;
  assert(ctx.yamada === true, '7/1 Yamada should be eligible despite 未確定 confidence');
  assert(ctx.coop === true, '7/3 Coop should be eligible with estimatedAmount in meta');
  assert(s.displayCount === 4, 'displayCount should include all four July schedules');
  assert(s.upcoming.length === 4, 'upcoming should return all eligible schedules');
  const dates = s.upcoming.map((item) => item.scheduledDate);
  assert(dates.join(',') === '2026-07-01,2026-07-02,2026-07-03,2026-07-08', 'schedules must be date ascending');
  assert(dates.indexOf('2026-07-03') < dates.indexOf('2026-07-08'), '7/3 must not be skipped before 7/8');
  assert(s.displayTotal === 25300 + 22000 + 18500 + 15000, 'displayTotal should sum positive amounts only');
  assert(s.upcoming.some((item) => item.customerName === 'ヤマダ案件'), 'upcoming list should include Yamada');
  assert(s.upcoming.some((item) => item.customerName === 'コープ案件'), 'upcoming list should include Coop');
}

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v41010-final-hard-polish.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 calendar schedule consistency checks passed.');

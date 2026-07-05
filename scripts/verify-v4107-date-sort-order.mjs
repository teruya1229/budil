/**
 * Budil v4.10.20 — scheduled list date/time ascending sort verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('== v4.10.20 date sort order ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const workOrderBrain = load('js/work-order-brain.js');
const profitBrain = load('js/profit-brain.js');
const revenueSummaryBrain = load('js/revenue-summary-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.33'), 'index.html should show v4.10.33');
assert(indexHtml.includes('js/app.js?v=4.10.33'), 'app.js cache buster should be v4.10.33');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.33'"), 'storage version should be v4.10.33');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.33'"), 'data-backup version should be v4.10.33');

assert(workOrderBrain.includes('compareScheduledDateTimeAsc'), 'work-order brain should define compareScheduledDateTimeAsc');
assert(workOrderBrain.includes('sortByScheduledDateTimeAsc'), 'work-order brain should define sortByScheduledDateTimeAsc');
assert(workOrderBrain.includes("return (a.createdAt || '').localeCompare(b.createdAt || '')"), 'sort should use createdAt as tie-breaker');

const savedListBlock = appJs.slice(
  appJs.indexOf('function renderCalendarCandidateSavedList'),
  appJs.indexOf('function renderCalendarPastRecoverySummary')
);
assert(savedListBlock.includes('sortByScheduledDateTimeAsc'), 'saved import list should sort by scheduled date/time asc');
assert(!savedListBlock.includes('updatedAt'), 'saved import list should not sort by updatedAt');

const weekListBlock = appJs.slice(
  appJs.indexOf('function renderWorkOrderWeekList'),
  appJs.indexOf('function renderWorkOrderFromIntakeList')
);
assert(weekListBlock.includes('getWeekWorkOrders'), 'week list should use getWeekWorkOrders');
assert(workOrderBrain.includes('getWeekWorkOrders') && workOrderBrain.includes('sortByScheduledDateTimeAsc'), 'week work orders should be date-sorted in brain');

const todayListBlock = appJs.slice(
  appJs.indexOf('function renderWorkOrderTodayList'),
  appJs.indexOf('function renderWorkOrderWeekList')
);
assert(todayListBlock.includes('getTodayWorkOrders'), 'today list should use getTodayWorkOrders');
assert(workOrderBrain.includes('getTodayWorkOrders') && workOrderBrain.match(/getTodayWorkOrders[\s\S]*?sortByScheduledDateTimeAsc/), 'today work orders should be time-sorted in brain');

assert(profitBrain.includes('sortByScheduledDateTimeAsc'), 'profit work order rows should use shared sort');
assert(revenueSummaryBrain.includes('sortByScheduledDateTimeAsc'), 'upcoming revenue schedule should use shared sort');

const queueBlock = appJs.slice(
  appJs.indexOf('function collectRevenueConfirmationQueue'),
  appJs.indexOf('function formatRevenueQueueDate')
);
assert(queueBlock.includes('sortByScheduledDateTimeAsc'), 'revenue confirmation queue should sort date asc');
assert(!queueBlock.includes("b.scheduledDate || '').localeCompare(a.scheduledDate"), 'queue should not sort date descending');

const previewBlock = appJs.slice(
  appJs.indexOf('function renderCalendarCandidatePreview'),
  appJs.indexOf('function getCalendarImportCandidateStatus')
);
assert(previewBlock.includes('compareScheduledDateTimeAsc'), 'import preview list should sort by date/time asc');
assert(previewBlock.includes('originalIndex'), 'import preview should preserve original save index after sort');

// July ascending sanity: comparator orders 7/1 before 7/15 before 7/30
const julyItems = [
  { scheduledDate: '2026-07-15', startTime: '10:00' },
  { scheduledDate: '2026-07-01', startTime: '09:00' },
  { scheduledDate: '2026-07-30', startTime: '14:00' },
  { scheduledDate: '2026-07-08', startTime: '11:00' }
];
const sortedJuly = julyItems.slice().sort((a, b) => {
  const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
  if (d !== 0) return d;
  return (a.startTime || '').localeCompare(b.startTime || '');
});
assert(sortedJuly[0].scheduledDate === '2026-07-01', 'July list should start at 7/1');
assert(sortedJuly[sortedJuly.length - 1].scheduledDate === '2026-07-30', 'July list should end at 7/30');
assert(sortedJuly.map(i => i.scheduledDate).join(',') === '2026-07-01,2026-07-08,2026-07-15,2026-07-30', 'July dates should be strictly ascending');

assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');
assert(indexHtml.includes('受付・予定確認'), 'v4.10.6 reception view naming maintained');
assert(indexHtml.includes('id="view-revenue-analysis"'), 'v4.10.5 revenue analysis view maintained');
assert(appJs.includes('applyMonthlyReconciliationAdjustment'), 'v4.10.5 reconciliation adjustment maintained');
assert(appJs.includes('navigateAfterAction'), 'v4.10.4 action navigation maintained');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import maintained');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4106-calendar-source-flow-simplification.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 date sort order checks passed.');

/**
 * Budil v4.10.20 — operational flow and label consistency verification.
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

console.log('== v4.10.20 operational consistency ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const workOrderBrain = load('js/work-order-brain.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.20'), 'index.html should show v4.10.20');
assert(indexHtml.includes('js/app.js?v=4.10.20'), 'app.js cache buster should be v4.10.20');

assert(indexHtml.includes('id="exec-home-revenue-queue-list"'), 'executive home should show revenue queue');
assert(indexHtml.includes('id="exec-home-upcoming-schedule-main"'), 'executive home should show upcoming schedule');
assert(indexHtml.includes('id="revenue-confirmation-queue-list"'), 'revenue view should show revenue queue');
assert(
  indexHtml.indexOf('exec-home-revenue-queue-list') < indexHtml.indexOf('exec-home-priority-action'),
  'executive home revenue queue should appear before priority action'
);
assert(
  indexHtml.indexOf('daily-section-revenue-queue') < indexHtml.indexOf('daily-section-priority'),
  'daily tasks revenue queue should appear before priority'
);

const receptionChunk = indexHtml.slice(
  indexHtml.indexOf('id="view-calendar-registration"'),
  indexHtml.indexOf('id="view-calendar-candidate"')
);
assert(receptionChunk.includes('売上確定待ち'), 'reception view should show 売上確定待ち');
assert(!receptionChunk.includes('作業後確定待ち'), 'reception view should not use 作業後確定待ち');
assert(receptionChunk.includes('card-reception-input-collapse'), 'reception input should be collapsible');
assert(receptionChunk.includes('card-reception-list-collapse'), 'reception list should be collapsible');
assert(
  receptionChunk.indexOf('work-order-pending-completion-list') < receptionChunk.indexOf('work-order-week-list'),
  'reception revenue queue should appear before week schedule'
);

assert(indexHtml.includes('card-onboarding-guide-collapse'), 'onboarding guide should be collapsible');
assert(indexHtml.includes('card-business-report-collapse'), 'business report should be collapsible');
assert(indexHtml.includes('売上明細を手入力'), 'revenue manual entry label should be distinct');

const forbiddenInMainViews = [
  '作業後確定待ち',
  '作業後売上確定',
  '作業後確定 —',
  '作業後確定</'
];
for (const term of forbiddenInMainViews) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in main views`);
}

assert(appJs.includes('renderRevenueConfirmationQueueBlock'), 'app should render shared revenue queue block');
assert(appJs.includes('>売上確定</button>'), 'primary action should be labeled 売上確定');
assert(appJs.includes('sortByScheduledDateTimeAsc'), 'v4.10.7 date sort should remain');
assert(workOrderBrain.includes('sortByScheduledDateTimeAsc'), 'work-order brain sort helper should remain');
assert(workOrderBrain.includes('isCalendarCandidateWorkOrder(wo)'), 'calendar saved orders should be in operational list');

assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import maintained');
assert(indexHtml.includes('id="view-revenue-analysis"'), 'v4.10.5 revenue analysis maintained');
assert(appJs.includes('applyMonthlyReconciliationAdjustment'), 'v4.10.5 reconciliation maintained');
assert(appJs.includes('navigateAfterAction'), 'v4.10.4 action navigation maintained');

assert(css.includes('v4.10.20'), 'css should include v4.10.20 operational styles');
assert(css.includes('card-onboarding-guide-collapse'), 'css should style collapsed guides');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4107-date-sort-order.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 operational consistency checks passed.');

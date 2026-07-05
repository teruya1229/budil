/**
 * Budil v4.10.20 — Google Calendar source-of-truth flow simplification verification.
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

console.log('== v4.10.20 calendar source flow simplification ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.32'), 'index.html should show v4.10.32');
assert(indexHtml.includes('受付・予定確認'), 'calendar registration view should be renamed');
assert(
  indexHtml.includes('Googleカレンダー登録後の予定をBudilで確認'),
  'subtitle should reflect Google Calendar source flow'
);
assert(
  !indexHtml.includes('日程が決まったら作業予定としてカレンダー登録します'),
  'old misleading calendar registration copy should be removed'
);

assert(indexHtml.includes('work-order-manual-entry'), 'manual work order form should be collapsible');
assert(indexHtml.includes('緊急手入力'), 'manual entry label should exist');
assert(
  indexHtml.includes('<details class="card card-wide work-order-manual-entry"'),
  'work order form should start in details (closed by default)'
);

const receptionListBlock = appJs.slice(
  appJs.indexOf('function renderReceptionSavedList'),
  appJs.indexOf('function bindReceptionListEvents')
);
assert(receptionListBlock.includes('reception-item-details'), 'reception cards should use detail collapse');
assert(receptionListBlock.includes('reception-saved-summary'), 'reception cards should have compact summary');
assert(
  receptionListBlock.includes('hidePrimary') || appJs.includes("hidePrimary = action === 'openWorkOrder'"),
  'work order primary actions should be hidden from reception card main row'
);
assert(
  appJs.includes('作業予定を開く') && appJs.includes('reception-detail-actions'),
  'open work order should remain in detail actions only'
);

assert(!indexHtml.includes('id="work-order-forecast"'), 'sales forecast cards should not be on reception view');
assert(indexHtml.includes('card-revenue-schedule-link'), 'revenue management link should replace forecast cards');
assert(indexHtml.includes('売上管理を見る'), 'revenue management CTA should exist');

assert(indexHtml.includes('card-work-order-week'), 'week schedule should be primary list');
assert(indexHtml.includes('work-order-today-collapse'), 'today schedule should be collapsible');
assert(
  indexHtml.indexOf('work-order-week-list') < indexHtml.indexOf('work-order-today-collapse'),
  'week list should appear before today collapse'
);

const calendarChunk = indexHtml.slice(
  indexHtml.indexOf('id="view-calendar-candidate"'),
  indexHtml.indexOf('id="view-external-check"')
);
assert(calendarChunk.includes('btn-calendar-candidate-json-import'), 'JSON import button should exist');
assert(
  calendarChunk.includes('btn-primary') && calendarChunk.includes('カレンダーJSONを取り込む'),
  'JSON import should be primary action'
);
assert(calendarChunk.includes('calendar-candidate-paste-collapse'), 'paste import should be collapsible');
assert(
  !calendarChunk.includes('カレンダー予定の貼り付け</h2>'),
  'paste section should not be a top-level always-visible heading'
);
assert(calendarChunk.includes('Googleカレンダーから出力した予定'), 'import subtitle should mention Google Calendar export');

assert(appJs.includes('このまま保持'), 'skip button should be renamed to keep label');
assert(appJs.includes('getExecutivePriorityActionLabel'), 'executive home should dedupe priority/next CTAs');
assert(appJs.includes('suppressRevenueLink'), 'profit view should suppress duplicate revenue CTA');

assert(indexHtml.includes('backup-scope-collapse'), 'backup detail list should be collapsible');
assert(indexHtml.includes('含まれるデータを確認する'), 'backup scope collapse label should exist');
assert(indexHtml.includes('profit-expense-breakdown-collapse'), 'profit expense breakdown should be collapsible');

assert(css.includes('reception-saved-item') && css.includes('var(--bg-card)'), 'reception cards should use dark card background');
assert(css.includes('.work-order-item') && css.includes('var(--bg-card)'), 'work order cards should use dark card background');

assert(indexHtml.includes('id="view-revenue-analysis"'), 'v4.10.5 revenue analysis view should remain');
assert(appJs.includes('renderRevenueAnalysisView'), 'v4.10.5 revenue analysis render should remain');
assert(appJs.includes('applyMonthlyReconciliationAdjustment'), 'v4.10.5 monthly adjustment should remain');
assert(appJs.includes('navigateAfterAction'), 'v4.10.4 action navigation should remain');
assert(!appJs.includes('unlinked-revenue'), 'v4.10.4 unlinked revenue prompts should remain removed');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import should remain');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4105-simple-daily-and-analysis-split.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 calendar source flow simplification checks passed.');

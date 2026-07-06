/**
 * Budil v4.10.5 — PC daily simplification and analysis split verification.
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

console.log('== v4.10.5 simple daily and analysis split ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const monthlyBrain = load('js/monthly-results-brain.js');
const revenueBrain = load('js/revenue-brain.js');
const profitBrain = load('js/profit-brain.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.11.8'), 'index.html should show v4.11.8');
assert(indexHtml.includes('id="view-revenue-analysis"'), 'revenue analysis view should exist');
assert(indexHtml.includes('売上分析'), 'nav or header should link to 売上分析');

const revenueViewChunk = indexHtml.slice(indexHtml.indexOf('id="view-revenue"'), indexHtml.indexOf('id="view-revenue-analysis"'));
assert(!revenueViewChunk.includes('id="revenue-aggregation-card"'), 'main revenue view should not include aggregation card');
assert(!revenueViewChunk.includes('id="revenue-flow-diagnostics"'), 'main revenue view should not include flow diagnostics');
assert(!revenueViewChunk.includes('revenue-by-service'), 'service breakdown should not be on main revenue view');
assert(revenueViewChunk.includes('id="revenue-list-section"'), 'main revenue view should keep revenue list');
assert(revenueViewChunk.includes('id="revenue-form"'), 'main revenue view should keep revenue form');

const analysisChunk = indexHtml.slice(indexHtml.indexOf('id="view-revenue-analysis"'), indexHtml.indexOf('id="view-receivables"'));
assert(analysisChunk.includes('id="revenue-aggregation-panel"'), 'analysis view should include aggregation panel');
assert(analysisChunk.includes('revenue-by-service'), 'analysis view should include service breakdown');
assert(analysisChunk.includes('revenue-by-source'), 'analysis view should include source breakdown');

assert(indexHtml.includes('exec-home-daily-core'), 'executive home should have compact monthly numbers section');
assert(indexHtml.includes('exec-home-next-action'), 'executive home should have next action section');
assert(indexHtml.includes('詳細チェック・運用状況'), 'executive home detail checks should be collapsed');

const execHomeChunk = indexHtml.slice(
  indexHtml.indexOf('id="executive-home"'),
  indexHtml.indexOf('class="card card-wide card-daily-action-tasks"')
);
assert(execHomeChunk.includes('exec-home-priority-action'), 'executive home should keep priority action');
assert(execHomeChunk.includes('exec-home-revenue-profit'), 'executive home should keep monthly numbers');
assert(!execHomeChunk.includes('exec-home-section-lead'), 'executive home should not show always-visible section leads');

assert(indexHtml.includes('<details class="card card-wide card-management-comment'), 'revenue management comment should be collapsible');
assert(indexHtml.includes('expense-advanced-settings'), 'expense linking fields should be in advanced settings');
assert(!indexHtml.includes('label for="profit-expense-revenue"') || indexHtml.includes('expense-advanced-settings'), 'expense revenue link should be in advanced block');

assert(appJs.includes('renderMonthlyReconciliationActionCard'), 'app should render reconciliation action card');
assert(appJs.includes('btn-monthly-reconciliation-add'), 'app should offer add-diff button');
assert(appJs.includes('applyMonthlyReconciliationAdjustment'), 'adjustment should be user-triggered only');
assert(appJs.includes('MonthlyResultsBrain.buildMonthlyAdjustmentPayload'), 'app should use monthly adjustment payload builder');
assert(appJs.includes("'monthly-adjustment-save'"), 'adjustment save should navigate after action');
assert(!appJs.includes('applyMonthlyReconciliationAdjustment(') || appJs.match(/applyMonthlyReconciliationAdjustment\(/g).length <= 2, 'adjustment should not auto-run on load');

assert(monthlyBrain.includes('buildMonthlyAdjustmentPayload'), 'monthly brain should build adjustment payload');
assert(monthlyBrain.includes('月次調整'), 'adjustment customer name should be 月次調整');
assert(monthlyBrain.includes('月次実績差額調整'), 'adjustment service should be 月次実績差額調整');
assert(monthlyBrain.includes("status: '確定'"), 'adjustment record should be 確定');

assert(appJs.includes('renderRevenueAnalysisView'), 'app should render analysis view separately');
assert(appJs.includes("view === 'revenue-analysis'"), 'switchView should handle revenue-analysis');

const resolveViewElementBlock = appJs.slice(
  appJs.indexOf('function resolveViewElement'),
  appJs.indexOf('function setNavActive')
);
assert(
  !resolveViewElementBlock.includes('NAV_VIEW_ALIASES'),
  'resolveViewElement must not use NAV_VIEW_ALIASES for DOM resolution'
);
assert(
  resolveViewElementBlock.includes('return view'),
  'resolveViewElement should map view names directly to view-* DOM ids'
);
assert(
  appJs.includes("data-view=\"revenue-analysis\"") || indexHtml.includes('data-view="revenue-analysis"'),
  'revenue-analysis navigation entry should exist'
);
assert(
  indexHtml.includes('売上分析を見る') && indexHtml.includes('data-view="revenue-analysis"'),
  'revenue header should link to revenue-analysis view'
);
assert(
  appJs.includes("'revenue-analysis': 'revenue'"),
  'NAV_VIEW_ALIASES may still group revenue-analysis under revenue for nav highlight'
);

assert(!appJs.includes('売上明細を追加するか、月次実績を確認してください'), 'old passive gap message should be removed');

assert(indexHtml.includes('revenue-lead-row') && indexHtml.includes('hidden'), 'v4.10.4 revenue lead UI hidden');
assert(!appJs.includes('unlinked-revenue'), 'v4.10.4 unlinked revenue prompts removed');
assert(appJs.includes('navigateAfterAction'), 'v4.10.4 action navigation maintained');
assert(appJs.includes('showActionResult'), 'v4.10.4 success toast maintained');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(revenueBrain.includes("STATUSES: ['予定', '確定', 'キャンセル']"), 'revenue statuses unchanged');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import maintained');

assert(css.includes('reconciliation-action-card'), 'styles for reconciliation action card');
assert(css.includes('expense-advanced-settings'), 'styles for expense advanced settings');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4104-action-flow-simplification.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.5 simple daily and analysis split checks passed.');

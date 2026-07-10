/**
 * Budil v4.12.4 - revenue page workflow and row action verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of [
  'js/revenue-brain.js',
  'js/executive-brain.js',
  'js/profit-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 revenue-page-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrainJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version check ==');
assert(indexHtml.includes('v4.12.8'), 'index.html should show v4.12.8');
assert(indexHtml.includes('js/app.js?v=4.12.8'), 'app.js cache buster should be v4.12.8');
assert(indexHtml.includes('css/style.css?v=4.12.8'), 'style.css cache buster should be v4.12.8');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.8'"), 'storage.js version should be v4.12.8');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.8'"), 'data-backup version should be v4.12.8');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== revenue page layout order ==');
const viewRevenue = indexHtml.slice(
  indexHtml.indexOf('<section id="view-revenue"'),
  indexHtml.indexOf('<!-- 売上分析 -->')
);
assert(viewRevenue.includes('今月サマリー'), 'monthly summary heading required');
assert(viewRevenue.includes('作業後の売上確定待ち'), 'post-work confirmation queue heading required');
assert(viewRevenue.includes('card-revenue-manual-input') || viewRevenue.includes('売上明細を手入力'), 'manual revenue registration section required');
assert(viewRevenue.includes('売上一覧（今月）'), 'revenue list required');
assert(viewRevenue.includes('入金確認'), 'payment confirmation section required');
assert(viewRevenue.includes('revenue-workflow-secondary-collapse'), 'secondary analysis collapse required');
assert(viewRevenue.indexOf('card-revenue-daily') < viewRevenue.indexOf('card-revenue-queue'), 'summary should be above queue');
assert(viewRevenue.indexOf('card-revenue-queue') < viewRevenue.indexOf('revenue-manual-input-details'), 'queue should be above manual input');
assert(viewRevenue.indexOf('revenue-manual-input-details') < viewRevenue.indexOf('revenue-list-section'), 'manual input should be above list');
assert(viewRevenue.indexOf('revenue-list-section') < viewRevenue.indexOf('revenue-payment-confirm-section'), 'list should be above payment confirm');
assert(viewRevenue.indexOf('revenue-payment-confirm-section') < viewRevenue.indexOf('revenue-workflow-secondary'), 'payment confirm should be above secondary collapse');

console.log('== broker fees and labels preserved ==');
assert(appJs.includes("label: '仲介料'"), 'revenue summary should keep 仲介料');
assert(appJs.includes("label: '確定仲介料'"), 'revenue summary should keep 確定仲介料');
assert(appJs.includes("label: '予定仲介料'"), 'revenue summary should keep 予定仲介料');
assert(revenueBrainJs.includes('confirmedFeeAmount = confirmedRevenue - confirmedGrossProfit'), 'v4.11.5 fee formula must remain');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit formula must remain');

console.log('== workflow queue and row actions ==');
assert(appJs.includes('renderRevenueWorkflowQueueCard'), 'workflow queue card renderer required');
assert(appJs.includes('workflowMode: true'), 'revenue view should use workflow queue mode');
assert(appJs.includes('renderRevenueRowWorkflowActions'), 'row workflow actions required');
assert(appJs.includes('data-revenue-go-receivable'), 'receivable navigation action required');
assert(appJs.includes('data-revenue-mark-paid'), 'mark paid action required');
assert(appJs.includes('data-create-invoice-revenue'), 'invoice create action must remain');
assert(appJs.includes('data-revenue-go-follow'), 'follow navigation action required');
assert(appJs.includes('data-revenue-check-source'), 'source check action required');
assert(appJs.includes('売上確定へ'), 'queue confirm button label required');
assert(appJs.includes('Googleカレンダー確認'), 'queue calendar button required');
assert(!appJs.includes('openWorkCompletionModalFromQueue') || appJs.includes('data-daily-revenue-confirm'), 'queue must use existing confirm modal flow');

{
  const confirmFn = appJs.match(/function openWorkCompletionModalFromQueue[\s\S]*?\n  \}/);
  assert(confirmFn, 'openWorkCompletionModalFromQueue must remain');
  assert(!confirmFn[0].includes('addWorkOrder'), 'queue confirm must not create work orders');
  assert(!confirmFn[0].includes('Storage.addRevenueRecord'), 'queue confirm must not auto-save revenue');
}

console.log('== secondary sections preserved ==');
assert(indexHtml.includes('id="revenue-sales-outcome"'), 'sales outcome block must remain');
assert(indexHtml.includes('id="revenue-next-sales"'), 'next sales block must remain');
assert(indexHtml.includes('id="revenue-sales-hold"'), 'sales hold block must remain');
assert(indexHtml.includes('revenue-monthly-target'), 'target setting must remain');
assert(indexHtml.includes('data-view="revenue-analysis"'), 'aggregation link to analysis must remain');
assert(appJs.includes('renderRevenueSalesOutcomeSection'), 'sales outcome renderer required');
assert(appJs.includes('renderRevenuePaymentConfirmSection'), 'payment confirm renderer required');

console.log('== forbidden label scan ==');
for (const term of ['見込み利益', '見込み売上', '今月利益', '今月売上', '予定売上見込み']) {
  assert(!appJs.includes(term), `app.js must not include forbidden label: ${term}`);
}

console.log('== untouched modules ==');
assert(!receptionJs.includes('renderRevenueRowWorkflowActions'), 'reception-brain must not change for v4.12.4');
assert(!documentsJs.includes('renderRevenueRowWorkflowActions'), 'documents-brain must not change for v4.12.4');
assert(!followJs.includes('renderRevenueRowWorkflowActions'), 'follow-up-brain must not change for v4.12.4');

console.log('== revenue workflow css ==');
assert(css.includes('#view-revenue .revenue-summary-grid'), 'revenue summary grid css required');
assert(css.includes('#view-revenue .revenue-row-workflow-actions'), 'row workflow actions css required');
assert(css.includes('#view-revenue .revenue-workflow-secondary-collapse'), 'secondary collapse css required');

execSync('node scripts/verify-v4117-profit-broker-fees-layout.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.12.4 revenue-page-workflow checks passed.');

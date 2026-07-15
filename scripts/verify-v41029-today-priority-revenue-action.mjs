/**
 * Budil v4.10.38 緊急修正 — 今日の最優先から受付売上確定導線 verification.
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

for (const file of ['js/app.js', 'js/reception-brain.js', 'js/revenue-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.38 today-priority-revenue-action ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const receptionJs = load('js/reception-brain.js');
const revenueJs = load('js/revenue-brain.js');
const executiveJs = load('js/executive-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

const NG_TERMS = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了',
  '作業完了後',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.12.13'), 'index.html should show v4.12.13');
assert(indexHtml.includes('js/app.js?v=4.12.13'), 'app.js cache buster should be v4.12.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.13'"), 'storage.js version should be v4.12.13');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.13'"), 'data-backup version should be v4.12.13');

console.log('== priority action button wiring ==');
assert(appJs.includes('data-exec-priority-fill-revenue'), 'exec priority should expose fill-revenue button');
assert(appJs.includes('data-daily-priority-fill-revenue'), 'daily priority should expose fill-revenue button');
assert(appJs.includes('この受付から売上確定する'), 'unified fill-revenue button label should exist');
assert(!appJs.includes('売上確定へ（例外）'), 'old exception button label must be removed from app.js');
assert(appJs.includes('fillRevenueAction'), 'priority items should carry fillRevenueAction flag');
assert(appJs.includes('受付内容から売上確定'), 'form title should be 受付内容から売上確定');
assert(appJs.includes('この内容で売上確定する'), 'submit label helper should set confirm copy');
assert(indexHtml.includes('id="revenue-form-intake-note"'), 'intake note element should exist');
assert(indexHtml.includes('id="btn-revenue-submit"'), 'revenue submit button should have id');
assert(receptionJs.includes('buildIntakePrioritySummary'), 'reception brain should build priority summary');
assert(receptionJs.includes('受付内容を確認・売上確定'), 'priority title pattern should be concrete');
assert(executiveJs.includes('fillRevenueAction'), 'executive brain should pass fillRevenueAction');
assert(appJs.includes('fillRevenueFromReceptionIntake'), 'fillRevenueFromReceptionIntake should remain');
assert(appJs.includes('warnExceptionRevenueDuplicate'), 'duplicate guard should remain');
assert(revenueJs.includes('buildExceptionRevenueFormFromIntake'), 'exception prefill should remain');
assert(!css.includes('v4.10.29'), 'css must not be changed for v4.10.29');

console.log('== NG terms ==');
for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

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
    undefined,
    RegExp,
    window: { confirm: () => true }
  });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  return ctx;
}

console.log('== 海老澤智貴様 priority + prefill ==');
{
  const ctx = createSandbox();
  const intake = {
    id: 'intake-ebisawa',
    customerName: '海老澤智貴',
    source: '直受',
    serviceText: 'R1',
    estimateAmount: 22000,
    scheduledDate: '2026-07-03',
    status: 'lead_created',
    memo: '受付済み'
  };
  const result = runInContext(`(() => {
    const prefill = RevenueBrain.buildExceptionRevenueFormFromIntake(${JSON.stringify(intake)});
    const state = ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, { leads: [], workOrders: [], revenues: [] });
    const summary = ReceptionBrain.buildIntakePrioritySummary(${JSON.stringify(intake)}, { leads: [], workOrders: [], revenues: [] });
    const priorities = ExecutiveBrain.buildTopPriorities({
      today: '2026-07-05',
      pendingReceptions: [${JSON.stringify(intake)}],
      leads: [],
      workOrders: [],
      revenues: [],
      todayWork: [],
      followTargets: [],
      analyticsCtx: {},
      profitCtx: {},
      dailyTasks: []
    });
    return { prefill, state, summary, priority: priorities[0] || null };
  })()`, ctx);
  assert(result.prefill.customerName === '海老澤智貴', 'customerName should prefill');
  assert(result.prefill.amount === 22000, 'amount should be 22000');
  assert(result.state.primaryAction === 'fillRevenue', 'primary action should be fillRevenue');
  assert(result.state.primaryLabel === 'この受付から売上確定する', 'primary label should be unified');
  assert(result.summary.title.includes('海老澤智貴様の受付内容を確認・売上確定'), 'summary title should be concrete');
  assert(result.summary.reason.includes('R1'), 'summary reason should include service');
  assert(result.summary.reason.includes('22,000'), 'summary reason should include amount');
  assert(result.summary.fillRevenueAction === true, 'summary should request fillRevenue action');
  assert(result.priority && result.priority.fillRevenueAction === true, 'top priority should expose fillRevenue action');
  assert(result.priority.title.includes('受付内容を確認・売上確定'), 'top priority title should be concrete');
}

console.log('== duplicate warning without auto overwrite ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const intake = {
      id: 'intake-ebisawa',
      customerName: '海老澤智貴',
      source: '直受',
      serviceText: 'R1',
      estimateAmount: 22000,
      scheduledDate: '2026-07-03'
    };
    const prefill = RevenueBrain.buildExceptionRevenueFormFromIntake(intake);
    const revenues = [{
      id: 'rev-existing',
      workDate: '2026-07-03',
      customerName: '海老澤智貴',
      service: 'R1',
      source: '直受',
      amount: 22000
    }];
    const dup = RevenueBrain.warnExceptionRevenueDuplicate(prefill, revenues);
    return { hasDuplicate: dup.hasDuplicate, matchCount: dup.matches.length };
  })()`, ctx);
  assert(result.hasDuplicate === true, 'same date/customer/amount should warn duplicate');
  assert(result.matchCount >= 1, 'duplicate matches should be found');
}

console.log('== no auto work-order / calendar creation ==');
assert(!appJs.match(/fillRevenueFromReceptionIntake[\s\S]{0,1200}Storage\.addWorkOrder/), 'exception fill must not auto-create work orders');

console.log('\nAll v4.10.38 today-priority-revenue-action checks passed.');

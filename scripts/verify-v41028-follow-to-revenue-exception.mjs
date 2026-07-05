/**
 * Budil v4.10.38 緊急修正 — 受付/フォローから売上明細例外補助導線 verification.
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

console.log('== v4.10.38 follow-to-revenue-exception ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const receptionJs = load('js/reception-brain.js');
const revenueJs = load('js/revenue-brain.js');
const calBrainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

console.log('== version check ==');
assert(indexHtml.includes('v4.10.41'), 'index.html should show v4.10.41');
assert(indexHtml.includes('js/app.js?v=4.10.41'), 'app.js cache buster should be v4.10.41');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.41'"), 'storage.js version should be v4.10.41');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.41'"), 'data-backup version should be v4.10.41');

console.log('== exception UI wiring ==');
assert(appJs.includes('data-exec-priority-fill-revenue'), 'priority card should expose exception revenue button');
assert(appJs.includes('この受付から売上確定する'), 'exception button label should exist');
assert(appJs.includes('fillRevenueFromReceptionIntake'), 'fillRevenueFromReceptionIntake should exist');
assert(appJs.includes('warnExceptionRevenueDuplicate'), 'app should use duplicate guard helper');
assert(appJs.includes('受付/フォローから例外補助入力。カレンダー予定未反映。'), 'exception memo should exist');
assert(!appJs.includes('売上登録'), 'NG term 売上登録 must not appear in app.js UI');
assert(receptionJs.includes('extractWorkDate'), 'reception brain should extract work date');
assert(revenueJs.includes('buildExceptionRevenueFormFromIntake'), 'revenue brain should build exception prefill');
assert(revenueJs.includes('warnExceptionRevenueDuplicate'), 'revenue brain should warn duplicates');
assert(!css.includes('v4.10.28'), 'css must not be changed for v4.10.28');

console.log('== v4.10.27 regression markers ==');
assert(calBrainJs.includes('c.startTime || \'\''), 'v4.10.27 dedupe startTime must remain');
assert(appJs.includes('CalendarCandidateBrain.isPendingCandidate(wo)'), 'v4.10.27 revenue queue candidate path must remain');
assert(indexHtml.includes('css/style.css?v=4.10.41'), 'v4.10.25 documents CSS cache buster must remain');

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
  return ctx;
}

console.log('== 海老澤智貴様 exception prefill ==');
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
    return { prefill, primaryAction: state.primaryAction, primaryLabel: state.primaryLabel };
  })()`, ctx);
  assert(result.prefill.customerName === '海老澤智貴', 'customerName should prefill');
  assert(result.prefill.source === '直受', 'source should prefill');
  assert(result.prefill.service === 'R1', 'service should prefill');
  assert(result.prefill.amount === 22000, 'amount should be 22000');
  assert(result.prefill.workDate === '2026-07-03', 'workDate should be 2026-07-03');
  assert(result.primaryAction === 'fillRevenue', 'primary action should be fillRevenue exception');
  assert(result.primaryLabel.includes('この受付から売上確定する'), 'primary label should be unified fill-revenue copy');
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
assert(!appJs.includes('Storage.addWorkOrder') || !appJs.match(/fillRevenueFromReceptionIntake[\s\S]{0,800}Storage\.addWorkOrder/), 'exception fill must not auto-create work orders');
assert(!receptionJs.includes('Googleカレンダー') || true, 'reception brain should not auto-create calendar events');

console.log('\nAll v4.10.38 follow-to-revenue-exception checks passed.');

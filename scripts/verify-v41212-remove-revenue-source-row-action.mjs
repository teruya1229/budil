/**
 * Budil v4.12.13 - remove redundant revenue-row source action.
 * Source change/confirm stays inside the existing edit form (revenue-source).
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

for (const file of ['js/app.js', 'js/revenue-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.13 remove-revenue-source-row-action ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.13'), 'index.html should show v4.12.13');
assert(indexHtml.includes('js/app.js?v=4.12.13'), 'app.js cache buster should be v4.12.13');
assert(indexHtml.includes('css/style.css?v=4.12.13'), 'style.css cache buster should be v4.12.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.13'"), 'storage version should be v4.12.13');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.13'"), 'data-backup version should be v4.12.13');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.13'"), 'verify-current EXPECTED_VERSION should be v4.12.13');
assert(!indexHtml.includes('?v=4.12.11'), 'old cache buster v4.12.11 should be gone');
assert(statusMd.includes('v4.12.13'), 'status.md should document v4.12.13');
assert(handoffMd.includes('v4.12.13'), 'handoff.md should document v4.12.13');
assert(decisionLog.includes('v4.12.13'), 'decision-log.md should record v4.12.13');

console.log('== standalone source row action removed ==');
assert(!appJs.includes('data-revenue-check-source'), 'data-revenue-check-source must be removed');
assert(!appJs.includes('openRevenueSourceCheck'), 'openRevenueSourceCheck must be removed');
assert(!appJs.includes('revenueCheckSource'), 'revenueCheckSource dataset wiring must be removed');
assert(!appJs.includes('>依頼元</button>'), 'standalone 依頼元 row button must be removed');
{
  const rowFn = appJs.match(/function renderRevenueRowWorkflowActions[\s\S]*?\n  function /);
  assert(rowFn, 'renderRevenueRowWorkflowActions must remain');
  assert(!rowFn[0].includes('依頼元'), 'row workflow renderer must not emit 依頼元 button');
  assert(!rowFn[0].includes('data-revenue-check-source'), 'row workflow renderer must not emit source check attr');
}
{
  const bindFn = appJs.match(/function bindRevenueRowWorkflowActions[\s\S]*?\n  function /);
  assert(bindFn, 'bindRevenueRowWorkflowActions must remain');
  assert(!bindFn[0].includes('data-revenue-check-source'), 'bind must not wire source-check listener');
  assert(!bindFn[0].includes('openRevenueSourceCheck'), 'bind must not call openRevenueSourceCheck');
}

console.log('== remaining row actions ==');
assert(appJs.includes('data-edit-revenue'), 'edit action must remain');
assert(appJs.includes('data-delete-revenue'), 'delete action must remain');
assert(appJs.includes('data-revenue-go-receivable'), 'receivable action must remain');
assert(appJs.includes('data-revenue-mark-paid'), 'mark-paid action must remain');
assert(appJs.includes('data-create-invoice-revenue'), 'invoice create action must remain');
assert(appJs.includes('data-revenue-go-follow'), 'follow action must remain');
assert(appJs.includes('renderRevenueRowWorkflowActions'), 'shared row action renderer must remain');
assert(appJs.includes('bindRevenueRowWorkflowActions'), 'shared row action binder must remain');

console.log('== edit form source path preserved ==');
assert(indexHtml.includes('id="revenue-source"'), 'revenue-source select must remain in form');
assert(indexHtml.includes('for="revenue-source"'), 'revenue-source label must remain');
assert(appJs.includes('function openRevenueEdit'), 'openRevenueEdit must remain');
assert(appJs.includes("fillSourceSelectOptions(document.getElementById('revenue-source'), record.source"), 'edit must restore record.source into revenue-source');
assert(appJs.includes("source: document.getElementById('revenue-source').value"), 'save path must read revenue-source');
assert(appJs.includes('function getRevenueFormData'), 'getRevenueFormData must remain');
assert(appJs.includes('fillSourceSelectOptions'), 'source option helper must remain');

console.log('== profit rates / storage / revenue confirm unchanged ==');
assert(revenueJs.includes('function getSourceProfitRate') || revenueJs.includes('getSourceProfitRate('), 'getSourceProfitRate must remain');
assert(revenueJs.includes('direct: 100'), 'direct profit rate unchanged');
assert(revenueJs.includes('coop: 80'), 'coop profit rate unchanged');
assert(revenueJs.includes('yamada: 60'), 'yamada profit rate unchanged');
assert(!storageJs.includes('revenue_check_source'), 'no new revenue_check_source storage key');
assert(!storageJs.includes('profitTargetMonth'), 'no unrelated storage key added');
assert(appJs.includes('openWorkCompletionModal') || appJs.includes('data-daily-revenue-confirm'), 'revenue confirmation flow must remain');
assert(!appJs.includes('localStorage.clear'), 'app must not clear localStorage');

{
  const sandbox = {
    console,
    PaymentBrain: null,
    RevenueBrain: null
  };
  const ctx = createContext(sandbox);
  runInContext(load('js/payment-brain.js'), ctx);
  runInContext(load('js/revenue-brain.js'), ctx);
  const rateCases = [
    ['直受け', 100, false],
    ['コープ', 80, false],
    ['ヤマダ', 60, false],
    ['', 0, true]
  ];
  for (const [source, rate, reviewRequired] of rateCases) {
    const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, ctx);
    assert(info.rate === rate, `${source || '(empty)'} rate must stay ${rate}, got ${info.rate}`);
    assert(info.reviewRequired === reviewRequired, `${source || '(empty)'} reviewRequired must stay ${reviewRequired}`);
  }
}

console.log('\nAll v4.12.13 remove-revenue-source-row-action checks passed.');

/**
 * Budil v4.13.12 - work-order 売上確定へ must prefill scheduled fields.
 * Isolated in-memory fixtures only. No production localStorage.
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

const app = load('js/app.js');
const index = load('index.html');
const currentRunner = load('scripts/verify-current.mjs');
const storageJs = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const completionSource = load('js/work-completion-brain.js');

for (const file of ['js/app.js', 'js/work-completion-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version ==');
assert(index.includes('Budil v4.13.12'), 'index shows Budil v4.13.12');
assert(index.includes('js/app.js?v=4.13.12'), 'app.js cache buster is v4.13.12');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.12'"), 'storage version is v4.13.12');
assert(dataBackup.includes("APP_VERSION: 'v4.13.12'"), 'data-backup version is v4.13.12');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.12'"), 'verify-current pins v4.13.12');

console.log('== work-order path prefills scheduled values ==');
assert(app.includes("document.getElementById('work-completion-date').value = defaults.workDate"), 'scheduled date is copied into 対象日');
assert(app.includes("document.getElementById('work-completion-customer').value = defaults.customerName"), 'customer is copied');
assert(app.includes("document.getElementById('work-completion-actual-service').value = defaults.actualService"), 'scheduled breakdown is copied into 実際の作業内容');
assert(app.includes("document.getElementById('work-completion-amount').value = defaults.amount"), 'estimate amount is copied into 実際の売上金額');
assert(!app.includes("document.getElementById('work-completion-date').value = ''"), 'work-order date is not forced empty');
assert(!app.includes("document.getElementById('work-completion-actual-service').value = ''"), 'work-order breakdown is not forced empty');
assert(!app.includes("document.getElementById('work-completion-amount').value = ''"), 'work-order amount is not forced empty');
assert(!app.includes("validateCurrentWorkCompletionSession(workOrderId, { requireUserInput: true })"), 'prefilled work-order submit does not require retyping empty fields');
assert(app.includes('validateCurrentWorkCompletionSession(workOrderId)'), 'work-order id and source signature are still validated');
assert(app.includes('createRevenueConfirmationSnapshot'), 'confirmation snapshot remains');
assert(app.includes('formatRevenueConfirmationMessage'), 'concrete confirmation message remains');
assert(app.includes('recoverStorageForRevenueConfirmationIfNeeded'), 'storage recovery remains');
assert(app.includes('workCompletionSubmitInFlight'), 'double-submit guard remains');

console.log('== emergency / new manual entry stays a separate empty form ==');
assert(index.includes('id="daily-revenue-customer"'), 'emergency daily revenue customer field exists');
assert(index.includes('id="daily-revenue-service"'), 'emergency daily revenue service field exists');
assert(index.includes('id="daily-revenue-amount"'), 'emergency daily revenue amount field exists');
assert(index.includes('placeholder="例：山田様"'), 'emergency customer field is a blank new-entry placeholder');
assert(index.includes('placeholder="予定と違う場合は修正"'), 'work-order breakdown placeholder asks to edit differences only');

console.log('== defaults map Victor-like work order fields ==');
const ctx = createContext({
  console, Date, JSON, Math, Number, String, Array, Object, Boolean, RegExp, Error,
  MapBrain: { detectAreaFromAddress: () => '' },
  ReceptionBrain: { matchRevenueService: value => value, matchRevenueSource: value => value },
  RevenueBrain: { getDefaultGrossProfitRateBySource: () => null }
});
runInContext(load('js/work-order-brain.js'), ctx, { filename: 'js/work-order-brain.js' });
runInContext(load('js/follow-up-brain.js'), ctx, { filename: 'js/follow-up-brain.js' });
runInContext(completionSource, ctx, { filename: 'js/work-completion-brain.js' });
ctx.wo = {
  id: 'fixture-victor',
  customerName: 'ビクター',
  source: '直受け',
  serviceText: 'N3,R1,KN4',
  scheduledDate: '2026-08-27',
  estimateAmount: 62000,
  status: 'confirmed'
};
runInContext(`
  this.defaults = WorkCompletionBrain.buildCompletionFormDefaults(wo, { today: '2026-08-27' });
  this.snapshot = WorkCompletionBrain.createRevenueConfirmationSnapshot(wo, {
    workDate: this.defaults.workDate,
    customerName: this.defaults.customerName,
    actualService: this.defaults.actualService,
    service: this.defaults.service,
    source: this.defaults.source,
    amount: this.defaults.amount,
    grossMarginRate: '',
    paymentStatus: this.defaults.paymentStatus,
    paymentDate: this.defaults.paymentDate,
    paymentMethod: '',
    paymentConcern: false,
    actualMemo: '',
    additionalMemo: '',
    followMemo: ''
  }, { shouldCreate: false });
  this.message = WorkCompletionBrain.formatRevenueConfirmationMessage(this.snapshot);
`, ctx);
assert(ctx.defaults.workDate === '2026-08-27', 'defaults.workDate is 2026-08-27');
assert(ctx.defaults.customerName === 'ビクター', 'defaults.customerName is ビクター');
assert(ctx.defaults.actualService === 'N3,R1,KN4', 'defaults.actualService is N3,R1,KN4');
assert(Number(ctx.defaults.amount) === 62000, 'defaults.amount is 62000');
assert(ctx.defaults.source === '直受け' || String(ctx.defaults.source).includes('直受'), 'defaults.source keeps 直受');
assert(ctx.message.includes('対象日：2026-08-27'), 'confirmation shows 2026-08-27');
assert(ctx.message.includes('対象顧客：ビクター'), 'confirmation shows ビクター');
assert(ctx.message.includes('入力された内訳：N3,R1,KN4'), 'confirmation shows N3,R1,KN4');
assert(ctx.message.includes('62,000円'), 'confirmation shows 62,000円');

console.log('\nAll v4.13.12 work-order prefill checks passed.');

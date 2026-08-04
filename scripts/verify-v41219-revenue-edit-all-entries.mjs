/**
 * Budil v4.12.22 - all revenue edit entries open existing form and update same ID.
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
  'js/app.js',
  'js/storage.js',
  'js/revenue-brain.js',
  'js/payment-brain.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.22 revenue-edit-all-entries ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const revenueJs = load('js/revenue-brain.js');
const paymentJs = load('js/payment-brain.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.24'), 'index.html should show v4.12.24');
assert(indexHtml.includes('js/app.js?v=4.12.24'), 'app.js cache buster should be v4.12.24');
assert(indexHtml.includes('js/storage.js?v=4.12.24'), 'storage cache buster should be v4.12.24');
assert(indexHtml.includes('js/revenue-brain.js?v=4.12.24'), 'revenue-brain cache buster should be v4.12.24');
assert(indexHtml.includes('css/style.css?v=4.12.24'), 'style.css cache buster should be v4.12.24');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.24'"), 'storage version should be v4.12.24');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.24'"), 'data-backup version should be v4.12.24');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.24'"), 'verify-current EXPECTED_VERSION should be v4.12.24');
assert(!indexHtml.includes('?v=4.12.18'), 'old cache buster v4.12.18 should be gone');
assert(statusMd.includes('v4.12.24'), 'status.md should document v4.12.24');
assert(handoffMd.includes('v4.12.24'), 'handoff.md should document v4.12.24');
assert(decisionLog.includes('v4.12.24'), 'decision-log.md should record v4.12.24');

console.log('== existing form / no new modal ==');
assert(indexHtml.includes('id="revenue-manual-input-details"'), 'manual input details must remain');
assert(indexHtml.includes('id="revenue-form"'), 'existing revenue form must remain');
assert(indexHtml.includes('id="revenue-edit-id"'), 'edit id hidden field must remain');
assert(indexHtml.includes('id="btn-revenue-cancel"'), 'cancel button must remain');
assert(!appJs.includes('createElement(\'dialog\')'), 'must not add dialog modal for revenue edit');
assert(!appJs.includes('revenue-edit-modal'), 'must not add new revenue-edit-modal');

console.log('== openRevenueEdit opens details and navigates ==');
{
  const fn = appJs.match(/function openRevenueEdit\([\s\S]*?\n  function /);
  assert(fn, 'openRevenueEdit must exist');
  const body = fn[0];
  assert(body.includes("navigateToView('revenue')"), 'edit must navigate to revenue view');
  assert(body.includes("getElementById('revenue-manual-input-details')"), 'edit must target manual input details');
  assert(body.includes('details.open = true') || body.includes('details.open=true'), 'edit must open details');
  assert(body.includes("getElementById('revenue-edit-id').value = id"), 'edit must set revenue-edit-id');
  assert(body.includes("textContent = '売上編集'"), 'edit title must be 売上編集');
  assert(body.includes('writeRevenuePaymentFieldsToForm(record)'), 'edit must load payment fields');
  assert(body.includes('scrollToElement') || body.includes('scrollIntoView'), 'edit must scroll to form');
  assert(!/確定済み|入金済み/.test(body) || !/return.*確定|編集できない|編集禁止/.test(body), 'must not block confirmed/paid edit');
}

console.log('== all edit entry points reach openRevenueEdit ==');
assert(appJs.includes('data-edit-revenue'), 'list edit attribute required');
assert(appJs.includes("openRevenueEdit(btn.dataset.editRevenue)"), 'list edit must call openRevenueEdit');
assert(appJs.includes('data-open-revenue'), 'receivables open-revenue attribute required');
assert(appJs.includes('openRevenueEdit(id)'), 'receivables path must call openRevenueEdit');
assert(appJs.includes('data-receivable-detail'), 'receivable detail attribute required');
assert(appJs.includes("openRevenueEdit(state.revenue.id)"), 'reception linked revenue must call openRevenueEdit');
assert(appJs.includes('openRevenueEdit(wo.actualRevenueId)'), 'work-order linked revenue must call openRevenueEdit');
assert(appJs.includes('openRevenueEdit(btn.dataset.execPriorityViewRevenue)'), 'executive priority must call openRevenueEdit');
assert(appJs.includes('openRevenueEdit(btn.dataset.dailyPriorityViewRevenue)'), 'daily priority must call openRevenueEdit');

console.log('== save path updates same id ==');
{
  const fn = appJs.match(/function handleRevenueSubmit\([\s\S]*?\n  function /);
  assert(fn, 'handleRevenueSubmit must exist');
  const body = fn[0];
  assert(body.includes('Storage.updateRevenueRecord(id, data)'), 'edit save must update existing record');
  assert(body.includes('Storage.addRevenueRecord(data)'), 'new save path may add');
  assert(body.includes("const id = document.getElementById('revenue-edit-id').value"), 'save must read edit id');
  assert(body.includes("id ? '売上を更新しました") || body.includes('売上を更新しました'), 'update toast required');
}

console.log('== storage update preserves id / merge ==');
assert(storageJs.includes('updateRevenueRecord(id, data)'), 'updateRevenueRecord must remain');
{
  const fn = storageJs.match(/updateRevenueRecord\(id, data\)\s*\{[\s\S]*?\n  \},/);
  assert(fn, 'updateRevenueRecord body required');
  assert(fn[0].includes('...list[idx], ...data'), 'update must merge into existing record');
  assert(!fn[0].includes('addRevenueRecord'), 'update must not create via add');
}

console.log('== runtime: confirmed + paid edit keeps id/status/links ==');
function createSandbox() {
  const store = Object.create(null);
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((k) => delete store[k]);
    }
  };
  const sandbox = {
    console,
    localStorage,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
    PaymentBrain: null,
    RevenueBrain: null,
    WorkOrderBrain: { normalizeWorkOrder: (x) => ({ ...(x || {}) }) },
    FollowUpBrain: { normalizeFollowUp: (x) => ({ ...(x || {}) }) },
    DocumentsBrain: { normalizeDocument: (x) => ({ ...(x || {}) }) },
    ProfitBrain: { normalizeExpense: (x) => ({ ...(x || {}) }) },
    ReceptionBrain: {
      matchRevenueService: (x) => x || '',
      matchRevenueSource: (x) => x || '',
      normalizeIntake: (x) => ({ ...(x || {}) })
    },
    Storage: null,
    window: { confirm: () => true, alert: () => {} },
    document: { getElementById: () => null },
    navigator: { clipboard: { writeText: async () => {} } },
    alert: () => {},
    confirm: () => true,
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    TextEncoder,
    TextDecoder
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = createContext(sandbox);
  runInContext(paymentJs, ctx);
  runInContext(revenueJs, ctx);
  runInContext(storageJs, ctx);
  return ctx;
}

{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const beforeCount = Storage.getRevenueRecords().length;
    const seed = Storage.addRevenueRecord({
      workDate: '2026-07-27',
      customerName: 'VerifyEdit顧客',
      service: 'エアコンクリーニング',
      source: 'LP',
      amount: 14300,
      status: '確定',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paidDate: '2026-07-27',
      paidAmount: 14300,
      unpaidAmount: 0,
      relatedRevenueId: 'rel-keep-001',
      linkedDocumentId: 'doc-keep-001',
      intakeId: 'intake-keep-001',
      receptionIntakeId: 'intake-keep-001',
      sourceWorkOrderId: 'wo-keep-001',
      memo: 'before-edit'
    });
    const seedId = seed && seed.id;
    const countAfterSeed = Storage.getRevenueRecords().length;
    Storage.updateRevenueRecord(seedId, {
      customerName: 'VerifyEdit顧客更新',
      amount: 15000,
      memo: 'after-edit',
      status: '確定',
      paymentStatus: 'paid',
      paidDate: '2026-07-27',
      paidAmount: 15000
    });
    const after = Storage.getRevenueRecords().find((r) => r.id === seedId);
    const reloaded = JSON.parse(localStorage.getItem(Storage.KEYS.REVENUE_RECORDS) || '[]');
    const hit = reloaded.find((r) => r.id === seedId);
    return {
      seedId,
      beforeCount,
      countAfterSeed,
      afterCount: Storage.getRevenueRecords().length,
      after,
      hit
    };
  })()`, ctx);

  assert(result.seedId, 'seed revenue must be created');
  assert(result.countAfterSeed === result.beforeCount + 1, 'seed should add exactly one revenue');
  assert(result.after, 'updated revenue must still exist with same id');
  assert(result.after.id === result.seedId, 'revenue id must not change');
  assert(result.afterCount === result.countAfterSeed, 'revenue count must not increase on update');
  assert(result.after.customerName === 'VerifyEdit顧客更新', 'customer name must update');
  assert(Number(result.after.amount) === 15000, 'amount must update');
  assert(result.after.memo === 'after-edit', 'memo must update');
  assert(result.after.status === '確定', 'confirmed status must remain');
  assert(result.after.paymentStatus === 'paid', 'paid status must remain');
  assert(result.after.relatedRevenueId === 'rel-keep-001', 'relatedRevenueId must remain');
  assert(result.after.linkedDocumentId === 'doc-keep-001', 'linkedDocumentId must remain');
  assert(result.after.intakeId === 'intake-keep-001' || result.after.receptionIntakeId === 'intake-keep-001', 'intake link must remain');
  assert(result.after.sourceWorkOrderId === 'wo-keep-001', 'sourceWorkOrderId must remain');
  assert(result.hit, 'persisted revenue must remain after reload parse');
  assert(result.hit.customerName === 'VerifyEdit顧客更新', 'persisted name must remain');
  assert(result.hit.status === '確定', 'persisted confirmed status must remain');
  assert(result.hit.paymentStatus === 'paid', 'persisted paid status must remain');
  assert(result.hit.relatedRevenueId === 'rel-keep-001', 'persisted relatedRevenueId must remain');
}

console.log('All v4.12.22 revenue-edit-all-entries checks passed.');

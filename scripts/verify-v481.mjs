/**
 * Budil v4.8.17 local verification (diagnostics + backup restore E2E)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function loadScript(name) {
  return readFileSync(join(jsDir, name), 'utf8');
}

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data
  };
}

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
  const ctx = createContext({
    localStorage,
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
    undefined
  });
  return { ctx, localStorage };
}

function evalScripts(ctx, names) {
  for (const name of names) {
    runInContext(loadScript(name), ctx, { filename: name });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== node --check ==');
for (const file of ['storage.js', 'data-backup.js', 'payment-brain.js', 'documents-brain.js', 'revenue-brain.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

console.log('\n== diagnostics: workOrders 0, FollowUpBrain present ==');
{
  const { ctx } = createSandbox({
    budil_settings: JSON.stringify({}),
    budil_leads: JSON.stringify([]),
    budil_revenue_records: JSON.stringify([]),
    budil_documents: JSON.stringify([]),
    budil_work_orders: JSON.stringify([]),
    budil_followups: JSON.stringify([]),
    budil_monthly_results: JSON.stringify([]),
    budil_external_check_reports: JSON.stringify([]),
    budil_action_candidates: JSON.stringify([]),
    budil_daily_action_tasks: JSON.stringify({ states: [], manualTasks: [], dailyChecks: {} })
  });
  evalScripts(ctx, ['payment-brain.js', 'data-backup.js', 'storage.js']);
  runInContext(`
    FollowUpBrain = {
      getDiagnosticsCounts(workOrders, revenues, leads, today) {
        if (!today || !/^\\d{4}-\\d{2}-\\d{2}$/.test(today)) throw new Error('todayDiag must be ISO date');
        return { thanksPending: 0, reviewPending: 0, maintNear: 0, badFollowUp: 0 };
      }
    };
  `, ctx);
  const result = runInContext('Storage.runDataDiagnostics()', ctx);
  assert(result && result.counts, 'diagnostics result missing');
  assert(result.counts.workOrders === 0, 'workOrders count expected 0');
  console.log('OK: diagnostics completed without crash');
}

console.log('\n== backup restore E2E ==');
{
  const today = new Date().toISOString().slice(0, 10);
  const revA = {
    id: 'rev_test_a',
    customerName: 'v481売上単体',
    amount: 10000,
    workDate: today,
    service: 'テスト',
    status: '確定',
    paymentMethod: 'kurashi_deferred',
    paymentStatus: 'pending',
    expectedPaymentDate: '2026-07-31',
    paidDate: '',
    paidAmount: 0,
    unpaidAmount: 10000
  };
  const docB = {
    id: 'doc_test_b',
    type: 'invoice',
    customerName: 'v481請求書単体',
    total: 14300,
    tax: 1300,
    subtotal: 13000,
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    expectedPaymentDate: '2026-07-31',
    paidDate: '',
    paidAmount: 0,
    unpaidAmount: 14300,
    taxSettings: { taxRate: 10, taxDisplayMode: 'taxExcluded', lineRounding: 'floor' }
  };
  const revC = {
    id: 'rev_test_c',
    customerName: 'v481 linked売上',
    amount: 22000,
    workDate: today,
    service: 'linked',
    status: '確定',
    paymentMethod: 'corporate_monthly',
    paymentStatus: 'pending',
    linkedDocumentId: 'doc_test_c',
    expectedPaymentDate: '2026-07-31',
    paidAmount: 0,
    unpaidAmount: 22000
  };
  const docC = {
    id: 'doc_test_c',
    type: 'invoice',
    customerName: 'v481 linked売上',
    total: 22000,
    linkedRevenueId: 'rev_test_c',
    paymentMethod: 'corporate_monthly',
    paymentStatus: 'pending',
    taxSettings: { taxRate: 10, taxDisplayMode: 'taxIncluded', lineRounding: 'floor' }
  };
  const revPaid = {
    id: 'rev_test_paid',
    customerName: 'v481現金入金済み',
    amount: 8000,
    workDate: today,
    status: '確定',
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    paidDate: today,
    paidAmount: 8000,
    unpaidAmount: 0
  };
  const revBroken = {
    id: 'rev_test_broken',
    customerName: 'v481 linked切れ',
    amount: 5000,
    workDate: today,
    status: '確定',
    linkedDocumentId: 'doc_missing',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    unpaidAmount: 5000
  };

  const seed = {
    budil_settings: JSON.stringify({}),
    budil_revenue_records: JSON.stringify([revA, revC, revPaid, revBroken]),
    budil_documents: JSON.stringify([docB, docC])
  };
  const { ctx, localStorage } = createSandbox(seed);
  evalScripts(ctx, ['payment-brain.js', 'data-backup.js', 'storage.js']);

  const e2e = runInContext(`
    const exported = DataBackup.exportPayload();
    const integrity = DataBackup.getIntegritySummaryFromData(exported.data);
    const preview = DataBackup.validatePayload(exported);
    DataBackup.inspectBackupData(exported.data, 'restore-preview-test');
    Object.keys(localStorage._data).forEach((k) => localStorage.removeItem(k));
    DataBackup.importData(preview.data, preview.keys);
    const revenues = JSON.parse(localStorage.getItem('budil_revenue_records') || '[]');
    const documents = JSON.parse(localStorage.getItem('budil_documents') || '[]');
    const receivables = PaymentBrain.summarizeReceivables(revenues, documents, ${JSON.stringify(today)});
    ({ exported, integrity, preview, revenues, documents, receivables });
  `, ctx);

  assert(e2e.exported.backupVersion === 'v4.8.17', 'backupVersion mismatch');
  assert(e2e.exported.appVersion === 'v4.8.17', 'appVersion mismatch');
  assert(e2e.exported.dataKeys.includes('budil_revenue_records'), 'missing revenue key');
  assert(e2e.exported.dataKeys.includes('budil_documents'), 'missing documents key');
  assert(e2e.integrity.revenueCount === 4, 'revenue count in backup');
  assert(e2e.integrity.documentsWithTaxSettings >= 2, 'taxSettings in backup');
  assert(e2e.integrity.linkedCount >= 2, 'linked IDs in backup');
  assert(e2e.preview.valid, 'backup payload invalid');

  const revenues = e2e.revenues;
  const documents = e2e.documents;
  const byName = (name) => revenues.find((r) => (r.customerName || '').includes(name));
  const docByName = (name) => documents.find((d) => (d.customerName || '').includes(name));

  assert(byName('v481売上単体')?.paymentMethod === 'kurashi_deferred', 'revA paymentMethod');
  assert(docByName('v481請求書単体')?.taxSettings?.taxRate === 10, 'docB taxSettings');
  assert(byName('v481 linked')?.linkedDocumentId === 'doc_test_c', 'linked revenue id');
  assert(docByName('v481 linked')?.linkedRevenueId === 'rev_test_c', 'linked document id');
  assert(byName('v481現金入金済み')?.paymentStatus === 'paid', 'paid revenue');
  assert(byName('v481 linked切れ')?.linkedDocumentId === 'doc_missing', 'broken linked preserved');

  const receivables = e2e.receivables;
  assert(!receivables.items.some((i) => (i.counterparty || '').includes('v481現金')), 'paid not in receivables');

  console.log('OK: backup export/import round-trip');
}

console.log('\nAll v4.8.17 local checks passed.');

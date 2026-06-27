/**
 * Budil v4.8.6 linked one-to-one safety verification.
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
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
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

console.log('== v4.8.6 linked one-to-one check ==');
for (const file of ['storage.js', 'payment-brain.js', 'documents-brain.js', 'data-backup.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const seed = {
  budil_revenue_records: JSON.stringify([
    {
      id: 'rev_a',
      customerName: 'linked safety A',
      amount: 11000,
      workDate: '2026-06-26',
      service: 'service A',
      status: 'confirmed',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 11000,
      linkedDocumentId: 'doc_a'
    },
    {
      id: 'rev_b',
      customerName: 'linked safety B',
      amount: 22000,
      workDate: '2026-06-26',
      service: 'service B',
      status: 'confirmed',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 22000,
      linkedDocumentId: 'doc_b'
    },
    {
      id: 'rev_c',
      customerName: 'linked safety duplicate',
      amount: 33000,
      workDate: '2026-06-26',
      service: 'service C',
      status: 'confirmed',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 33000,
      linkedDocumentId: 'doc_b'
    },
    {
      id: 'rev_d',
      customerName: 'delete document counterpart',
      amount: 44000,
      workDate: '2026-06-26',
      service: 'service D',
      status: 'confirmed',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 44000,
      linkedDocumentId: 'doc_d'
    }
  ]),
  budil_documents: JSON.stringify([
    {
      id: 'doc_a',
      type: 'invoice',
      customerName: 'linked safety A',
      title: 'invoice A',
      total: 11000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 11000,
      linkedRevenueId: 'rev_a',
      taxSettings: { taxRate: 10, taxDisplayMode: 'taxIncluded', lineRounding: 'floor' }
    },
    {
      id: 'doc_b',
      type: 'invoice',
      customerName: 'linked safety B',
      title: 'invoice B',
      total: 22000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 22000,
      linkedRevenueId: 'rev_b',
      taxSettings: { taxRate: 10, taxDisplayMode: 'taxIncluded', lineRounding: 'floor' }
    },
    {
      id: 'doc_c',
      type: 'invoice',
      customerName: 'linked safety competing doc',
      title: 'invoice C',
      total: 33000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 33000,
      linkedRevenueId: 'rev_a',
      taxSettings: { taxRate: 10, taxDisplayMode: 'taxIncluded', lineRounding: 'floor' }
    },
    {
      id: 'doc_d',
      type: 'invoice',
      customerName: 'delete document counterpart',
      title: 'invoice D',
      total: 44000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: '2026-07-31',
      paidAmount: 0,
      unpaidAmount: 44000,
      linkedRevenueId: 'rev_d',
      taxSettings: { taxRate: 10, taxDisplayMode: 'taxIncluded', lineRounding: 'floor' }
    }
  ])
};

const { ctx } = createSandbox(seed);
evalScripts(ctx, ['payment-brain.js', 'documents-brain.js', 'storage.js', 'data-backup.js']);

const result = runInContext(`
  PaymentBrain.linkRevenueAndDocument('rev_a', 'doc_b', Storage);
  const afterLink = {
    revenues: Storage.getRevenueRecords(),
    documents: Storage.getDocuments()
  };
  const receivablesAfterLink = PaymentBrain.summarizeReceivables(afterLink.revenues, afterLink.documents, '2026-06-26');

  Storage.deleteRevenueRecord('rev_a');
  const afterDeleteRevenue = {
    revenues: Storage.getRevenueRecords(),
    documents: Storage.getDocuments()
  };

  Storage.deleteDocument('doc_d');
  const afterDeleteDocument = {
    revenues: Storage.getRevenueRecords(),
    documents: Storage.getDocuments()
  };

  const exported = DataBackup.exportPayload();
  ({ afterLink, receivablesAfterLink, afterDeleteRevenue, afterDeleteDocument, exported });
`, ctx);

const rev = (list, id) => list.find((r) => r.id === id);
const doc = (list, id) => list.find((d) => d.id === id);

assert(rev(result.afterLink.revenues, 'rev_a')?.linkedDocumentId === 'doc_b', 'rev_a should link doc_b');
assert(doc(result.afterLink.documents, 'doc_b')?.linkedRevenueId === 'rev_a', 'doc_b should link rev_a');
assert(doc(result.afterLink.documents, 'doc_a')?.linkedRevenueId === '', 'old doc_a link should be cleared');
assert(rev(result.afterLink.revenues, 'rev_b')?.linkedDocumentId === '', 'old rev_b link should be cleared');
assert(rev(result.afterLink.revenues, 'rev_c')?.linkedDocumentId === '', 'competing rev_c link should be cleared');
assert(doc(result.afterLink.documents, 'doc_c')?.linkedRevenueId === '', 'competing doc_c link should be cleared');

const docBItems = result.receivablesAfterLink.items.filter((i) => i.linkedDocumentId === 'doc_b' || i.primaryId === 'doc_b');
assert(docBItems.length === 1, 'linked receivables should not duplicate doc_b');

assert(!rev(result.afterDeleteRevenue.revenues, 'rev_a'), 'rev_a should be deleted');
assert(doc(result.afterDeleteRevenue.documents, 'doc_b')?.linkedRevenueId === '', 'doc_b link should be cleared after revenue delete');
assert(!doc(result.afterDeleteDocument.documents, 'doc_d'), 'doc_d should be deleted');
assert(rev(result.afterDeleteDocument.revenues, 'rev_d')?.linkedDocumentId === '', 'rev_d link should be cleared after document delete');

assert(result.exported.appVersion === 'v4.8.6', 'backup appVersion should be v4.8.6');
assert(result.exported.dataKeys.includes('budil_revenue_records'), 'backup should include revenues');
assert(result.exported.dataKeys.includes('budil_documents'), 'backup should include documents');

console.log('OK: linked one-to-one, deletion cleanup, receivable dedupe, backup metadata');

/**
 * Budil v4.10.38 - invoice/estimate print layout verification.
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

for (const file of ['js/app.js', 'js/documents-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.38 invoice-print-layout ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsJs = load('js/documents-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

console.log('== version check ==');
assert(indexHtml.includes('v4.12.9'), 'index.html should show v4.12.9');
assert(indexHtml.includes('js/app.js?v=4.12.9'), 'app.js cache buster should be v4.12.9');
assert(indexHtml.includes('css/style.css?v=4.12.9'), 'style.css cache buster should be v4.10.41');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.9'"), 'storage.js version should be v4.12.9');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.9'"), 'data-backup version should be v4.12.9');

console.log('== print CSS ==');
assert(css.includes('@media print'), 'print media query should exist');
assert(css.includes('body.doc-printing'), 'doc-printing print scope should exist');
assert(css.includes('@page'), 'print page rule should exist');
assert(css.includes('size: A4 portrait'), 'A4 portrait should be specified');
assert(css.includes('body.doc-printing .sidebar'), 'sidebar should be hidden when printing');
assert(css.includes('body.doc-printing .doc-preview-heading'), 'preview heading should be hidden when printing');
assert(css.includes('body.doc-printing .documents-purpose-note'), 'purpose note should be hidden when printing');
assert(css.includes('body.doc-printing .doc-preview-toolbar'), 'preview toolbar should be hidden when printing');
assert(css.includes('body.doc-printing .documents-preview-body'), 'preview frame padding/border reset for print');
assert(css.includes('body.doc-printing .doc-sheet'), 'doc-sheet print compaction should exist');
assert(css.includes('body.doc-printing .doc-bank'), 'bank block print rule should exist');
assert(css.includes('page-break-before: avoid'), 'bank should avoid page break before');
assert(css.includes('v4.10.37'), 'v4.10.38 print layout marker should exist in css');

console.log('== screen UI preserved ==');
assert(indexHtml.includes('doc-print-browser-hint'), 'browser print hint should exist on screen');
assert(indexHtml.includes('no-print'), 'no-print class should be used for non-print UI');
assert(css.includes('--doc-preview-frame'), 'v4.10.25 screen preview frame vars should remain');
assert(css.includes('#view-documents .documents-preview-body'), 'v4.10.25 screen preview body styles should remain');
assert(appJs.includes('doc-printing'), 'app.js should toggle doc-printing for print');

console.log('== v4.10.38 tax consistency maintained ==');
assert(documentsJs.includes('calcFromFormItems'), 'calcFromFormItems must remain');
assert(documentsJs.includes('getFormItemsFromDocument'), 'getFormItemsFromDocument must remain');
assert(appJs.includes('calcFromFormItems'), 'app.js must still use calcFromFormItems');

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    RevenueBrain: { normalizeRevenueRecord: r => ({ ...(r || {}) }) },
    PaymentBrain: {
      normalizeRevenuePayment: (r, o) => ({
        paymentMethod: 'bank_transfer', paymentStatus: 'pending',
        expectedPaymentDate: '', paidDate: '', paidAmount: 0,
        unpaidAmount: o?.total || 0, paymentMemo: ''
      }),
      normalizeDocumentPayment: (d, o) => ({
        paymentMethod: d.paymentMethod || 'bank_transfer',
        paymentStatus: d.paymentStatus || 'pending',
        expectedPaymentDate: d.expectedPaymentDate || '',
        paidDate: d.paidDate || '', paidAmount: d.paidAmount || 0,
        unpaidAmount: o?.total || 0, paymentMemo: d.paymentMemo || ''
      })
    }
  });
  runInContext(load('js/documents-brain.js'), ctx, { filename: 'documents-brain.js' });
  return ctx;
}

console.log('== taxIncluded 22,000 yen case ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = { taxDisplayMode: 'taxIncluded', taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' };
    const draft = DocumentsBrain.buildInvoiceFromRevenue({
      id: 'rev-tax', customerName: 'Customer', service: 'AC cleaning', serviceText: 'R1',
      amount: 22000, workDate: '2026-07-03'
    }, []);
    const formItems = DocumentsBrain.getFormItemsFromDocument(draft);
    const formCalc = DocumentsBrain.calcFromFormItems(formItems, draft.taxSettings);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { draft, formCalc, html };
  })()`, ctx);
  assert(result.draft.items[0].unitPrice === 20000, 'unit price should be 20000');
  assert(result.draft.items[0].amount === 20000, 'amount should be 20000');
  assert(result.formCalc.subtotal === 20000, 'subtotal should be 20000');
  assert(result.formCalc.tax === 2000, 'tax should be 2000');
  assert(result.formCalc.total === 22000, 'total should be 22000');
  assert(/20,000/.test(result.html), 'sheet should show 20,000');
  assert(result.html.includes('doc-sheet'), 'rendered output should include doc-sheet');
  assert(result.html.includes('doc-bank'), 'invoice should include bank block');
}

console.log('== v4.10.30 sanitizing maintained ==');
{
  const ctx = createSandbox();
  const revenue = {
    id: 'rev-sanitize', customerName: 'Customer', service: 'AC cleaning', serviceText: 'R1',
    amount: 22000, workDate: '2026-07-03',
    memo: 'phone: 000-0000-0000\nhttps://drive.google.com/file/d/abc/view\nreceipt: https://example.com/receipt.jpg\ninternal-only memo',
    description: 'GPT helper'
  };
  const result = runInContext(`(() => {
    const draft = DocumentsBrain.buildInvoiceFromRevenue(${JSON.stringify(revenue)}, []);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { html };
  })()`, ctx);
  assert(!result.html.includes('000-0000-0000'), 'dummy phone must not appear');
  assert(!result.html.includes('drive.google.com'), 'Drive URL must not appear');
  assert(!result.html.includes('receipt.jpg'), 'receipt image URL must not appear');
  assert(!result.html.includes('internal-only memo'), 'internal memo must not appear');
}

console.log('\nAll v4.10.38 invoice-print-layout checks passed.');

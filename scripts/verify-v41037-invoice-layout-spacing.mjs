/**
 * Budil v4.10.38 - invoice/estimate A4 layout spacing verification.
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

console.log('== v4.10.38 invoice-layout-spacing ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsJs = load('js/documents-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

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
assert(indexHtml.includes('v4.12.15'), 'index.html should show v4.12.15');
assert(indexHtml.includes('js/app.js?v=4.12.15'), 'app.js cache buster should be v4.12.15');
assert(indexHtml.includes('css/style.css?v=4.12.15'), 'style.css cache buster should be v4.10.41');
assert(indexHtml.includes('js/documents-brain.js?v=4.12.15'), 'documents-brain cache buster should be v4.12.15');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.15'"), 'storage.js version should be v4.12.15');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.15'"), 'data-backup version should be v4.12.15');

console.log('== spacing adjustments ==');
assert(css.includes('v4.10.37'), 'v4.10.38 layout marker should exist in css');
assert(css.includes('margin-bottom: 1.35rem'), 'header bottom spacing should be increased');
assert(css.includes('margin-bottom: 1rem'), 'meta bottom spacing should be increased');
assert(css.includes('margin: 0.9rem 0 1.05rem'), 'total banner spacing should be increased');
assert(css.includes('margin-top: 0.25rem'), 'table/totals top spacing should exist');
assert(css.includes('margin-top: 0.85rem'), 'bank/note top spacing should be increased');
assert(css.includes('width: 210mm'), 'A4 width must remain fixed');
assert(css.includes('padding: 16mm 18mm'), 'A4 horizontal padding must remain');
assert(!css.includes('font-size: 9.5pt !important'), 'print must not reintroduce sheet shrink');

console.log('== layout structure ==');
assert(documentsJs.includes('doc-issuer-block'), 'issuer block should exist');
assert(documentsJs.includes('doc-seal'), 'seal image should exist');
assert(documentsJs.includes('doc-framed-block'), 'framed blocks should exist');
assert(!documentsJs.includes('税率別内訳'), 'tax breakdown table must not be rendered');

console.log('== CSS layout ==');
assert(css.includes('body.doc-printing .doc-seal'), 'print seal CSS should exist');
assert(css.includes('width: 72px !important'), 'print seal should stay 72px');
assert(css.includes('.doc-col-price { width: 5.75rem; }'), 'column widths should remain');

for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    RevenueBrain: {
      normalizeRevenueRecord: r => ({ ...(r || {}) }),
      formatYen: n => Number(n || 0).toLocaleString('ja-JP') + '円'
    },
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

console.log('== rendered layout ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const draft = DocumentsBrain.buildInvoiceFromRevenue({
      id: 'rev-layout',
      customerName: 'テスト商事',
      service: 'エアコン通常',
      serviceText: 'R1',
      amount: 22000,
      workDate: '2026-07-03'
    }, []);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { html };
  })()`, ctx);
  assert(result.html.includes('doc-sheet-right'), 'company block should remain top-right');
  assert(result.html.includes('doc-seal'), 'seal should remain in sheet');
  assert(result.html.includes('doc-framed-block'), 'framed blocks should remain');
  assert(!result.html.includes('税率別'), 'tax breakdown must not appear');
}

console.log('== taxIncluded 22,000 yen case ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const draft = DocumentsBrain.buildInvoiceFromRevenue({
      id: 'rev-tax',
      customerName: 'Customer',
      service: 'AC cleaning',
      serviceText: 'R1',
      amount: 22000,
      workDate: '2026-07-03'
    }, []);
    const formItems = DocumentsBrain.getFormItemsFromDocument(draft);
    const formCalc = DocumentsBrain.calcFromFormItems(formItems, draft.taxSettings);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { draft, formCalc, html };
  })()`, ctx);
  assert(result.draft.items[0].unitPrice === 20000, 'unit price should be 20000');
  assert(result.formCalc.total === 22000, 'total should be 22000');
  assert(result.html.includes('20,000円'), 'sheet should show 20,000 yen');
  assert(result.html.includes('22,000円'), 'sheet should show 22,000 yen total');
}

console.log('== v4.10.30 sanitizing maintained ==');
{
  const ctx = createSandbox();
  const revenue = {
    id: 'rev-sanitize',
    customerName: 'Customer',
    service: 'AC cleaning',
    serviceText: 'R1',
    amount: 22000,
    workDate: '2026-07-03',
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

console.log('\nAll v4.10.38 invoice-layout-spacing checks passed.');

/**
 * Budil v4.10.33 - invoice/estimate tax display mode verification.
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

console.log('== v4.10.33 invoice-tax-display-mode ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsJs = load('js/documents-brain.js');
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
assert(indexHtml.includes('v4.10.33'), 'index.html should show v4.10.33');
assert(indexHtml.includes('js/app.js?v=4.10.33'), 'app.js cache buster should be v4.10.33');
assert(indexHtml.includes('css/style.css?v=4.10.33'), 'style.css cache buster should be v4.10.33');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.33'"), 'storage.js version should be v4.10.33');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.33'"), 'data-backup version should be v4.10.33');

console.log('== tax display mode UI ==');
assert(indexHtml.includes('id="doc-tax-display-mode"'), 'tax display mode select should exist');
assert(indexHtml.includes('value="taxIncluded">内税'), '内税 option should exist');
assert(indexHtml.includes('value="taxExcluded">外税'), '外税 option should exist');
assert(indexHtml.includes('value="nonTaxable">非課税'), '非課税 option should exist');
assert(!indexHtml.includes('doc-show-tax-breakdown'), 'tax breakdown checkbox should be removed');
assert(documentsJs.includes('formTaxDisplayModeValue'), 'documents brain should expose formTaxDisplayModeValue');
assert(documentsJs.includes('taxSettingsFromFormDisplayMode'), 'documents brain should expose taxSettingsFromFormDisplayMode');
assert(appJs.includes('syncDocTaxCategoryFieldVisibility'), 'app.js should sync tax category visibility');

console.log('== tax breakdown table hidden on customer sheet ==');
assert(!documentsJs.includes('税率別内訳'), 'customer sheet must not render tax breakdown table title');
assert(documentsJs.includes('うち消費税額'), 'included tax label should be うち消費税額');
assert(!documentsJs.includes('うち消費税額合計'), 'old included tax label must be removed');
assert(documentsJs.includes('showTaxBreakdown: false'), 'showTaxBreakdown default should be false');

for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Set, Map, Error,
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

console.log('== taxIncluded 22,000 yen case ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = { taxDisplayMode: 'taxIncluded', taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' };
    const calc = DocumentsBrain.calcFromItems([{
      name: 'エアコンクリーニング R1',
      unitPrice: 22000,
      quantity: 1,
      amount: 22000
    }], taxSettings);
    const draft = DocumentsBrain.buildInvoiceFromRevenue({
      id: 'rev-tax',
      customerName: '海老澤智貴',
      service: 'エアコン通常',
      serviceText: 'R1',
      amount: 22000,
      workDate: '2026-07-03'
    }, []);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { calc, draft, html };
  })()`, ctx);
  assert(result.calc.displayItems[0].unitPrice === 20000, 'display unit price should be 20000');
  assert(result.calc.subtotal === 20000, 'subtotal should be 20000');
  assert(result.calc.tax === 2000, 'tax should be 2000');
  assert(result.calc.total === 22000, 'total should be 22000');
  assert(result.html.includes('20,000円'), 'sheet should show 20,000 yen');
  assert(result.html.includes('うち消費税額'), 'sheet should show うち消費税額');
  assert(result.html.includes('2,000円'), 'sheet should show 2,000 yen tax');
  assert(result.html.includes('22,000円'), 'sheet should show 22,000 yen total');
  assert(!result.html.includes('税率別'), 'tax breakdown table must not appear');
}

console.log('== taxExcluded 20,000 yen case ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = { taxDisplayMode: 'taxExcluded', taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' };
    const calc = DocumentsBrain.calcFromItems([{
      name: 'テスト',
      unitPrice: 10000,
      quantity: 2,
      amount: 20000
    }], taxSettings);
    const doc = {
      type: 'invoice',
      taxSettings,
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total
    };
    const html = DocumentsBrain.renderDocumentSheet(doc, s => String(s || ''));
    return { calc, html };
  })()`, ctx);
  assert(result.calc.subtotal === 20000, 'taxExcluded subtotal should be 20000');
  assert(result.calc.tax === 2000, 'taxExcluded tax should be 2000');
  assert(result.calc.total === 22000, 'taxExcluded total should be 22000');
  assert(result.html.includes('消費税'), 'sheet should show 消費税 row');
  assert(!result.html.includes('うち消費税額'), 'taxExcluded sheet must not use うち消費税額');
  assert(!result.html.includes('税率別'), 'tax breakdown table must not appear');
}

console.log('== nonTaxable 22,000 yen case ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = DocumentsBrain.taxSettingsFromFormDisplayMode('nonTaxable', {});
    const calc = DocumentsBrain.calcFromFormItems([{
      name: '非課税作業',
      unitPrice: 22000,
      quantity: 1,
      amount: 22000
    }], taxSettings);
    const doc = {
      type: 'invoice',
      taxSettings,
      items: [{ name: '非課税作業', unitPrice: 22000, quantity: 1, amount: 22000 }],
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total
    };
    const html = DocumentsBrain.renderDocumentSheet(doc, s => String(s || ''));
    return { taxSettings, calc, html };
  })()`, ctx);
  assert(result.taxSettings.taxCategory === 'nonTaxable', 'nonTaxable mode should set taxCategory');
  assert(result.calc.subtotal === 22000, 'nonTaxable subtotal should be 22000');
  assert(result.calc.tax === 0, 'nonTaxable tax should be 0');
  assert(result.calc.total === 22000, 'nonTaxable total should be 22000');
  assert(result.html.includes('22,000円'), 'sheet should show 22,000 yen');
  assert(result.html.includes('消費税'), 'nonTaxable sheet should show 消費税 row');
  assert(result.html.includes('0円'), 'nonTaxable sheet should show 0 yen tax');
  assert(result.html.includes('非課税'), 'sheet should show 非課税 note');
}

console.log('== form tax mode helpers ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const included = DocumentsBrain.formTaxDisplayModeValue({ taxDisplayMode: 'taxIncluded', taxCategory: 'taxable10' });
    const excluded = DocumentsBrain.formTaxDisplayModeValue({ taxDisplayMode: 'taxExcluded', taxCategory: 'taxable10' });
    const nonTaxable = DocumentsBrain.formTaxDisplayModeValue({ taxDisplayMode: 'taxExcluded', taxCategory: 'nonTaxable' });
    const fromNonTaxable = DocumentsBrain.taxSettingsFromFormDisplayMode('nonTaxable', { taxDisplayMode: 'taxIncluded', taxCategory: 'taxable10' });
    const fromIncluded = DocumentsBrain.taxSettingsFromFormDisplayMode('taxIncluded', { taxCategory: 'nonTaxable' });
    return { included, excluded, nonTaxable, fromNonTaxable, fromIncluded };
  })()`, ctx);
  assert(result.included === 'taxIncluded', 'included mode value should map to taxIncluded');
  assert(result.excluded === 'taxExcluded', 'excluded mode value should map to taxExcluded');
  assert(result.nonTaxable === 'nonTaxable', 'nonTaxable category should map to nonTaxable form value');
  assert(result.fromNonTaxable.taxCategory === 'nonTaxable', 'nonTaxable form value should set category');
  assert(result.fromIncluded.taxCategory === 'taxable10', 'switching from nonTaxable to included should reset category');
}

console.log('== v4.10.30 sanitizing maintained ==');
assert(documentsJs.includes('sanitizeDocumentForCustomerDisplay'), 'sanitizing helper must remain');
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

console.log('== v4.10.31 form consistency maintained ==');
assert(documentsJs.includes('getFormItemsFromDocument'), 'getFormItemsFromDocument must remain');
assert(documentsJs.includes('calcFromFormItems'), 'calcFromFormItems must remain');
assert(appJs.includes('calcFromFormItems'), 'app.js must use calcFromFormItems');

console.log('== v4.10.32 print layout maintained ==');
assert(css.includes('@media print'), 'print media query should exist');
assert(css.includes('body.doc-printing'), 'doc-printing print scope should exist');
assert(css.includes('size: A4 portrait'), 'A4 portrait should be specified');
assert(css.includes('v4.10.33'), 'v4.10.33 print layout marker should exist in css');
assert(appJs.includes('doc-printing'), 'app.js should toggle doc-printing for print');

console.log('\nAll v4.10.33 invoice-tax-display-mode checks passed.');

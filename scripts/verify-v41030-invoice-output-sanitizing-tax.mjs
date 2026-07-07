/**
 * Budil v4.10.38 緊急修正 — 請求書出力サニタイズ・内税明細 verification.
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

for (const file of ['js/app.js', 'js/documents-brain.js', 'js/revenue-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.38 invoice-output-sanitizing-tax ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsJs = load('js/documents-brain.js');
const revenueJs = load('js/revenue-brain.js');
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
assert(indexHtml.includes('v4.11.15'), 'index.html should show v4.11.15');
assert(indexHtml.includes('js/app.js?v=4.11.15'), 'app.js cache buster should be v4.11.15');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.15'"), 'storage.js version should be v4.11.15');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.15'"), 'data-backup version should be v4.11.15');

console.log('== sanitizing helpers ==');
assert(documentsJs.includes('sanitizeDocumentForCustomerDisplay'), 'documents brain should sanitize customer display');
assert(documentsJs.includes('buildInvoiceTitleFromRevenue'), 'documents brain should build short invoice title');
assert(documentsJs.includes('buildInvoiceItemNameFromRevenue'), 'documents brain should build short item name');
assert(!documentsJs.includes('rev.memo,\n      rev.description'), 'buildInvoiceFromRevenue must not prioritize memo/description');
assert(documentsJs.includes('displayItems'), 'calcFromItems should expose displayItems for taxIncluded');
assert(revenueJs.includes('getCustomerFacingServiceLabel'), 'revenue brain should expose service label helper');
assert(appJs.includes('この受付から売上確定する'), 'v4.10.29 reception revenue action must remain');
assert(indexHtml.includes('css/style.css?v=4.11.15'), 'v4.10.25 documents CSS cache buster must remain');
assert(!css.includes('v4.10.30'), 'css must not be changed for v4.10.30');

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
    RevenueBrain: {
      normalizeRevenueRecord: r => ({ ...(r || {}) }),
      formatYen: n => Number(n || 0).toLocaleString('ja-JP') + '円'
    },
    PaymentBrain: {
      normalizeRevenuePayment: (r, o) => ({
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        expectedPaymentDate: '',
        paidDate: '',
        paidAmount: 0,
        unpaidAmount: o?.total || 0,
        paymentMemo: ''
      }),
      normalizeDocumentPayment: (d, o) => ({
        paymentMethod: d.paymentMethod || 'bank_transfer',
        paymentStatus: d.paymentStatus || 'pending',
        expectedPaymentDate: d.expectedPaymentDate || '',
        paidDate: d.paidDate || '',
        paidAmount: d.paidAmount || 0,
        unpaidAmount: o?.total || 0,
        paymentMemo: d.paymentMemo || ''
      })
    }
  });
  runInContext(load('js/documents-brain.js'), ctx, { filename: 'documents-brain.js' });
  return ctx;
}

console.log('== reception raw text must not leak to invoice ==');
{
  const ctx = createSandbox();
  const rawMemo = [
    '依頼元：直受',
    'お客様名：海老澤智貴',
    '電話番号：000-0000-0000',
    '住所：沖縄県南城市大里123',
    '作業内容：エアコンクリーニング R1',
    'GPT補助あり',
    'https://drive.google.com/file/d/abc/view',
    'https://docs.google.com/spreadsheets/d/xyz',
    '受付画像URL: https://example.com/receipt.jpg',
    '備考全文：内部確認メモ'
  ].join('\n');
  const revenue = {
    id: 'rev-ebisawa',
    customerName: '海老澤智貴',
    service: 'エアコン通常',
    serviceText: 'R1',
    amount: 22000,
    workDate: '2026-07-03',
    memo: rawMemo,
    description: rawMemo
  };
  const result = runInContext(`(() => {
    const draft = DocumentsBrain.buildInvoiceFromRevenue(${JSON.stringify(revenue)}, []);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { draft, html };
  })()`, ctx);
  assert(!result.html.includes('000-0000-0000'), 'dummy phone must not appear on invoice');
  assert(!result.html.includes('drive.google.com'), 'Drive URL must not appear on invoice');
  assert(!result.html.includes('docs.google.com'), 'docs URL must not appear on invoice');
  assert(!result.html.includes('receipt.jpg'), 'receipt image URL must not appear on invoice');
  assert(!result.html.includes('GPT補助'), 'GPT memo must not appear on invoice');
  assert(!result.html.includes('備考全文'), 'internal note label must not appear on invoice');
  assert(!result.html.includes('内部確認メモ'), 'internal memo must not appear on invoice');
  assert(!result.draft.title.includes('依頼元'), 'title must not contain reception raw text');
  assert(result.draft.items[0].name.includes('エアコン'), 'item name should use service label');
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
  assert(result.calc.displayItems[0].amount === 20000, 'display line amount should be 20000');
  assert(result.calc.subtotal === 20000, 'subtotal should be 20000');
  assert(result.calc.tax === 2000, 'tax should be 2000');
  assert(result.calc.total === 22000, 'total should remain 22000');
  assert(result.html.includes('20,000円'), 'rendered sheet should show 20,000 yen line values');
  assert(result.html.includes('2,000円'), 'rendered sheet should show 2,000 yen tax');
  assert(result.html.includes('22,000円'), 'rendered sheet should show 22,000 yen total');
}

console.log('== taxExcluded regression ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const calc = DocumentsBrain.calcFromItems([{
      name: 'テスト',
      unitPrice: 10000,
      quantity: 2,
      amount: 20000
    }], { taxDisplayMode: 'taxExcluded', taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' });
    return calc;
  })()`, ctx);
  assert(result.subtotal === 20000, 'taxExcluded subtotal should remain 20000');
  assert(result.tax === 2000, 'taxExcluded tax should be 2000');
  assert(result.total === 22000, 'taxExcluded total should be 22000');
  assert(result.items[0].unitPrice === 10000, 'taxExcluded unit price should stay taxExcluded');
}

console.log('== non-taxable regression ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    return DocumentsBrain.calcFromItems([{
      name: '非課税',
      unitPrice: 5000,
      quantity: 1,
      amount: 5000
    }], { taxDisplayMode: 'taxIncluded', taxCategory: 'nonTaxable', taxRounding: 'floor', lineRounding: 'floor' });
  })()`, ctx);
  assert(result.tax === 0, 'non-taxable tax should be 0');
  assert(result.total === 5000, 'non-taxable total should remain 5000');
  assert(result.displayItems[0].amount === 5000, 'non-taxable display amount should remain 5000');
}

console.log('\nAll v4.10.38 invoice-output-sanitizing-tax checks passed.');

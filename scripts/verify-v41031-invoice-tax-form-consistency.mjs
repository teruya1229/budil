/**
 * Budil v4.10.31 - invoice form tax consistency verification.
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

console.log('== v4.10.31 invoice-tax-form-consistency ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsJs = load('js/documents-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

console.log('== version check ==');
assert(indexHtml.includes('v4.10.31'), 'index.html should show v4.10.31');
assert(indexHtml.includes('js/app.js?v=4.10.31'), 'app.js cache buster should be v4.10.31');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.31'"), 'storage.js version should be v4.10.31');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.31'"), 'data-backup version should be v4.10.31');

console.log('== form consistency helpers ==');
assert(documentsJs.includes('getFormItemsFromDocument'), 'documents brain should expose getFormItemsFromDocument');
assert(documentsJs.includes('calcFromFormItems'), 'documents brain should expose calcFromFormItems');
assert(documentsJs.includes('detectItemsTaxBasis'), 'documents brain should detect items tax basis');
assert(appJs.includes('calcFromFormItems'), 'app.js should use calcFromFormItems for form tax preview');
assert(appJs.includes('getFormItemsFromDocument'), 'app.js should use getFormItemsFromDocument when opening form');
assert(documentsJs.includes('sanitizeDocumentForCustomerDisplay'), 'v4.10.31 sanitizing must remain');
assert(indexHtml.includes('css/style.css?v=4.10.25.1'), 'v4.10.25 documents CSS cache buster must remain');
assert(!css.includes('v4.10.31'), 'css must not be changed for v4.10.31');

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
      formatYen: n => Number(n || 0).toLocaleString('ja-JP') + '\u5186'
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

const taxIncluded10 = {
  taxDisplayMode: 'taxIncluded',
  taxCategory: 'taxable10',
  taxRounding: 'floor',
  lineRounding: 'floor'
};

console.log('== taxIncluded 22,000 yen form display ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const legacyDoc = {
      type: 'invoice',
      taxSettings: ${JSON.stringify(taxIncluded10)},
      subtotal: 20000,
      tax: 2000,
      total: 22000,
      items: [{ name: 'Service R1', unitPrice: 22000, quantity: 1, amount: 22000 }]
    };
    const formItems = DocumentsBrain.getFormItemsFromDocument(legacyDoc);
    const formCalc = DocumentsBrain.calcFromFormItems(formItems, legacyDoc.taxSettings);
    const html = DocumentsBrain.renderDocumentSheet(legacyDoc, s => String(s || ''));
    return { formItems, formCalc, html };
  })()`, ctx);
  assert(result.formItems[0].unitPrice === 20000, 'legacy form unit price should be 20000');
  assert(result.formItems[0].amount === 20000, 'legacy form amount should be 20000');
  assert(result.formCalc.subtotal === 20000, 'form calc subtotal should be 20000');
  assert(result.formCalc.tax === 2000, 'form calc tax should be 2000');
  assert(result.formCalc.total === 22000, 'form calc total should be 22000');
  assert(/20,000/.test(result.html), 'rendered sheet should show 20,000 yen line values');
  assert(/2,000/.test(result.html), 'rendered sheet should show 2,000 yen tax');
  assert(/22,000/.test(result.html), 'rendered sheet should show 22,000 yen total');
}

console.log('== no double conversion after save/re-edit ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const savedDoc = {
      type: 'invoice',
      taxSettings: ${JSON.stringify(taxIncluded10)},
      subtotal: 20000,
      tax: 2000,
      total: 22000,
      items: [{ name: 'Service R1', unitPrice: 20000, quantity: 1, amount: 20000 }]
    };
    const formItems = DocumentsBrain.getFormItemsFromDocument(savedDoc);
    const formCalc = DocumentsBrain.calcFromFormItems(formItems, savedDoc.taxSettings);
    const normalized = DocumentsBrain.normalizeDocument(savedDoc);
    return { formItems, formCalc, normalized };
  })()`, ctx);
  assert(result.formItems[0].unitPrice === 20000, 're-edit form unit price should stay 20000');
  assert(result.formCalc.subtotal === 20000, 're-edit subtotal should stay 20000');
  assert(result.formCalc.subtotal !== 18182, 'must not double-convert to 18182 subtotal');
  assert(result.normalized.total === 22000, 'normalized total should stay 22000');
}

console.log('== buildInvoiceFromRevenue uses tax-exclusive form items ==');
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
    return { draft, formItems, formCalc };
  })()`, ctx);
  assert(result.draft.items[0].unitPrice === 20000, 'draft items unit price should be 20000');
  assert(result.draft.items[0].amount === 20000, 'draft items amount should be 20000');
  assert(result.draft.total === 22000, 'draft total should remain 22000');
  assert(result.formCalc.subtotal === 20000, 'form calc from draft should have subtotal 20000');
}

console.log('== v4.10.31 sanitizing maintained ==');
{
  const ctx = createSandbox();
  const revenue = {
    id: 'rev-sanitize',
    customerName: 'Customer',
    service: 'AC cleaning',
    serviceText: 'R1',
    amount: 22000,
    workDate: '2026-07-03',
    memo: [
      'source: direct',
      'phone: 000-0000-0000',
      'https://drive.google.com/file/d/abc/view',
      'receipt-image: https://example.com/receipt.jpg',
      'internal-only memo text'
    ].join('\n'),
    description: 'GPT helper note'
  };
  const result = runInContext(`(() => {
    const draft = DocumentsBrain.buildInvoiceFromRevenue(${JSON.stringify(revenue)}, []);
    const html = DocumentsBrain.renderDocumentSheet(draft, s => String(s || ''));
    return { draft, html };
  })()`, ctx);
  assert(!result.html.includes('000-0000-0000'), 'dummy phone must not appear on invoice');
  assert(!result.html.includes('drive.google.com'), 'Drive URL must not appear on invoice');
  assert(!result.html.includes('receipt.jpg'), 'receipt image URL must not appear on invoice');
  assert(!result.html.includes('internal-only memo text'), 'internal memo must not appear on invoice');
  assert(!result.html.includes('GPT helper note'), 'GPT memo must not appear on invoice');
}

console.log('== taxExcluded regression ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = { taxDisplayMode: 'taxExcluded', taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' };
    const items = [{ name: 'Test', unitPrice: 10000, quantity: 2, amount: 20000 }];
    const formCalc = DocumentsBrain.calcFromFormItems(items, taxSettings);
    const formItems = DocumentsBrain.getFormItemsFromDocument({ type: 'invoice', taxSettings, items, subtotal: 20000, tax: 2000, total: 22000 });
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    return { formCalc, formItems, calc };
  })()`, ctx);
  assert(result.formCalc.subtotal === 20000, 'taxExcluded form subtotal should remain 20000');
  assert(result.formCalc.total === 22000, 'taxExcluded form total should remain 22000');
  assert(result.formItems[0].unitPrice === 10000, 'taxExcluded form unit price should stay 10000');
  assert(result.calc.items[0].unitPrice === 10000, 'taxExcluded unit price should stay taxExcluded');
}

console.log('== non-taxable regression ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const taxSettings = { taxDisplayMode: 'taxIncluded', taxCategory: 'nonTaxable', taxRounding: 'floor', lineRounding: 'floor' };
    const items = [{ name: 'Non-taxable', unitPrice: 5000, quantity: 1, amount: 5000 }];
    return DocumentsBrain.calcFromFormItems(items, taxSettings);
  })()`, ctx);
  assert(result.tax === 0, 'non-taxable tax should be 0');
  assert(result.total === 5000, 'non-taxable total should remain 5000');
  assert(result.subtotal === 5000, 'non-taxable subtotal should remain 5000');
}

console.log('\nAll v4.10.31 invoice-tax-form-consistency checks passed.');

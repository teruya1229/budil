/**
 * Budil v4.13.18 - 請求書・見積書の独立印刷とPDFダウンロード
 * Isolated fixtures only. No production localStorage.
 */
import { readFileSync, existsSync } from 'node:fs';
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

for (const file of [
  'js/app.js',
  'js/documents-brain.js',
  'js/doc-export.js',
  'js/storage.js'
]) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const index = load('index.html');
const app = load('js/app.js');
const css = load('css/style.css');
const documentsJs = load('js/documents-brain.js');
const exportJs = load('js/doc-export.js');
const storageJs = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version ==');
assert(index.includes('Budil v4.13.18'), 'index shows Budil v4.13.18');
assert(index.includes('js/app.js?v=4.13.18'), 'app.js cache buster is 4.13.18');
assert(index.includes('js/documents-brain.js?v=4.13.18'), 'documents-brain cache buster is 4.13.18');
assert(index.includes('js/doc-export.js?v=4.13.18'), 'doc-export cache buster is 4.13.18');
assert(index.includes('css/style.css?v=4.13.18'), 'style.css cache buster is 4.13.18');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.18'"), 'storage version is v4.13.18');
assert(dataBackup.includes("APP_VERSION: 'v4.13.18'"), 'data-backup version is v4.13.18');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.18'"), 'verify-current pins v4.13.18');
assert(statusMd.includes('v4.13.18'), 'status.md documents v4.13.18');
assert(handoffMd.includes('v4.13.18'), 'handoff.md documents v4.13.18');
assert(decisionLog.includes('v4.13.18'), 'decision-log.md records v4.13.18');

console.log('== UI / wiring ==');
assert(index.includes('id="btn-doc-print"'), 'print button exists');
assert(index.includes('id="btn-doc-pdf-download"'), 'PDF download button exists');
assert(index.includes('>印刷<') || index.includes('>印刷</button>'), 'print button label is 印刷');
assert(index.includes('PDFダウンロード'), 'PDF download label present');
assert(!index.includes('ヘッダーとフッター'), 'old header/footer OFF guidance is removed');
assert(!index.includes('印刷 / PDF'), 'combined print/PDF label is removed');
assert(!app.includes('>印刷/PDF<'), 'list action no longer says 印刷/PDF');
assert(index.includes('js/doc-export.js?v=4.13.18'), 'doc-export script is loaded');
assert(existsSync(join(root, 'js/vendor/html2pdf.bundle.min.js')), 'html2pdf vendor bundle exists');
assert(app.includes('BudilDocExport.printDocumentStandalone'), 'print uses standalone exporter');
assert(app.includes('BudilDocExport.downloadDocumentPdf'), 'PDF uses download exporter');
assert(!/function printDocument\(\) \{\s*document\.body\.classList\.add\('doc-printing'\)/.test(app),
  'print no longer depends on in-app body.doc-printing window.print');
assert(exportJs.includes('printDocumentStandalone'), 'export module has printDocumentStandalone');
assert(exportJs.includes('downloadDocumentPdf'), 'export module has downloadDocumentPdf');
assert(exportJs.includes('html2pdf'), 'PDF path uses html2pdf');
assert(documentsJs.includes('buildStandaloneDocumentHtml'), 'DocumentsBrain builds standalone HTML');
assert(documentsJs.includes('buildDocumentExportFilename'), 'DocumentsBrain builds export filename');
assert(documentsJs.includes('extractDocumentCss'), 'DocumentsBrain extracts document CSS');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');

console.log('== print CSS defense ==');
assert(css.includes('body.doc-printing .mobile-topbar'), 'print CSS hides mobile-topbar');
assert(css.includes('body.doc-printing .sidebar'), 'print CSS still hides sidebar');
assert(css.includes('body.doc-printing .doc-sheet'), 'print CSS keeps doc-sheet rules');
assert(css.includes('@page'), 'A4 page rule remains');

console.log('== brain fixtures ==');
const ctx = createContext({
  console,
  Date,
  Number,
  String,
  Array,
  Object,
  JSON,
  Math,
  parseInt,
  parseFloat,
  isNaN,
  undefined,
  RegExp,
  location: { href: 'https://example.test/budil/' },
  RevenueBrain: { normalizeRevenueRecord: r => ({ ...(r || {}) }) },
  PaymentBrain: {
    normalizeDocumentPayment: () => ({}),
    normalizeRevenuePayment: () => ({})
  }
});
runInContext(documentsJs + '\nthis.DocumentsBrain = DocumentsBrain;', ctx);
const Brain = ctx.DocumentsBrain;

const invoice = Brain.normalizeDocument({
  id: 'doc-inv-1',
  type: 'invoice',
  number: '493',
  issueDate: '2026-07-05',
  dueDate: '2026-07-31',
  customerName: '儀間祐太朗',
  customerHonorific: '様',
  title: 'エアコンクリーニング',
  status: 'issued',
  items: [{ date: '2026-07-05', name: 'エアコンクリーニング一式', unitPrice: 13000, quantity: 1, amount: 13000 }],
  subtotal: 13000,
  tax: 1300,
  total: 14300,
  taxSettings: { taxDisplayMode: 'taxExcluded', taxRate: 10, taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' },
  bankInfo: Brain.DEFAULT_BANK_INFO,
  note: '振込手数料はご負担ください',
  issuer: Brain.defaultIssuer()
});

const estimate = Brain.normalizeDocument({
  id: 'doc-est-1',
  type: 'estimate',
  number: '12',
  issueDate: '2026-08-01',
  customerName: 'テスト顧客',
  customerHonorific: '様',
  title: '見積件名',
  status: 'submitted',
  items: [{ name: '工事一式', unitPrice: 27000, quantity: 1, amount: 27000 }],
  subtotal: 27000,
  tax: 2700,
  total: 29700,
  taxSettings: { taxDisplayMode: 'taxExcluded', taxRate: 10, taxCategory: 'taxable10', taxRounding: 'floor', lineRounding: 'floor' },
  note: '備考',
  issuer: Brain.defaultIssuer()
});

assert(
  Brain.buildDocumentExportFilename(invoice, 'pdf') === '請求書_儀間祐太朗_493_2026-07-05.pdf',
  'invoice PDF filename matches expected pattern'
);
assert(
  Brain.buildDocumentExportFilename(estimate, 'pdf') === '見積書_テスト顧客_12_2026-08-01.pdf',
  'estimate PDF filename matches expected pattern'
);
assert(
  Brain.sanitizeExportFilenamePart('a/b:c*d?.pdf', 'x') === 'a_b_c_d_.pdf' ||
    Brain.sanitizeExportFilenamePart('a/b:c*d', 'x') === 'a_b_c_d',
  'filename sanitizes forbidden characters'
);

const sampleCss = `
.doc-sheet { width: 210mm; }
.sidebar { display: block; }
@media print {
  body.doc-printing .sidebar { display: none; }
}
@page { size: A4 portrait; margin: 0; }
.button { color: red; }
`;
const extracted = Brain.extractDocumentCss(sampleCss);
assert(extracted.includes('.doc-sheet'), 'extract keeps .doc-sheet');
assert(extracted.includes('@media print'), 'extract keeps @media print');
assert(extracted.includes('@page'), 'extract keeps @page');
assert(!extracted.includes('.sidebar { display: block; }'), 'extract skips unrelated screen sidebar rule');
assert(!extracted.includes('.button'), 'extract skips unrelated button rule');

const standalone = Brain.buildStandaloneDocumentHtml(invoice, {
  cssText: extracted,
  baseHref: 'https://example.test/budil/',
  autoPrint: true
});
assert(standalone.includes('class="doc-sheet"'), 'standalone HTML contains doc-sheet');
assert(standalone.includes('請求書'), 'standalone HTML contains invoice title');
assert(standalone.includes('儀間祐太朗'), 'standalone HTML contains customer');
assert(standalone.includes('14,300') || standalone.includes('14300') || standalone.includes('ご請求金額'),
  'standalone HTML contains amount area');
assert(standalone.includes('window.print()'), 'standalone autoPrint includes window.print');
assert(!standalone.includes('mobile-topbar'), 'standalone HTML has no mobile-topbar');
assert(!standalone.includes('budil-sidebar'), 'standalone HTML has no sidebar');
assert(!standalone.includes('請求書・見積書'), 'standalone HTML has no screen view title chrome');
assert(!standalone.includes('メニュー'), 'standalone HTML has no menu chrome');
assert(standalone.includes('bc-service-seal'), 'standalone HTML keeps seal image');

const estHtml = Brain.buildStandaloneDocumentHtml(estimate, {
  cssText: extracted,
  baseHref: 'https://example.test/budil/',
  autoPrint: false
});
assert(estHtml.includes('見積書'), 'estimate standalone HTML works');
assert(!estHtml.includes('window.print()'), 'estimate without autoPrint has no print script');

const sheet = Brain.renderDocumentSheet(invoice, s => String(s));
assert(sheet.includes('class="doc-sheet"'), 'screen renderDocumentSheet unchanged shape');
assert(sheet.includes('doc-seal'), 'seal markup remains');
assert(sheet.includes('doc-bank') || sheet.includes('振込先'), 'bank block remains for invoice');

console.log('\nAll v4.13.18 document print/PDF export checks passed.');

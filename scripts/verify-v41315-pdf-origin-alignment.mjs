/**
 * Budil v4.13.18 - PDFダウンロード位置ズレ修正
 * Isolated fixtures only. No production localStorage.
 * 印刷経路（printDocumentStandalone）は不変であることを確認する。
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
const documentsJs = load('js/documents-brain.js');
const exportJs = load('js/doc-export.js');
const storageJs = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const printPdfVerify = load('scripts/verify-v41314-document-print-pdf-export.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version ==');
assert(index.includes('Budil v4.13.18'), 'index shows Budil v4.13.18');
assert(index.includes('js/app.js?v=4.13.18'), 'app.js cache buster is 4.13.18');
assert(index.includes('js/doc-export.js?v=4.13.18'), 'doc-export cache buster is 4.13.18');
assert(index.includes('js/documents-brain.js?v=4.13.18'), 'documents-brain cache buster is 4.13.18');
assert(index.includes('css/style.css?v=4.13.18'), 'style.css cache buster is 4.13.18');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.18'"), 'storage version is v4.13.18');
assert(dataBackup.includes("APP_VERSION: 'v4.13.18'"), 'data-backup version is v4.13.18');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.18'"), 'verify-current pins v4.13.18');
assert(statusMd.includes('v4.13.18'), 'status.md documents v4.13.18');
assert(handoffMd.includes('v4.13.18'), 'handoff.md documents v4.13.18');
assert(decisionLog.includes('v4.13.18'), 'decision-log.md records v4.13.18');
assert(printPdfVerify.includes('v4.13.18') || printPdfVerify.includes('4.13.18'),
  'v4.13.14 print/PDF verify kept and version-aligned to 4.13.18');

console.log('== PDF origin alignment (source) ==');
assert(exportJs.includes('createPdfRenderFrame'), 'PDF uses dedicated render iframe');
assert(exportJs.includes('measurePdfSheetGeometry'), 'PDF measures sheet geometry before capture');
assert(exportJs.includes('writeHtmlToFrame'), 'PDF writes standalone HTML into iframe');
assert(exportJs.includes('buildCurrentStandaloneHtml'), 'PDF reuses standalone HTML builder');
assert(exportJs.includes("left: 0"), 'PDF frame uses left: 0');
assert(!/['"]left:\s*-12000px['"]/.test(exportJs), 'PDF path no longer assigns left:-12000px');
assert(!exportJs.includes('data-budil-doc-pdf-host'), 'old offscreen PDF host is removed');
assert(exportJs.includes('pdf_sheet_not_origin_aligned'), 'geometry guard rejects huge negative left');
assert(exportJs.includes('pdf_sheet_width_not_a4'), 'geometry guard rejects non-A4 width');
assert(exportJs.includes('794px'), 'PDF sheet width locked to A4 px');
assert(exportJs.includes('1123px'), 'PDF sheet height locked to A4 px');
assert(exportJs.includes('onclone'), 'html2canvas onclone normalizes position');
assert(exportJs.includes('scrollX: 0'), 'html2canvas scrollX forced to 0');
assert(exportJs.includes('scrollY: 0'), 'html2canvas scrollY forced to 0');

console.log('== print path unchanged ==');
assert(exportJs.includes('async printDocumentStandalone(doc)'), 'printDocumentStandalone remains');
assert(/async printDocumentStandalone\(doc\) \{\s*if \(!doc\) throw new Error\('document_required'\);\s*const html = await this\.buildCurrentStandaloneHtml\(doc, true\);\s*const win = window\.open\('', '_blank'\);/s.test(exportJs),
  'printDocumentStandalone still opens standalone window (not iframe/html2pdf)');
assert(!/printDocumentStandalone[\s\S]{0,400}html2pdf/.test(exportJs),
  'printDocumentStandalone does not call html2pdf');
assert(app.includes('BudilDocExport.printDocumentStandalone'), 'app still wires print to standalone');
assert(app.includes('BudilDocExport.downloadDocumentPdf'), 'app still wires PDF download');
assert(existsSync(join(root, 'js/vendor/html2pdf.bundle.min.js')), 'html2pdf vendor remains');

console.log('== filename + seal fixtures ==');
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
  note: '備考テスト',
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
  'invoice PDF filename unchanged'
);
assert(
  Brain.buildDocumentExportFilename(estimate, 'pdf') === '見積書_テスト顧客_12_2026-08-01.pdf',
  'estimate PDF filename unchanged'
);

const extracted = Brain.extractDocumentCss(`
.doc-sheet { width: 210mm; }
@media print { body.doc-printing .sidebar { display: none; } }
@page { size: A4 portrait; margin: 0; }
`);
const invHtml = Brain.buildStandaloneDocumentHtml(invoice, {
  cssText: extracted,
  baseHref: 'https://example.test/budil/',
  autoPrint: false
});
const estHtml = Brain.buildStandaloneDocumentHtml(estimate, {
  cssText: extracted,
  baseHref: 'https://example.test/budil/',
  autoPrint: true
});
assert(invHtml.includes('class="doc-sheet"'), 'invoice standalone has doc-sheet');
assert(invHtml.includes('bc-service-seal'), 'invoice standalone keeps seal');
assert(invHtml.includes('振込先') || invHtml.includes('doc-bank'), 'invoice keeps bank block');
assert(invHtml.includes('備考テスト'), 'invoice keeps note');
assert(estHtml.includes('見積書'), 'estimate standalone works');
assert(estHtml.includes('window.print()'), 'estimate print path still supports autoPrint');
assert(!invHtml.includes('mobile-topbar'), 'PDF/print HTML has no Budil chrome');

console.log('== geometry helper contract ==');
runInContext(exportJs + '\nthis.BudilDocExport = BudilDocExport;', Object.assign(ctx, {
  document: {
    createElement: () => ({
      setAttribute() {},
      style: { cssText: '' },
      addEventListener() {},
      contentDocument: null,
      contentWindow: null
    }),
    body: { appendChild() {} }
  },
  window: {
    getComputedStyle: () => ({
      width: '794px',
      left: '0px',
      transform: 'none',
      position: 'relative',
      marginLeft: '0px'
    }),
    open: () => null
  },
  DocumentsBrain: Brain,
  location: { href: 'https://example.test/budil/' },
  esc: s => String(s == null ? '' : s)
}));
const Export = ctx.BudilDocExport;
assert(typeof Export.measurePdfSheetGeometry === 'function', 'measurePdfSheetGeometry exported');
assert(typeof Export.createPdfRenderFrame === 'function', 'createPdfRenderFrame exported');
assert(typeof Export.printDocumentStandalone === 'function', 'printDocumentStandalone exported');
assert(typeof Export.downloadDocumentPdf === 'function', 'downloadDocumentPdf exported');

const fakeSheet = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 794, height: 1123 }),
  scrollWidth: 794,
  offsetWidth: 794,
  ownerDocument: {
    defaultView: {
      getComputedStyle: () => ({
        width: '794px',
        left: '0px',
        transform: 'none',
        position: 'relative',
        marginLeft: '0px'
      })
    }
  }
};
const geometry = Export.measurePdfSheetGeometry(fakeSheet);
assert(geometry.ok === true, 'geometry ok for origin-aligned sheet');
assert(geometry.left === 0, 'geometry left is 0');
assert(geometry.width === 794, 'geometry width is A4 px');
assert(!(geometry.left < -1), 'geometry left is not a huge negative');

const badSheet = {
  getBoundingClientRect: () => ({ left: -12000, top: 0, width: 794, height: 1123 }),
  scrollWidth: 794,
  offsetWidth: 794,
  ownerDocument: fakeSheet.ownerDocument
};
const badGeometry = Export.measurePdfSheetGeometry(badSheet);
assert(badGeometry.left === -12000, 'old offscreen host would report left:-12000');
assert(badGeometry.left < -1, 'huge negative left is detectable');

console.log('\nAll v4.13.18 PDF origin alignment checks passed.');

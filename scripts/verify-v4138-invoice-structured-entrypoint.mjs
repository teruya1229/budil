/**
 * Budil v4.13.8 — 構造化入力→請求書 prepare/apply 正規入口 verification.
 * 一時DB・一時PDFのみ。本番 localStorage / 公開環境 / 共通Chromeは使わない。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

for (const file of [
  'js/documents-brain.js',
  'js/invoice-structured-entrypoint.js',
  'scripts/invoice-structured-cli.mjs'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.13.8 invoice structured entrypoint ==');

const entryJs = load('js/invoice-structured-entrypoint.js');
const cliJs = load('scripts/invoice-structured-cli.mjs');
assert(entryJs.includes('InvoiceStructuredEntrypoint'), 'entrypoint const must exist');
assert(entryJs.includes('prepare(') && entryJs.includes('apply('), 'prepare/apply required');
assert(entryJs.includes('idempotencyKey'), 'idempotencyKey required');
assert(entryJs.includes('NEEDS_CONFIRMATION'), 'NEEDS_CONFIRMATION required');
assert(entryJs.includes('EXPECTED_TOTAL_MISMATCH'), 'expectedTotal mismatch code required');
assert(entryJs.includes('taxIncluded'), 'must reuse taxIncluded path like buildInvoiceFromRevenue');
assert(cliJs.includes('invoice-structured-cli'), 'CLI file present');
assert(cliJs.includes('print-to-pdf') || cliJs.includes('writePdfWithBrowser'), 'CLI PDF path required');
assert(!cliJs.includes('bc-memory'), 'must not copy Canonical Data to common Memory');
assert(!/console\.log\([^)]*customerName/.test(cliJs), 'CLI must not log customerName');

function createSandbox() {
  const ctx = createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
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
    BigInt,
    module: { exports: {} },
    exports: {},
    PaymentBrain: {
      normalizeRevenuePayment(rev, opts) {
        const total = opts && opts.total != null ? opts.total : 0;
        return {
          paymentMethod: rev.paymentMethod || 'bank_transfer',
          paymentStatus: rev.paymentStatus || 'pending',
          expectedPaymentDate: rev.expectedPaymentDate || '',
          paidDate: rev.paidDate || '',
          paidAmount: rev.paidAmount || 0,
          unpaidAmount: total,
          paymentMemo: rev.paymentMemo || ''
        };
      },
      normalizeDocumentPayment(doc, opts) {
        const total = opts && opts.total != null ? opts.total : 0;
        return {
          paymentMethod: doc.paymentMethod || 'bank_transfer',
          paymentStatus: doc.paymentStatus || 'pending',
          expectedPaymentDate: doc.expectedPaymentDate || '',
          paidDate: doc.paidDate || '',
          paidAmount: doc.paidAmount || 0,
          unpaidAmount: total,
          paymentMemo: doc.paymentMemo || '',
          linkedDocumentId: doc.linkedDocumentId || '',
          linkedRevenueId: doc.linkedRevenueId || ''
        };
      }
    }
  });
  runInContext(load('js/documents-brain.js'), ctx, { filename: 'documents-brain.js' });
  runInContext(load('js/invoice-structured-entrypoint.js'), ctx, {
    filename: 'invoice-structured-entrypoint.js'
  });
  runInContext(
    'this.DocumentsBrain = DocumentsBrain; this.InvoiceStructuredEntrypoint = InvoiceStructuredEntrypoint;',
    ctx
  );
  return ctx;
}

const fixtureCustomer = {
  id: 'cust-fixture-aircon-001',
  customerName: 'テスト顧客（構造化請求fixture）',
  companyName: 'テスト顧客（構造化請求fixture）',
  isTestFixture: true
};

function futureDueDate(daysAhead = 40) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function baseInput(overrides = {}) {
  return {
    customerId: fixtureCustomer.id,
    items: [
      {
        description: 'エアコン工事',
        quantity: 1,
        unitPrice: 88000
      }
    ],
    expectedTotal: 88000,
    dueDate: futureDueDate(45),
    idempotencyKey: 'test-structured-invoice-88000-v1',
    ...overrides
  };
}

function makeStore() {
  const documents = [];
  const idempotency = {};
  const pdfWrites = [];
  return {
    documents,
    idempotency,
    pdfWrites,
    getCustomers: () => [fixtureCustomer, {
      id: 'cust-dup-a',
      customerName: '同姓同名テスト',
      companyName: '同姓同名テスト'
    }, {
      id: 'cust-dup-b',
      customerName: '同姓同名テスト',
      companyName: '同姓同名テスト'
    }],
    getDocuments: () => documents.slice(),
    addDocument(doc) {
      const saved = {
        ...doc,
        id: doc.id || `doc-test-${documents.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      documents.unshift(saved);
      return saved;
    },
    findIdempotency(key) {
      return idempotency[key] || null;
    },
    saveIdempotency(key, value) {
      idempotency[key] = value;
    },
    writePdf(saved) {
      const pointer = { kind: 'file', path: `pdf/invoice-${saved.id}.pdf` };
      pdfWrites.push({ id: saved.id, path: pointer.path, total: saved.total });
      return pointer;
    }
  };
}

const ctx = createSandbox();
const E = ctx.InvoiceStructuredEntrypoint;
const DocumentsBrain = ctx.DocumentsBrain;

console.log('== 正常prepare ==');
{
  const store = makeStore();
  const docsBefore = store.documents.length;
  const pdfBefore = store.pdfWrites.length;
  const prepared = E.prepare(baseInput(), {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    hashFn: sha256Hex
  });
  assert(prepared.ok === true, 'prepare should succeed');
  assert(prepared.checksum && prepared.checksum.length >= 32, 'checksum required');
  assert(prepared.preview.total === 88000, 'preview total must be 88000');
  assert(prepared.preview.items[0].description === 'エアコン工事', 'description preserved');
  assert(store.documents.length === docsBefore, 'prepare must not write documents');
  assert(store.pdfWrites.length === pdfBefore, 'prepare must not write PDF');
}

console.log('== 88,000円の計算一致 ==');
{
  const calcPath = DocumentsBrain.buildInvoiceFromRevenue({
    id: 'rev-calc',
    customerName: 'x',
    service: 'エアコン工事',
    amount: 88000,
    workDate: DocumentsBrain.todayISO()
  }, []);
  assert(calcPath.total === 88000, 'revenue path total 88000');
  const prepared = E.prepare(baseInput(), {
    getCustomers: () => [fixtureCustomer],
    getDocuments: () => [],
    hashFn: sha256Hex
  });
  assert(prepared.preview.total === 88000, 'structured total matches 88000');
  assert(prepared.preview.total === calcPath.total, 'structured total matches DocumentsBrain revenue path');
}

console.log('== expectedTotal不一致拒否 ==');
{
  const bad = E.prepare(baseInput({ expectedTotal: 99999 }), {
    getCustomers: () => [fixtureCustomer],
    getDocuments: () => [],
    hashFn: sha256Hex
  });
  assert(bad.ok === false, 'expectedTotal mismatch must fail');
  assert(bad.code === 'EXPECTED_TOTAL_MISMATCH', 'EXPECTED_TOTAL_MISMATCH');
}

console.log('== 顧客不明・複数候補拒否 ==');
{
  const missing = E.prepare(baseInput({ customerId: 'no-such-customer' }), {
    getCustomers: () => [fixtureCustomer],
    getDocuments: () => [],
    hashFn: sha256Hex
  });
  assert(missing.ok === false && missing.code === 'CUSTOMER_NOT_FOUND', 'unknown customerId');

  const multi = E.prepare(baseInput({
    customerId: '',
    customerName: '同姓同名テスト',
    idempotencyKey: 'test-multi-name'
  }), {
    getCustomers: makeStore().getCustomers,
    getDocuments: () => [],
    hashFn: sha256Hex
  });
  assert(multi.ok === false && multi.code === 'NEEDS_CONFIRMATION', 'ambiguous name needs confirmation');
}

console.log('== 期限逆転拒否 ==');
{
  const bad = E.prepare(baseInput({
    invoiceDate: '2026-08-20',
    dueDate: '2026-08-10',
    idempotencyKey: 'test-date-order'
  }), {
    getCustomers: () => [fixtureCustomer],
    getDocuments: () => [],
    hashFn: sha256Hex
  });
  assert(bad.ok === false && bad.code === 'DATE_ORDER_INVALID', 'due before invoice rejected');
}

console.log('== 正常apply（一時ストア） / permitなし / checksum改ざん / idempotency ==');
{
  const store = makeStore();
  const input = baseInput({ idempotencyKey: 'test-apply-once-001' });
  const prepared = E.prepare(input, {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    hashFn: sha256Hex
  });
  assert(prepared.ok, 'prepare before apply');

  const noPermit = E.apply({
    ...input,
    checksum: prepared.checksum,
    expiresAt: prepared.expiresAt,
    number: prepared.preview.number
  }, {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    addDocument: store.addDocument,
    findIdempotency: store.findIdempotency,
    saveIdempotency: store.saveIdempotency,
    writePdf: store.writePdf,
    hashFn: sha256Hex,
    permit: false
  });
  assert(noPermit.ok === false && noPermit.code === 'PERMIT_REQUIRED', 'permit required');

  const tampered = E.apply({
    ...input,
    checksum: `${prepared.checksum}dead`,
    expiresAt: prepared.expiresAt,
    number: prepared.preview.number,
    permit: true
  }, {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    addDocument: store.addDocument,
    findIdempotency: store.findIdempotency,
    saveIdempotency: store.saveIdempotency,
    writePdf: store.writePdf,
    hashFn: sha256Hex,
    permit: true
  });
  assert(tampered.ok === false && tampered.code === 'CHECKSUM_MISMATCH', 'checksum tamper rejected');

  const applied = E.apply({
    ...input,
    checksum: prepared.checksum,
    expiresAt: prepared.expiresAt,
    number: prepared.preview.number,
    permit: true
  }, {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    addDocument: store.addDocument,
    findIdempotency: store.findIdempotency,
    saveIdempotency: store.saveIdempotency,
    writePdf: store.writePdf,
    hashFn: sha256Hex,
    permit: true
  });
  assert(applied.ok === true, 'apply should succeed');
  assert(applied.total === 88000, 'apply total 88000');
  assert(applied.invoiceId, 'invoiceId returned');
  assert(applied.pdfPointer && applied.pdfPointer.path, 'pdf pointer returned');
  assert(store.documents.length === 1, 'one document saved');
  assert(store.pdfWrites.length === 1, 'one pdf write');

  const replay = E.apply({
    ...input,
    checksum: prepared.checksum,
    expiresAt: prepared.expiresAt,
    number: prepared.preview.number,
    permit: true
  }, {
    getCustomers: store.getCustomers,
    getDocuments: store.getDocuments,
    addDocument: store.addDocument,
    findIdempotency: store.findIdempotency,
    saveIdempotency: store.saveIdempotency,
    writePdf: store.writePdf,
    hashFn: sha256Hex,
    permit: true
  });
  assert(replay.ok === true && replay.idempotentReplay === true, 'idempotent replay');
  assert(replay.invoiceId === applied.invoiceId, 'same invoiceId on replay');
  assert(store.documents.length === 1, 'idempotency prevents duplicate document');
  assert(store.pdfWrites.length === 1, 'idempotency prevents duplicate pdf');
}

console.log('== prepare副作用ゼロ（CLI documents.json） ==');
{
  const dir = mkdtempSync(join(tmpdir(), 'budil-inv-prep-'));
  try {
    writeFileSync(join(dir, 'customers.json'), `${JSON.stringify([fixtureCustomer], null, 2)}\n`);
    writeFileSync(join(dir, 'documents.json'), '[]\n');
    writeFileSync(join(dir, 'idempotency.json'), '{}\n');
    const inputPath = join(dir, 'input.json');
    writeFileSync(inputPath, `${JSON.stringify(baseInput({
      idempotencyKey: 'test-cli-prepare-sideeffect'
    }), null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [
        join(root, 'scripts/invoice-structured-cli.mjs'),
        'prepare',
        '--input', inputPath,
        '--data-dir', dir
      ],
      { encoding: 'utf8', cwd: root }
    );
    assert(result.status === 0, `CLI prepare exit 0 (got ${result.status}) stderr=${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim().split('\n').pop());
    assert(parsed.ok === true, 'CLI prepare ok');
    assert(parsed.preview.total === 88000, 'CLI prepare total');
    const docs = JSON.parse(readFileSync(join(dir, 'documents.json'), 'utf8'));
    assert(Array.isArray(docs) && docs.length === 0, 'CLI prepare documents still empty');
    const pdfDir = join(dir, 'pdf');
    if (existsSync(pdfDir)) {
      assert(readdirSync(pdfDir).length === 0, 'CLI prepare pdf dir empty');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('== 既存請求書計算回帰（DocumentsBrain） ==');
{
  const draft = DocumentsBrain.buildInvoiceFromRevenue({
    id: 'rev-reg',
    customerName: '回帰顧客',
    service: 'エアコンクリーニング',
    amount: 22000,
    workDate: '2026-08-01'
  }, []);
  assert(draft && draft.total === 22000, 'revenue invoice total regression');
  const html = DocumentsBrain.renderDocumentSheet(draft, (s) => String(s || ''));
  assert(html.includes('22,000円') || html.includes('22000'), 'render contains amount');
  assert(html.includes('請求書'), 'render invoice title');
  const formItems = DocumentsBrain.getFormItemsFromDocument(draft);
  const formCalc = DocumentsBrain.calcFromFormItems(formItems, draft.taxSettings);
  assert(formCalc.total === 22000, 'form calc total regression');
}

console.log('== PII・本文をログへ出さない（ソース静的検査） ==');
{
  assert(!/safeLog\([^)]*preview/.test(cliJs), 'safeLog must not dump preview');
  assert(!/safeLog\([^)]*customerName/.test(cliJs), 'safeLog must not include customerName');
  assert(!/console\.log\(.*JSON\.stringify\(input/.test(cliJs), 'must not log raw input');
  assert(!/bc-memory|copyCanonical|commonMemory/i.test(entryJs), 'no memory copy in entrypoint');
}

console.log('== v4.13.8 invoice structured entrypoint: PASS ==');

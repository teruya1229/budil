#!/usr/bin/env node
/**
 * Budil structured invoice CLI — Browser番頭から将来安全に呼べる最小入口。
 *
 * 使い方:
 *   node scripts/invoice-structured-cli.mjs prepare --input in.json --data-dir <tmp>
 *   node scripts/invoice-structured-cli.mjs apply  --input in.json --data-dir <tmp> --permit --checksum <hex> --expires-at <iso> --number <n>
 *
 * - SQLite 直結や Browser番頭からの内部モジュール接続はしない
 * - 一時 data-dir / pdf-dir のみ書き込み（本番 localStorage 非接触）
 * - stdout は構造化 JSONのみ。PII・請求書本文・PDF本文は stderr ログに出さない
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function loadJs(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function createBrainContext() {
  const ctx = createContext({
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
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
  runInContext(loadJs('js/documents-brain.js'), ctx, { filename: 'documents-brain.js' });
  runInContext(loadJs('js/invoice-structured-entrypoint.js'), ctx, {
    filename: 'invoice-structured-entrypoint.js'
  });
  runInContext(
    'this.DocumentsBrain = DocumentsBrain; this.InvoiceStructuredEntrypoint = InvoiceStructuredEntrypoint;',
    ctx
  );
  return ctx;
}

function safeLog(message) {
  // PII / 本文 / 秘密情報を出さない短い運用ログのみ
  process.stderr.write(`[invoice-structured] ${message}\n`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--permit') {
      out.permit = true;
      continue;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = val;
        i += 1;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function openStore(dataDir) {
  ensureDir(dataDir);
  const customersPath = join(dataDir, 'customers.json');
  const documentsPath = join(dataDir, 'documents.json');
  const idempotencyPath = join(dataDir, 'idempotency.json');
  if (!existsSync(customersPath)) writeJson(customersPath, []);
  if (!existsSync(documentsPath)) writeJson(documentsPath, []);
  if (!existsSync(idempotencyPath)) writeJson(idempotencyPath, {});

  return {
    customersPath,
    documentsPath,
    idempotencyPath,
    getCustomers() {
      const list = readJson(customersPath, []);
      return Array.isArray(list) ? list : [];
    },
    getDocuments() {
      const list = readJson(documentsPath, []);
      return Array.isArray(list) ? list : [];
    },
    addDocument(doc) {
      const list = this.getDocuments();
      const now = new Date().toISOString();
      const saved = {
        ...doc,
        id: doc.id || `doc-${randomUUID()}`,
        createdAt: doc.createdAt || now,
        updatedAt: now
      };
      list.unshift(saved);
      writeJson(documentsPath, list);
      return saved;
    },
    findIdempotency(key) {
      const map = readJson(idempotencyPath, {});
      return map[key] || null;
    },
    saveIdempotency(key, result) {
      const map = readJson(idempotencyPath, {});
      map[key] = result;
      writeJson(idempotencyPath, map);
    },
    countDocuments() {
      return this.getDocuments().length;
    }
  };
}

function extractDocCss(cssText) {
  // 帳票関連ルールだけ抜き出し（巨大な style.css 全体は使わない）
  const lines = String(cssText || '').split(/\r?\n/);
  const keep = [];
  let capturing = false;
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const startsDoc =
      trimmed.startsWith('.doc-') ||
      trimmed.startsWith('@media print') ||
      trimmed.startsWith('@page');
    if (!capturing && startsDoc) capturing = true;
    if (capturing) {
      keep.push(line);
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;
      if (depth <= 0 && trimmed.includes('}')) {
        capturing = false;
        depth = 0;
        keep.push('');
      }
    }
  }
  return keep.join('\n');
}

function findBrowserBinary() {
  const candidates = [
    process.env.BUDIL_PDF_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function buildPrintableHtml(docHtml, sealFileUrl, cssText) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>invoice</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    ${cssText}
    body { background: #fff !important; }
    .doc-sheet { box-shadow: none !important; }
  </style>
</head>
<body class="doc-printing">
  <div class="doc-print-area">${docHtml.replace(
    /src="assets\/bc-service-seal\.jpg"/g,
    `src="${sealFileUrl}"`
  )}</div>
</body>
</html>`;
}

function writePdfWithBrowser(htmlPath, pdfPath) {
  const browser = findBrowserBinary();
  if (!browser) {
    throw new Error('browser_not_found');
  }
  ensureDir(dirname(pdfPath));
  const userDataDir = join(dirname(pdfPath), '.browser-profile-tmp');
  ensureDir(userDataDir);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${pdfPath}`,
    '--print-to-pdf-no-header',
    pathToFileURL(htmlPath).href
  ];
  const result = spawnSync(browser, args, {
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true
  });
  if (result.status !== 0 || !existsSync(pdfPath) || statSync(pdfPath).size < 100) {
    throw new Error('pdf_render_failed');
  }
  return pdfPath;
}

function loadInput(args) {
  if (args.input) {
    return JSON.parse(readFileSync(resolve(String(args.input)), 'utf8'));
  }
  if (args['input-json']) {
    return JSON.parse(String(args['input-json']));
  }
  const stdin = readFileSync(0, 'utf8');
  if (!stdin.trim()) {
    throw new Error('input_required');
  }
  return JSON.parse(stdin);
}

function printResult(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function seedFixtureIfRequested(store, args) {
  if (!args['seed-fixture']) return null;
  const customers = store.getCustomers();
  const existing = customers.find((c) => c.id === 'cust-fixture-aircon-001');
  if (existing) return existing;
  const fixture = {
    id: 'cust-fixture-aircon-001',
    customerName: 'テスト顧客（構造化請求fixture）',
    companyName: 'テスト顧客（構造化請求fixture）',
    isTestFixture: true
  };
  customers.push(fixture);
  writeJson(store.customersPath, customers);
  return fixture;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || !['prepare', 'apply', 'seed-fixture'].includes(command)) {
    printResult({
      ok: false,
      code: 'USAGE',
      message: 'prepare | apply | seed-fixture'
    });
    process.exit(2);
  }

  const dataDir = resolve(String(args['data-dir'] || join(tmpdir(), 'budil-invoice-structured')));
  const pdfDir = resolve(String(args['pdf-dir'] || join(dataDir, 'pdf')));
  ensureDir(dataDir);
  ensureDir(pdfDir);

  const store = openStore(dataDir);
  const ctx = createBrainContext();
  const Entrypoint = ctx.InvoiceStructuredEntrypoint;
  const Documents = ctx.DocumentsBrain;

  if (command === 'seed-fixture') {
    const fixture = seedFixtureIfRequested(store, { 'seed-fixture': true });
    printResult({ ok: true, customerId: fixture.id });
    return;
  }

  let input;
  try {
    input = loadInput(args);
  } catch {
    printResult({ ok: false, code: 'INVALID_INPUT', message: 'input JSON を読めません' });
    process.exit(1);
  }

  if (args['seed-fixture']) seedFixtureIfRequested(store, args);

  // apply 時は prepare 結果の number / expiresAt / checksum を入力へ戻す
  if (args.checksum) input.checksum = String(args.checksum);
  if (args['expires-at']) input.expiresAt = String(args['expires-at']);
  if (args.number) input.number = String(args.number);
  if (args.permit) input.permit = true;

  const docsBefore = store.countDocuments();

  if (command === 'prepare') {
    const result = Entrypoint.prepare(input, {
      getCustomers: () => store.getCustomers(),
      getDocuments: () => store.getDocuments(),
      hashFn: sha256Hex,
      now: () => new Date()
    });
    const docsAfter = store.countDocuments();
    if (docsAfter !== docsBefore) {
      printResult({
        ok: false,
        code: 'SIDE_EFFECT',
        message: 'prepare が documents を変更しました'
      });
      process.exit(1);
    }
    // PDF ディレクトリが空のままかも確認（既存ファイルは触らない）
    safeLog(`prepare ${result.ok ? 'ok' : result.code}`);
    printResult(result);
    process.exit(result.ok ? 0 : 1);
  }

  // apply
  const result = Entrypoint.apply(input, {
    getCustomers: () => store.getCustomers(),
    getDocuments: () => store.getDocuments(),
    addDocument: (doc) => store.addDocument(Documents.normalizeDocument(doc)),
    findIdempotency: (key) => store.findIdempotency(key),
    saveIdempotency: (key, value) => store.saveIdempotency(key, value),
    hashFn: sha256Hex,
    permit: input.permit === true,
    checksum: input.checksum,
    now: () => new Date(),
    writePdf(saved) {
      const css = extractDocCss(loadJs('css/style.css'));
      const sealPath = join(root, 'assets', 'bc-service-seal.jpg');
      const sealUrl = pathToFileURL(sealPath).href;
      const sheet = Documents.renderDocumentSheet(saved, (s) =>
        String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
      );
      const html = buildPrintableHtml(sheet, sealUrl, css);
      const stem = `invoice-${saved.id}`;
      const htmlPath = join(pdfDir, `${stem}.html`);
      const pdfPath = join(pdfDir, `${stem}.pdf`);
      writeFileSync(htmlPath, html, 'utf8');
      writePdfWithBrowser(htmlPath, pdfPath);
      // 呼び出し側には data-dir 相対の安全な pointer のみ返す
      const rel = relative(dataDir, pdfPath).replace(/\\/g, '/');
      return { kind: 'file', path: rel, absolutePath: pdfPath };
    }
  });

  safeLog(`apply ${result.ok ? (result.idempotentReplay ? 'replay' : 'ok') : result.code}`);
  // absolutePath は内部のみ。応答からは落とす
  if (result.pdfPointer && result.pdfPointer.absolutePath) {
    delete result.pdfPointer.absolutePath;
  }
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

main();

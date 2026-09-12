/**
 * Budil v4.13.18 - AI確認用バックアップ
 * Isolated fixtures only. No production localStorage. No restore.
 */
import { readFileSync } from 'node:fs';
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

function functionBody(src, name) {
  const re = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const start = src.search(re);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

for (const file of ['js/data-backup.js', 'js/app.js', 'js/storage.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const index = load('index.html');
const app = load('js/app.js');
const dataBackup = load('js/data-backup.js');
const storageJs = load('js/storage.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version ==');
assert(index.includes('Budil v4.13.18'), 'index shows Budil v4.13.18');
assert(index.includes('AI経営脳みそ v4.13.18'), 'header shows v4.13.18');
assert(index.includes('js/app.js?v=4.13.18'), 'app.js cache buster is 4.13.18');
assert(index.includes('js/data-backup.js?v=4.13.18'), 'data-backup cache buster is 4.13.18');
assert(index.includes('css/style.css?v=4.13.18'), 'style.css cache buster is 4.13.18');
assert(!index.includes('?v=4.13.17'), 'old cache buster 4.13.17 is gone from index');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.18'"), 'storage version is v4.13.18');
assert(dataBackup.includes("APP_VERSION: 'v4.13.18'"), 'data-backup version is v4.13.18');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.18'"), 'verify-current pins v4.13.18');
assert(statusMd.includes('v4.13.18'), 'status.md documents v4.13.18');
assert(handoffMd.includes('v4.13.18'), 'handoff.md documents v4.13.18');
assert(decisionLog.includes('v4.13.18'), 'decision-log records v4.13.18');

console.log('== UI wiring ==');
assert(index.includes('id="btn-export-data"'), 'usual backup button remains');
assert(index.includes('>バックアップを保存<'), 'usual backup label unchanged');
assert(index.includes('id="btn-export-ai-snapshot"'), 'AI snapshot button is in index.html');
assert(index.includes('>AI確認用バックアップ<'), 'AI snapshot label is in HTML');
assert(index.includes('id="btn-import-select"'), 'restore select remains');
assert(index.includes('id="btn-import-confirm"'), 'restore confirm remains');
assert(!dataBackup.includes('installAiConfirmationSnapshotButton'), 'data-backup no longer injects the button');
assert(!dataBackup.includes("createElement('button')"), 'data-backup does not create the AI button');

const exportUsual = functionBody(app, 'exportBudilData');
const exportAi = functionBody(app, 'exportAiConfirmSnapshot');
const downloadFn = functionBody(app, 'downloadBudilBackupSnapshot');
assert(downloadFn.includes('DataBackup.exportPayload()'), 'download reuses exportPayload');
assert(exportUsual.includes('downloadBudilBackupSnapshot()'), 'usual export uses default filename');
assert(exportUsual.includes('DataBackup.recordBackupTime()'), 'usual export still records backup time');
assert(exportAi.includes('DataBackup.aiSnapshotFilename()'), 'AI export uses AI filename');
assert(!exportAi.includes('recordBackupTime'), 'AI export does not record backup time');
assert(!exportAi.includes('importData'), 'AI export does not restore');
assert(app.includes('btn-export-ai-snapshot'), 'app.js binds the HTML AI button');

console.log('== payload / filename ==');
const store = {};
const ctx = createContext({
  Date,
  JSON,
  String,
  Array,
  Object,
  Set,
  console,
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { throw new Error('WRITE_FORBIDDEN'); }
  }
});
runInContext(dataBackup, ctx, { filename: 'data-backup.js' });
runInContext('this.DataBackup = DataBackup;', ctx);

const keys = runInContext('DataBackup.BACKUP_KEYS', ctx);
assert(keys.includes('budil_revenue_records'), 'payload includes revenue records');
assert(keys.includes('budil_work_orders'), 'payload includes work orders');
assert(keys.includes('budil_expense_records'), 'payload includes expenses');
assert(keys.includes('budil_documents'), 'payload includes invoices/estimates');

store.budil_settings = JSON.stringify({ lastBackupAt: '2026-09-01T00:00:00.000Z' });
store.budil_revenue_records = JSON.stringify([{ id: 'rev1', amount: 1000 }]);
store.budil_work_orders = JSON.stringify([{ id: 'wo1' }]);
store.budil_expense_records = JSON.stringify([{ id: 'ex1' }]);
store.budil_documents = JSON.stringify([{ id: 'doc1', type: 'invoice' }]);
const payload = runInContext('DataBackup.exportPayload()', ctx);
assert(payload.version === '4.0', 'schema version unchanged');
assert(Array.isArray(payload.data.budil_revenue_records) && payload.data.budil_revenue_records.length === 1, 'export includes revenue');
assert(Array.isArray(payload.data.budil_work_orders) && payload.data.budil_work_orders.length === 1, 'export includes work orders');
assert(Array.isArray(payload.data.budil_expense_records) && payload.data.budil_expense_records.length === 1, 'export includes expenses');
assert(Array.isArray(payload.data.budil_documents) && payload.data.budil_documents[0].type === 'invoice', 'export includes documents');
assert(JSON.parse(store.budil_settings).lastBackupAt === '2026-09-01T00:00:00.000Z', 'exportPayload does not change lastBackupAt');

const aiName = runInContext('DataBackup.aiSnapshotFilename()', ctx);
const usualName = runInContext('DataBackup.filename()', ctx);
assert(/^budil-backup-\d{4}-\d{2}-\d{2}\.json$/.test(usualName), 'usual filename format unchanged');
assert(/^budil-ai-snapshot-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(aiName), 'AI filename format');

console.log('\nAll v4.13.18 AI confirm snapshot checks passed.');

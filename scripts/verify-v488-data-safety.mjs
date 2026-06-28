/**
 * Budil v4.8.25 data safety verification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function load(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data
  };
}

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
  const ctx = createContext({
    localStorage,
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
    undefined
  });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

function readSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (rel.startsWith('.git/') || rel.startsWith('recovery/')) continue;
    if (rel === 'scripts/verify-v488-data-safety.mjs') continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

function parse(key, localStorage) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

console.log('== v4.8.25 data safety check ==');

for (const file of ['storage.js', 'data-backup.js', 'app.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

assert(appJs.includes('clearReceptionDraftInputs'), 'reception clear helper should exist');
const clearFn = appJs.match(/function clearReceptionDraftInputs[\s\S]*?\n  \}/)?.[0] || '';
assert(clearFn && !/budil_revenue_records|saveRevenueRecords|deleteRevenueRecord|deleteTestRecordsByKey/.test(clearFn),
  'reception input clear must not touch saved revenue data');

assert(storageJs.includes('createSafetyBackup'), 'safety backup helper missing');
assert(storageJs.includes('recordOperationLog'), 'operation log helper missing');
assert(storageJs.includes('empty_array_overwrite_blocked'), 'empty revenue overwrite guard missing');
assert(storageJs.includes('all_records_delete_blocked'), 'all-record deletion guard missing');
assert(dataBackupJs.includes('budil_safety_backups'), 'safety backups should be included in backup keys');
assert(dataBackupJs.includes('budil_operation_logs'), 'operation logs should be included in backup keys');

const sourceText = readSourceFiles(root).map(p => readFileSync(p, 'utf8')).join('\n');
assert(!(new RegExp('localStorage' + '\\.clear\\s*\\(')).test(sourceText), 'direct localStorage clear must not exist');
assert(!(new RegExp('saveRevenueRecords' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty revenue save must not exist');
assert(!(new RegExp('saveReceptionIntakes' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty reception save must not exist');
assert(!(new RegExp('saveWorkOrders' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty work-order save must not exist');

console.log('OK: source safety checks');

console.log('== revenue delete guard ==');
{
  const seed = {
    budil_revenue_records: JSON.stringify([
      { id: 'rev_keep_a', customerName: '実データA', amount: 10000, workDate: '2026-06-01' },
      { id: 'rev_delete', customerName: '削除対象', amount: 5000, workDate: '2026-06-02' },
      { id: 'rev_keep_b', customerName: '実データB', amount: 12000, workDate: '2026-06-03' }
    ]),
    budil_documents: JSON.stringify([
      { id: 'doc_linked', type: 'invoice', linkedRevenueId: 'rev_delete', total: 5000 }
    ])
  };
  const { ctx, localStorage } = createSandbox(seed);
  const result = runInContext(`Storage.deleteRevenueRecord('rev_delete')`, ctx);
  const revenues = parse('budil_revenue_records', localStorage);
  const documents = parse('budil_documents', localStorage);
  const backups = parse('budil_safety_backups', localStorage);
  const logs = parse('budil_operation_logs', localStorage);

  assert(result.ok === true, 'revenue delete should succeed for existing ID');
  assert(revenues.length === 2, 'revenue delete should reduce count by exactly 1');
  assert(revenues.every(r => r.id !== 'rev_delete'), 'target revenue should be removed');
  assert(documents[0].linkedRevenueId === '', 'linked document should be safely unlinked');
  assert(backups.some(b => b.targetKey === 'budil_revenue_records' && b.targetId === 'rev_delete'), 'revenue safety backup missing');
  assert(backups.some(b => b.targetKey === 'budil_documents'), 'document safety backup missing for unlink');
  assert(logs.some(l => l.action === 'delete_revenue' && l.beforeCount === 3 && l.afterCount === 2), 'delete revenue operation log missing');

  const beforeRaw = localStorage.getItem('budil_revenue_records');
  const missing = runInContext(`Storage.deleteRevenueRecord('rev_missing')`, ctx);
  assert(missing.ok === false, 'missing ID delete should be blocked');
  assert(localStorage.getItem('budil_revenue_records') === beforeRaw, 'missing ID delete must not save revenue records');
}

console.log('OK: revenue delete guard');

console.log('== test data delete guard ==');
{
  const seed = {
    budil_revenue_records: JSON.stringify([
      { id: 'rev_real', customerName: '実データ', amount: 10000, workDate: '2026-06-01' },
      { id: 'rev_test', customerName: 'テスト', amount: 1, workDate: '2026-06-02', isTest: true },
      { id: 'rev_run', customerName: 'テストRun', amount: 2, workDate: '2026-06-03', testRunId: 'v488-run' }
    ]),
    budil_reception_intakes: JSON.stringify([
      { id: 'intake_real', customerName: '実受付' },
      { id: 'intake_test', customerName: 'テスト受付', isTest: true }
    ]),
    budil_work_orders: JSON.stringify([
      { id: 'work_real', customerName: '実予定' },
      { id: 'work_test', customerName: 'テスト予定', testRunId: 'v488-run' }
    ])
  };
  const { ctx, localStorage } = createSandbox(seed);
  const revResult = runInContext(`Storage.deleteTestRecordsByKey(Storage.KEYS.REVENUE_RECORDS, { testRunId: 'v488-run' })`, ctx);
  const intakeResult = runInContext(`Storage.deleteTestRecordsByKey(Storage.KEYS.RECEPTION_INTAKES)`, ctx);
  const workResult = runInContext(`Storage.deleteTestRecordsByKey(Storage.KEYS.WORK_ORDERS, { testRunId: 'v488-run' })`, ctx);
  const revenues = parse('budil_revenue_records', localStorage);
  const intakes = parse('budil_reception_intakes', localStorage);
  const workOrders = parse('budil_work_orders', localStorage);

  assert(revResult.ok && revResult.deleted === 2, 'revenue test delete should remove isTest/testRunId only');
  assert(intakeResult.ok && intakeResult.deleted === 1, 'intake test delete should remove isTest only');
  assert(workResult.ok && workResult.deleted === 1, 'work-order test delete should remove matching testRunId only');
  assert(revenues.length === 1 && revenues[0].id === 'rev_real', 'real revenue must remain');
  assert(intakes.length === 1 && intakes[0].id === 'intake_real', 'real intake must remain');
  assert(workOrders.length === 1 && workOrders[0].id === 'work_real', 'real work order must remain');
}

console.log('OK: test data delete guard');

console.log('== all-record delete block ==');
{
  const { ctx, localStorage } = createSandbox({
    budil_revenue_records: JSON.stringify([
      { id: 'rev_only_test', isTest: true, amount: 1, workDate: '2026-06-01' }
    ])
  });
  const result = runInContext(`Storage.deleteTestRecordsByKey(Storage.KEYS.REVENUE_RECORDS)`, ctx);
  const revenues = parse('budil_revenue_records', localStorage);
  assert(result.ok === false && result.error === 'all_records_delete_blocked', 'all-record test delete should be blocked');
  assert(revenues.length === 1 && revenues[0].id === 'rev_only_test', 'blocked all-record delete must keep data');
}

console.log('OK: all-record delete block');

console.log('== diagnostics and git ignore ==');
{
  const { ctx } = createSandbox({
    budil_revenue_records: JSON.stringify([]),
    budil_documents: JSON.stringify([]),
    budil_reception_intakes: JSON.stringify([]),
    budil_work_orders: JSON.stringify([]),
    budil_daily_action_tasks: JSON.stringify({ states: [], manualTasks: [], dailyChecks: {} }),
    budil_safety_backups: JSON.stringify([{ id: 'safety-backup-test' }]),
    budil_operation_logs: JSON.stringify([{ id: 'operation-log-test' }])
  });
  const result = runInContext(`Storage.runDataDiagnostics()`, ctx);
  assert(result.counts.safetyBackups === 1, 'diagnostics should count safety backups');
  assert(result.counts.operationLogs === 1, 'diagnostics should count operation logs');
  assert(result.levels.critical.some(t => t.includes('\u58f2\u4e0a\u30c7\u30fc\u30bf\u304c0\u4ef6')), 'diagnostics should warn when revenue count is 0');
}

const ignored = execSync('git check-ignore recovery/leveldb-revenue-salvage-report.md', { cwd: root, encoding: 'utf8' }).trim();
assert(ignored.includes('recovery/leveldb-revenue-salvage-report.md'), 'recovery/ should be git-ignored');

console.log('OK: diagnostics and recovery/ git ignore');
console.log('All v4.8.25 data safety checks passed.');

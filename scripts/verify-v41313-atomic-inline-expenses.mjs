/**
 * Budil v4.13.13 - 売上確定時の複数経費を一括・全件成功で保存
 * Isolated in-memory fixtures only. No production localStorage.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = file => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const index = load('index.html');
const app = load('js/app.js');
const completionSource = load('js/work-completion-brain.js');
const revenueBrainSrc = load('js/revenue-brain.js');
const profitBrainSrc = load('js/profit-brain.js');
const storageSrc = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/storage.js', 'js/work-completion-brain.js', 'js/revenue-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const extractFn = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

console.log('== version ==');
assert(index.includes('Budil v4.13.13'), 'index shows Budil v4.13.13');
assert(index.includes('AI経営脳みそ v4.13.13'), 'header shows v4.13.13');
assert(index.includes('js/app.js?v=4.13.13'), 'app.js cache buster is 4.13.13');
assert(index.includes('js/storage.js?v=4.13.13'), 'storage.js cache buster is 4.13.13');
assert(index.includes('css/style.css?v=4.13.13'), 'style.css cache buster is 4.13.13');
assert(storageSrc.includes("BUDIL_VERSION: 'v4.13.13'"), 'storage version is v4.13.13');
assert(dataBackup.includes("APP_VERSION: 'v4.13.13'"), 'data-backup version is v4.13.13');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.13'"), 'verify-current pins v4.13.13');
assert(statusMd.includes('v4.13.13'), 'status.md documents v4.13.13');
assert(handoffMd.includes('v4.13.13'), 'handoff.md documents v4.13.13');
assert(decisionLog.includes('v4.13.13'), 'decision-log.md records v4.13.13');

console.log('== source: atomic save wiring ==');
assert(storageSrc.includes('addExpenseRecords(items)'), 'Storage.addExpenseRecords exists');
assert(app.includes('function saveInlineExpensesForRevenue('), 'batch save helper exists');
assert(app.includes('function formatInlineExpenseAllFailedMessage('), 'accurate failure message helper exists');
assert(app.includes('売上は保存済み、今回の経費'), 'failure message names saved revenue');
assert(app.includes('件は1件も保存されていない'), 'failure message says none of this batch was saved');
assert(!app.includes('売上は保存済みです。経費のみ未保存です'), 'misleading partial-save copy is gone');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');

const workSrc = extractFn(app, 'submitWorkCompletion');
const revSrc = extractFn(app, 'handleRevenueSubmit');
const pastSrc = extractFn(app, 'submitPastRecoveryFromModal');
const batchSrc = extractFn(app, 'saveInlineExpensesForRevenue');

assert(workSrc.includes('saveInlineExpensesForRevenue('), 'work completion uses batch save');
assert(revSrc.includes('saveInlineExpensesForRevenue('), 'manual revenue uses batch save');
assert(!/for\s*\(\s*const expenseItem of expenseItems\s*\)/.test(workSrc), 'work completion has no per-item save loop');
assert(!/for\s*\(\s*const expenseItem of expenseItems\s*\)/.test(revSrc), 'manual revenue has no per-item save loop');
assert(!workSrc.includes('saveInlineExpenseForRevenue('), 'work completion no longer saves one-by-one');
assert(!revSrc.includes('saveInlineExpenseForRevenue('), 'manual revenue no longer saves one-by-one');
assert(workSrc.includes('formatInlineExpenseAllFailedMessage('), 'work completion uses accurate failure copy');
assert(revSrc.includes('formatInlineExpenseAllFailedMessage('), 'manual revenue uses accurate failure copy');
assert(workSrc.includes('recoverStorageForRevenueConfirmationIfNeeded('), 'storage recovery call kept');
assert(workSrc.includes('confirmRevenueSaveWithDuplicateCheck('), 'duplicate revenue guard kept');
assert(workSrc.includes('売上は保存済みです。再登録せず、予定リンクの修復が必要です'), 'work-order link repair message kept');
assert(pastSrc.includes('対象内容を入力確認しない過去売上復元からの直接確定は無効です'), 'past recovery remains disabled');
assert(!pastSrc.includes('saveInlineExpensesForRevenue('), 'disabled past recovery cannot batch-save expenses');
assert(batchSrc.includes('Storage.addExpenseRecords('), 'batch helper writes through addExpenseRecords');
assert(!batchSrc.includes('addExpenseRecord('), 'batch helper does not call single addExpenseRecord');
assert(storageSrc.includes('this.saveExpenseRecords(records.slice().reverse().concat(existing))'), 'expense array is written once from a combined list');

console.log('== isolated storage fixtures ==');
const localStore = new Map();
let expenseWriteCount = 0;
let failIfExpenseLengthOver = null;
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => {
      if (k === 'budil_expense_records') {
        const parsed = JSON.parse(String(v));
        if (failIfExpenseLengthOver != null && parsed.length > failIfExpenseLengthOver) {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
        expenseWriteCount += 1;
      }
      localStore.set(k, String(v));
    },
    removeItem: (k) => localStore.delete(k)
  },
  window: {},
  document: { createElement: () => ({}) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(revenueBrainSrc + '\n;this.RevenueBrain = RevenueBrain;', sandbox);
vm.runInContext(profitBrainSrc + '\n;this.ProfitBrain = ProfitBrain;', sandbox);
vm.runInContext(storageSrc + '\n;this.Storage = Storage;', sandbox);
vm.runInContext(completionSource + '\n;this.WorkCompletionBrain = WorkCompletionBrain;', sandbox);
const { Storage, ProfitBrain, WorkCompletionBrain } = sandbox;

const existing = Storage.addExpenseRecord({
  id: 'expense-existing-keep',
  date: '2026-08-01',
  category: '広告費',
  amount: 3000,
  memo: '既存経費は変更しない',
  relatedRevenueId: 'rev-old-keep',
  source: 'manual'
});
assert(existing.id === 'expense-existing-keep', 'seed existing expense');
const existingSnap = JSON.stringify(Storage.getExpenseRecords().find(e => e.id === 'expense-existing-keep'));

const saveFnSrc = extractFn(app, 'saveInlineExpensesForRevenue');
const payloadFnSrc = extractFn(app, 'buildInlineExpenseSavePayload');
const memoFnSrc = extractFn(app, 'buildDailyExpenseMemo');
const msgFnSrc = extractFn(app, 'formatInlineExpenseAllFailedMessage');
vm.runInContext(
  `${memoFnSrc}\n${payloadFnSrc}\n${saveFnSrc}\n${msgFnSrc}\n` +
    'this.saveInlineExpensesForRevenue = saveInlineExpensesForRevenue;\n' +
    'this.formatInlineExpenseAllFailedMessage = formatInlineExpenseAllFailedMessage;\n' +
    'this.TODAY = function(){ return "2026-08-30"; };',
  sandbox
);

const line1 = { category: '人件費', amount: 20000, content: '人件費', memo: '' };
const line2 = { category: '消耗品', amount: 45000, content: 'エアコン本体代', memo: '' };
const line3 = { category: '薬剤・材料', amount: 5000, content: '材料費', memo: '' };

expenseWriteCount = 0;
const one = sandbox.saveInlineExpensesForRevenue('rev-atomic-1', '2026-08-30', [line1]);
assert(one.ok && one.expenses.length === 1, '1 expense batch save succeeds');
assert(one.expenses[0].amount === 20000 && one.expenses[0].relatedRevenueId === 'rev-atomic-1', '1 expense linked and amount kept');
assert(expenseWriteCount === 1, '1 expense uses one localStorage write');

expenseWriteCount = 0;
const two = sandbox.saveInlineExpensesForRevenue('rev-atomic-2', '2026-08-30', [line1, line2]);
assert(two.ok && two.expenses.length === 2, '2 expense batch save succeeds');
assert(two.expenses[0].amount === 20000 && two.expenses[1].amount === 45000, '2 expenses keep input order');
assert(expenseWriteCount === 1, '2 expenses use one localStorage write');

expenseWriteCount = 0;
const three = sandbox.saveInlineExpensesForRevenue('rev-atomic-3', '2026-08-30', [line1, line2, line3]);
assert(three.ok && three.expenses.length === 3, '3 expense batch save succeeds');
assert(three.expenses.map(e => e.amount).join(',') === '20000,45000,5000', '3 expenses keep amounts');
assert(three.expenses.every(e => e.relatedRevenueId === 'rev-atomic-3'), '3 expenses link the same revenue');
assert(expenseWriteCount === 1, '3 expenses use one localStorage write');

const afterSuccessExisting = Storage.getExpenseRecords().find(e => e.id === 'expense-existing-keep');
assert(JSON.stringify(afterSuccessExisting) === existingSnap, 'existing expense unchanged after successful batches');

const linked3 = Storage.getExpenseRecords().filter(e => e.relatedRevenueId === 'rev-atomic-3');
assert(linked3.length === 3, 'exactly 3 new expenses for rev-atomic-3');
assert(ProfitBrain.sumAmount(linked3) === 70000, 'expense total is 70000');
const profit = ProfitBrain.computeRevenueRowProfit({
  id: 'rev-atomic-3',
  amount: 62000,
  source: '直受け',
  grossMarginRate: 100
}, 70000);
assert(profit.grossProfit === -8000, 'profit is revenue minus expense total');

console.log('== injected failure on 2nd-equivalent write ==');
const beforeFailIds = new Set(Storage.getExpenseRecords().map(e => e.id));
const beforeFailCount = Storage.getExpenseRecords().length;
failIfExpenseLengthOver = beforeFailCount + 1;
expenseWriteCount = 0;
let failThrown = false;
let failResult;
try {
  failResult = sandbox.saveInlineExpensesForRevenue('rev-atomic-fail', '2026-08-30', [line1, line2, line3]);
} catch {
  failThrown = true;
}
failIfExpenseLengthOver = null;
assert(!failThrown, 'QuotaExceeded during batch save is not rethrown');
assert(failResult && failResult.ok === false && failResult.error === 'expense_save_failed', 'failure returns expense_save_failed');
assert(failResult.attemptedCount === 3, 'failure reports attempted count 3');
const afterFail = Storage.getExpenseRecords();
assert(afterFail.length === beforeFailCount, 'failed batch adds 0 expenses');
assert(afterFail.every(e => beforeFailIds.has(e.id)), 'failed batch does not introduce new expense ids');
assert(!afterFail.some(e => e.relatedRevenueId === 'rev-atomic-fail'), 'failed batch leaves no linked new expenses');
assert(
  JSON.stringify(afterFail.find(e => e.id === 'expense-existing-keep')) === existingSnap,
  'existing expense unchanged after failed batch'
);
assert(
  sandbox.formatInlineExpenseAllFailedMessage(failResult.attemptedCount) ===
    '売上は保存済み、今回の経費3件は1件も保存されていない',
  'failure copy names 3 unsaved expenses'
);

console.log('== retry after failure does not duplicate ==');
expenseWriteCount = 0;
const retry = sandbox.saveInlineExpensesForRevenue('rev-atomic-fail', '2026-08-30', [line1, line2, line3]);
assert(retry.ok && retry.expenses.length === 3, 'retry after failure saves all 3');
assert(expenseWriteCount === 1, 'retry uses one localStorage write');
const retryLinked = Storage.getExpenseRecords().filter(e => e.relatedRevenueId === 'rev-atomic-fail');
assert(retryLinked.length === 3, 'retry creates exactly 3 expenses, not a partial leftover plus 3');
assert(new Set(retryLinked.map(e => e.id)).size === 3, 'retry ids are unique');
assert(
  JSON.stringify(Storage.getExpenseRecords().find(e => e.id === 'expense-existing-keep')) === existingSnap,
  'existing expense unchanged after retry'
);

const empty = sandbox.saveInlineExpensesForRevenue('rev-empty', '2026-08-30', []);
assert(empty.ok && empty.expenses.length === 0, '0 expenses is a no-op success');

const snap3 = WorkCompletionBrain.createRevenueConfirmationSnapshot({
  id: 'wo-exp-atomic',
  customerName: 'テスト顧客',
  scheduledDate: '2026-08-30',
  serviceText: 'N3,R1,KN4',
  source: '直受',
  estimateAmount: 62000,
  status: 'confirmed'
}, {
  workDate: '2026-08-30',
  customerName: 'テスト顧客',
  actualService: 'N3,R1,KN4',
  service: 'その他',
  source: '直受け',
  amount: 62000,
  paymentStatus: '未入金',
  paymentDate: '2026-09-30',
  paymentMethod: '',
  paymentConcern: false,
  actualMemo: '',
  followMemo: ''
}, {
  items: [
    { category: '人件費', amount: 20000, content: '人件費', name: '人件費' },
    { category: '消耗品', amount: 45000, content: 'エアコン本体代', name: 'エアコン本体代' },
    { category: '薬剤・材料', amount: 5000, content: '材料費', name: '材料費' }
  ]
});
assert(snap3.payload.expenseTotal === 70000, 'snapshot expenseTotal stays 70000');
assert(Array.isArray(snap3.payload.expenseLines) && snap3.payload.expenseLines.length === 3, 'snapshot expenseLines stay 3');

console.log('\nAll v4.13.13 atomic inline expense checks passed.');

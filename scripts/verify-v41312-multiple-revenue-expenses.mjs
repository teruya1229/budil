/**
 * Budil v4.13.13 - 売上確定時の経費明細 0〜3件
 * Isolated in-memory fixtures only. No production localStorage.
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

const index = load('index.html');
const app = load('js/app.js');
const css = load('css/style.css');
const completionSource = load('js/work-completion-brain.js');
const revenueBrain = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of [
  'js/app.js',
  'js/work-completion-brain.js',
  'js/revenue-brain.js',
  'js/storage.js'
]) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version ==');
assert(index.includes('Budil v4.13.13'), 'index shows Budil v4.13.13');
assert(index.includes('AI経営脳みそ v4.13.13'), 'header shows v4.13.13');
assert(index.includes('js/app.js?v=4.13.13'), 'app.js cache buster is 4.13.13');
assert(index.includes('js/work-completion-brain.js?v=4.13.13'), 'work-completion-brain cache buster is 4.13.13');
assert(index.includes('css/style.css?v=4.13.13'), 'style.css cache buster is 4.13.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.13'"), 'storage version is v4.13.13');
assert(dataBackup.includes("APP_VERSION: 'v4.13.13'"), 'data-backup version is v4.13.13');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.13'"), 'verify-current pins v4.13.13');
assert(statusMd.includes('v4.13.13'), 'status.md documents v4.13.13');
assert(handoffMd.includes('v4.13.13'), 'handoff.md documents v4.13.13');
assert(decisionLog.includes('v4.13.13'), 'decision-log.md records v4.13.13');

console.log('== UI ==');
assert(index.includes('id="work-completion-inline-expense-list"'), 'work-completion has expense list');
assert(index.includes('id="revenue-inline-expense-list"'), 'manual revenue has expense list');
assert(index.includes('id="work-completion-inline-expense-amount"'), 'keeps first-row amount id');
assert(index.includes('id="revenue-inline-expense-amount"'), 'keeps first-row amount id');
assert(index.includes('data-inline-expense-add="work-completion"'), 'work-completion has add button');
assert(index.includes('data-inline-expense-add="revenue"'), 'manual revenue has add button');
assert(index.includes('経費を追加'), 'add label present');
assert(index.includes('work-completion-inline-expense-total'), 'work-completion shows expense total');
assert(index.includes('work-completion-inline-expense-profit'), 'work-completion shows profit');
assert(css.includes('.inline-expense-list'), 'scoped CSS for expense rows exists');
assert(app.includes('function addInlineExpenseRow('), 'add row helper exists');
assert(app.includes('function removeInlineExpenseRow('), 'remove row helper exists');
assert(app.includes('function updateInlineExpenseTotals('), 'totals helper exists');
assert(app.includes('collectInlineExpenseSaveItems('), 'multi-item save collector exists');
assert(app.includes("source: 'revenue-inline-expense'"), 'legacy expense source tag kept');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');

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
  ProfitBrain: {
    DAILY_EXPENSE_CATEGORIES: ['人件費', '薬剤・材料', '交通・燃料', '外注費', '広告費', '消耗品', 'その他'],
    CATEGORIES: ['人件費', '薬剤・材料', '交通・燃料', '広告費', '外注費', '手数料', '工具・部品', '車両', '通信費', 'サブスク', '事務用品', '消耗品', 'その他']
  },
  FollowUpBrain: {
    normalizeFollowUp(v) {
      return v;
    }
  },
  WorkOrderBrain: {
    normalizeWorkOrder(wo) {
      return wo;
    }
  }
});
runInContext(completionSource + '\nthis.WorkCompletionBrain = WorkCompletionBrain;', ctx);
runInContext(revenueBrain + '\nthis.RevenueBrain = RevenueBrain;', ctx);
const Brain = ctx.WorkCompletionBrain;
const RevenueBrain = ctx.RevenueBrain;

const emptyCheck = Brain.validateInlineExpenseLines([
  { name: '', amountRaw: '' },
  { name: '', amountRaw: '' }
]);
assert(emptyCheck.ok === true && emptyCheck.shouldCreate === false && emptyCheck.amount === 0, '0 filled lines are skipped');

const oneCheck = Brain.validateInlineExpenseLines([
  { name: '人件費', amountRaw: '20000' },
  { name: '', amountRaw: '' }
]);
assert(oneCheck.ok && oneCheck.shouldCreate && oneCheck.items.length === 1 && oneCheck.amount === 20000, '1 filled line is saved');

const twoCheck = Brain.validateInlineExpenseLines([
  { name: '人件費', amountRaw: '20000' },
  { name: 'エアコン本体代', amountRaw: '45000' }
]);
assert(twoCheck.ok && twoCheck.items.length === 2 && twoCheck.amount === 65000, '2 lines sum to 65000');

const threeCheck = Brain.validateInlineExpenseLines([
  { name: '人件費', amountRaw: '20000' },
  { name: 'エアコン本体代', amountRaw: '45000' },
  { name: '材料費', amountRaw: '5000' }
]);
assert(threeCheck.ok && threeCheck.items.length === 3 && threeCheck.amount === 70000, '3 lines sum to 70000');

const fourCheck = Brain.validateInlineExpenseLines([
  { name: 'A', amountRaw: '1' },
  { name: 'B', amountRaw: '2' },
  { name: 'C', amountRaw: '3' },
  { name: 'D', amountRaw: '4' }
]);
assert(fourCheck.ok === false, '4 lines are rejected');

const blankNameAmount = Brain.validateInlineExpenseLines([
  { name: '駐車場代', amountRaw: '' }
]);
assert(blankNameAmount.ok === false, 'name without amount is rejected');

const negative = Brain.validateInlineExpenseLines([{ name: '人件費', amountRaw: '-1' }]);
assert(negative.ok === false, 'negative amount is rejected');

const decimal = Brain.validateInlineExpenseLines([{ name: '人件費', amountRaw: '1.5' }]);
assert(decimal.ok === false, 'non-integer amount is rejected');

const nan = Brain.validateInlineExpenseLines([{ name: '人件費', amountRaw: 'abc' }]);
assert(nan.ok === false, 'non-numeric amount is rejected');

assert(Brain.sumInlineExpenseAmount(threeCheck.items) === 70000, 'profit base uses expense total 70000');
assert(62000 - 70000 === -8000, 'profit is revenue minus expense total');

const wo = {
  id: 'wo-exp-1',
  customerName: 'テスト顧客',
  scheduledDate: '2026-08-30',
  serviceText: 'N3,R1,KN4',
  source: '直受',
  estimateAmount: 62000,
  status: 'confirmed'
};
const input = {
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
};

const snap0 = Brain.createRevenueConfirmationSnapshot(wo, input, { shouldCreate: false });
assert(snap0.expense.shouldCreate === false, '0 expense snapshot has no create flag');
assert(!Array.isArray(snap0.payload.expenseLines), '0 expense does not write expenseLines');
assert(snap0.payload.expenseTotal == null, '0 expense does not write expenseTotal');

const snap1 = Brain.createRevenueConfirmationSnapshot(wo, input, {
  shouldCreate: true,
  input: { category: '交通・燃料', amount: 12500, content: '', memo: '' }
});
assert(snap1.expense.shouldCreate === true && snap1.expense.amount === 12500, 'legacy single expense still snapshots');
assert(snap1.payload.expenseTotal === 12500, 'legacy single writes expenseTotal');
assert(Brain.formatRevenueConfirmationMessage(snap1).includes('同時登録する経費：12,500円（交通・燃料）'), 'legacy confirm text kept');

const snap3 = Brain.createRevenueConfirmationSnapshot(wo, input, { items: threeCheck.items });
assert(snap3.payload.expenseTotal === 70000, 'new lines write expenseTotal');
assert(Array.isArray(snap3.payload.expenseLines) && snap3.payload.expenseLines.length === 3, 'new lines write expenseLines');
assert(snap3.signature.includes('"expenseTotal":70000'), 'signature includes expense total');
const msg3 = Brain.formatRevenueConfirmationMessage(snap3);
assert(msg3.includes('同時登録する経費：70,000円（3件）'), 'confirm lists 3-item total');
assert(msg3.includes('経費1：') && msg3.includes('経費3：'), 'confirm lists each line');

const oldRevenue = RevenueBrain.normalizeRevenueRecord({
  id: 'rev-old',
  workDate: '2026-08-01',
  customerName: '過去顧客',
  service: 'エアコン通常',
  source: '直受け',
  amount: 30000,
  status: '確定'
});
assert(oldRevenue.expenseLines == null && oldRevenue.expenseTotal == null, 'old revenue stays without expense array');

const newRevenue = RevenueBrain.normalizeRevenueRecord({
  id: 'rev-new',
  workDate: '2026-08-30',
  customerName: 'テスト顧客',
  service: 'その他',
  source: '直受け',
  amount: 62000,
  status: '確定',
  expenseLines: snap3.payload.expenseLines,
  expenseTotal: 70000
});
assert(newRevenue.expenseTotal === 70000 && newRevenue.expenseLines.length === 3, 'new revenue keeps lines and total');

assert(app.includes('recoverStorageForRevenueConfirmationIfNeeded('), 'v4.13.11 storage recovery call kept');
assert(app.includes('validateCurrentWorkCompletionSession('), 'session/signature check kept');
assert(app.includes('confirmRevenueSaveWithDuplicateCheck('), 'duplicate revenue guard kept');

console.log('\nAll v4.13.13 multiple revenue expense checks passed.');

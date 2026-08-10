/**
 * Budil v4.13.4 - 売上と経費の紐づけ・売上確定時の経費同時入力 verify
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const profitBrainSrc = load('js/profit-brain.js');
const revenueBrainSrc = load('js/revenue-brain.js');
const storageSrc = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const css = load('css/style.css');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/profit-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('Budil v4.13.4'), 'index.html shows Budil v4.13.4');
assert(html.includes('js/app.js?v=4.13.4'), 'app.js cache buster is v4.13.4');
assert(html.includes('js/profit-brain.js?v=4.13.4'), 'profit-brain cache buster is v4.13.4');
assert(html.includes('css/style.css?v=4.13.4'), 'style.css cache buster is v4.13.4');
assert(storageSrc.includes("BUDIL_VERSION: 'v4.13.4'"), 'storage version is v4.13.4');
assert(dataBackup.includes("APP_VERSION: 'v4.13.4'"), 'data-backup version is v4.13.4');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.4'"), 'verify-current pins v4.13.4');
assert(statusMd.includes('v4.13.4'), 'status.md documents v4.13.4');
assert(handoffMd.includes('v4.13.4'), 'handoff.md documents v4.13.4');
assert(decisionLog.includes('v4.13.4'), 'decision-log.md records v4.13.4');

console.log('== UI: daily / profit / inline expense ==');
assert(html.includes('id="daily-expense-revenue"'), 'daily expense has revenue select');
assert(html.includes('紐づけ売上（任意）'), 'uses 紐づけ売上（任意） label');
assert(html.includes('id="work-completion-inline-expense-amount"'), 'work completion has inline expense amount');
assert(html.includes('id="revenue-inline-expense-amount"'), 'revenue form has inline expense amount');
assert(html.includes('この売上の経費（任意）'), 'inline expense heading present');
assert(css.includes('.revenue-inline-expense-block'), 'scoped CSS for inline expense exists');
assert(css.includes('.expense-revenue-select'), 'scoped CSS for revenue select exists');
{
  const formMatch = html.match(/<form id="profit-expense-form"[\s\S]*?<\/form>/);
  assert(!!formMatch, 'profit-expense-form exists');
  const formHtml = formMatch[0];
  const revIdx = formHtml.indexOf('id="profit-expense-revenue"');
  const advIdx = formHtml.indexOf('expense-advanced-settings');
  assert(revIdx >= 0 && advIdx > revIdx, 'profit related revenue is outside advanced settings');
  assert(!/<details class="expense-advanced-settings">[\s\S]*id="profit-expense-revenue"/.test(formHtml),
    'profit-expense-revenue not nested in advanced settings');
}
assert(app.includes('function populateExpenseRevenueSelect('), 'shared revenue select helper exists');
assert(app.includes('function refreshExpenseRevenueSelects('), 'refresh helper exists');
assert(app.includes('function saveInlineExpenseForRevenue('), 'inline expense save helper exists');
assert(app.includes("source: 'revenue-inline-expense'"), 'inline expense source tag present');
assert(app.includes('粗利率（経費反映後）'), 'profit table uses expense-adjusted rate label');

console.log('== load brains / storage ==');
const localStore = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => localStore.set(k, String(v)),
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
const { ProfitBrain, RevenueBrain, Storage } = sandbox;
assert(!!ProfitBrain && !!RevenueBrain && !!Storage, 'brains and Storage loaded');

const mkRev = (id, patch = {}) => ({
  id,
  workDate: '2026-08-10',
  customerName: 'テスト顧客A',
  service: 'エアコン通常',
  amount: 10000,
  status: '確定',
  source: 'くらしのマーケット',
  grossMarginRate: 80,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
  ...patch
});

console.log('== profit calc 10000 / 80% / 2000 ==');
{
  const profit = ProfitBrain.computeRevenueRowProfit(mkRev('r1'), 2000);
  assert(profit.marginProfit === 8000, 'margin profit after share rate is 8000');
  assert(profit.grossProfit === 6000, 'expense-adjusted profit is 6000');
  assert(Math.round(profit.grossRate) === 60, 'display grossRate is 60');
  assert(Math.round(profit.expenseAdjustedGrossRate) === 60, 'expenseAdjustedGrossRate is 60');
  assert(profit.marginRate === 80, 'marginRate remains 80');
  const row = ProfitBrain.getRevenueProfitRows(
    [mkRev('r1')],
    [{ id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' }],
    [],
    []
  )[0];
  assert(row.grossProfit === 6000 && Math.round(row.grossRate) === 60, 'revenue row uses expense-adjusted values');
  assert(row.marginRate === 80, 'row keeps marginRate 80');
}

console.log('== multi expense sum / other revenue unchanged ==');
{
  const revenues = [mkRev('r1'), mkRev('r2', { customerName: 'テスト顧客B', amount: 20000, grossMarginRate: 100 })];
  const expenses = [
    { id: 'e1', relatedRevenueId: 'r1', amount: 1200, date: '2026-08-10', category: '交通・燃料' },
    { id: 'e2', relatedRevenueId: 'r1', amount: 800, date: '2026-08-10', category: '消耗品' },
    { id: 'e3', relatedRevenueId: 'r2', amount: 500, date: '2026-08-10', category: '消耗品' }
  ];
  const rows = ProfitBrain.getRevenueProfitRows(revenues, expenses, [], []);
  const r1 = rows.find(r => r.revenueId === 'r1');
  const r2 = rows.find(r => r.revenueId === 'r2');
  assert(r1.expenseTotal === 2000, 'multiple linked expenses are summed once');
  assert(r1.grossProfit === 6000, 'r1 profit after multi expenses is 6000');
  assert(r2.expenseTotal === 500, 'other revenue keeps its own expenses');
  assert(r2.grossProfit === 19500, 'other revenue profit unchanged by r1 expenses');
}

console.log('== monthly total no double deduction / unlinked ==');
{
  const revenues = [mkRev('r1'), mkRev('r2', { amount: 5000, grossMarginRate: 100 })];
  const expenses = [
    { id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' },
    { id: 'e2', relatedRevenueId: '', amount: 3000, date: '2026-08-11', category: '広告費' }
  ];
  const summary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues,
    expenses,
    workOrders: []
  });
  // margin: 8000 + 5000 = 13000; all month expenses 5000 once => 8000
  assert(summary.monthExpense === 5000, 'month expense totals all expenses once');
  assert(summary.monthGrossProfit === 8000, 'month gross profit deducts all expenses once');
  assert(summary.unlinkedTotal === 3000, 'unlinked expense remains diagnosed');
  const rows = ProfitBrain.getRevenueProfitRows(revenues, expenses, [], []);
  assert(rows.find(r => r.revenueId === 'r1').expenseTotal === 2000, 'unlinked not allocated to revenue row');
  assert(rows.find(r => r.revenueId === 'r2').expenseTotal === 0, 'unlinked not allocated to other revenue');
}

console.log('== service/source aggregation reflects linked expenses ==');
{
  const revenues = [mkRev('r1')];
  const expenses = [{ id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' }];
  const service = ProfitBrain.buildServiceRows(revenues, expenses, [])[0];
  assert(service.grossProfit === 6000, 'service row profit reflects linked expense');
  assert(Math.round(service.grossRate) === 60, 'service row rate is expense-adjusted');
  const source = ProfitBrain.buildSourceRows(revenues, expenses, [], [])[0];
  assert(source.grossProfit === 6000, 'source row profit reflects linked expense');
}

console.log('== storage delete revenue unlinks expenses only ==');
{
  localStore.clear();
  // seed enough revenues so delete is allowed
  const r1 = Storage.addRevenueRecord(mkRev('seed1', { id: undefined, customerName: 'テスト顧客A' }));
  const r2 = Storage.addRevenueRecord(mkRev('seed2', { id: undefined, customerName: 'テスト顧客B', amount: 5000 }));
  assert(!!r1 && !!r2, 'seed revenues created');
  const exp = Storage.addExpenseRecord({
    date: '2026-08-10',
    category: '交通・燃料',
    amount: 2000,
    relatedRevenueId: r1.id,
    memo: 'fixture',
    source: 'manual'
  });
  assert(exp.relatedRevenueId === r1.id, 'expense linked before delete');
  const del = Storage.deleteRevenueRecord(r1.id);
  assert(del.ok === true, 'revenue delete succeeds');
  const afterExp = Storage.getExpenseRecords().find(e => e.id === exp.id);
  assert(!!afterExp, 'expense record remains after revenue delete');
  assert(String(afterExp.relatedRevenueId || '') === '', 'relatedRevenueId cleared');
  const orphans = Storage.getExpenseRecords().filter(e => e.relatedRevenueId === r1.id);
  assert(orphans.length === 0, 'no orphan relatedRevenueId remains');
}

console.log('== app.js wiring / guards ==');
assert(app.includes("relatedRevenueId"), 'daily/profit paths reference relatedRevenueId');
assert(app.includes('handleDailyExpenseQuickSubmit'), 'daily expense submit remains');
assert(app.includes("document.getElementById('daily-expense-revenue')"), 'daily submit reads revenue select');
assert(app.includes('validateInlineExpenseInput'), 'inline expense validation exists');
assert(app.includes('inlineExpenseSaveGuard'), 'double-submit guard exists');
assert(app.includes('売上は保存済みです。経費のみ未保存です'), 'partial save message exists');
assert(app.includes('updateRevenueLinkedExpenseSummary'), 'existing linked expense summary exists');
assert(app.includes('saveInlineExpenseForRevenue(newRecord.id'), 'work completion saves inline expense after revenue id');
assert(app.includes('saveInlineExpenseForRevenue(revId, data.workDate, inlineInput)'), 'revenue form saves inline expense');
assert(app.includes('submitPastRecoveryFromModal(wo, input, { shouldCreate:'), 'past recovery passes inline expense');
assert(!app.includes('localStorage.clear('), 'no localStorage.clear');
assert(dataBackup.includes('budil_expense_records') || dataBackup.includes('EXPENSE'), 'backup still covers expense records');
assert(!app.includes('自動紐づけ') && !storageSrc.includes('autoLinkExpense'), 'no auto-link migration');

console.log('\nAll v4.13.4 revenue-linked expense flow checks passed.');

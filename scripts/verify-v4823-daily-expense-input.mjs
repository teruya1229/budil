/**
 * Budil v4.9.3 daily expense input verification.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
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
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

function readSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (rel.startsWith('.git/') || rel.startsWith('recovery/') || rel.startsWith('scripts/')) continue;
    if (rel === 'scripts/verify-v4823-daily-expense-input.mjs') continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

for (const file of ['app.js', 'storage.js', 'profit-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const profitJs = load('js/profit-brain.js');
const backupJs = load('js/data-backup.js');
const css = load('css/style.css');

console.log('== v4.9.3 daily expense input ==');

// A. UI
assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.9.3'), 'header version should be v4.9.3');
assert(indexHtml.includes('Budil v4.9.3'), 'sidebar version should be v4.9.3');
assert(indexHtml.includes('js/app.js?v=4.9.3'), 'app.js cache buster should be v4.9.3');

assert(indexHtml.includes('daily-section-expense'), 'daily expense section should exist');
assert(indexHtml.includes('daily-section-title">\u7d4c\u8cbb\u5165\u529b'), 'daily expense title should use \u7d4c\u8cbb\u5165\u529b');
assert(indexHtml.includes('daily-expense-quick-form'), 'daily expense form should exist');
assert(indexHtml.includes('daily-expense-monthly-note'), 'monthly result note should exist');
assert(indexHtml.includes('\u6708\u6b21\u5b9f\u7e3e\u5165\u529b\u6e08\u307f\u306e\u6708\u306f\u3001\u5229\u76ca\u30b5\u30de\u30ea\u30fc\u306f\u6708\u6b21\u5b9f\u7e3e\u3092\u512a\u5148\u3057\u307e\u3059'), 'monthly note text should exist');

const queuePos = indexHtml.indexOf('daily-section-revenue-queue');
const expensePos = indexHtml.indexOf('daily-section-expense');
const assistPos = indexHtml.indexOf('daily-section-revenue-assist');
const schedulePos = indexHtml.indexOf('daily-section-schedule');
assert(queuePos > -1 && expensePos > queuePos, 'expense section should be below revenue queue');
assert(expensePos < schedulePos, 'expense section should be above schedule');
assert(schedulePos < assistPos, 'schedule section should be above manual revenue assist');

const expenseBlock = indexHtml.slice(expensePos, assistPos);
assert(indexHtml.includes('<div id="daily-section-expense"'), 'daily expense should be a div section, not details');
assert(indexHtml.includes('<details class="daily-section daily-section-revenue-assist"'), 'manual revenue assist should remain details');

// B. Save handling (static + dynamic)
assert(appJs.includes('handleDailyExpenseQuickSubmit'), 'daily expense submit handler should exist');
assert(appJs.includes('Storage.addExpenseRecord'), 'should use Storage.addExpenseRecord');
assert(appJs.includes("source: 'daily-action-expense'"), 'source should be daily-action-expense');
assert(appJs.includes("paymentMethod: '\u73fe\u91d1'"), 'paymentMethod should default to \u73fe\u91d1');
assert(appJs.includes('buildDailyExpenseMemo'), 'memo builder should exist');
assert(appJs.includes('clearDailyExpenseForm'), 'form clear after save should exist');
assert(appJs.includes('showDailyExpenseSavedNotice'), 'post-save notice should exist');
assert(appJs.includes('\u5229\u76ca\u7ba1\u7406\u3092\u898b\u308b'), 'profit view link should exist');
assert(!appJs.match(/function renderDailyActionTasks[\s\S]{0,1200}addExpenseRecord/),
  'renderDailyActionTasks should not auto-save expenses');

const expenseHandler = appJs.match(/function handleDailyExpenseQuickSubmit[\s\S]{0,900}/);
assert(expenseHandler && !expenseHandler[0].includes('upsertMonthlyResult'), 'daily expense should not call upsertMonthlyResult');
assert(!expenseHandler[0].includes('saveMonthlyResult'), 'daily expense should not write monthly results');

const { ctx } = createSandbox();
runInContext(`
  const record = Storage.addExpenseRecord({
    date: '2026-06-28',
    category: '\u4ea4\u901a\u30fb\u71c3\u6599',
    amount: 500,
    paymentMethod: '\u73fe\u91d1',
    memo: '\u5185\u5bb9\uff1a\u99c5\u8eca\u5834\u4ee3\\n\u30e1\u30e2\uff1a\u56fd\u969b\u901a\u308a\u8fd1\u304f',
    taxIncluded: true,
    isRecurring: false,
    source: 'daily-action-expense'
  });
  globalThis.__saved = record;
  globalThis.__list = Storage.getExpenseRecords();
  globalThis.__monthly = Storage.getMonthlyResults();
`, ctx);

const saved = ctx.__saved;
const list = ctx.__list;
const monthly = ctx.__monthly;
assert(list.length === 1, 'expense should append to budil_expense_records');
assert(saved.amount === 500 && typeof saved.amount === 'number', 'amount should be numeric');
assert(saved.paymentMethod === '\u73fe\u91d1', 'paymentMethod should be \u73fe\u91d1');
assert(saved.source === 'daily-action-expense', 'source should be daily-action-expense');
assert(saved.memo.includes('\u99c5\u8eca\u5834\u4ee3'), 'memo should include content');
assert(!monthly || monthly.length === 0, 'should not auto-write budil_monthly_results');

// C. Categories
assert(profitJs.includes("'\u4eba\u4ef6\u8cbb'"), '\u4eba\u4ef6\u8cbb category should exist in ProfitBrain');
assert(profitJs.includes('DAILY_EXPENSE_CATEGORIES'), 'daily categories constant should exist');
assert(profitJs.includes("'\u4ea4\u901a\u30fb\u71c3\u6599'"), '\u4ea4\u901a\u30fb\u71c3\u6599 should remain');
assert(!profitJs.includes('\u99c5\u8eca\u5834\u30fb\u9ad8\u901f'), '\u99c5\u8eca\u5834\u30fb\u9ad8\u901f should not be a separate category');
const dailyCats = profitJs.match(/DAILY_EXPENSE_CATEGORIES:\s*\[([\s\S]*?)\]/);
assert(dailyCats, 'DAILY_EXPENSE_CATEGORIES block should exist');
const dailyCatText = dailyCats[1];
assert(dailyCatText.includes('\u4eba\u4ef6\u8cbb'), 'daily categories should include \u4eba\u4ef6\u8cbb');
assert(dailyCatText.includes('\u4ea4\u901a\u30fb\u71c3\u6599'), 'daily categories should include \u4ea4\u901a\u30fb\u71c3\u6599');
assert(!dailyCatText.includes('\u624b\u6570\u6599'), 'daily categories should not expose full catalog');

const originalCategories = [
  '\u85ac\u5264\u30fb\u6750\u6599', '\u4ea4\u901a\u30fb\u71c3\u6599', '\u5e83\u544a\u8cbb', '\u5916\u6ce8\u8cbb', '\u624b\u6570\u6599', '\u5de5\u5177\u30fb\u90e8\u54c1',
  '\u8eca\u4e21', '\u901a\u4fe1\u8cbb', '\u30b5\u30d6\u30b9\u30af', '\u4e8b\u52d9\u7528\u54c1', '\u6d88\u8017\u54c1', '\u305d\u306e\u4ed6'
];
for (const cat of originalCategories) {
  assert(profitJs.includes(`'${cat}'`), `existing category ${cat} should remain`);
}

// D. Monthly results relationship
assert(!expenseHandler[0].includes('upsertMonthlyResult'),
  'daily expense path must not upsert monthly results');

// E. Data safety
assert(storageJs.includes("'budil_expense_records'"), 'expense records key should exist');
assert(storageJs.includes('CRITICAL_BACKUP_KEYS'), 'critical backup keys should exist');
const backupBlock = storageJs.match(/CRITICAL_BACKUP_KEYS:\s*\[([\s\S]*?)\]/);
assert(backupBlock && backupBlock[1].includes('budil_expense_records'), 'expense records should be backup target');
assert(storageJs.includes('\u652f\u51fa\u30c7\u30fc\u30bf\uff08budil_expense_records\uff09'), 'expense records should be in diagnostics');
assert(storageJs.includes('PROTECTED_DELETE_KEYS'), 'protected delete keys should exist');
const protectedBlock = storageJs.match(/PROTECTED_DELETE_KEYS:\s*\[([\s\S]*?)\]/);
assert(protectedBlock && protectedBlock[1].includes('budil_expense_records'), 'expense records should be protected');
assert(backupJs.includes('budil_expense_records'), 'data-backup should include expense records');

let hasClear = false;
for (const file of readSourceFiles(join(root, 'js'))) {
  const src = readFileSync(file, 'utf8');
  if (src.includes('localStorage.' + 'clear(')) hasClear = true;
}
assert(!hasClear, 'direct full storage clear must not exist in js');

assert(appJs.includes('BUDIL DELETE'), 'BUDIL DELETE guard should remain');

// F. Existing maintenance
assert(appJs.includes('renderDailyRevenueConfirmationQueue'), 'v4.8.21 revenue queue should remain');
assert(appJs.includes('getRevenueConfirmationWorkOrderIds'), 'v4.9.3 revenue hardening should remain');
assert(appJs.includes('external-check-dash-brief'), 'v4.8.20 external check summary should remain');
assert(appJs.includes('AnalyticsBrain'), 'v4.8.16 analytics should remain');
assert(indexHtml.includes('calendar-candidate-notice'), 'v4.8.12 past recovery notice should remain');
assert(appJs.includes("if (p.sourceKey === 'profit') return"), 'daily priority should suppress duplicate expense prompts');
assert(css.includes('overflow-x: hidden') || css.includes('overflow-x:hidden') || css.includes('min-width: 0'),
  'layout should avoid horizontal scroll patterns');

console.log('All v4.9.3 daily expense input checks passed.');

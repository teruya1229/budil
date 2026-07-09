/**
 * Budil v4.10.1 executive home information hierarchy verification.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

execSync(`node --check "${join(root, 'js', 'app.js')}"`, { stdio: 'inherit' });

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const css = load('css/style.css');

console.log('== v4.10.1 executive home hierarchy ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.3'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.3'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.3'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('id="exec-home-priority-action"'), 'priority action block should exist');
assert(indexHtml.includes('exec-home-today-tasks'), 'today tasks section should exist');
assert(indexHtml.includes('exec-home-revenue-profit'), 'monthly metrics section should exist');
assert(indexHtml.includes('id="exec-home-profit-diagnostics"'), 'exec profit diagnostics should exist');
assert(indexHtml.includes('id="exec-home-expense-breakdown"'), 'exec expense breakdown should exist');
assert(indexHtml.includes('id="exec-home-monthly-closing-check"'), 'exec monthly closing should remain');
assert(indexHtml.includes('profit-operations-diagnostics'), 'profit view diagnostics should remain');
assert(indexHtml.includes('profit-expense-breakdown'), 'profit view expense breakdown should remain');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics should remain');
assert(indexHtml.includes('card-revenue-summary-collapse'), 'dash revenue summary should be collapsible');

const priorityIdx = indexHtml.indexOf('exec-home-priority-action');
const todayTasksIdx = indexHtml.indexOf('exec-home-today-tasks');
const revenueProfitIdx = indexHtml.indexOf('exec-home-revenue-profit');
const profitIdx = indexHtml.indexOf('exec-home-profit-diagnostics');
const monthlyIdx = indexHtml.indexOf('exec-home-monthly-closing-check');
const expenseIdx = indexHtml.indexOf('exec-home-expense-breakdown');
assert(priorityIdx > 0 && todayTasksIdx > priorityIdx, 'priority action should precede today tasks');
assert(revenueProfitIdx > todayTasksIdx, 'today tasks should precede monthly metrics');
assert(monthlyIdx > revenueProfitIdx && profitIdx > monthlyIdx, 'monthly metrics → monthly closing → profit diagnostics order');
assert(expenseIdx > monthlyIdx, 'expense breakdown should follow monthly closing in html');

assert(appJs.includes('renderExecutivePriorityAction'), 'priority action renderer should remain');
assert(appJs.includes('renderExecutiveHome'), 'executive home renderer should remain');
assert(appJs.includes("renderMonthlyClosingCheck('exec-home-monthly-closing-check', { compact: true"), 'exec monthly closing should use compact mode');
assert(appJs.includes("targetId: 'exec-home-profit-diagnostics', compact: true"), 'exec profit diagnostics should use compact mode');
assert(appJs.includes("targetId: 'exec-home-expense-breakdown'"), 'exec expense breakdown should render');
assert(appJs.includes('exec-home-priority-action-message'), 'priority action should have message text');
assert(appJs.includes("renderMonthlyClosingCheck('revenue-monthly-closing-check'"), 'revenue monthly closing check should remain');

assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index should not use \u652f\u51fa\u767b\u9332');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use \u652f\u51fa\u767b\u9332');
assert(indexHtml.includes('\u7d4c\u8cbb\u5165\u529b'), 'expense input wording should remain');
assert(css.includes('exec-home-ops-flow'), 'ops flow styles should exist');
assert(css.includes('exec-home-priority-action'), 'priority action styles should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'), 'layout should avoid horizontal scroll');

console.log('All v4.10.1 executive home hierarchy checks passed.');

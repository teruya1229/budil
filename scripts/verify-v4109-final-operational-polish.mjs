/**
 * Budil v4.10.20 — final operational polish verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('== v4.10.20 final operational polish ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueSummaryBrain = load('js/revenue-summary-brain.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.26'), 'index.html should show v4.10.26');
assert(indexHtml.includes('js/app.js?v=4.10.26'), 'app.js cache buster should be v4.10.26');

const forbiddenUiTerms = ['売上登録', '作業後確定待ち', '作業後売上確定'];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

assert(indexHtml.includes('売上確定、入金予定'), 'sidebar hint should use 売上確定');
assert(indexHtml.includes('作業予定から売上確定が通常'), 'revenue subtitle should describe primary flow');
assert(indexHtml.includes('revenue-flow-hint'), 'revenue flow hint should explain entry hierarchy');
assert(indexHtml.includes('登録対象を売上確定'), 'past recovery button should say 売上確定');
assert(indexHtml.includes('売上明細を手入力'), 'manual revenue entry label should remain');
assert(indexHtml.includes('calendar-week-scope-note'), 'week schedule scope note should exist');
assert(
  indexHtml.includes('onboarding-guide-data') && indexHtml.includes('card-onboarding-guide-collapse'),
  'data management onboarding should be collapsible'
);

assert(revenueSummaryBrain.includes('displayCount'), 'upcoming summary should expose displayCount');
assert(revenueSummaryBrain.includes('displayTotal'), 'upcoming summary should expose displayTotal');
assert(appJs.includes('summary.displayCount'), 'app should render header from displayCount');
assert(appJs.includes('calendar-candidate-saved-more'), 'imported schedule list should use detail actions');
assert(appJs.includes('売上確定済みの明細のみ'), 'revenue analysis note should avoid 売上登録');

assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import maintained');
assert(indexHtml.includes('id="view-revenue-analysis"'), 'v4.10.5 revenue analysis maintained');
assert(appJs.includes('renderRevenueConfirmationQueueBlock'), 'v4.10.8 revenue queue block maintained');
assert(appJs.includes('sortByScheduledDateTimeAsc'), 'v4.10.7 date sort should remain');

assert(css.includes('v4.10.20'), 'css should include v4.10.20 polish styles');
assert(css.includes('calendar-candidate-saved-more'), 'css should style imported schedule detail actions');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4108-operational-consistency.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 final operational polish checks passed.');

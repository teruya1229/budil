/**
 * Budil v4.10.4 action flow simplification verification.
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

console.log('== v4.10.4 action flow simplification ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrain = load('js/revenue-brain.js');
const revenueSummaryBrain = load('js/revenue-summary-brain.js');
const workCompletionBrain = load('js/work-completion-brain.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.11.13'), 'index.html should show v4.11.13');
assert(!indexHtml.includes('<option value="完了">完了</option>'), 'revenue status select should not include 完了');
assert(
  revenueBrain.includes('displayRevenueStatus') && revenueBrain.includes("status === '完了'"),
  'revenue-brain should map legacy 完了 to 確定 for display'
);
assert(
  revenueBrain.includes("STATUSES: ['予定', '確定', 'キャンセル']"),
  'revenue-brain STATUSES should exclude 完了 from form options'
);
assert(
  revenueSummaryBrain.includes("CONFIRMED_STATUSES: ['確定', '完了']"),
  'aggregation should still treat legacy 完了 as confirmed without migration'
);

assert(indexHtml.includes('id="revenue-lead-row"') && indexHtml.includes('hidden'), 'revenue lead linking UI should be hidden');
assert(indexHtml.includes('lead-revenue-history-section hidden'), 'sales lead revenue history should be hidden');
assert(indexHtml.includes('revenue-sales-outcome-card') && indexHtml.includes('hidden'), 'revenue sales outcome card should be hidden');

assert(appJs.includes('navigateAfterAction'), 'app.js should define navigateAfterAction helper');
assert(appJs.includes('showActionResult'), 'app.js should define showActionResult helper');
assert(appJs.includes("'calendar-import-save'"), 'calendar import save should navigate after action');
assert(appJs.includes("'revenue-confirm'"), 'revenue confirm should navigate after action');
assert(appJs.includes("'revenue-save'"), 'revenue save should navigate after action');
assert(appJs.includes("'expense-save'"), 'expense save should navigate after action');
assert(appJs.includes("'monthly-results-save'"), 'monthly results save should navigate after action');
assert(appJs.includes('formatRevenueStatusBadge'), 'revenue list should use unified status display');
assert(!appJs.includes('data-create-lead-revenue'), 'revenue list should not show lead create buttons');
assert(appJs.includes('normalizeRevenueStatusForSave'), 'revenue save should normalize legacy status');

assert(
  !workCompletionBrain.includes('leadId: input.leadId') || workCompletionBrain.includes('createRevenuePayloadFromWorkOrder'),
  'work completion revenue payload should be inspectable'
);
assert(
  !/leadId:\s*input\.leadId/.test(workCompletionBrain),
  'work completion should not assign leadId on new revenue'
);

assert(!appJs.includes('localStorage.clear()'), 'app.js must not use localStorage.clear()');

const leadLinkPromptPatterns = [
  '売上を営業先に紐付け',
  '未紐付け売上があります',
  '営業先と紐付けると',
  "type: 'unlinked-revenue'",
  'unlinked-revenue',
  '紐付け売上',
  '売上発生営業先',
  '成約営業先'
];
for (const pattern of leadLinkPromptPatterns) {
  assert(!appJs.includes(pattern), `app.js should not show lead-link prompt: ${pattern}`);
  assert(!revenueBrain.includes(pattern), `revenue-brain.js should not show lead-link prompt: ${pattern}`);
}
assert(!indexHtml.includes('売上を営業先に紐付け'), 'index.html should not prompt revenue lead linking');
assert(!indexHtml.includes('未紐付け売上があります'), 'index.html should not warn about unlinked revenue');
assert(indexHtml.includes('id="view-sales"'), 'sales view should remain');
assert(indexHtml.includes('revenue-lead-row') && indexHtml.includes('hidden'), 'revenue lead linking UI should stay hidden');
assert(indexHtml.includes('class="hidden">紐付け営業先</th>'), 'revenue list lead column should stay hidden');

assert(
  indexHtml.includes('確定売上明細には入りません') || indexHtml.includes('確定売上には入りません') || appJs.includes('売上明細には登録されません'),
  'calendar import should still warn that import does not add confirmed revenue'
);
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import button should remain');
assert(indexHtml.includes('btn-calendar-candidate-parse'), 'paste import button should remain');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

assert(
  css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden') || css.includes('overflow-x: clip'),
  'layout should avoid horizontal scroll at 390px'
);

execSync('node scripts/verify-v4103-local-calendar-json-workflow.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.4 action flow simplification checks passed.');

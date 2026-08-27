/**
 * Budil v4.12.26 - 集客チェック：薄色カード文字色修正 verify
 *
 * Symptom: 「集客チェック」画面（#view-analytics）の白・薄紫背景カード
 * （.analytics-today-conclusion / .analytics-summary-item strong /
 *  .analytics-top-card / .analytics-action-card / .analytics-pickup-card）が
 * ダークテーマ用の薄い文字色（body { color: var(--text) } / --text: #e6edf3）を
 * 継承し、白・薄紫背景上でほぼ読めなくなっていた。
 *
 * Fix: css/style.css に #view-analytics 配下限定のスコープ付きルールを追加し、
 * 上記カード・strong・p・.analytics-meta・.analytics-action-card 内の
 * .btn-secondary に明示的な暗色文字・背景・borderを指定した。
 * body / 共通 .card / 共通 .btn-secondary などの全体スタイルは変更していない。
 * 集客データの計算・並び順・ボタン処理は変更していない（CSSのみ）。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const css = load('css/style.css');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/analytics-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('v4.13.11'), 'index.html shows current version v4.13.11');
assert(html.includes('js/app.js?v=4.13.11'), 'app.js cache buster is current v4.13.11');
assert(html.includes('css/style.css?v=4.13.11'), 'style.css cache buster is current v4.13.11');
assert(html.includes('js/analytics-brain.js?v=4.13.11'), 'analytics-brain.js cache buster is current v4.13.11');
assert(storage.includes("BUDIL_VERSION: 'v4.13.11'"), 'storage version is current v4.13.11');
assert(dataBackup.includes("APP_VERSION: 'v4.13.11'"), 'data-backup version is current v4.13.11');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.11'"), 'verify-current pins current v4.13.11');
assert(!html.includes('?v=4.12.25'), 'old cache buster v4.12.25 should be gone');
assert(statusMd.includes('v4.12.26'), 'status.md documents v4.12.26');
assert(handoffMd.includes('v4.12.26'), 'handoff.md documents v4.12.26');
assert(decisionLog.includes('v4.12.26'), 'decision-log.md records v4.12.26');

console.log('== fix marker / scope: every new selector is under #view-analytics ==');
const markerIdx = css.indexOf('v4.12.26 集客チェック');
assert(markerIdx !== -1, 'css contains the v4.12.26 analytics contrast fix marker comment');
const afterMarker = css.slice(markerIdx);
const blockEndIdx = afterMarker.indexOf('.browser-bantou-sample-details');
assert(blockEndIdx !== -1, 'fix block is bounded before the next unrelated CSS section');
const fixBlock = afterMarker.slice(0, blockEndIdx);
const selectorLines = fixBlock
  .split('\n')
  .filter((line) => line.includes('{') && !line.trim().startsWith('/*'));
assert(selectorLines.length >= 7, 'fix block defines at least 7 rule sets');
for (const line of selectorLines) {
  const selectors = line.split('{')[0].split(',').map((s) => s.trim()).filter(Boolean);
  for (const sel of selectors) {
    assert(sel.startsWith('#view-analytics'), `selector "${sel}" is scoped to #view-analytics`);
  }
}

console.log('== explicit dark text: light-background cards no longer inherit white text ==');
assert(
  /#view-analytics \.analytics-today-conclusion\s*\{\s*color:\s*#111827;\s*\}/.test(css),
  '.analytics-today-conclusion has an explicit dark text color (does not inherit --text)'
);
assert(
  /#view-analytics \.analytics-summary-item strong\s*\{\s*color:\s*#111827;\s*\}/.test(css),
  '.analytics-summary-item strong has an explicit dark text color (does not inherit white)'
);
assert(
  /#view-analytics \.analytics-summary-priority\s*\{[^}]*color:\s*#334155;[^}]*\}/.test(css),
  '.analytics-summary-priority keeps an explicit readable supplemental color'
);
assert(
  /#view-analytics \.analytics-summary-priority\s*\{[^}]*background:\s*#eef2ff;[^}]*\}/.test(css),
  '.analytics-summary-priority gets its own light background (it sits directly on the dark card, not a light island, so text-color-only would not fix it)'
);
assert(
  /#view-analytics \.analytics-top-card,\s*#view-analytics \.analytics-action-card,\s*#view-analytics \.analytics-pickup-card\s*\{\s*color:\s*#111827;\s*\}/.test(css),
  '.analytics-top-card / .analytics-action-card / .analytics-pickup-card get explicit dark text'
);
assert(
  /#view-analytics \.analytics-top-card strong,\s*#view-analytics \.analytics-action-card strong,\s*#view-analytics \.analytics-pickup-card strong\s*\{/.test(css),
  'page-name <strong> inside top/action/pickup cards gets explicit dark text'
);
assert(css.includes('#view-analytics .analytics-top-card .analytics-meta'), 'top-card supplemental text (表示/直帰率) has explicit color, scoped to this card only');
assert(css.includes('#view-analytics .analytics-action-card .analytics-meta'), 'action-card judgment text has explicit color, scoped to this card only');
assert(css.includes('#view-analytics .analytics-pickup-card .analytics-meta'), 'pickup-card judgment text has explicit color, scoped to this card only');
assert(!/^\.analytics-meta\s*\{[^}]*color:\s*#111827/m.test(css), 'the unscoped global .analytics-meta rule is not overridden globally (other panels like preview/detail keep their own color)');

console.log('== secondary button on the light action card is readable (no plain opacity trick) ==');
assert(
  /#view-analytics \.analytics-action-card \.btn-secondary \{\s*\n\s*border-color:\s*#94a3b8;\s*\n\s*color:\s*#1e293b;\s*\n\s*background:\s*#fff;\s*\n\}/.test(css),
  'action-card .btn-secondary has explicit dark text + white background + visible border'
);
assert(
  css.includes('#view-analytics .analytics-action-card .btn-secondary:hover:not(:disabled)'),
  'action-card .btn-secondary hover state keeps text readable'
);
assert(
  css.includes('#view-analytics .analytics-action-card .btn-secondary:disabled'),
  'action-card .btn-secondary disabled state keeps text readable while looking disabled'
);
assert(
  !/#view-analytics \.analytics-action-card \.btn-secondary:disabled \{\s*\n\s*opacity:\s*0\.[1-9]/.test(css),
  'disabled state does not rely on lowering opacity alone (background/text/border are explicit)'
);

console.log('== no changes to global body / common .card / common .btn-secondary ==');
assert(
  /body\s*\{\s*\n\s*font-family: var\(--font\);\s*\n\s*background: var\(--bg\);\s*\n\s*color: var\(--text\);\s*\n\s*line-height: 1\.6;\s*\n\s*min-height: 100vh;\s*\n\}/.test(css),
  'global body rule is byte-for-byte unchanged'
);
assert(
  /^\.btn-secondary \{\s*\n\s*background: transparent;\s*\n\s*border: 1px solid var\(--border\);\s*\n\s*color: var\(--text\);\s*\n\}/m.test(css),
  'common .btn-secondary rule is byte-for-byte unchanged'
);
assert(!/^\.card \{[^}]*color:/m.test(css), 'common .card rule still has no forced text color override');

console.log('== no acquisition data / calculation / sort / button processing changes ==');
assert(app.includes('function renderAnalyticsSummary(ctx)'), 'renderAnalyticsSummary is unchanged in shape');
assert(app.includes("conclusionEl.innerHTML = conclusion"), 'today-conclusion rendering logic is unchanged');
assert(app.includes('function renderAnalyticsTopDemand(ctx)'), 'renderAnalyticsTopDemand is unchanged in shape');
assert(app.includes('function renderAnalyticsActionsList(ctx)'), 'renderAnalyticsActionsList is unchanged in shape');
assert(app.includes("items = (ctx.records || []).filter(r => r.status === 'open').slice(0, 8)"), 'actions list filter/sort/limit logic is unchanged');
assert(app.includes('function renderAnalyticsPickupBridge(ctx)'), 'renderAnalyticsPickupBridge is unchanged in shape');
assert(app.includes("candidates = (ctx.highBounce || []).concat(ctx.topDemand || []).slice(0, 4)"), 'pickup bridge candidate selection logic is unchanged');
assert(app.includes('詳細・タスク追加'), 'action-card button label is unchanged');
assert(app.includes('data-analytics-open-action='), 'action-card button handler wiring is unchanged');
assert(app.includes('需要番頭に送る'), 'pickup-card button label is unchanged');
assert(app.includes('function sendAnalyticsToPickup(recordId)'), 'sendAnalyticsToPickup logic is unchanged in shape');
assert(!app.includes('localStorage.clear()'), 'localStorage.clear must not be introduced');

console.log('\nAll v4.12.26 analytics-light-card-contrast checks passed.');

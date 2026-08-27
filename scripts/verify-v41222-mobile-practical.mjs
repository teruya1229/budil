/**
 * Budil v4.12.22 - スマホ実用化（レスポンシブ）verify
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
const css = load('css/style.css');
const app = load('js/app.js');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

execFileSync(process.execPath, ['--check', join(root, 'js/app.js')], { stdio: 'inherit' });

assert(html.includes('v4.13.10'), 'index shows v4.12.26');
assert(html.includes('css/style.css?v=4.13.10'), 'style.css cache buster is v4.13.10');
assert(html.includes('js/app.js?v=4.13.10'), 'app.js cache buster is v4.13.10');
assert(storage.includes("BUDIL_VERSION: 'v4.13.10'"), 'storage version is v4.13.10');
assert(dataBackup.includes("APP_VERSION: 'v4.13.10'"), 'data-backup version is v4.13.10');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.10'"), 'verify-current pins v4.12.26');
assert(statusMd.includes('v4.12.25'), 'status.md documents v4.12.25');
assert(handoffMd.includes('v4.12.25'), 'handoff.md documents v4.12.25');
assert(decisionLog.includes('v4.12.25'), 'decision-log.md records v4.12.25');

assert(html.includes('id="mobile-topbar"'), 'mobile topbar exists');
assert(html.includes('id="mobile-nav-toggle"'), 'mobile nav toggle exists');
assert(html.includes('id="mobile-nav-backdrop"'), 'mobile nav backdrop exists');
assert(html.includes('id="budil-sidebar"'), 'sidebar has id for aria-controls');
assert(html.includes('viewport-fit=cover'), 'viewport-fit=cover for safe area');
assert(app.includes('initMobileNavigation'), 'mobile nav init exists');
assert(app.includes('setMobileNavOpen'), 'mobile nav open helper exists');
assert(app.includes('is-mobile-nav-open'), 'mobile nav open class is used');
assert(app.includes('updateMobileTopbarLabel'), 'mobile topbar label updater exists');

assert(css.includes('v4.12.22 スマホ実用化'), 'mobile practical CSS section exists');
assert(css.includes('@media (max-width: 900px)'), '900px breakpoint exists');
assert(css.includes('font-size: 16px !important'), 'mobile inputs use 16px+');
assert(css.includes('min-height: 44px'), '44px tap targets exist');
assert(css.includes('transform: translateX(-105%)'), 'drawer sidebar off-canvas');
assert(css.includes('.app.is-mobile-nav-open .sidebar'), 'drawer open state');
assert(css.includes('env(safe-area-inset-top'), 'safe-area top considered');
assert(css.includes('env(safe-area-inset-bottom'), 'safe-area bottom considered');
assert(css.includes('overflow-x: scroll') || css.includes('overflow-x: auto'), 'inner table horizontal scroll remains');
assert(css.includes('flex-direction: column'), 'mobile app stacks topbar above main');
assert(css.includes('grid-template-columns: 1fr !important'), 'mobile form rows collapse to 1 col');

// 旧60pxアイコンレールを復活させていない
const iconRail = css.match(/@media \(max-width: 768px\)\s*\{[\s\S]*?\.sidebar\s*\{[\s\S]*?width:\s*60px/);
assert(!iconRail, 'old 60px icon-rail sidebar is removed');
assert(!css.includes('.nav-label,\n  .nav-item-sub,\n  .sidebar-footer {\n    display: none;'), 'old label-hiding block not restored as primary mobile nav');

// 業務処理・保存キー不変の煙突チェック
assert(storage.includes("KEYS:"), 'storage KEYS remain');
assert(storage.includes("budil_revenue_records") || storage.includes("REVENUE"), 'revenue storage key remains');
assert(app.includes('runMarketingAutoSync'), 'marketing one-button remains');
assert(app.includes('function switchView'), 'switchView remains');
assert(app.includes("data-view"), 'nav data-view wiring remains in app usage path');
assert(html.includes('data-view="dashboard"'), 'dashboard nav remains');
assert(html.includes('data-view="revenue"'), 'revenue nav remains');
assert(html.includes('data-view="calendar-registration"'), 'reception nav remains');
assert(html.includes('data-view="follow-up"'), 'follow-up nav remains');
assert(html.includes('data-view="analytics"'), 'analytics nav remains');
assert(html.includes('data-view="receivables"'), 'receivables nav remains');
assert(!app.includes('localStorage.clear'), 'localStorage.clear not introduced');
assert(!/売上登録|作業完了後|作業後確定/.test(html + app), 'NG terms not revived');

// PC向けサイドバー幅を破壊していない
assert(css.includes('--sidebar-width: 240px'), 'PC sidebar width variable remains');
assert(css.includes('@media (min-width: 901px)'), 'PC hides mobile topbar');

// テーブルwrap追加（DOMのみ）
assert(app.includes('analytics-table-wrap'), 'analytics table wrap added');
assert(app.includes('profit-table-wrap'), 'profit table wrap used for expense list');

console.log('\nAll v4.12.22 mobile practical checks passed.');

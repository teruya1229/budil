/**
 * Budil v4.10.1 data backup hardening verification.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** アプリ本体のみ（index.html + js/*.js）。verify / docs は対象外。 */
function collectAppSourceFiles() {
  const files = [join(root, 'index.html')];
  const jsDir = join(root, 'js');
  for (const name of readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue;
    if (name === 'hub-import.js') continue;
    files.push(join(jsDir, name));
  }
  return files;
}

/** コメント・文字列リテラルを除いたうえで localStorage.clear( の実呼び出しを検出 */
function stripCommentsAndStringLiterals(code) {
  return String(code || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '""');
}

function hasLocalStorageClearCall(code) {
  return /localStorage\s*\.\s*clear\s*\(/.test(stripCommentsAndStringLiterals(code));
}

function findLocalStorageClearInAppSources(files) {
  const hits = [];
  for (const filePath of files) {
    const rel = relative(root, filePath).replace(/\\/g, '/');
    const content = readFileSync(filePath, 'utf8');
    if (hasLocalStorageClearCall(content)) hits.push(rel);
  }
  return hits;
}

execSync(`node --check "${join(root, 'js', 'app.js')}"`, { stdio: 'inherit' });
execSync(`node --check "${join(root, 'js', 'data-backup.js')}"`, { stdio: 'inherit' });

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

console.log('== v4.10.1 data backup hardening ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.10.1'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.10.1'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.10.1'), 'app.js cache buster should be v4.10.1');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.1'"), 'storage version should be v4.10.1');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.1'"), 'data-backup version should be v4.10.1');

const appSourceFiles = collectAppSourceFiles();
const clearHits = findLocalStorageClearInAppSources(appSourceFiles);
assert(
  clearHits.length === 0,
  `localStorage.clear must not be used in app sources (found in: ${clearHits.join(', ') || 'n/a'})`
);

const protectedKeys = [
  'budil_revenue_records',
  'budil_monthly_results',
  'budil_work_orders',
  'budil_expense_records'
];
for (const key of protectedKeys) {
  assert(dataBackupJs.includes(`'${key}'`), `backup keys should include ${key}`);
  assert(storageJs.includes(`'${key}'`), `critical backup keys should include ${key}`);
}

assert(indexHtml.includes('\u58f2\u4e0a\u660e\u7d30\u30fb\u6708\u6b21\u5b9f\u7e3e\u30fb\u4f5c\u696d\u4e88\u5b9a\u30fb\u7d4c\u8cbb\u5165\u529b\u30fb\u8a2d\u5b9a\u304c\u542b\u307e\u308c\u307e\u3059'),
  'backup scope description should list protected data types');
assert(indexHtml.includes('backup-protected-note'), 'protected data note element should exist');
assert(indexHtml.includes('\u5b9f\u884c\u524d\u306b\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3057\u3066\u304f\u3060\u3055\u3044'),
  'restore/import should warn to backup before overwrite');
assert(indexHtml.includes('card-danger-zone'), 'danger zone card should exist');
assert(indexHtml.includes('\u58f2\u4e0a\u660e\u7d30\u30fb\u6708\u6b21\u5b9f\u7e3e\u30fb\u4f5c\u696d\u4e88\u5b9a\u30fb\u7d4c\u8cbb\u5165\u529b\u3082\u6d88\u3048\u307e\u3059'),
  'delete zone should warn about protected data loss');

assert(appJs.includes('\u4fdd\u8b77\u5bfe\u8c61\uff1a\u58f2\u4e0a\u660e\u7d30\u30fb\u6708\u6b21\u5b9f\u7e3e\u30fb\u4f5c\u696d\u4e88\u5b9a\u30fb\u7d4c\u8cbb\u5165\u529b\u30fb\u8a2d\u5b9a'),
  'data safety notice should list protected targets');
assert(appJs.includes('\u7d4c\u8cbb\u5165\u529b '), 'data summary should use \u7d4c\u8cbb\u5165\u529b wording');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use old expense wording');
assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index should not use old expense wording');

assert(indexHtml.includes('id="exec-home-priority-action"'), 'v4.9.4 priority action should remain');
assert(indexHtml.includes('id="exec-home-monthly-closing-check"'), 'v4.9.3 monthly closing should remain');
assert(indexHtml.includes('id="exec-home-expense-breakdown"'), 'v4.9.2 expense breakdown should remain');
assert(indexHtml.includes('exec-home-ops-flow'), 'v4.10.1 executive home hierarchy should remain');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics should remain');
assert(indexHtml.includes('profit-operations-diagnostics'), 'profit operations should remain');
assert(appJs.includes('renderExecutivePriorityAction'), 'priority action renderer should remain');
assert(appJs.includes("renderMonthlyClosingCheck('exec-home-monthly-closing-check', { compact: true })"),
  'exec monthly closing compact mode should remain');
assert(appJs.includes('getRevenueConfirmationWorkOrderIds'), 'v4.8.31 sales operations should remain');

assert(css.includes('backup-protected-note'), 'backup protected note style should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'),
  'layout should avoid horizontal scroll at 390px');

console.log('All v4.10.1 data backup hardening checks passed.');

/**
 * Budil v4.8.17 navigation and action flow label verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['app.js', 'executive-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveBrain = load('js/executive-brain.js');

console.log('== v4.8.17 navigation labels ==');

assert(indexHtml.includes('AI経営脳みそ v4.8.17'), 'header version should be v4.8.17');
assert(indexHtml.includes('Budil v4.8.17'), 'sidebar version should be v4.8.17');
assert(indexHtml.includes('js/app.js?v=4.8.17'), 'app.js cache buster should be v4.8.17');

assert(indexHtml.includes('集客管理'), 'marketing group should be 集客管理');
assert(indexHtml.includes('外部確認'), 'external check UI should be 外部確認');
assert(indexHtml.includes('施策メモ'), 'strategy memo nav should exist');
assert(indexHtml.includes('改善リスト'), 'improvement list label should exist');
assert(indexHtml.includes('確認履歴'), 'history label should be 確認履歴');
assert(indexHtml.includes('経営メモ'), 'business memo label should exist');
assert(indexHtml.includes('予定作成'), 'calendar entry should be 予定作成');
assert(indexHtml.includes('営業管理'), 'sales group should exist');

assert(!indexHtml.includes('nav-label">需要レーダー'), 'radar should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">需要ピックアップ'), 'pickup should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">需要リサーチ'), 'demand search should not be a top-level nav item');
assert(!indexHtml.includes('外部チェック履歴'), 'old history label should be gone from nav');
assert(!indexHtml.includes('集客・外部チェック'), 'old marketing group label should be gone from nav');
assert(!indexHtml.includes('改善アクション候補'), 'old improvement candidate label should be gone');

assert(appJs.includes('showImprovementListAddedNotice'), 'improvement list save notice should exist');
assert(appJs.includes('改善リストに追加しました'), 'save notice text should mention 改善リスト');
assert(appJs.includes('今日やることへ'), 'save notice should link to daily tasks');
assert(appJs.includes('出どころ：'), 'daily tasks should show origin label');
assert(appJs.includes('getDailyTaskOriginLabel'), 'origin label helper should exist');
assert(appJs.includes('STRATEGY_MEMO_VIEWS'), 'strategy memo nav mapping should exist');
assert(appJs.includes('改善リストに追加'), 'add button should say 改善リストに追加');
assert(appJs.includes('改善リストはまだありません'), 'empty improvement list copy should exist');
assert(appJs.includes('今日やることはまだありません'), 'empty daily tasks copy should exist');
assert(appJs.includes('作業予定はまだありません'), 'empty work order copy should exist');

assert(executiveBrain.includes("label: '集客管理'"), 'executive quick button should use 集客管理');
assert(executiveBrain.includes("label: '外部確認を保存'"), 'executive secondary should use 外部確認');

assert(!appJs.match(/行動候補に追加/), 'UI should not use 行動候補に追加');
assert(!appJs.match(/今日やること候補/), 'UI should not use 今日やること候補 in app.js');
assert(!indexHtml.match(/nav-label">[^<]*候補/), 'nav should not expose 候補 labels');

console.log('All v4.8.17 navigation label checks passed.');

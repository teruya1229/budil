/**
 * Budil v4.8.14 marketing / external check label verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

for (const file of ['app.js', 'analytics-brain.js', 'external-check-brain.js', 'storage.js', 'executive-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const analyticsBrain = load('js/analytics-brain.js');
const storageJs = load('js/storage.js');
const actionBrain = load('js/action-brain.js');
const executiveBrain = load('js/executive-brain.js');

console.log('== v4.8.14 marketing/external check labels ==');

assert(indexHtml.includes('AI経営脳みそ v4.8.14'), 'header version should be v4.8.14');
assert(indexHtml.includes('Budil v4.8.14'), 'sidebar version should be v4.8.14');
assert(indexHtml.includes('js/app.js?v=4.8.14'), 'app.js cache buster should be v4.8.14');
assert(indexHtml.includes('集客・外部チェック'), 'marketing group label should exist');
assert(indexHtml.includes('外部レポート取り込み'), 'external report import label should exist');
assert(indexHtml.includes('外部確認プロンプト'), 'external check prompt label should exist');
assert(indexHtml.includes('広告・集客支援'), 'ad/marketing support label should exist');
assert(indexHtml.includes('改善アクション候補'), 'improvement action candidates label should exist');
assert(executiveBrain.includes("label: '集客・外部チェック'"), 'executive quick button should use the unified label');
assert(!executiveBrain.includes("label: '集客・需要'"), 'executive quick button should not use the old label');
assert(!indexHtml.includes('ブラウザー番頭連携'), 'legacy browser integration label should not be visible');
assert(!indexHtml.includes('ブラウザー番頭プロンプト'), 'legacy browser prompt label should not be visible');
assert(!indexHtml.includes('広告番頭を売る'), 'legacy ad sales label should not be visible');

assert(analyticsBrain.includes('外部確認/アナリティクス'), 'new analytics source label should be saved');
assert(appJs.includes("p.source === 'ブラウザー番頭/アナリティクス'"), 'old analytics source label should remain readable');
assert(appJs.includes("p.source === '外部確認/アナリティクス'"), 'new analytics source label should be readable');
assert(storageJs.includes('budil_external_check_reports'), 'external check storage key should remain');
assert(actionBrain.includes('budil_action_candidates') || storageJs.includes('budil_action_candidates'), 'action candidate storage key should remain');
assert(storageJs.includes('budil_action_candidate_states'), 'action candidate state key should remain');
assert(!appJs.includes('localStorage.' + 'clear()'), 'app should not clear localStorage');
assert(!storageJs.includes('saveRevenueRecords(' + '[])'), 'storage should not save empty revenue records directly');

console.log('All v4.8.14 marketing/external check label checks passed.');

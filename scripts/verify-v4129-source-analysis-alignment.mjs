/**
 * Budil v4.12.17 - revenue source analysis display aligned with profit rates.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of ['js/revenue-summary-brain.js', 'js/revenue-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.17 source-analysis-alignment ==');

const indexHtml = load('index.html');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const revenueSummaryJs = load('js/revenue-summary-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.17'), 'index.html should show v4.12.17');
assert(indexHtml.includes('js/app.js?v=4.12.17'), 'app.js cache buster should be v4.12.17');
assert(indexHtml.includes('js/revenue-summary-brain.js?v=4.12.17'), 'revenue-summary-brain cache buster should be v4.12.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.17'"), 'storage version should be v4.12.17');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.17'"), 'data-backup version should be v4.12.17');
assert(!indexHtml.includes('?v=4.12.8'), 'old cache buster v4.12.8 should be gone');
assert(statusMd.includes('v4.12.17'), 'status.md should document v4.12.17');
assert(handoffMd.includes('v4.12.17'), 'handoff.md should document v4.12.17');
assert(decisionLog.includes('v4.12.17'), 'decision-log.md should record v4.12.17');

console.log('== summary alias wiring ==');
assert(revenueSummaryJs.includes("'LINE': 'LINE'"), 'LINE should not collapse to その他');
assert(revenueSummaryJs.includes("'Airリザーブ': 'Airリザーブ'"), 'Airリザーブ should not collapse to その他');
assert(!revenueSummaryJs.includes("'Google広告': 'LP'"), 'Google広告 should keep recorded label');
assert(!revenueSummaryJs.includes("'直予約': 'その他'"), '直予約 should not collapse to その他');
assert(revenueSummaryJs.includes('未設定|不明|判定不能'), 'unknown source labels should map to 不明');

console.log('== profit master unchanged ==');
assert(!revenueBrainJs.includes('SOURCE_ALIASES'), 'RevenueBrain must not gain summary aliases');
assert(revenueBrainJs.includes('direct: 100'), 'direct profit rate must stay 100%');
assert(revenueBrainJs.includes('referralDirect: 100'), 'referralDirect profit rate must stay 100%');
assert(revenueBrainJs.includes('coop: 80'), 'coop profit rate must stay 80%');
assert(revenueBrainJs.includes('market: 80'), 'market profit rate must stay 80%');
assert(revenueBrainJs.includes('yamada: 60'), 'yamada profit rate must stay 60%');

function createSandbox() {
  const sandbox = {
    console,
    RevenueBrain: null,
    RevenueSummaryBrain: null,
    WorkOrderBrain: { forOperationalList: (x) => x || [], normalizeWorkOrder: (x) => x || {}, ACTIVE_STATUSES: [], addDays: (d, n) => d, sortByScheduledDateTimeAsc: (x) => x || [] },
    CalendarCandidateBrain: null,
    MonthlyResultsBrain: null,
    WorkCompletionBrain: null
  };
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-summary-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}

const ctx = createSandbox();

const displayCases = [
  ['LP', 'LP'],
  ['Google', 'Google'],
  ['Google検索', 'Google検索'],
  ['Google広告', 'Google広告'],
  ['Googleビジネスプロフィール', 'Googleビジネスプロフィール'],
  ['LINE', 'LINE'],
  ['電話', '電話'],
  ['既存客', '既存客'],
  ['自社導線', '自社導線'],
  ['Airリザーブ', 'Airリザーブ'],
  ['紹介直', '紹介直'],
  ['110番', '110番'],
  ['片付け110番', '片付け110番'],
  ['コープ', 'コープ'],
  ['くらしのマーケット', 'くらしのマーケット'],
  ['ヤマダ', 'ヤマダ'],
  ['', '不明'],
  ['未設定', '不明'],
  ['不明', '不明'],
  ['判定不能', '不明'],
  ['その他', 'その他']
];

console.log('== analysis display labels ==');
for (const [source, expected] of displayCases) {
  const label = runInContext(
    `RevenueSummaryBrain.getRevenueSource(${JSON.stringify({ source })})`,
    ctx
  );
  assert(label === expected, `source ${source || '(empty)'} should display as ${expected}, got ${label}`);
}

const profitCases = [
  ['LP', 100, false],
  ['Google広告', 100, false],
  ['LINE', 100, false],
  ['電話', 100, false],
  ['既存客', 100, false],
  ['自社導線', 100, false],
  ['Airリザーブ', 100, false],
  ['紹介直', 100, false],
  ['110番', 80, false],
  ['片付け110番', 80, false],
  ['コープ', 80, false],
  ['くらしのマーケット', 80, false],
  ['ヤマダ', 60, false],
  ['', 0, true],
  ['未設定', 0, true],
  ['不明', 0, true],
  ['判定不能', 0, true],
  ['その他', 0, true]
];

console.log('== profit rates unchanged ==');
for (const [source, expectedRate, reviewRequired] of profitCases) {
  const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, ctx);
  assert(info.rate === expectedRate, `${source || '(empty)'} rate should be ${expectedRate}, got ${info.rate}`);
  assert(info.reviewRequired === reviewRequired, `${source || '(empty)'} reviewRequired should be ${reviewRequired}`);
}

console.log('== summary change must not alter profit math ==');
{
  const amount = 12000;
  const sources = ['LINE', 'Google広告', 'Airリザーブ', '紹介直', 'コープ', 'ヤマダ', '不明'];
  for (const source of sources) {
    const summaryLabel = runInContext(
      `RevenueSummaryBrain.getRevenueSource(${JSON.stringify({ source })})`,
      ctx
    );
    const profitShare = runInContext(
      `RevenueBrain.calculateNetRevenueBySource(${amount}, ${JSON.stringify(source)})`,
      ctx
    );
    const expectedShare = runInContext(
      `(() => {
        const info = RevenueBrain.getSourceProfitRate(${JSON.stringify(source)});
        return RevenueBrain.computeMarginProfit(${amount}, info.rate);
      })()`,
      ctx
    );
    assert(profitShare === expectedShare, `profit share for ${source} must stay ${expectedShare}, got ${profitShare}`);
    assert(typeof summaryLabel === 'string' && summaryLabel.length > 0, `summary label for ${source} must be non-empty`);
  }
}

console.log('== localStorage keys unchanged ==');
const storageKeysBefore = (storageJs.match(/STORAGE_KEYS|localStorage\.setItem\('budil_/g) || []).length;
assert(storageKeysBefore > 0, 'storage.js should still define storage keys');
assert(!revenueSummaryJs.includes('localStorage'), 'revenue-summary-brain must not touch localStorage');

console.log('\nAll v4.12.17 source-analysis-alignment checks passed.');

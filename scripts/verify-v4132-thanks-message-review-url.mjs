/**
 * Budil v4.13.7 - お礼LINE文へGoogle口コミURL追加 verify
 *
 * Background: 作業後フォローの「お礼LINE文」に、既存のGoogle口コミURLを
 * 表示・コピーできるようにする。口コミ依頼文の処理は変えない。
 *
 * Fix: FollowUpBrain.generateThanksMessage() が getReviewUrl() 経由で
 * URLを followUpMemo の後・事業者名の前に挿入する。followUpMemo内に
 * 同一URLがある場合は二重表示しない。googleReviewUrl設定時は設定値優先。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const followUpSrc = load('js/follow-up-brain.js');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/follow-up-brain.js', 'js/app.js', 'js/storage.js', 'js/data-backup.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('Budil v4.13.11'), 'index.html shows Budil v4.13.11');
assert(html.includes('js/app.js?v=4.13.11'), 'app.js cache buster is v4.13.11');
assert(html.includes('js/follow-up-brain.js?v=4.13.11'), 'follow-up-brain.js cache buster is v4.13.11');
assert(html.includes('css/style.css?v=4.13.11'), 'style.css cache buster is v4.13.11');
assert(storage.includes("BUDIL_VERSION: 'v4.13.11'"), 'storage version is v4.13.11');
assert(dataBackup.includes("APP_VERSION: 'v4.13.11'"), 'data-backup version is v4.13.11');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.11'"), 'verify-current pins v4.13.11');
assert(statusMd.includes('v4.13.11'), 'status.md documents v4.13.11');
assert(handoffMd.includes('v4.13.11'), 'handoff.md documents v4.13.11');
assert(decisionLog.includes('v4.13.11'), 'decision-log.md records v4.13.11');

console.log('== load FollowUpBrain ==');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(followUpSrc + '\n;this.FollowUpBrain = FollowUpBrain;', sandbox);
const Brain = sandbox.FollowUpBrain;
assert(!!Brain, 'FollowUpBrain loaded');
assert(
  Brain.DEFAULT_REVIEW_URL === 'https://g.page/r/CQj7TW8RxXd1EBM/review',
  'DEFAULT_REVIEW_URL is the known Google review URL'
);

const target = {
  customerName: '検証太郎',
  serviceText: 'エアコンクリーニング'
};

const countUrl = (text, url) => {
  if (!url) return 0;
  let n = 0;
  let idx = 0;
  while (true) {
    const found = text.indexOf(url, idx);
    if (found < 0) break;
    n += 1;
    idx = found + url.length;
  }
  return n;
};

const assertUrlBetweenMemoAndBiz = (text, memo, url, biz) => {
  const memoIdx = text.indexOf(memo);
  const urlIdx = text.indexOf(url);
  const bizIdx = text.lastIndexOf(biz);
  assert(memoIdx >= 0, 'followUpMemo is present in thanks message');
  assert(urlIdx >= 0, 'review URL is present in thanks message');
  assert(bizIdx >= 0, 'business name is present in thanks message');
  assert(memoIdx < urlIdx, 'review URL comes after followUpMemo');
  assert(urlIdx < bizIdx, 'review URL comes before business name');
};

console.log('== 1. default URL once when googleReviewUrl unset ==');
{
  const profile = {
    businessName: 'BCサービス',
    followUpMemo: '本日はありがとうございました！BCサービス照屋です。よろしければ30秒で口コミにご協力お願いします🙏'
  };
  const text = Brain.generateThanksMessage(target, profile);
  const url = Brain.DEFAULT_REVIEW_URL;
  assert(countUrl(text, url) === 1, 'DEFAULT_REVIEW_URL appears exactly once');
  assertUrlBetweenMemoAndBiz(text, profile.followUpMemo, url, profile.businessName);
  assert(text.includes('本日はエアコンクリーニングのご依頼ありがとうございました。'), 'existing thanks body remains');
}

console.log('== 2. configured googleReviewUrl takes priority once ==');
{
  const customUrl = 'https://example.com/review-custom';
  const profile = {
    businessName: 'BCサービス',
    googleReviewUrl: customUrl,
    followUpMemo: '本日はありがとうございました！BCサービス照屋です。よろしければ30秒で口コミにご協力お願いします🙏'
  };
  const text = Brain.generateThanksMessage(target, profile);
  assert(countUrl(text, customUrl) === 1, 'configured googleReviewUrl appears exactly once');
  assert(countUrl(text, Brain.DEFAULT_REVIEW_URL) === 0, 'DEFAULT_REVIEW_URL is not used when configured');
  assertUrlBetweenMemoAndBiz(text, profile.followUpMemo, customUrl, profile.businessName);
}

console.log('== 3. no duplicate when followUpMemo already contains same URL ==');
{
  const url = Brain.DEFAULT_REVIEW_URL;
  const profile = {
    businessName: 'BCサービス',
    followUpMemo: `メモ文です\n${url}\nよろしくお願いします`
  };
  const text = Brain.generateThanksMessage(target, profile);
  assert(countUrl(text, url) === 1, 'same URL in followUpMemo is not duplicated');
  assert(text.includes(profile.businessName), 'business name still appended');
  const urlIdx = text.indexOf(url);
  const bizIdx = text.lastIndexOf(profile.businessName);
  assert(urlIdx < bizIdx, 'URL from memo still appears before business name');
}

console.log('== 4. generateReviewRequest output unchanged ==');
{
  const profile = {
    businessName: 'BCサービス',
    followUpMemo: 'お礼用メモ',
    googleReviewUrl: ''
  };
  const reviewText = Brain.generateReviewRequest(target, profile);
  assert(reviewText.includes('もし作業内容にご満足いただけましたら'), 'review request body preserved');
  assert(reviewText.includes('Googleの口コミにご協力いただけると嬉しいです'), 'review request wording preserved');
  assert(reviewText.includes(Brain.DEFAULT_REVIEW_URL), 'review request still appends review URL');
  assert(!reviewText.includes(profile.followUpMemo), 'review request does not include followUpMemo');
  assert(!reviewText.includes(profile.businessName), 'review request does not append business name');
  assert(countUrl(reviewText, Brain.DEFAULT_REVIEW_URL) === 1, 'review request URL appears once');
}

console.log('== 5. thanks copy paths still use generateThanksMessage ==');
assert(app.includes('FollowUpBrain.generateThanksMessage'), 'app.js still calls generateThanksMessage');
assert(app.includes('function getFollowUpMessageText('), 'getFollowUpMessageText exists');
{
  const start = app.indexOf('function getFollowUpMessageText(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 800);
  assert(body.includes("type === 'thanks'") && body.includes('FollowUpBrain.generateThanksMessage'),
    'getFollowUpMessageText(thanks) uses generateThanksMessage');
}
{
  const start = app.indexOf('function copyExecutiveFollowMessage(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 1200);
  assert(body.includes('FollowUpBrain.generateThanksMessage'),
    'executive thanks copy uses generateThanksMessage');
  assert(body.includes('FollowUpBrain.generateReviewRequest'),
    'executive review copy still uses generateReviewRequest');
}
assert(!/generateThanksMessage[\s\S]{0,200}window\.open\(|fetch\(|line\.me\/R\/msg/i.test(followUpSrc),
  'generateThanksMessage does not auto-send');

console.log('== 6. getReviewUrl priority preserved ==');
assert(Brain.getReviewUrl({}) === Brain.DEFAULT_REVIEW_URL, 'getReviewUrl falls back to DEFAULT');
assert(
  Brain.getReviewUrl({ googleReviewUrl: ' https://example.com/r ' }) === 'https://example.com/r',
  'getReviewUrl prefers trimmed googleReviewUrl'
);

console.log('\nAll v4.13.7 thanks-message review URL checks passed.');

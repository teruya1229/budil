/**
 * Budil v4.8.5 - AI受付結果パーサー簡易検証
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

const SAMPLE_PASTE = `氏名：平良 真俊 様

住所：〒900-0036
沖縄県那覇市西1-11-11 西町第一マンション701号室

電話番号：090-3412-5880

日付：2026年6月27日（土）

時間：9:00〜

金額：24,200円（税込）

作業内容：R1、C1

補足：

・利用区分：店舗来店
・依頼番号：2167-26T0626-037
・自動お掃除機能付きエアコン
・防カビ・抗菌コートあり
・型番：ダイキン RASYX40M2（型番よりお掃除機能付き判断）
・希望：土曜または平日希望
・6/26 16:00 アポ済み
・入金予定：24,200円（税込）
・完全分解の記載なし
・GPT補助あり
・確定案件`;

function loadScript(name) {
  return readFileSync(join(jsDir, name), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== node --check reception-brain.js ==');
execSync(`node --check "${join(jsDir, 'reception-brain.js')}"`, { stdio: 'inherit' });

const ctx = createContext({ console, Date, JSON, Math, Number, String, Array, Object, Set, Map, Error, parseInt, parseFloat, isNaN, undefined });
runInContext(loadScript('map-brain.js'), ctx, { filename: 'map-brain.js' });
runInContext(loadScript('reception-brain.js'), ctx, { filename: 'reception-brain.js' });

const parsed = runInContext(`ReceptionBrain.parseAiBantouPaste(${JSON.stringify(SAMPLE_PASTE)})`, ctx);

console.log('\n== parse sample paste ==');
assert(parsed.customerName === '平良 真俊 様', `customerName: ${parsed.customerName}`);
assert(parsed.phone === '090-3412-5880', `phone: ${parsed.phone}`);
assert(
  parsed.address === '〒900-0036 沖縄県那覇市西1-11-11 西町第一マンション701号室',
  `address: ${parsed.address}`
);
assert(parsed.serviceText === 'R1、C1', `serviceText: ${parsed.serviceText}`);
assert(parsed.preferredDatesText === '2026年6月27日（土） 9:00〜', `preferredDatesText: ${parsed.preferredDatesText}`);
assert(parsed.estimateAmount === 24200, `estimateAmount: ${parsed.estimateAmount}`);
assert(parsed.area === '那覇市', `area: ${parsed.area}`);
assert(parsed.memo.includes('利用区分：店舗来店'), `memo missing 利用区分: ${parsed.memo}`);
assert(parsed.memo.includes('確定案件'), `memo missing 確定案件: ${parsed.memo}`);
assert(!parsed.memo.includes('・利用区分'), 'memo should strip bullet prefix');

console.log('OK: intake parser sample');
console.log(JSON.stringify({
  customerName: parsed.customerName,
  phone: parsed.phone,
  address: parsed.address,
  serviceText: parsed.serviceText,
  preferredDatesText: parsed.preferredDatesText,
  estimateAmount: parsed.estimateAmount,
  area: parsed.area,
  memoLines: parsed.memo.split('\n').length
}, null, 2));

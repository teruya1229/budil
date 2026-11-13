/**
 * ユニマット依頼元の独立回帰テスト。
 * 業務データの書き込み・外部送信は一切行わない。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const revSource = read('js/revenue-brain.js');
const receptionSource = read('js/reception-brain.js');
const page = read('index.html');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(revSource + '\nthis.RevenueBrain = RevenueBrain;', sandbox);
vm.runInContext(receptionSource + '\nthis.ReceptionBrain = ReceptionBrain;', sandbox);
const {RevenueBrain:r, ReceptionBrain:rec} = sandbox;
assert.equal(r.SOURCES[0], 'LP', '既存の先頭LPを維持');
assert.equal(r.SOURCES.filter(x => x === 'ユニマット').length, 1, 'ユニマットは1件のみ');
assert.equal(r.DEFAULT_GROSS_MARGIN_RATES['ユニマット'], 100);
assert.equal(r.getDefaultGrossProfitRateBySource('ユニマット'), 100);
assert.equal(r.getDefaultGrossProfitRateBySource('株式会社ユニマットライフ'), 100);
assert.equal(r.getSourceProfitRate('ユニマット').reviewRequired, false);
assert.equal(r.getSourceProfitRate('ユニマット').rate, 100);
assert.equal(r.normalizeSourceForForm('ユニマットライフ'), 'ユニマット');
assert.equal(rec.matchRevenueSource('ユニマット'), 'ユニマット');
assert.equal(rec.matchRevenueSource('ユニマットライフ'), 'ユニマット');
assert.equal(r.computeMarginProfit(25000, r.getDefaultGrossProfitRateBySource('ユニマット')), 25000);
for(const [name,rate] of Object.entries({'LP':100,'直受け':100,'コープ':80,'ヤマダ':60,'くらしのマーケット':80,'110番':80}))
  assert.equal(r.getDefaultGrossProfitRateBySource(name), rate, '既存の料率不変: '+name);
assert.equal(r.getDefaultGrossProfitRateBySource('未登録元請け'), null, '未登録の元請けは要確認');
assert.ok(page.includes('js/revenue-brain.js?v=20261113-unimat1'));
assert.ok(page.includes('js/reception-brain.js?v=20261113-unimat1'));
console.log('UNIMAT_BUDIL_SOURCE_RATE_TEST=PASS');

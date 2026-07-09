/**
 * Budil v4.10.38 緊急修正 — カレンダー重複判定・売上確定待ち表示 verification.
 *
 * 確認内容:
 * - v4.10.27 表示に更新されていること
 * - 2026-07-03 の今日判定が維持されていること（v4.10.26 回帰確認）
 * - 2026-07-03 の2件が同じ今日の別予定として保持されること
 *   1. コープ 伊地美千代様 R2 / 10:00〜14:00 / 35,090円
 *   2. 直受 海老澤智貴様 R1  / 15:00〜17:30 / 22,000円（税込）
 * - 2026-07-02 儀間祐太朗 / 現地確認 / 22,000円 と 海老澤智貴様が混ざらないこと
 * - 同じ22,000円でも日付・時間・顧客名・住所が違えば別予定になること
 * - 日付だけ・金額だけ・依頼元だけで重複扱いしないこと
 * - 今日の未確定作業予定が売上確定待ちに出ること（'候補'ステータスでも）
 * - 「作業予定に追加済み」でも、売上未確定なら売上確定待ちに出ること
 * - 売上確定済みの予定は二重に出ないこと
 * - 金額 22,000円（税込） が 22000 として扱われること
 * - 過去日付でも金額があれば isFutureImportSavable=true になること（翌日インポート対応）
 * - v4.10.25 請求書UI修正を壊していないこと
 * - v4.10.26 今日判定修正を壊していないこと
 * - NG文言が復活していないこと
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

// --- 構文チェック ---
for (const file of [
  'js/app.js',
  'js/calendar-candidate-brain.js',
  'js/revenue-summary-brain.js',
  'js/work-completion-brain.js',
  'js/work-order-brain.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.27 calendar-dedupe-revenue-queue ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revSummaryJs = load('js/revenue-summary-brain.js');
const calBrainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

// --- バージョン確認 ---
console.log('== version check ==');
assert(indexHtml.includes('v4.12.7'), 'index.html should show v4.12.7');
assert(indexHtml.includes('js/app.js?v=4.12.7'), 'app.js cache buster should be v4.12.7');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.7'"), 'storage.js version should be v4.12.7');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.7'"), 'data-backup version should be v4.12.7');

// --- v4.10.26 今日判定が維持されていること ---
console.log('== TODAY() local date regression ==');
assert(
  !appJs.match(/const TODAY\s*=\s*\(\)\s*=>\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/),
  'TODAY() must NOT use toISOString().slice(0,10) (UTC-based) — v4.10.26 regression'
);
assert(
  appJs.includes('d.getFullYear()') && appJs.includes('d.getMonth()') && appJs.includes('d.getDate()'),
  'TODAY() should use getFullYear/getMonth/getDate (local date) — v4.10.26 regression'
);

// --- v4.10.27: 過去日付 + 金額あり は excluded にしないこと ---
console.log('== classifyFutureImportCandidate past-date-with-amount check ==');
assert(
  !calBrainJs.includes("reasons.push('過去日付')"),
  'classifyFutureImportCandidate must NOT push 過去日付 as hard exclusion'
);
assert(
  calBrainJs.includes('v4.10.27'),
  'calendar-candidate-brain.js should have v4.10.27 comment'
);

// --- v4.10.27: buildCalendarDedupeKey に startTime/endTime が含まれること ---
console.log('== buildCalendarDedupeKey startTime/endTime check ==');
assert(
  calBrainJs.includes("c.startTime || ''") && calBrainJs.includes("c.endTime || ''"),
  'buildCalendarDedupeKey should include startTime and endTime'
);

// --- v4.10.27: collectRevenueConfirmationQueue が候補ステータス予定を含めること ---
console.log('== collectRevenueConfirmationQueue pending candidate check ==');
assert(
  appJs.includes('CalendarCandidateBrain.isPendingCandidate(wo)'),
  'collectRevenueConfirmationQueue should handle isPendingCandidate calendar work orders'
);
assert(
  appJs.includes('v4.10.27'),
  'app.js should have v4.10.27 comment'
);

// --- v4.10.25 請求書UI修正が維持されていること ---
console.log('== v4.10.25 documents UI regression ==');
assert(css.includes('v4.10.25 請求書・見積書'), 'css should still include v4.10.25 documents marker');
assert(indexHtml.includes('css/style.css?v=4.12.7'), 'css cache buster should remain v4.10.25.1');

// --- v4.10.26: isRevenueConfirmationQueueCandidate が >= を使っていること ---
console.log('== isRevenueConfirmationQueueCandidate >= regression ==');
assert(
  revSummaryJs.includes('wo.scheduledDate >= t'),
  'isRevenueConfirmationQueueCandidate must use >= (not >) — v4.10.26 regression'
);

// --- NG文言チェック ---
console.log('== NG term check ==');
const ngTargets = [indexHtml, appJs, revSummaryJs];
const ngTerms = ['今月売上</span>', '今月売上（確定分）', '今月の粗利'];
ngTargets.forEach((src, i) => {
  ngTerms.forEach(term => {
    assert(!src.includes(term), `NG term "${term}" found in file index ${i}`);
  });
});

// CSS変更チェック
console.log('== CSS unchanged check ==');
assert(!css.includes('v4.10.27'), 'css/style.css must NOT have v4.10.27 marker (CSS must not be changed)');

// ============================================================
// 数値テスト: VM sandbox
// ============================================================
function createSandbox() {
  const ctx = createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    RegExp
  });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  return ctx;
}

// テスト1: 金額パース
console.log('== parseAmount check ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => ({
    a: CalendarCandidateBrain.parseAmount('22,000円（税込）'),
    b: CalendarCandidateBrain.parseAmount('35,090円'),
    c: CalendarCandidateBrain.parseAmount('25,300円'),
    d: CalendarCandidateBrain.parseAmount('11,110円'),
    e: CalendarCandidateBrain.parseAmount(22000),
    f: CalendarCandidateBrain.parseAmount('')
  }))()`, ctx);
  assert(result.a === 22000, `parseAmount('22,000円（税込）') should be 22000, got ${result.a}`);
  assert(result.b === 35090, `parseAmount('35,090円') should be 35090, got ${result.b}`);
  assert(result.c === 25300, `parseAmount('25,300円') should be 25300, got ${result.c}`);
  assert(result.d === 11110, `parseAmount('11,110円') should be 11110, got ${result.d}`);
  assert(result.e === 22000, `parseAmount(22000) should be 22000, got ${result.e}`);
  assert(result.f === 0, `parseAmount('') should be 0, got ${result.f}`);
  console.log('  parseAmount: all OK');
}

// テスト2: buildDedupeKey — 儀間祐太朗(07-02) と 海老澤智貴様(07-03) のキーが異なること
console.log('== buildDedupeKey different dates must differ ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const gima = {
      scheduledDate: '2026-07-02', startTime: '09:00', endTime: '11:30',
      customerName: '儀間祐太朗', serviceText: '現地確認',
      address: '那覇市安里388-84 松田共同住宅3F', estimateAmount: 22000, source: '直受'
    };
    const ebisawa = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30',
      customerName: '海老澤智貴様', serviceText: '直受 R1',
      address: '那覇市牧志3-8-21 ポンプビル1-C', estimateAmount: 22000, source: '直受'
    };
    return {
      gimaKey: CalendarCandidateBrain.buildDedupeKey(gima),
      ebisawaKey: CalendarCandidateBrain.buildDedupeKey(ebisawa),
      gimaCalKey: CalendarCandidateBrain.buildCalendarDedupeKey(gima),
      ebisawaCalKey: CalendarCandidateBrain.buildCalendarDedupeKey(ebisawa),
      sameDedupeKey: CalendarCandidateBrain.buildDedupeKey(gima) === CalendarCandidateBrain.buildDedupeKey(ebisawa),
      sameCalKey: CalendarCandidateBrain.buildCalendarDedupeKey(gima) === CalendarCandidateBrain.buildCalendarDedupeKey(ebisawa)
    };
  })()`, ctx);
  assert(!result.sameDedupeKey, `buildDedupeKey: 儀間祐太朗(07-02) and 海老澤智貴様(07-03) must have DIFFERENT keys`);
  assert(!result.sameCalKey, `buildCalendarDedupeKey: 儀間祐太朗(07-02) and 海老澤智貴様(07-03) must have DIFFERENT calendar keys`);
  console.log(`  gimaKey="${result.gimaKey.slice(0,40)}..."`);
  console.log(`  ebisawaKey="${result.ebisawaKey.slice(0,40)}..."`);
  console.log('  dedupeKey differs: OK');
}

// テスト3: detectDuplicates — 儀間祐太朗(07-02) vs 海老澤智貴様(07-03) は重複扱いしないこと
console.log('== detectDuplicates: gima vs ebisawa no dup ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const gima = {
      id: 'wo-gima',
      scheduledDate: '2026-07-02', startTime: '09:00', endTime: '11:30',
      customerName: '儀間祐太朗', serviceText: '現地確認',
      address: '那覇市安里388-84 松田共同住宅3F', estimateAmount: 22000, source: '直受',
      status: 'tentative',
      calendarDedupeKey: 'calendar-past-recovery|2026-07-02|儀間祐太朗|22000|現地確認|直受|09:00|11:30',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste' }
    };
    const ebisawa = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30',
      customerName: '海老澤智貴様', serviceText: '直受 R1',
      address: '那覇市牧志3-8-21 ポンプビル1-C', estimateAmount: 22000, source: '直受',
      estimateAmount: 22000
    };
    const dups = CalendarCandidateBrain.detectDuplicates(ebisawa, [gima], []);
    return {
      dupCount: dups.length,
      types: dups.map(d => d.type)
    };
  })()`, ctx);
  assert(result.dupCount === 0, `海老澤智貴様(07-03) must NOT be detected as duplicate of 儀間祐太朗(07-02). dupCount=${result.dupCount}`);
  console.log('  No false duplicate detected: OK');
}

// テスト4: detectDuplicates — 同日・同金額・異なる時間・別顧客は重複扱いしないこと
console.log('== detectDuplicates: same-day same-amount different time and customer ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const iji = {
      id: 'wo-iji',
      scheduledDate: '2026-07-03', startTime: '10:00', endTime: '14:00',
      customerName: '伊地 美千代様', serviceText: 'コープ R2',
      estimateAmount: 35090, source: 'コープ',
      status: 'tentative',
      calendarDedupeKey: 'calendar-past-recovery|2026-07-03|伊地美千代様|35090|コープr2|コープ|10:00|14:00',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste' }
    };
    const ebisawa = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30',
      customerName: '海老澤智貴様', serviceText: '直受 R1',
      estimateAmount: 22000, source: '直受'
    };
    const dups = CalendarCandidateBrain.detectDuplicates(ebisawa, [iji], []);
    return { dupCount: dups.length };
  })()`, ctx);
  assert(result.dupCount === 0, `Different customer/time/amount on same day must NOT be duplicate. dupCount=${result.dupCount}`);
  console.log('  Same-day different events not confused: OK');
}

// テスト5: 過去日付 + 金額あり → isFutureImportSavable = true
console.log('== isFutureImportSavable: past-date with amount must be savable ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const itemPastWithAmount = {
      isPastDate: true,
      isDuplicate: false,
      candidate: { scheduledDate: '2026-07-03', estimateAmount: 22000, customerName: '海老澤智貴様' },
      futureImport: { status: 'eligible', savable: true }
    };
    const itemPastNoAmount = {
      isPastDate: true,
      isDuplicate: false,
      candidate: { scheduledDate: '2026-07-03', estimateAmount: 0 },
      futureImport: { status: 'excluded', savable: false }
    };
    const itemFutureWithAmount = {
      isPastDate: false,
      isDuplicate: false,
      candidate: { scheduledDate: '2026-07-05', estimateAmount: 22000 },
      futureImport: { status: 'eligible', savable: true }
    };
    return {
      pastWithAmount: CalendarCandidateBrain.isFutureImportSavable(itemPastWithAmount, false),
      pastNoAmount: CalendarCandidateBrain.isFutureImportSavable(itemPastNoAmount, false),
      futureWithAmount: CalendarCandidateBrain.isFutureImportSavable(itemFutureWithAmount, false)
    };
  })()`, ctx);
  assert(result.pastWithAmount === true, `Past date with amount must be savable. got ${result.pastWithAmount}`);
  assert(result.pastNoAmount === false, `Past date with NO amount must NOT be savable. got ${result.pastNoAmount}`);
  assert(result.futureWithAmount === true, `Future date with amount must be savable. got ${result.futureWithAmount}`);
  console.log('  isFutureImportSavable: past+amount OK, past+noAmount blocked, future+amount OK');
}

// テスト6: classifyFutureImportCandidate — 過去日付 + 金額あり は eligible
console.log('== classifyFutureImportCandidate: past-date with amount is eligible ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const today = '2026-07-04';
    const pastWithAmount = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30', estimateAmount: 22000,
      customerName: '海老澤智貴様', serviceText: '直受 R1', source: '直受'
    };
    const pastNoAmount = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30', estimateAmount: 0,
      customerName: '海老澤智貴様', serviceText: '直受 R1', source: '直受'
    };
    const cancelledEvent = {
      scheduledDate: '2026-07-05', startTime: '10:00', endTime: '12:00', estimateAmount: 22000,
      customerName: 'テスト様', serviceText: 'キャンセル確認', source: '直受'
    };
    return {
      pastWithAmountStatus: CalendarCandidateBrain.classifyFutureImportCandidate(pastWithAmount, today).status,
      pastNoAmountStatus: CalendarCandidateBrain.classifyFutureImportCandidate(pastNoAmount, today).status,
      cancelledStatus: CalendarCandidateBrain.classifyFutureImportCandidate(cancelledEvent, today).status
    };
  })()`, ctx);
  assert(result.pastWithAmountStatus === 'eligible', `Past date with amount should be 'eligible', got '${result.pastWithAmountStatus}'`);
  assert(result.pastNoAmountStatus === 'excluded', `Past date with NO amount should be 'excluded', got '${result.pastNoAmountStatus}'`);
  assert(result.cancelledStatus === 'excluded', `Cancelled event should be 'excluded', got '${result.cancelledStatus}'`);
  console.log(`  pastWithAmount=${result.pastWithAmountStatus} pastNoAmount=${result.pastNoAmountStatus} cancelled=${result.cancelledStatus} OK`);
}

// テスト7: isUpcomingRevenueScheduleWorkOrder — 今日の2件が直近予定に含まれること（v4.10.26 回帰）
console.log('== isUpcomingRevenueScheduleWorkOrder today 2 events ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const wo1 = {
      id: 'wo-1', scheduledDate: '2026-07-03', startTime: '10:00', endTime: '14:00',
      customerName: '伊地 美千代様', serviceText: 'コープ R2', estimateAmount: 35090,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste', sourceType: 'work-order-candidate' }
    };
    const wo2 = {
      id: 'wo-2', scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30',
      customerName: '海老澤智貴様', serviceText: '直受 R1', estimateAmount: 22000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste', sourceType: 'work-order-candidate' }
    };
    const wo3_past = {
      id: 'wo-3', scheduledDate: '2026-07-02', startTime: '09:00', endTime: '11:30',
      customerName: '儀間祐太朗', serviceText: '現地確認', estimateAmount: 22000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste', sourceType: 'work-order-candidate' }
    };
    return {
      iji: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo1, TODAY),
      ebisawa: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo2, TODAY),
      gima: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo3_past, TODAY)
    };
  })()`, ctx);
  assert(result.iji === true, `伊地美千代様 must be in upcoming schedule`);
  assert(result.ebisawa === true, `海老澤智貴様 must be in upcoming schedule`);
  assert(result.gima === false, `儀間祐太朗(07-02) must NOT be in upcoming (past date)`);
  console.log(`  iji=${result.iji} ebisawa=${result.ebisawa} gima=${result.gima} OK`);
}

// テスト8: 売上確定済みは二重に出ないこと
console.log('== confirmed revenue not duplicated ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const confirmedWo = {
      id: 'wo-confirmed', scheduledDate: '2026-07-03', startTime: '10:00',
      customerName: '伊地 美千代様', serviceText: 'コープ R2', estimateAmount: 35090,
      status: 'tentative', actualRevenueId: 'rev-001',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste', sourceType: 'work-order-candidate' }
    };
    return {
      inConfirmQueue: RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(confirmedWo, TODAY),
      inUpcoming: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(confirmedWo, TODAY)
    };
  })()`, ctx);
  assert(!result.inConfirmQueue, `Already confirmed work order must NOT be in confirmation queue`);
  assert(!result.inUpcoming, `Already confirmed work order must NOT be in upcoming`);
  console.log('  Confirmed revenue excluded from both queue and upcoming: OK');
}

// テスト9: 今日の「候補」ステータスの作業予定が isRevenueConfirmationQueueCandidate=false であること
// （app.jsの新しいロジックで直接追加されるため、brain側はfalseが正しい）
console.log('== pending candidate not in brain queue (handled by app.js) ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const pendingWo = {
      id: 'wo-pending', scheduledDate: '2026-07-03', startTime: '15:00',
      customerName: '海老澤智貴様', serviceText: '直受 R1', estimateAmount: 22000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste', sourceType: 'work-order-candidate' }
    };
    return {
      inBrainQueue: RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(pendingWo, TODAY)
    };
  })()`, ctx);
  assert(!result.inBrainQueue, `Pending candidate today should NOT be in brain confirmation queue (false = correct)`);
  console.log('  Pending candidate brain-queue=false (app.js handles separately): OK');
}

// テスト10: buildCalendarDedupeKey に startTime が含まれることで同日同金額別時間を区別
console.log('== buildCalendarDedupeKey includes startTime for time differentiation ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const event1000 = {
      scheduledDate: '2026-07-03', startTime: '10:00', endTime: '14:00',
      customerName: '伊地美千代様', serviceText: 'コープ', source: 'コープ', estimateAmount: 35090
    };
    const event1500 = {
      scheduledDate: '2026-07-03', startTime: '15:00', endTime: '17:30',
      customerName: '海老澤智貴様', serviceText: '直受R1', source: '直受', estimateAmount: 22000
    };
    return {
      key1: CalendarCandidateBrain.buildCalendarDedupeKey(event1000),
      key2: CalendarCandidateBrain.buildCalendarDedupeKey(event1500),
      differ: CalendarCandidateBrain.buildCalendarDedupeKey(event1000) !== CalendarCandidateBrain.buildCalendarDedupeKey(event1500)
    };
  })()`, ctx);
  assert(result.differ, `buildCalendarDedupeKey for different events on same day must differ`);
  assert(result.key1.includes('10:00'), `Key1 should include startTime 10:00`);
  assert(result.key2.includes('15:00'), `Key2 should include startTime 15:00`);
  console.log('  startTime in dedupeKey correctly differentiates events: OK');
}

console.log('\nAll v4.10.27 calendar-dedupe-revenue-queue checks passed.');

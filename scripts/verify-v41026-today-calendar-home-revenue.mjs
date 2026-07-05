/**
 * Budil v4.10.26 緊急修正 — 今日判定・カレンダー予定・経営ホーム売上 verification.
 *
 * 確認内容:
 * - v4.10.26 表示に更新されていること
 * - 今日キー生成がローカル日付基準であること（toISOString().slice(0,10) を今日判定に使っていないこと）
 * - 2026-07-03 08:16 JST の todayKey が "2026-07-03" になること
 * - 2026-07-03 の予定が「明日」扱いにならないこと
 * - 同一日付の複数予定が落ちないこと（伊地美千代様・海老澤智貴様 両方）
 * - 金額 35,090円 と 22,000円（税込）が正しく数値化されること
 * - 経営ホームの今月数字が予定込みの売上見込みを反映すること
 * - 「今月売上」という曖昧ラベルが残らないこと
 * - isRevenueConfirmationQueueCandidate が今日の予定を除外しないこと（>= 修正）
 * - v4.10.24 の利益管理定義を壊していないこと
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
  'js/executive-brain.js',
  'js/revenue-summary-brain.js',
  'js/profit-brain.js',
  'js/work-completion-brain.js',
  'js/calendar-candidate-brain.js',
  'js/work-order-brain.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.26 today-calendar-home-revenue ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const execBrainJs = load('js/executive-brain.js');
const revSummaryJs = load('js/revenue-summary-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

// --- バージョン確認 ---
console.log('== version check ==');
assert(indexHtml.includes('v4.11.5'), 'index.html should show v4.11.5');
assert(indexHtml.includes('js/app.js?v=4.11.5'), 'app.js cache buster should be v4.11.5');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.5'"), 'storage.js version should be v4.11.5');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.5'"), 'data-backup version should be v4.11.5');

// --- TODAY() がローカル日付基準であること ---
console.log('== TODAY() local date check ==');
assert(
  !appJs.match(/const TODAY\s*=\s*\(\)\s*=>\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/),
  'TODAY() must NOT use toISOString().slice(0,10) (UTC-based)'
);
assert(
  appJs.includes('d.getFullYear()') && appJs.includes('d.getMonth()') && appJs.includes('d.getDate()'),
  'TODAY() should use getFullYear/getMonth/getDate (local date)'
);

// --- isRevenueConfirmationQueueCandidate が >= を使っていること ---
console.log('== isRevenueConfirmationQueueCandidate >= check ==');
assert(
  revSummaryJs.includes('wo.scheduledDate >= t'),
  'isRevenueConfirmationQueueCandidate must use >= (not >) to exclude today from confirmation queue'
);
assert(
  !revSummaryJs.match(/isRevenueConfirmationQueueCandidate[\s\S]{0,200}wo\.scheduledDate > t/),
  'isRevenueConfirmationQueueCandidate must NOT use > t (which excludes today from upcoming)'
);

// --- 経営ホームの今月売上ラベルが曖昧でないこと ---
console.log('== executive home month revenue label check ==');
assert(
  execBrainJs.includes('monthRevenueLabel'),
  'executive-brain.js should have monthRevenueLabel field'
);
assert(
  execBrainJs.includes('合計売上') || execBrainJs.includes('今月合計売上') || execBrainJs.includes('今月予定売上') || execBrainJs.includes('今月の合計売上（予定含む）') || execBrainJs.includes('今月売上見込み（予定含む）'),
  'executive-brain.js should have a clear scheduled revenue label'
);
assert(
  appJs.includes('確定売上'),
  'app.js should show 確定売上 on executive home'
);
assert(
  !execBrainJs.match(/monthRevenueLabel[^=]*=.*'今月売上'[^（]/),
  'executive-brain.js monthRevenueLabel should not be just 今月売上 without qualifier'
);

// --- 経営ホームで共通月次メトリクスを使っていること ---
console.log('== executive home monthRevenue uses shared metrics ==');
assert(
  execBrainJs.includes('buildSharedMonthlyMetrics'),
  'executive-brain.js should use buildSharedMonthlyMetrics for monthRevenue calculation'
);
assert(
  execBrainJs.includes('totalRevenue') || execBrainJs.includes('plannedRevenue'),
  'executive-brain.js should expose totalRevenue from shared metrics'
);

// --- app.jsで予定売上ラベルを使っていること ---
console.log('== app.js uses scheduled revenue label ==');
assert(
  appJs.includes('合計売上') || appJs.includes('今月合計売上') || appJs.includes('今月予定売上') || appJs.includes("s.monthRevenueLabel || '今月売上'"),
  'app.js should show clear scheduled revenue label in revenue grid'
);
// 曖昧な「今月売上」がグリッドにハードコードされていないこと
assert(
  !appJs.includes("<span>今月売上</span>"),
  'app.js should not have hardcoded <span>今月売上</span> in grid'
);

// ============================================================
// 数値テスト: ローカル日付・今日判定・直近予定抽出
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
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

// テスト1: 金額パース確認
console.log('== parseAmount check ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    return {
      plain: CalendarCandidateBrain.parseAmount(35090),
      commaSen: CalendarCandidateBrain.parseAmount('35,090円'),
      taxIncl: CalendarCandidateBrain.parseAmount('22,000円（税込）'),
      plain2: CalendarCandidateBrain.parseAmount('22000'),
      zero: CalendarCandidateBrain.parseAmount(0),
      empty: CalendarCandidateBrain.parseAmount('')
    };
  })()`, ctx);
  assert(result.plain === 35090, `parseAmount(35090) should be 35090, got ${result.plain}`);
  assert(result.commaSen === 35090, `parseAmount('35,090円') should be 35090, got ${result.commaSen}`);
  assert(result.taxIncl === 22000, `parseAmount('22,000円（税込）') should be 22000, got ${result.taxIncl}`);
  assert(result.plain2 === 22000, `parseAmount('22000') should be 22000, got ${result.plain2}`);
  assert(result.zero === 0, `parseAmount(0) should be 0`);
  assert(result.empty === 0, `parseAmount('') should be 0`);
  console.log('  parseAmount: all cases OK');
}

// テスト2: formatUpcomingScheduleDate — 今日の予定が「今日」になること
console.log('== formatUpcomingScheduleDate today check ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    return {
      todayLabel:    RevenueSummaryBrain.formatUpcomingScheduleDate('2026-07-03', TODAY),
      tomorrowLabel: RevenueSummaryBrain.formatUpcomingScheduleDate('2026-07-04', TODAY),
      futureLabel:   RevenueSummaryBrain.formatUpcomingScheduleDate('2026-07-10', TODAY),
      yesterdayLabel: RevenueSummaryBrain.formatUpcomingScheduleDate('2026-07-02', TODAY)
    };
  })()`, ctx);
  assert(result.todayLabel === '今日', `2026-07-03 should be labeled 今日, got "${result.todayLabel}"`);
  assert(result.tomorrowLabel === '明日', `2026-07-04 should be labeled 明日, got "${result.tomorrowLabel}"`);
  assert(result.todayLabel !== '明日', `2026-07-03 must NOT be labeled 明日`);
  console.log(`  todayLabel="${result.todayLabel}" tomorrowLabel="${result.tomorrowLabel}" OK`);
}

// テスト3: isRevenueConfirmationQueueCandidate — 今日の予定（pending）は除外しないこと
console.log('== isRevenueConfirmationQueueCandidate today==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    // pending calendar candidate (未確認・カレンダー候補)
    const pendingWo = {
      id: 'wo-pending',
      scheduledDate: '2026-07-03',
      startTime: '15:00',
      customerName: '海老澤智貴様',
      serviceText: '直受 R1',
      estimateAmount: 22000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
    };
    // promoted calendar candidate (作業予定に追加済み)
    const promotedWo = {
      id: 'wo-promoted',
      scheduledDate: '2026-07-03',
      startTime: '10:00',
      customerName: '伊地 美千代様',
      serviceText: 'コープ R2',
      estimateAmount: 35090,
      status: 'tentative',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste' }
    };
    return {
      pendingInQueue: RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(pendingWo, TODAY),
      promotedInQueue: RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(promotedWo, TODAY)
    };
  })()`, ctx);
  assert(!result.pendingInQueue, `Today's PENDING calendar candidate must NOT be in confirmation queue`);
  assert(!result.promotedInQueue, `Today's PROMOTED calendar candidate must NOT be in confirmation queue`);
  console.log(`  pendingInQueue=${result.pendingInQueue} promotedInQueue=${result.promotedInQueue} OK`);
}

// テスト4: isUpcomingRevenueScheduleWorkOrder — 今日の2件が「直近予定」に含まれること
console.log('== isUpcomingRevenueScheduleWorkOrder today events ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const wo1 = {
      id: 'wo-1',
      scheduledDate: '2026-07-03',
      startTime: '10:00',
      endTime: '14:00',
      customerName: '伊地 美千代様',
      serviceText: 'コープ R2',
      estimateAmount: 35090,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
    };
    const wo2 = {
      id: 'wo-2',
      scheduledDate: '2026-07-03',
      startTime: '15:00',
      endTime: '17:30',
      customerName: '海老澤智貴様',
      serviceText: '直受 R1',
      estimateAmount: 22000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
    };
    return {
      wo1Upcoming: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo1, TODAY),
      wo2Upcoming: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo2, TODAY)
    };
  })()`, ctx);
  assert(result.wo1Upcoming, `伊地美千代様 (wo1) must appear in upcoming schedule (今日の予定)`);
  assert(result.wo2Upcoming, `海老澤智貴様 (wo2) must appear in upcoming schedule (今日の予定)`);
  console.log(`  wo1Upcoming=${result.wo1Upcoming} wo2Upcoming=${result.wo2Upcoming} OK`);
}

// テスト5: buildUpcomingRevenueScheduleSummary — 同日2件が両方含まれること
console.log('== buildUpcomingRevenueScheduleSummary same-day 2 events ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const workOrders = [
      {
        id: 'wo-1',
        scheduledDate: '2026-07-03',
        startTime: '10:00',
        endTime: '14:00',
        customerName: '伊地 美千代様',
        serviceText: 'コープ エアコン R2',
        estimateAmount: 35090,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      },
      {
        id: 'wo-2',
        scheduledDate: '2026-07-03',
        startTime: '15:00',
        endTime: '17:30',
        customerName: '海老澤智貴様',
        serviceText: '直受 エアコン R1',
        estimateAmount: 22000,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      }
    ];
    const summary = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, TODAY);
    return summary;
  })()`, ctx);
  assert(result.upcoming.length === 2, `buildUpcomingRevenueScheduleSummary must return 2 events (同日2件), got ${result.upcoming.length}`);
  const labels = result.upcoming.map(u => u.dateLabel);
  assert(labels.every(l => l === '今日'), `All today events must be labeled 今日, got: ${JSON.stringify(labels)}`);
  assert(labels.indexOf('明日') === -1, `Today events must NOT be labeled 明日`);
  const totalAmt = result.upcoming.reduce((s, u) => s + u.amount, 0);
  assert(totalAmt === 57090, `Total amount should be 57090 (35090+22000), got ${totalAmt}`);
  const names = result.upcoming.map(u => u.customerName);
  assert(names.some(n => n.includes('伊地')), `伊地美千代様 must appear in upcoming`);
  assert(names.some(n => n.includes('海老澤')), `海老澤智貴様 must appear in upcoming`);
  console.log(`  upcoming count=${result.upcoming.length} labels=${JSON.stringify(labels)} total=${totalAmt} OK`);
}

// テスト6: 経営ホーム monthRevenue が予定含む売上を反映すること
console.log('== executive home monthRevenue includes workOrder estimates ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const workOrders = [
      {
        id: 'wo-1',
        scheduledDate: '2026-07-03',
        startTime: '10:00',
        customerName: '伊地 美千代様',
        serviceText: 'コープ R2',
        estimateAmount: 35090,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      },
      {
        id: 'wo-2',
        scheduledDate: '2026-07-03',
        startTime: '15:00',
        customerName: '海老澤智貴様',
        serviceText: '直受 R1',
        estimateAmount: 22000,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      }
    ];
    const profitCtx = ProfitBrain.buildProfitContext({
      today: TODAY,
      revenues: [],
      expenses: [],
      workOrders,
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    const ps = profitCtx.summary || {};
    return {
      plannedRevenueEstimate: ps.plannedRevenueEstimate,
      totalRevenue: ps.totalRevenue,
      confirmedRevenue: ps.confirmedRevenue,
      usesMonthlyResult: ps.usesMonthlyResult
    };
  })()`, ctx);
  assert(result.plannedRevenueEstimate === 57090, `plannedRevenueEstimate should be 57090 (35090+22000), got ${result.plannedRevenueEstimate}`);
  assert(result.totalRevenue === 57090, `totalRevenue should be 57090, got ${result.totalRevenue}`);
  assert(result.confirmedRevenue === 0, `confirmedRevenue should be 0 (no confirmed records), got ${result.confirmedRevenue}`);
  console.log(`  plannedRevenueEstimate=${result.plannedRevenueEstimate} totalRevenue=${result.totalRevenue} OK`);
}

// テスト7: buildRevenueProfitSection monthRevenue と monthRevenueLabel
console.log('== buildRevenueProfitSection monthRevenue label ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const workOrders = [
      {
        id: 'wo-1',
        scheduledDate: '2026-07-03',
        startTime: '10:00',
        customerName: '伊地 美千代様',
        serviceText: 'コープ R2',
        estimateAmount: 35090,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      },
      {
        id: 'wo-2',
        scheduledDate: '2026-07-03',
        startTime: '15:00',
        customerName: '海老澤智貴様',
        serviceText: '直受 R1',
        estimateAmount: 22000,
        status: 'tentative',
        candidateMeta: { candidateStatus: '候補', importSource: 'calendar-paste' }
      }
    ];
    const profitCtx = ProfitBrain.buildProfitContext({
      today: TODAY,
      revenues: [],
      expenses: [],
      workOrders,
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    const ctx_exec = {
      today: TODAY,
      workOrders,
      revenues: [],
      expenses: [],
      leads: [],
      intakes: [],
      revCtx: {
        records: [],
        summary: { planned: 0, confirmed: 0, total: 0, monthlyTarget: 0, achievementRate: 0 },
        revenueSummary: null
      },
      profitCtx,
      forecast: { todayCount: 2, todayAmount: 57090, weekCount: 2, weekAmount: 57090 }
    };
    const section = ExecutiveBrain.buildRevenueProfitSection(ctx_exec);
    return {
      monthRevenue: section.monthRevenue,
      monthRevenueLabel: section.monthRevenueLabel
    };
  })()`, ctx);
  assert(result.monthRevenue === 57090, `section.monthRevenue should be 57090, got ${result.monthRevenue}`);
  assert(result.monthRevenueLabel !== '今月売上', `section.monthRevenueLabel must not be plain 今月売上`);
  assert(
    result.monthRevenueLabel.includes('予定含む') || result.monthRevenueLabel.includes('合計') || result.monthRevenueLabel.includes('予定売上'),
    `section.monthRevenueLabel should indicate scheduled revenue, got "${result.monthRevenueLabel}"`
  );
  console.log(`  monthRevenue=${result.monthRevenue} label="${result.monthRevenueLabel}" OK`);
}

// テスト8: 昨日の予定は今日に比べて確認キューに入ること（past確認）
console.log('== yesterday events enter confirmation queue ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-03';
    const yesterdayWo = {
      id: 'wo-past',
      scheduledDate: '2026-07-02',
      startTime: '10:00',
      customerName: 'テスト様',
      serviceText: 'エアコン R1',
      estimateAmount: 20000,
      status: 'tentative',
      candidateMeta: { candidateStatus: '作業予定に追加済み', importSource: 'calendar-paste' }
    };
    return {
      inQueue: RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(yesterdayWo, TODAY),
      inUpcoming: RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(yesterdayWo, TODAY)
    };
  })()`, ctx);
  assert(result.inQueue, `Yesterday's promoted wo should be in confirmation queue`);
  assert(!result.inUpcoming, `Yesterday's wo should NOT be in upcoming schedule`);
  console.log(`  yesterday: inQueue=${result.inQueue} inUpcoming=${result.inUpcoming} OK`);
}

// --- v4.10.24 利益管理定義が壊れていないこと ---
console.log('== v4.10.24 profit definition regression ==');
assert(profitBrainJs.includes('confirmedMonthRevenues'), 'ProfitBrain should still use confirmedMonthRevenues');
assert(profitBrainJs.includes('isConfirmedRevenueStatus'), 'ProfitBrain should still use isConfirmedRevenueStatus');
assert(profitBrainJs.includes('plannedRevenueEstimate'), 'ProfitBrain should have plannedRevenueEstimate (3-tier)');
assert(profitBrainJs.includes('plannedForecastProfit'), 'ProfitBrain should have plannedForecastProfit');
assert(profitBrainJs.includes('confirmedRevenue'), 'ProfitBrain should have confirmedRevenue');
assert(profitBrainJs.includes('totalRevenue'), 'ProfitBrain should have totalRevenue');

// --- v4.10.25 請求書UI修正が維持されていること ---
console.log('== v4.10.25 documents-ui regression ==');
const css = load('css/style.css');
assert(css.includes('v4.10.25 請求書・見積書'), 'css should still include v4.10.25 documents marker');
assert(indexHtml.includes('css/style.css?v=4.10.41'), 'css cache buster should remain v4.10.25.1');

// --- NG文言確認 ---
console.log('== NG term check ==');
const forbiddenUiTerms = [
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include NG term: ${term}`);
  assert(!appJs.includes(term), `app.js should not include NG term: ${term}`);
}
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');
console.log('  NG terms: none found OK');

// --- CSS変更なし（v4.10.26ではCSS未変更） ---
assert(!css.includes('v4.10.26-rev'), 'css/style.css should NOT have v4.10.26-rev marker (CSS未変更)');
console.log('  CSS unchanged OK');

console.log('\nAll v4.10.26 today-calendar-home-revenue checks passed.');

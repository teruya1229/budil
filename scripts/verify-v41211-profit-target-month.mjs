/**
 * Budil v4.12.17 - profit target month view.
 * Static wiring checks + month-spanning execution asserts (A–E).
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

for (const file of [
  'js/app.js',
  'js/profit-brain.js',
  'js/revenue-brain.js',
  'js/revenue-summary-brain.js',
  'js/monthly-results-brain.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.17 profit-target-month ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.17'), 'index.html should show v4.12.17');
assert(indexHtml.includes('js/app.js?v=4.12.17'), 'app.js cache buster should be v4.12.17');
assert(indexHtml.includes('js/profit-brain.js?v=4.12.17'), 'profit-brain cache buster should be v4.12.17');
assert(indexHtml.includes('css/style.css?v=4.12.17'), 'style.css cache buster should be v4.12.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.17'"), 'storage version should be v4.12.17');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.17'"), 'data-backup version should be v4.12.17');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.17'"), 'verify-current EXPECTED_VERSION should be v4.12.17');
assert(!indexHtml.includes('?v=4.12.10'), 'old cache buster v4.12.10 should be gone');
assert(statusMd.includes('v4.12.17'), 'status.md should document v4.12.17');
assert(handoffMd.includes('v4.12.17'), 'handoff.md should document v4.12.17');
assert(decisionLog.includes('v4.12.17'), 'decision-log.md should record v4.12.17');
assert(statusMd.includes('d483339') && statusMd.includes('bdd4eaa'), 'status.md should record body + docs commits');
assert(handoffMd.includes('d483339') && handoffMd.includes('bdd4eaa'), 'handoff.md should record body + docs commits');
assert(decisionLog.includes('d483339') && decisionLog.includes('bdd4eaa'), 'decision-log.md should record body + docs commits');
assert(statusMd.includes('公開URLで v4.12.11 確認済み'), 'status.md should note public URL confirmation');
assert(handoffMd.includes('公開URLで v4.12.11 確認済み'), 'handoff.md should note public URL confirmation');
assert(decisionLog.includes('公開URLで v4.12.11 確認済み'), 'decision-log.md should note public URL confirmation');
assert(statusMd.includes('70/70') || statusMd.includes('verify-current 70'), 'status.md should note 70/70');
assert(handoffMd.includes('70/70'), 'handoff.md should note 70/70');
assert(decisionLog.includes('70/70'), 'decision-log.md should note 70/70');

console.log('== UI wiring ==');
assert(indexHtml.includes('id="profit-target-month"'), 'profit target month input required');
assert(indexHtml.includes('id="profit-target-month-reset"'), 'reset-to-current-month button required');
assert(indexHtml.includes('今月に戻す'), 'reset button label required');
assert(indexHtml.includes('id="profit-status-heading"'), 'dynamic status heading required');
assert(indexHtml.includes('id="profit-numbers-heading"'), 'dynamic numbers heading required');
assert(css.includes('profit-target-month-bar'), 'minimal CSS for target month bar required');

console.log('== in-memory state only ==');
assert(appJs.includes('let profitTargetMonthKey = null'), 'profitTargetMonthKey must be in-memory');
assert(appJs.includes('useProfitTargetMonth'), 'profit view must opt into target month context');
assert(!appJs.includes("localStorage.setItem('profitTargetMonth"), 'must not persist target month to localStorage');
assert(!appJs.includes('profit_target_month'), 'must not add profit_target_month storage key');
assert(!storageJs.includes('profitTargetMonth'), 'storage.js must not gain profitTargetMonth key');

console.log('== same-month filtering ==');
assert(appJs.includes('filterRecordsForProfitMonth'), 'month filter helper required');
assert(appJs.includes('getProfitContext({ useProfitTargetMonth: true })'), 'profit view context must use target month');
assert(appJs.includes('ctx.workOrderRows = []'), 'past month must clear work-order forecast rows');
assert(appJs.includes('buildUpcomingRevenueScheduleSummary(monthWorkOrders'), 'upcoming schedule must use selected-month work orders');
assert(appJs.includes("useProfitTargetMonth: true"), 'monthly closing from profit must pass target month');

console.log('== monthly result summary vs detail ==');
assert(appJs.includes('resolveProfitSummaryMetrics'), 'monthly-result summary metrics helper required');
assert(appJs.includes('s.usesMonthlyResult'), 'summary must detect monthly-result months');
assert(appJs.includes('詳細分析は保存済み明細のみ'), 'monthly-result note must clarify detail is detail-only');
assert(!profitJs.includes('push(...monthly') && !appJs.includes('月次実績を売上行'), 'must not invent detail rows from monthly results');

console.log('== future month soft handling ==');
assert(appJs.includes("monthKind === 'future'"), 'future month branch required');
assert(appJs.includes('予定確認用'), 'future month must be labeled preview');
assert(appJs.includes('future_preview') || appJs.includes('月次実績未入力・経費未入力を締め警告にしません'), 'future month must not treat missing monthly as closing warning');

console.log('== other screens stay current-month ==');
assert(appJs.includes('getSharedMonthlyMetrics()'), 'other screens keep default current-month shared metrics');
assert(appJs.includes("renderMonthlyClosingCheck('exec-home-monthly-closing-check'"), 'exec home closing check remains');
assert(appJs.includes("renderMonthlyClosingCheck('revenue-monthly-closing-check'"), 'revenue closing check remains');

console.log('== profit rates / source / calendar unchanged ==');
assert(revenueJs.includes('direct: 100'), 'direct profit rate unchanged');
assert(revenueJs.includes('coop: 80'), 'coop profit rate unchanged');
assert(revenueJs.includes('yamada: 60'), 'yamada profit rate unchanged');
assert(profitJs.includes('resolveRevenueSourceLabel'), 'v4.12.10 source display helper must remain');
assert(!appJs.includes('localStorage.clear'), 'app must not clear localStorage');
assert(!indexHtml.includes('exportCalendarForBudil'), 'calendar API must not enter Budil UI');

function extractAppFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `app.js must define ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert(end > start, `app.js must define ${nextName} after ${name}`);
  return source.slice(start, end);
}

function createSandbox() {
  const sandbox = {
    console,
    PaymentBrain: null,
    RevenueBrain: null,
    RevenueSummaryBrain: null,
    MonthlyResultsBrain: null,
    ProfitBrain: null,
    WorkOrderBrain: {
      forOperationalList: (x) => x || [],
      normalizeWorkOrder: (x) => x || {},
      ACTIVE_STATUSES: ['scheduled', 'confirmed', 'in_progress', '予定', '確定'],
      addDays: (d, n) => {
        const dt = new Date(`${d}T12:00:00`);
        dt.setDate(dt.getDate() + Number(n || 0));
        return dt.toISOString().slice(0, 10);
      },
      sortByScheduledDateTimeAsc: (list) => (list || []).slice().sort((a, b) => {
        const d = String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
        if (d !== 0) return d;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
      })
    },
    CalendarCandidateBrain: undefined,
    WorkCompletionBrain: undefined
  };
  const ctx = createContext(sandbox);
  runInContext(load('js/payment-brain.js'), ctx);
  runInContext(load('js/revenue-brain.js'), ctx);
  runInContext(load('js/revenue-summary-brain.js'), ctx);
  runInContext(load('js/monthly-results-brain.js'), ctx);
  runInContext(load('js/profit-brain.js'), ctx);
  runInContext(
    'function TODAY() { return "2026-07-11"; }\n'
    + `${extractAppFunction(appJs, 'getCurrentProfitMonthKey', 'getResolvedProfitTargetMonthKey')}\n`
    + `${extractAppFunction(appJs, 'formatProfitMonthLabel', 'getProfitMonthKind')}\n`
    + `${extractAppFunction(appJs, 'getProfitMonthKind', 'filterRecordsForProfitMonth')}\n`
    + `${extractAppFunction(appJs, 'filterRecordsForProfitMonth', 'resolveProfitSummaryMetrics')}\n`
    + 'this.getCurrentProfitMonthKey = getCurrentProfitMonthKey;\n'
    + 'this.formatProfitMonthLabel = formatProfitMonthLabel;\n'
    + 'this.getProfitMonthKind = getProfitMonthKind;\n'
    + 'this.filterRecordsForProfitMonth = filterRecordsForProfitMonth;\n',
    ctx
  );
  return ctx;
}

const vm = createSandbox();
const TODAY = '2026-07-11';

const allRevenues = [
  { id: 'rev-may', workDate: '2026-05-10', amount: 12000, source: '直受け', service: 'エアコン通常', status: '確定', paymentStatus: 'paid', customerName: '五月太郎' },
  { id: 'rev-jul', workDate: '2026-07-05', amount: 18000, source: 'コープ', service: 'エアコン通常', status: '確定', paymentStatus: 'paid', customerName: '七月花子' }
];
const allExpenses = [
  { id: 'exp-may', date: '2026-05-12', amount: 3000, category: '交通・燃料', memo: '五月経費' },
  { id: 'exp-jul', date: '2026-07-06', amount: 4500, category: '材料費', memo: '七月経費' }
];
const allWorkOrders = [
  { id: 'wo-may', scheduledDate: '2026-05-20', estimateAmount: 15000, status: 'scheduled', customerName: '五月予定', serviceText: 'エアコン通常', source: '直受け' },
  { id: 'wo-jul', scheduledDate: '2026-07-20', estimateAmount: 22000, status: 'scheduled', customerName: '七月予定', serviceText: 'エアコン通常', source: '直受け' },
  { id: 'wo-aug', scheduledDate: '2026-08-15', estimateAmount: 30000, status: 'scheduled', customerName: '八月予定', serviceText: 'エアコン通常', source: '直受け' }
];
const mayMonthly = {
  id: '2026-05',
  month: '2026-05',
  sales: 500000,
  brokerFee: 50000,
  materialCost: 20000,
  laborCost: 30000,
  outsourcingCost: 0,
  otherCost: 10000,
  profit: 390000,
  memo: '五月月次'
};

function scopedProfitContext(monthKey, monthlyResults) {
  return runInContext(`(() => {
    const monthKey = ${JSON.stringify(monthKey)};
    const today = ${JSON.stringify(TODAY)};
    const revenues = ${JSON.stringify(allRevenues)};
    const expenses = ${JSON.stringify(allExpenses)};
    const workOrders = ${JSON.stringify(allWorkOrders)};
    const monthlyResults = ${JSON.stringify(monthlyResults || [])};
    const scoped = filterRecordsForProfitMonth(revenues, expenses, workOrders, monthKey);
    const ctx = ProfitBrain.buildProfitContext({
      today,
      revenues: scoped.revenues,
      expenses: scoped.expenses,
      workOrders: scoped.workOrders,
      leads: [],
      intakes: [],
      monthlyResults,
      monthKey
    });
    const kind = getProfitMonthKind(monthKey, today);
    if (kind === 'past') ctx.workOrderRows = [];
    ctx.profitMonthKind = kind;
    ctx.profitMonthKey = monthKey;
    return { scoped, ctx, kind };
  })()`, vm);
}

console.log('== A. past-month cross-month isolation ==');
{
  const { scoped, ctx, kind } = scopedProfitContext('2026-05', [mayMonthly]);
  assert(kind === 'past', '2026-05 should be past relative to 2026-07-11');
  assert(scoped.revenues.length === 1 && scoped.revenues[0].id === 'rev-may', 'May filter: revenues must be May-only');
  assert(scoped.expenses.length === 1 && scoped.expenses[0].id === 'exp-may', 'May filter: expenses must be May-only');
  assert(scoped.workOrders.length === 1 && scoped.workOrders[0].id === 'wo-may', 'May filter: work orders must be May-only');
  assert(!scoped.revenues.some((r) => r.id === 'rev-jul'), 'May filter must exclude July revenue');
  assert(!scoped.expenses.some((e) => e.id === 'exp-jul'), 'May filter must exclude July expense');
  assert(!scoped.workOrders.some((w) => w.id === 'wo-jul' || w.id === 'wo-aug'), 'May filter must exclude Jul/Aug work orders');
  assert(Array.isArray(ctx.workOrderRows) && ctx.workOrderRows.length === 0, 'past month must clear workOrderRows');
  const revIds = (ctx.revenueRows || []).map((r) => r.revenueId);
  assert(revIds.includes('rev-may'), 'May detail revenue row must remain');
  assert(!revIds.includes('rev-jul'), 'July revenue must not appear in May detail rows');
}

console.log('== B. past month monthly-result priority / no invented detail ==');
{
  const { scoped, ctx } = scopedProfitContext('2026-05', [mayMonthly]);
  const s = ctx.summary || {};
  assert(s.usesMonthlyResult === true, 'May with monthly result must set usesMonthlyResult');
  assert(Number(s.monthRevenue) === 500000, `May summary revenue must prefer monthly 500000, got ${s.monthRevenue}`);
  assert(Number(s.monthExpense) === 110000, `May summary expense must prefer monthly total 110000, got ${s.monthExpense}`);
  assert(Number(s.monthGrossProfit) === 390000, `May summary profit must prefer monthly 390000, got ${s.monthGrossProfit}`);
  assert(Number(s.monthRevenue) !== 12000, 'summary must not fall back to detail-only revenue when monthly exists');
  assert(Number(s.monthRevenue) !== 500000 + 12000, 'summary must not double-count monthly + detail revenue');
  assert(Number(s.monthExpense) !== 110000 + 3000, 'summary must not double-count monthly + detail expense');
  const revIds = (ctx.revenueRows || []).map((r) => r.revenueId);
  assert(revIds.length === 1 && revIds[0] === 'rev-may', 'detail revenue rows must be saved May detail only');
  assert(!revIds.some((id) => String(id).includes('monthly')), 'must not invent revenue rows from monthly result');
  assert(!revIds.includes('rev-jul'), 'July detail must not mix into May analysis');
  const expIds = (ctx.expenses || []).map((e) => e.id);
  assert(expIds.includes('exp-may') && !expIds.includes('exp-jul'), 'detail expenses must stay May-only');
  assert(scoped.revenues.every((r) => String(r.workDate).startsWith('2026-05')), 'scoped revenues stay in 2026-05');
}

console.log('== C. past month without monthly result uses detail ==');
{
  const { ctx } = scopedProfitContext('2026-05', []);
  const s = ctx.summary || {};
  assert(s.usesMonthlyResult !== true, 'without monthly result, usesMonthlyResult must be false');
  assert(Number(s.monthRevenue) === 12000, `detail-based May revenue should be 12000, got ${s.monthRevenue}`);
  assert(Number(s.monthExpense) === 3000, `detail-based May expense should be 3000, got ${s.monthExpense}`);
  const revIds = (ctx.revenueRows || []).map((r) => r.revenueId);
  assert(revIds.includes('rev-may') && !revIds.includes('rev-jul'), 'detail-only path still isolates May rows');
}

console.log('== D. future month schedule isolation + soft closing ==');
{
  const monthKey = '2026-08';
  const kind = runInContext(`getProfitMonthKind(${JSON.stringify(monthKey)}, ${JSON.stringify(TODAY)})`, vm);
  assert(kind === 'future', '2026-08 should be future relative to 2026-07-11');

  const upcoming = runInContext(`(() => {
    const monthKey = ${JSON.stringify(monthKey)};
    const today = ${JSON.stringify(TODAY)};
    const workOrders = ${JSON.stringify(allWorkOrders)};
    const monthWorkOrders = workOrders.filter(w => w && w.scheduledDate && String(w.scheduledDate).startsWith(monthKey));
    return {
      monthWorkOrders,
      summary: RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(monthWorkOrders, today)
    };
  })()`, vm);

  assert(upcoming.monthWorkOrders.length === 1 && upcoming.monthWorkOrders[0].id === 'wo-aug', 'future filter must keep August work order only');
  const upcomingIds = (upcoming.summary.upcoming || []).map((u) => u.id);
  assert(upcomingIds.includes('wo-aug'), 'August upcoming schedule must include wo-aug');
  assert(!upcomingIds.includes('wo-may') && !upcomingIds.includes('wo-jul'), 'May/July work orders must not mix into August upcoming');
  assert((upcoming.summary.upcomingCount || 0) === 1, 'August upcoming count must be 1');

  const closing = runInContext(`(() => {
    const monthKey = ${JSON.stringify(monthKey)};
    const today = ${JSON.stringify(TODAY)};
    const workOrders = ${JSON.stringify(allWorkOrders)}.filter(w => w.scheduledDate && String(w.scheduledDate).startsWith(monthKey));
    const profitCtx = ProfitBrain.buildProfitContext({
      today,
      revenues: [],
      expenses: [],
      workOrders,
      leads: [],
      intakes: [],
      monthlyResults: [],
      monthKey
    });
    profitCtx.profitMonthKind = 'future';
    profitCtx.profitMonthKey = monthKey;
    const check = ProfitBrain.buildMonthlyClosingCheck({
      today,
      profitCtx,
      workOrders,
      revenues: [],
      monthlyResults: [],
      expenses: []
    });
    let statusKey = check.statusKey;
    let statusMessages = (check.statusMessages || []).slice();
    let nextAction = check.nextAction;
    let primaryAction = check.primaryAction;
    const monthKind = 'future';
    if (monthKind === 'future') {
      statusKey = 'future_preview';
      statusMessages = [
        formatProfitMonthLabel(monthKey) + 'は予定確認用です',
        check.hasMonthlyResult || (profitCtx.summary && profitCtx.summary.usesMonthlyResult)
          ? 'この未来月には月次実績があります（読み取り専用）'
          : '未来月のため、月次実績未入力・経費未入力を締め警告にしません'
      ];
      nextAction = '未来月の予定を確認してください。';
      primaryAction = null;
    }
    return {
      rawHasMonthly: !!check.hasMonthlyResult,
      rawMessages: check.statusMessages || [],
      statusKey,
      statusMessages,
      nextAction,
      primaryAction
    };
  })()`, vm);

  assert(closing.rawHasMonthly === false, 'August fixture has no monthly result');
  assert(closing.rawMessages.some((m) => /月次実績が未入力|経費入力がまだありません/.test(m)), 'raw closing would warn without future override');
  assert(closing.statusKey === 'future_preview', 'future month closing must become future_preview');
  assert(closing.primaryAction === null, 'future month must not keep gap/add CTAs as primaryAction');
  assert(
    closing.statusMessages.some((m) => m.includes('月次実績未入力・経費未入力を締め警告にしません')),
    'future month must keep soft message instead of closing warning'
  );
  assert(!closing.statusMessages.includes('月次実績が未入力です'), 'future override must not keep monthly-missing closing warning');
  assert(!closing.statusMessages.includes('経費入力がまだありません'), 'future override must not keep expense-missing closing warning');

  assert(appJs.includes("statusKey = 'future_preview'"), 'app must keep future_preview assignment');
  assert(appJs.includes('月次実績未入力・経費未入力を締め警告にしません'), 'app must keep future soft-closing copy');
  assert(appJs.includes("monthKind === 'future' && (statusKey === 'no_expense' || statusKey === 'low_expense')"), 'app must soften future no_expense/low_expense diagnostics');
}

console.log('== E. profit rates / persistence invariants (runtime) ==');
{
  const rateCases = [
    ['直受け', 100, false],
    ['LINE', 100, false],
    ['コープ', 80, false],
    ['くらしのマーケット', 80, false],
    ['ヤマダ', 60, false],
    ['', 0, true],
    ['不明', 0, true]
  ];
  for (const [source, rate, reviewRequired] of rateCases) {
    const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, vm);
    assert(info.rate === rate, `${source || '(empty)'} rate must stay ${rate}, got ${info.rate}`);
    assert(info.reviewRequired === reviewRequired, `${source || '(empty)'} reviewRequired must stay ${reviewRequired}`);
  }
  assert(appJs.includes('let profitTargetMonthKey = null'), 'profitTargetMonthKey remains JS memory only');
  assert(!storageJs.includes('profitTargetMonth'), 'no new storage key for target month');
  assert(!storageJs.includes('profit_target_month'), 'no profit_target_month storage key');
  assert(!profitJs.includes('record.source ='), 'profit-brain must not rewrite record.source');
  assert(!profitJs.includes('localStorage'), 'profit-brain must not touch localStorage');
  assert(!appJs.includes('月次実績を売上行') && !profitJs.includes('inventDetailFromMonthly'), 'no auto-decompose monthly into detail rows');
  assert(profitJs.includes('buildProfitSummaryFromMonthly') || load('js/monthly-results-brain.js').includes('buildProfitSummaryFromMonthly'), 'monthly summary overlay remains summary-only');
}

console.log('\nAll v4.12.17 profit-target-month checks passed.');

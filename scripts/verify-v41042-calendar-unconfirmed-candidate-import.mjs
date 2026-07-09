/**
 * Budil v4.12.4 - calendar unconfirmed candidate import verification.
 *
 * 玉澤 真理子様ケース:
 * - confirmationStatus: 未確定 でも候補から落とさない
 * - 日付・時間・金額・作業内容を保持
 * - 作業予定に追加できる / 追加済みなら二重追加しない
 * - 休み・金額なし・日付なし・時間なしは除外
 * - v4.10.27 重複判定 / v4.10.39 受付同期 / v4.10.41 フォロー導線を維持
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
  'js/calendar-candidate-brain.js',
  'js/app.js',
  'js/revenue-summary-brain.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 calendar-unconfirmed-candidate-import ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calBrainJs = load('js/calendar-candidate-brain.js');
const revSummaryJs = load('js/revenue-summary-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');

const TAMAZAWA_DEDUPE = 'google_calendar|primary|tamazawa-r2-20260707';
const TODAY = '2026-07-05';

const tamazawaItem = {
  title: 'コープ 玉澤 真理子様 R2',
  date: '2026-07-07',
  start: { time: '10:00', isAllDay: false },
  end: { time: '14:00', isAllDay: false },
  description: '金額：32,670円\n作業内容：R2\n確認Status：未確定',
  extracted: {
    customerName: '玉澤 真理子様',
    amount: 32670,
    amountText: '32,670円',
    workType: 'R2',
    requestSource: 'コープ',
    confirmationStatus: '未確定'
  },
  budilImport: {
    dedupeKey: TAMAZAWA_DEDUPE,
    source: 'google_calendar'
  }
};

console.log('== version check ==');
assert(indexHtml.includes('v4.12.5'), 'index.html should show v4.12.4');
assert(indexHtml.includes('js/app.js?v=4.12.5'), 'app.js cache buster should be v4.12.4');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.11.1'), 'calendar brain cache buster should remain v4.11.1');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.5'"), 'storage.js version should be v4.12.4');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.5'"), 'data-backup version should be v4.12.4');

console.log('== v4.12.4 brain markers ==');
assert(calBrainJs.includes('v4.11.1'), 'calendar-candidate-brain.js should include v4.11.1 marker');
assert(calBrainJs.includes('NON_EXCLUSION_CONFIRMATION_STATUSES'), 'non-exclusion confirmation statuses should exist');
assert(calBrainJs.includes('resolveConfirmationStatus'), 'resolveConfirmationStatus should exist');
assert(!calBrainJs.includes('仮押さえ|未確定/'), 'PAST_RECOVERY pattern must not treat bare 未確定 as exclusion');
assert(calBrainJs.includes("if (!c.startTime) reasons.push('時間なし')"), 'future import should require start time');
assert(calBrainJs.includes("if (!String(c.serviceText || '').trim()) reasons.push('作業内容なし')"), 'future import should require service text');

console.log('== CSS unchanged ==');
assert(css.includes('v4.10.41 follow card actions'), 'v4.10.41 follow css marker should remain');

console.log('== v4.10.27 dedupe maintained ==');
assert(calBrainJs.includes('v4.10.27'), 'v4.10.27 dedupe comment should remain');
assert(calBrainJs.includes("c.startTime || ''") && calBrainJs.includes("c.endTime || ''"), 'buildCalendarDedupeKey should keep start/end time');

console.log('== v4.10.39 reception sync maintained ==');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'v4.10.39 reception sync should remain');
assert(appJs.includes('isReceptionIntakeRevenueResolved'), 'v4.10.39 app sync helper should remain');

console.log('== v4.10.41 follow flow maintained ==');
assert(appJs.includes('data-daily-priority-follow-open'), 'v4.10.41 follow wiring should remain');
assert(appJs.includes('お礼LINEを作る/確認'), 'v4.10.41 thanks label should remain');

console.log('== NG term check ==');
const ngTerms = ['今月売上</span>', '今月売上（確定分）', '今月の粗利'];
for (const term of ngTerms) {
  assert(!indexHtml.includes(term) && !appJs.includes(term), `NG term "${term}" must not appear`);
}

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    _data: data
  };
}

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
  const ctx = createContext({
    localStorage,
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
  runInContext(load('js/map-brain.js'), ctx, { filename: 'map-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

console.log('== tamazawa candidate mapping ==');
{
  const { ctx } = createSandbox();
  const candidate = runInContext(`CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(tamazawaItem)})`, ctx);
  assert(candidate.customerName.includes('玉澤'), 'customerName should include 玉澤');
  assert(candidate.scheduledDate === '2026-07-07', 'scheduledDate should be 2026-07-07');
  assert(candidate.startTime === '10:00', 'startTime should be 10:00');
  assert(candidate.endTime === '14:00', 'endTime should be 14:00');
  assert(candidate.estimateAmount === 32670, 'estimateAmount should be 32670');
  assert(candidate.serviceText === 'R2', 'serviceText should be R2');
  assert(candidate.confirmationStatus === '未確定', 'confirmationStatus should map to 未確定');
  assert(candidate.confidence === '未確定', 'confidence should mirror confirmationStatus');

  const futureImport = runInContext(
    `CalendarCandidateBrain.classifyFutureImportCandidate(${JSON.stringify(candidate)}, '${TODAY}')`,
    ctx
  );
  assert(futureImport.status === 'eligible', `tamazawa should be eligible, got ${futureImport.status}`);
  assert(futureImport.savable === true, 'tamazawa should be savable');
  assert(!futureImport.reasons.includes('未確定'), '未確定 must not be an exclusion reason');

  const pastExcluded = runInContext(`CalendarCandidateBrain.hasPastRecoveryExcludedWord(${JSON.stringify(candidate)})`, ctx);
  assert(pastExcluded === false, 'memo/status 未確定 must not trigger past recovery exclusion');

  const preview = runInContext(`(() => {
    const parsed = { candidates: [${JSON.stringify(candidate)}], warnings: [], errors: [], sourceFormat: 'budil-calendar-json' };
    const built = CalendarCandidateBrain.buildImportPreview(parsed, []);
    return CalendarCandidateBrain.attachFutureImportPreview(built, '${TODAY}');
  })()`, ctx);
  assert(preview.items[0].futureImport.status === 'eligible', 'preview should keep tamazawa eligible');
  assert(preview.futureImportSummary.savableCount === 1, 'preview savableCount should be 1');
}

console.log('== save and upcoming ==');
{
  const { ctx, localStorage } = createSandbox();
  runInContext(`(() => {
    const candidate = CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(tamazawaItem)});
    const payload = CalendarCandidateBrain.createWorkOrderPayload(candidate, {
      calendarDedupeKey: candidate.calendarDedupeKey,
      importSource: CalendarCandidateBrain.JSON_IMPORT_SOURCE,
      candidateStatus: '作業予定に追加済み'
    });
    Storage.addWorkOrder(payload);
  })()`, ctx);
  const workOrders = JSON.parse(localStorage.getItem('budil_work_orders') || '[]');
  assert(workOrders.length === 1, 'tamazawa should save once');
  assert(workOrders[0].calendarDedupeKey === TAMAZAWA_DEDUPE, 'dedupe key should remain');
  assert(workOrders[0].candidateMeta.confidence === '未確定', 'saved confidence should remain 未確定');

  const upcoming = runInContext(
    `RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(JSON.parse(localStorage.getItem('budil_work_orders')), '${TODAY}')`,
    ctx
  );
  assert(upcoming.upcomingCount === 1, 'tamazawa should appear in upcoming schedule');
  assert(upcoming.upcoming[0].customerName.includes('玉澤'), 'upcoming should include tamazawa');
  assert(upcoming.upcoming[0].amount === 32670, 'upcoming amount should be 32670');

  const dupPreview = runInContext(`(() => {
    const candidate = CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(tamazawaItem)});
    const parsed = { candidates: [candidate], warnings: [], errors: [], sourceFormat: 'budil-calendar-json' };
    const built = CalendarCandidateBrain.buildImportPreview(parsed, JSON.parse(localStorage.getItem('budil_work_orders')));
    return CalendarCandidateBrain.attachFutureImportPreview(built, '${TODAY}');
  })()`, ctx);
  assert(dupPreview.items[0].isDuplicate === true, 're-import should detect duplicate');
}

console.log('== exclusion controls ==');
{
  const { ctx } = createSandbox();
  const results = runInContext(`(() => {
    const today = '${TODAY}';
    const noAmount = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-08', startTime: '10:00', serviceText: 'R2', estimateAmount: 0
    }, today);
    const noDate = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '', startTime: '10:00', serviceText: 'R2', estimateAmount: 1000
    }, today);
    const noTime = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-08', startTime: '', serviceText: 'R2', estimateAmount: 1000
    }, today);
    const noService = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-08', startTime: '10:00', serviceText: '', estimateAmount: 1000
    }, today);
    const holiday = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-08', startTime: '10:00', serviceText: '休み', estimateAmount: 1000
    }, today);
    return { noAmount, noDate, noTime, noService, holiday };
  })()`, ctx);
  assert(results.noAmount.status === 'excluded', 'no amount should be excluded');
  assert(results.noDate.status === 'excluded', 'no date should be excluded');
  assert(results.noTime.status === 'excluded', 'no time should be excluded');
  assert(results.noService.status === 'excluded', 'no service should be excluded');
  assert(results.holiday.status === 'excluded', 'holiday should be excluded');
}

console.log('\nAll v4.12.4 calendar-unconfirmed-candidate-import checks passed.');

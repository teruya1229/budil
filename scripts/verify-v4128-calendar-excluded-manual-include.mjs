/**
 * Budil v4.12.12 - excluded calendar candidates can be manually included as work orders.
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
  'js/storage.js',
  'js/data-backup.js',
  'js/work-order-brain.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== v4.12.12 calendar-excluded-manual-include ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.12'), 'index.html should show v4.12.12');
assert(indexHtml.includes('js/app.js?v=4.12.12'), 'app.js cache buster should be v4.12.12');
assert(indexHtml.includes('css/style.css?v=4.12.12'), 'style.css cache buster should be v4.12.12');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.12'), 'calendar-candidate cache buster should be v4.12.12');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.12'"), 'storage version should be v4.12.12');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.12'"), 'data-backup version should be v4.12.12');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone');
assert(statusMd.includes('v4.12.12'), 'status.md should document v4.12.12');
assert(handoffMd.includes('v4.12.12'), 'handoff.md should document v4.12.12');
assert(decisionLog.includes('v4.12.12'), 'decision-log.md should record v4.12.12');

console.log('== UI wiring ==');
assert(appJs.includes('この予定を作業予定に追加'), 'manual include button label required');
assert(appJs.includes('data-cal-manual-include'), 'manual include data attribute required');
assert(appJs.includes('manualInclude'), 'manualInclude option required');
assert(appJs.includes('自動保存対象外'), 'auto-exclude notice required');
assert(appJs.includes('理由：'), 'exclude reason display required');
assert(appJs.includes('判定理由：'), 'include reason display required');
assert(appJs.includes('作業予定に追加済み'), 'already-added label required');
assert(appJs.includes('この予定を作業予定として保存します。売上確定は作業後に行います。'), 'confirm dialog required');
assert(appJs.includes('calendarImportDecision'), 'manual include decision field required');
assert(appJs.includes('importOverride'), 'importOverride field required');
assert(!appJs.includes('（保存対象外）'), 'old contradictory 保存対象外 suffix should be gone from app.js');
assert(css.includes('calendar-candidate-exclude-reason'), 'exclude reason CSS required');
assert(css.includes('calendar-candidate-manual-done'), 'manual done CSS required');

console.log('== brain helpers ==');
assert(calendarJs.includes('hasHardFutureImportExcludedWord'), 'hard exclude helper required');
assert(calendarJs.includes('hasSoftFutureImportExcludedWord'), 'soft exclude helper required');
assert(calendarJs.includes('getWorkScheduleSignals'), 'work schedule signals helper required');
assert(calendarJs.includes('hasStrongWorkScheduleSignals'), 'strong signals helper required');
assert(calendarJs.includes('manualIncludeAllowed'), 'manualIncludeAllowed flag required');
assert(calendarJs.includes('BUSINESS_SOURCE_PATTERN'), 'business source pattern required');
assert(calendarJs.includes('WORK_UNIT_PATTERN'), 'work unit pattern required');
assert(indexHtml.includes('正本フロー'), 'canonical calendar flow notice must remain');

console.log('== runtime classification ==');
function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; }
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
    MapBrain: { detectAreaFromAddress: () => '' }
  });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

{
  const { ctx } = createSandbox();
  const result = runInContext(`(() => {
    const today = '2026-07-10';
    const nishimura = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-12',
      startTime: '10:00',
      endTime: '12:00',
      customerName: 'にしむら',
      serviceText: 'N1',
      source: '110番',
      estimateAmount: 10000,
      confirmationStatus: '確定',
      title: '110番 / にしむら / N1'
    }, today);
    const juraku = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-13',
      startTime: '13:00',
      endTime: '15:00',
      customerName: 'ジュラクローラ',
      serviceText: 'N3',
      source: '110番',
      estimateAmount: 27000,
      confirmationStatus: '確定',
      title: '110番 / ジュラクローラ / N3'
    }, today);
    const softHolidayWithAmount = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-14',
      startTime: '09:00',
      serviceText: 'エアコン 休みメモ',
      source: 'LP',
      estimateAmount: 15000,
      confirmationStatus: '確定'
    }, today);
    const pureHoliday = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-15',
      startTime: '09:00',
      serviceText: '休み',
      source: '',
      estimateAmount: 0,
      confirmationStatus: ''
    }, today);
    const cancelled = CalendarCandidateBrain.classifyFutureImportCandidate({
      scheduledDate: '2026-07-16',
      startTime: '09:00',
      serviceText: 'エアコン キャンセル',
      source: '110番',
      estimateAmount: 12000,
      confirmationStatus: '確定'
    }, today);
    return { nishimura, juraku, softHolidayWithAmount, pureHoliday, cancelled };
  })()`, ctx);

  assert(result.nishimura.status === 'eligible', 'にしむら/N1/110番/予定売上 should be eligible');
  assert(result.nishimura.savable === true, 'にしむら should be savable');
  assert(result.juraku.status === 'eligible', 'ジュラクローラ/N3 should be eligible');
  assert(result.softHolidayWithAmount.status === 'eligible', 'soft exclude word with amount/confirmed should stay eligible');
  assert(result.pureHoliday.status === 'excluded', 'pure holiday without business signals should be excluded');
  assert(result.pureHoliday.manualIncludeAllowed === true, 'excluded candidates must allow manual include');
  assert(result.cancelled.status === 'excluded', 'hard cancel word should remain excluded');
  assert(result.cancelled.manualIncludeAllowed === true, 'cancelled excluded still allows manual include');
}

console.log('== manual include save does not create revenue ==');
{
  const { ctx, localStorage } = createSandbox();
  runInContext(`(() => {
    const candidate = {
      scheduledDate: '2026-07-20',
      startTime: '11:00',
      endTime: '13:00',
      customerName: '手動追加テスト',
      serviceText: '休みメモのみ',
      source: '',
      estimateAmount: 0,
      confirmationStatus: '',
      title: '休み'
    };
    const classified = CalendarCandidateBrain.classifyFutureImportCandidate(candidate, '2026-07-10');
    if (classified.status !== 'excluded') throw new Error('fixture should be excluded');
    const payload = CalendarCandidateBrain.createWorkOrderPayload(candidate, {
      candidateStatus: '作業予定に追加済み',
      importOverride: true,
      importOverrideReason: '対象外候補を手動追加',
      calendarImportDecision: 'manual_include',
      importSource: CalendarCandidateBrain.JSON_IMPORT_SOURCE
    });
    Storage.addWorkOrder(payload);
  })()`, ctx);
  const workOrders = JSON.parse(localStorage.getItem('budil_work_orders') || '[]');
  const revenues = JSON.parse(localStorage.getItem('budil_revenue_records') || '[]');
  assert(workOrders.length === 1, 'manual include should create one work order');
  assert(revenues.length === 0, 'manual include must not create revenue');
  assert(workOrders[0].candidateMeta.importOverride === true, 'importOverride should be recorded');
  assert(workOrders[0].candidateMeta.calendarImportDecision === 'manual_include', 'calendarImportDecision should be recorded');
  assert(workOrders[0].candidateMeta.confirmedRevenue !== true, 'must not mark confirmed revenue');
  assert(workOrders[0].status === 'tentative', 'work order should remain tentative');

  const dup = runInContext(`(() => {
    const candidate = {
      scheduledDate: '2026-07-20',
      startTime: '11:00',
      endTime: '13:00',
      customerName: '手動追加テスト',
      serviceText: '休みメモのみ',
      source: '',
      estimateAmount: 0,
      title: '休み'
    };
    const parsed = { candidates: [candidate], warnings: [], errors: [], sourceFormat: 'budil-calendar-json' };
    const built = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    return CalendarCandidateBrain.attachFutureImportPreview(built, '2026-07-10');
  })()`, ctx);
  assert(dup.items[0].isDuplicate === true, 're-import after manual include should detect duplicate');
}

console.log('== no google calendar writeback / no new storage keys ==');
assert(!appJs.includes('calendar.events.insert'), 'must not write back to Google Calendar API');
assert(!calendarJs.includes('calendar.events.insert'), 'brain must not write back to Google Calendar API');
assert(!appJs.includes('localStorage.clear'), 'app must not clear localStorage');
assert(!calendarJs.includes('localStorage.clear'), 'brain must not clear localStorage');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.12'"), 'storage key namespace unchanged (version only)');
assert(!statusMd.includes('budil_manual_include'), 'must not invent new localStorage key docs');

console.log('== prior feature docs retained ==');
assert(statusMd.includes('v4.12.3') || handoffMd.includes('v4.12.3'), 'v4.12.3 history retained');
assert(statusMd.includes('v4.12.4') || handoffMd.includes('v4.12.4'), 'v4.12.4 history retained');
assert(statusMd.includes('v4.12.6') || handoffMd.includes('v4.12.6'), 'v4.12.6 history retained');
assert(statusMd.includes('verify-current') || handoffMd.includes('verify-current'), 'v4.12.12 verify-current ops retained');

console.log('\nAll v4.12.12 calendar-excluded-manual-include checks passed.');

/**
 * Budil v4.12.4 - calendar import result shows tamazawa candidate verification.
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

for (const file of ['js/calendar-candidate-brain.js', 'js/app.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 calendar-import-result-shows-tamazawa ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calBrainJs = load('js/calendar-candidate-brain.js');
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
    source: 'google_calendar',
    status: 'candidate'
  }
};

console.log('== version check ==');
assert(indexHtml.includes('v4.12.9'), 'index.html should show v4.12.9');
assert(indexHtml.includes('js/app.js?v=4.12.9'), 'app.js cache buster should be v4.12.9');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.9'), 'calendar brain cache buster should be v4.12.9');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.9'"), 'storage.js version should be v4.12.9');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.9'"), 'data-backup version should be v4.12.9');

console.log('== import result UI wiring ==');
assert(appJs.includes('renderCalendarImportResultBreakdownHtml'), 'import result breakdown renderer should exist');
assert(appJs.includes('bucketFutureImportPreviewItems'), 'app should use bucketFutureImportPreviewItems');
assert(appJs.includes('calendar-import-result-breakdown'), 'import result breakdown section should exist');
assert(appJs.includes('保存予定'), 'import result should label savable bucket');
assert(appJs.includes('data-calendar-import-save-all'), 'import result save-all button should exist');
assert(calBrainJs.includes('bucketFutureImportPreviewItems'), 'brain should expose bucketFutureImportPreviewItems');

console.log('== v4.10.42 unconfirmed import policy ==');
assert(calBrainJs.includes('NON_EXCLUSION_CONFIRMATION_STATUSES'), 'non-exclusion confirmation statuses should remain');
assert(!calBrainJs.includes('仮押さえ|未確定/'), 'bare 未確定 must not be exclusion pattern');

console.log('== v4.11.0 reception sync maintained ==');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'reception sync should remain');
assert(appJs.includes('isReceptionWorkflowRevenueResolved'), 'reception list helper should remain');

console.log('== CSS unchanged ==');
console.log('== storage keys unchanged ==');
assert(!storageJs.includes('localStorage.clear'), 'must not clear localStorage');

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Set, Map, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    WorkOrderBrain: { normalizeWorkOrder: w => ({ ...(w || {}) }), compareScheduledDateTimeAsc: () => 0, formatYen: n => `${n}円` },
    Storage: null
  });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  return ctx;
}

console.log('== 玉澤真理子様 JSON read and eligible ==');
{
  const ctx = createSandbox();
  const jsonPayload = JSON.stringify({ items: [tamazawaItem] });
  const parsed = runInContext(`CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonPayload)})`, ctx);
  assert(parsed.candidates.length === 1, 'tamazawa should be read from JSON');
  const preview = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, []);
    return CalendarCandidateBrain.attachFutureImportPreview(preview, '${TODAY}');
  })()`, ctx);
  const item = preview.items[0];
  assert(item.futureImport.status === 'eligible', 'tamazawa should be eligible');
  assert(item.futureImport.savable === true, 'tamazawa should be savable');
  assert(item.candidate.customerName.includes('玉澤'), 'customer name should include 玉澤');
  assert(item.candidate.scheduledDate === '2026-07-07', 'date should be 2026-07-07');
  assert(item.candidate.startTime === '10:00', 'start time should be 10:00');
  assert(item.candidate.endTime === '14:00', 'end time should be 14:00');
  assert(Number(item.candidate.estimateAmount) === 32670, 'amount should be 32670');
  assert(item.candidate.serviceText === 'R2', 'service should be R2');
  assert(item.candidate.confirmationStatus === '未確定', 'confirmationStatus should be 未確定');
  const buckets = runInContext(`CalendarCandidateBrain.bucketFutureImportPreviewItems(${JSON.stringify(preview)})`, ctx);
  assert(buckets.savable.length === 1, 'tamazawa should be in savable bucket');
}

console.log('== duplicate does not allow second save ==');
{
  const ctx = createSandbox();
  const jsonPayload = JSON.stringify({ items: [tamazawaItem] });
  const parsed = runInContext(`CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonPayload)})`, ctx);
  const preview = runInContext(`(() => {
    const existing = [{
      id: 'wo-tama',
      scheduledDate: '2026-07-07',
      startTime: '10:00',
      endTime: '14:00',
      customerName: '玉澤 真理子様',
      serviceText: 'R2',
      estimateAmount: 32670,
      calendarDedupeKey: '${TAMAZAWA_DEDUPE}',
      candidateMeta: { importSource: 'calendar-json-file' }
    }];
    const preview = CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, existing);
    return CalendarCandidateBrain.attachFutureImportPreview(preview, '${TODAY}');
  })()`, ctx);
  const item = preview.items[0];
  assert(item.isDuplicate === true, 'existing work order should mark duplicate');
  const savable = runInContext(`CalendarCandidateBrain.isFutureImportSavable(${JSON.stringify(item)})`, ctx);
  assert(savable === false, 'duplicate must not be savable without force');
  const buckets = runInContext(`CalendarCandidateBrain.bucketFutureImportPreviewItems(${JSON.stringify(preview)})`, ctx);
  assert(buckets.duplicate.length === 1, 'tamazawa should move to duplicate bucket');
}

console.log('== excluded controls remain ==');
{
  const ctx = createSandbox();
  const holiday = {
    title: '休み',
    date: '2026-07-08',
    start: { time: '10:00', isAllDay: false },
    end: { time: '12:00', isAllDay: false },
    extracted: { customerName: '休み', amount: 10000, workType: 'R1' }
  };
  const noAmount = {
    title: '仮 テスト',
    date: '2026-07-09',
    start: { time: '10:00', isAllDay: false },
    end: { time: '12:00', isAllDay: false },
    extracted: { customerName: '仮テスト', workType: 'R1' }
  };
  const jsonPayload = JSON.stringify({ items: [holiday, noAmount] });
  const parsed = runInContext(`CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonPayload)})`, ctx);
  const preview = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, []);
    return CalendarCandidateBrain.attachFutureImportPreview(preview, '${TODAY}');
  })()`, ctx);
  assert(preview.items[0].futureImport.status === 'eligible', 'holiday with amount should remain eligible (v4.12.9 soft override)');
  assert(preview.items[1].futureImport.status === 'excluded', 'no-amount should stay excluded');
}

console.log('\nAll v4.12.4 calendar-import-result-shows-tamazawa checks passed.');

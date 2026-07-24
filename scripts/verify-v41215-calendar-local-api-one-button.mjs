/**
 * Budil v4.12.17 - Google Calendar one-button local API sync + auto-save.
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

for (const file of ['js/app.js', 'js/storage.js', 'js/calendar-candidate-brain.js', 'js/data-backup.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.17 calendar-local-api-one-button ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const brainJs = load('js/calendar-candidate-brain.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.17'), 'index.html should show v4.12.17');
assert(indexHtml.includes('js/app.js?v=4.12.17'), 'app.js cache buster should be v4.12.17');
assert(indexHtml.includes('css/style.css?v=4.12.17'), 'style.css cache buster should be v4.12.17');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.17'), 'calendar-candidate cache buster should be v4.12.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.17'"), 'storage version should be v4.12.17');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.17'"), 'data-backup version should be v4.12.17');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.17'"), 'verify-current EXPECTED_VERSION should be v4.12.17');
assert(!indexHtml.includes('?v=4.12.14'), 'old cache buster v4.12.14 should be gone');
assert(statusMd.includes('v4.12.17'), 'status.md should document v4.12.17');
assert(handoffMd.includes('v4.12.17'), 'handoff.md should document v4.12.17');
assert(decisionLog.includes('v4.12.17'), 'decision-log.md should record v4.12.17');

console.log('== UI wiring ==');
assert((indexHtml.match(/id="btn-calendar-export-latest"/g) || []).length === 1, 'exactly one update button');
assert(indexHtml.includes('Googleカレンダーを更新'), 'button label should be Googleカレンダーを更新');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'manual JSON import remains');
assert(indexHtml.includes('非常用'), 'manual path labeled emergency');
assert(!indexHtml.includes('最新予定を書き出す'), 'old export-only label should be gone');

console.log('== local API constants / safety ==');
assert(appJs.includes("CALENDAR_LOCAL_API_BASE = 'http://127.0.0.1:43821'"), 'API base fixed to loopback');
assert(appJs.includes("CALENDAR_EXPORT_LOCAL_API_URL = CALENDAR_LOCAL_API_BASE"), 'legacy hook points to fixed base');
assert(appJs.includes('/health'), 'health endpoint used');
assert(appJs.includes('/sync'), 'sync endpoint used');
assert(appJs.includes('CALENDAR_LOCAL_API_TIMEOUT_MS = 90000'), '90s timeout');
assert(appJs.includes('AbortController'), 'AbortController timeout');
assert(appJs.includes('calendarLocalSyncInFlight'), 'in-flight guard');
assert(appJs.includes('exportBtn.disabled = true'), 'button disabled while running');
assert(appJs.includes('exportBtn.disabled = false'), 'button re-enabled in finally');
assert(!appJs.includes('Access-Control-Allow-Origin: *'), 'no wildcard CORS in app');
assert(!/localhost:\d+/.test(appJs.match(/CALENDAR_LOCAL_API_BASE[\s\S]{0,80}/)[0]), 'must not use localhost host');
assert(!appJs.includes('0.0.0.0'), 'must not reference 0.0.0.0');

console.log('== error messages ==');
for (const msg of [
  'カレンダー連携が起動していません。PCでローカル連携を起動してから、もう一度お試しください。',
  'ローカル連携へ接続できません。Chromeのローカルネットワーク許可と連携ツールの起動状態を確認してください。',
  'カレンダーを更新中です。完了後にもう一度お試しください。',
  '連続更新を避け、数秒後にもう一度お試しください。',
  'カレンダーの取得がタイムアウトしました。既存データは変更していません。',
  'カレンダーを更新できませんでした。既存データは変更していません。'
]) {
  assert(appJs.includes(msg), `safe message required: ${msg}`);
}

console.log('== reuse existing save path ==');
assert(appJs.includes('commitSavableCalendarCandidates'), 'shared commit helper required');
assert(appJs.includes('parseBudilCalendarEventsJson'), 'must use existing parser');
assert(appJs.includes('applyCalendarCandidateParsed'), 'must use existing preview apply');
assert(appJs.includes('refreshCalendarCandidateViews'), 'must refresh related views');
assert(appJs.includes('isFutureImportSavable'), 'must keep existing savable checks');
assert(
  /function saveAllCalendarCandidates\(force\) \{[\s\S]{0,400}?commitSavableCalendarCandidates/.test(appJs),
  'saveAll must call shared commit helper'
);
assert(
  /function handleCalendarExportLatestClick\(\) \{[\s\S]{0,5000}?commitSavableCalendarCandidates/.test(appJs),
  'local API flow must call shared commit helper'
);
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');
assert(!/Storage\.KEYS\.[A-Z0-9_]+ = /.test(appJs), 'must not invent new Storage key assignments');

console.log('== success message shape ==');
assert(appJs.includes('formatCalendarLocalSyncSuccessMessage'), 'success formatter required');
assert(appJs.includes('取得'), 'success mentions fetched count');
assert(appJs.includes('新規'), 'success mentions new count');
assert(appJs.includes('重複'), 'success mentions duplicate count');
assert(appJs.includes('対象外'), 'success mentions excluded count');

console.log('== no Google write / no secrets dump ==');
assert(!appJs.includes('events.insert'), 'no calendar write insert');
assert(!appJs.includes('events.update'), 'no calendar write update');
assert(!appJs.includes('events.delete'), 'no calendar write delete');
assert(!appJs.includes('console.error(error'), 'must not dump raw error objects casually');
assert(!appJs.includes('console.log(sync'), 'must not log sync payload');
assert(!appJs.includes('service-account'), 'must not mention service-account in app');

console.log('== docs ==');
assert(statusMd.includes('loopback') || statusMd.includes('127.0.0.1:43821'), 'status should mention local API');
assert(statusMd.includes('手動起動') || statusMd.includes('手動'), 'status should note manual worker start');
assert(handoffMd.includes('Googleカレンダーを更新') || handoffMd.includes('local API'), 'handoff should mention one-button update');
assert(decisionLog.includes('読取専用') || decisionLog.includes('readonly') || decisionLog.includes('読取'), 'decision-log should note readonly');

console.log('== brain save rules remain ==');
assert(brainJs.includes('isFutureImportSavable'), 'brain savable helper remains');
assert(brainJs.includes('summarizeFutureImportPreview'), 'brain summary helper remains');
assert(brainJs.includes('parseBudilCalendarEventsJson'), 'brain parser remains');

function createBrainSandbox() {
  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    parseInt,
    isNaN,
    CalendarCandidateBrain: undefined
  };
  createContext(sandbox);
  runInContext(brainJs, sandbox);
  return sandbox;
}

{
  const ctx = createBrainSandbox();
  const payload = {
    source: 'google_calendar',
    schemaVersion: 1,
    fetchedAt: '2026-07-22T00:00:00.000Z',
    timezone: 'Asia/Tokyo',
    targetPeriod: { from: '2026-07-22', to: '2026-08-21' },
    items: [
      {
        source: 'google_calendar',
        calendarId: 'test@example.com',
        calendarEventId: 'evt-new-1',
        title: 'テスト新規',
        date: '2026-08-01',
        start: { date: '2026-08-01', time: '10:00', isAllDay: false },
        end: { date: '2026-08-01', time: '11:00', isAllDay: false },
        location: '',
        description: '金額：10000円',
        extracted: {
          customerName: 'テスト太郎',
          phone: null,
          amount: 10000,
          amountText: '10000円',
          requestSource: '直受け',
          workType: 'M1',
          address: null,
          confirmationStatus: '確定'
        },
        budilImport: {
          candidateType: 'revenue_candidate',
          dedupeKey: 'google_calendar|test@example.com|evt-new-1',
          status: 'candidate'
        },
        rawEvent: {}
      },
      {
        source: 'google_calendar',
        calendarId: 'test@example.com',
        calendarEventId: 'evt-dup-1',
        title: 'テスト重複',
        date: '2026-08-02',
        start: { date: '2026-08-02', time: '10:00', isAllDay: false },
        end: { date: '2026-08-02', time: '11:00', isAllDay: false },
        location: '',
        description: '金額：20000円',
        extracted: {
          customerName: '重複花子',
          phone: null,
          amount: 20000,
          amountText: '20000円',
          requestSource: '直受け',
          workType: 'M1',
          address: null,
          confirmationStatus: '確定'
        },
        budilImport: {
          candidateType: 'revenue_candidate',
          dedupeKey: 'google_calendar|test@example.com|evt-dup-1',
          status: 'candidate'
        },
        rawEvent: {}
      },
      {
        source: 'google_calendar',
        calendarId: 'test@example.com',
        calendarEventId: 'evt-ex-1',
        title: '見積のみ',
        date: '2026-08-03',
        start: { date: '2026-08-03', time: '10:00', isAllDay: false },
        end: { date: '2026-08-03', time: '11:00', isAllDay: false },
        location: '',
        description: '見積',
        extracted: {
          customerName: '対象外',
          phone: null,
          amount: null,
          amountText: null,
          requestSource: '直受け',
          workType: null,
          address: null,
          confirmationStatus: '見積'
        },
        budilImport: {
          candidateType: 'revenue_candidate',
          dedupeKey: 'google_calendar|test@example.com|evt-ex-1',
          status: 'candidate'
        },
        rawEvent: {}
      }
    ]
  };

  const parsed = runInContext(
    `CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(JSON.stringify(payload))})`,
    ctx
  );
  assert(parsed.meta.schemaVersion === 1, 'parser accepts schemaVersion 1');
  assert(!(parsed.errors || []).length, 'parser should not error on valid payload');

  const existingOrders = [
    {
      id: 'wo-dup',
      calendarDedupeKey: 'google_calendar|test@example.com|evt-dup-1',
      scheduledDate: '2026-08-02',
      title: 'テスト重複'
    }
  ];

  let preview = runInContext(
    `CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, ${JSON.stringify(existingOrders)})`,
    ctx
  );
  preview = runInContext(
    `CalendarCandidateBrain.attachFutureImportPreview(${JSON.stringify(preview)}, '2026-07-22')`,
    ctx
  );
  const summary = runInContext(
    `CalendarCandidateBrain.summarizeFutureImportPreview(${JSON.stringify(preview)})`,
    ctx
  );

  assert(summary.readCount === 3, 'readCount should be 3');
  assert(summary.duplicateCount >= 1, 'duplicate should be detected');
  assert(summary.excludedCount >= 1, 'excluded should be detected');
  assert(summary.savableCount >= 1, 'at least one savable');

  const savable = preview.items.filter((item) =>
    runInContext(`CalendarCandidateBrain.isFutureImportSavable(${JSON.stringify(item)}, false)`, ctx)
  );
  assert(savable.every((item) => !item.isDuplicate), 'savable must exclude duplicates');
  assert(
    savable.every((item) => !(item.futureImport && item.futureImport.status === 'excluded')),
    'savable must exclude excluded'
  );
}

console.log('\nAll v4.12.17 calendar-local-api-one-button checks passed.');

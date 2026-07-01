/**
 * Budil v4.10.15 — revenue duplicate guard verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
    undefined
  });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  return ctx;
}

for (const file of ['app.js', 'calendar-candidate-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.15 revenue duplicate guards ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.15'), 'index.html should show v4.10.15');
assert(indexHtml.includes('js/app.js?v=4.10.15'), 'app.js cache buster should be v4.10.15');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.15'"), 'storage.js version should be v4.10.15');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.15'"), 'data-backup version should be v4.10.15');

assert(calendarBrain.includes('findRevenueDuplicateMatches'), 'calendar brain should expose duplicate match helper');
assert(calendarBrain.includes('findRevenueLinkCandidatesForDocument'), 'calendar brain should find invoice link candidates');
assert(calendarBrain.includes('revenueHasStrongDuplicateLink'), 'calendar brain should detect strong duplicate links');
assert(appJs.includes('confirmRevenueSaveWithDuplicateCheck'), 'app should confirm before duplicate revenue save');
assert(appJs.includes('handleRevenueSubmit') && appJs.includes('confirmRevenueSaveWithDuplicateCheck(data'), 'revenue form submit should use duplicate guard');
assert(appJs.includes('handleDailyRevenueQuickSubmit') && appJs.includes('confirmRevenueSaveWithDuplicateCheck(payload'), 'daily quick submit should use duplicate guard');
assert(appJs.includes('tryLinkDocumentToExistingRevenue'), 'app should try linking invoice to existing revenue');
assert(appJs.includes('tryLinkDocumentToExistingRevenue(docId, doc, prefill)'), 'document reflect should check existing revenue first');
assert(appJs.includes('PaymentBrain.linkRevenueAndDocument(rev.id, docId, Storage)'), 'single candidate should link not create');
assert(appJs.includes('既存の売上候補が'), 'multiple candidates should block new create');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
  '+ 新規登録',
  '売上を登録',
  '売上を1件登録'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

console.log('== duplicate match logic ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const revenues = [{
      id: 'rev-existing',
      workDate: '2026-07-01',
      customerName: 'テスト様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25000,
      sourceWorkOrderId: 'wo-1',
      calendarDedupeKey: 'cal-key-1'
    }];
    const form = {
      workDate: '2026-07-01',
      customerName: 'テスト様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25000
    };
    const matches = CalendarCandidateBrain.findRevenueDuplicateMatches(form, revenues, {});
    const strong = CalendarCandidateBrain.revenueHasStrongDuplicateLink(revenues[0]);
    const doc = {
      type: 'invoice',
      issueDate: '2026-07-01',
      customerName: 'テスト',
      total: 25000
    };
    const linkCandidates = CalendarCandidateBrain.findRevenueLinkCandidatesForDocument(doc, revenues);
    return { matchCount: matches.length, strong, linkCount: linkCandidates.length };
  })()`, ctx);
  assert(result.matchCount >= 1, 'form duplicate should match existing revenue');
  assert(result.strong === true, 'work-order revenue should be strong duplicate');
  assert(result.linkCount === 1, 'invoice should find one link candidate');
}

console.log('== past recovery duplicate guard preserved ==');
{
  const ctx = createSandbox();
  const report = runInContext(`(() => {
    const revenues = [{
      id: 'rev-dup',
      workDate: '2026-06-01',
      customerName: '過去様',
      service: '浴室',
      source: 'LP',
      amount: 18000,
      calendarDedupeKey: 'calendar-past-recovery|2026-06-01|過去様|18000|浴室|lp'
    }];
    const wo = {
      id: 'wo-past',
      customerName: '過去様',
      serviceText: '浴室',
      scheduledDate: '2026-06-01',
      estimateAmount: 18000,
      source: 'LP',
      calendarDedupeKey: 'calendar-past-recovery|2026-06-01|過去様|18000|浴室|lp',
      candidateMeta: { importSource: 'calendar-json-file' }
    };
    return CalendarCandidateBrain.classifyPastRecoveryCandidate(wo, revenues, { today: '2026-07-01' }).status;
  })()`, ctx);
  assert(report === 'duplicate_suspected', 'past recovery duplicate classification must remain');
}

console.log('== v4.10.15 calendar schedule consistency (regression) ==');
{
  const ctx = createSandbox();
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  const today = '2026-06-30';
  const summary = runInContext(`(() => {
    const calendarMeta = {
      importSource: 'calendar-json-file',
      sourceType: 'work-order-candidate',
      candidateStatus: '作業予定に追加済み'
    };
    const workOrders = [{
      id: 'wo-yamada',
      customerName: 'ヤマダ案件',
      serviceText: 'エアコンクリーニング',
      scheduledDate: '2026-07-01',
      estimateAmount: 25300,
      source: 'ヤマダ',
      status: 'tentative',
      candidateMeta: { ...calendarMeta, confidence: '未確定' },
      calendarDedupeKey: 'cal-yamada'
    }];
    return RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, '${today}');
  })()`, ctx);
  assert(summary.displayCount >= 1, 'calendar upcoming schedule regression should include tentative calendar item');
}

assert(statusMd.includes('v4.10.15'), 'status.md should document v4.10.15');
assert(handoffMd.includes('v4.10.15'), 'handoff.md should document v4.10.15');
assert(decisionLog.includes('v4.10.15'), 'decision-log.md should record v4.10.15');

console.log('All v4.10.15 revenue duplicate guard checks passed.');

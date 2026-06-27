/**
 * Budil v4.8.13 reception -> work order -> revenue flow verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function loadScript(name) {
  return readFileSync(join(jsDir, name), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== v4.8.13 reception flow check ==');
for (const file of ['revenue-brain.js', 'reception-brain.js', 'work-order-brain.js', 'work-completion-brain.js', 'app.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

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
  URLSearchParams,
  parseInt,
  undefined,
  MapBrain: { detectAreaFromAddress: () => '那覇市' },
  CalendarCandidateBrain: {
    isPendingCandidate: () => false,
    normalizeCandidateMeta: (x) => x || {}
  },
  FollowUpBrain: {
    normalizeFollowUp: (x) => x || {}
  }
});

for (const file of ['revenue-brain.js', 'reception-brain.js', 'work-completion-brain.js', 'work-order-brain.js']) {
  runInContext(loadScript(file), ctx, { filename: file });
}

const result = runInContext(`
  const intake = ReceptionBrain.normalizeIntake({
    id: 'intake_486',
    customerName: '一本道 太郎',
    phone: '090-0000-0000',
    address: '沖縄県那覇市西1-1-1',
    source: 'ヤマダ',
    serviceText: 'エアコン通常',
    preferredDatesText: '2026/07/01 9:00',
    estimateAmount: 18000,
    memo: '受付メモ'
  });
  const workOrder = WorkOrderBrain.createFromIntake(intake);
  workOrder.id = 'work_486';
  const withWorkIntake = {
    ...intake,
    relatedWorkOrderId: workOrder.id,
    relatedWorkOrderIds: [workOrder.id]
  };
  const openWorkState = ReceptionBrain.getWorkflowState(withWorkIntake, {
    leads: [],
    workOrders: [workOrder],
    revenues: []
  });
  const completedWork = {
    ...workOrder,
    status: 'completed',
    completedAt: '2026-07-01T10:00:00.000Z'
  };
  const completedState = ReceptionBrain.getWorkflowState(withWorkIntake, {
    leads: [],
    workOrders: [completedWork],
    revenues: []
  });
  const formPayload = WorkOrderBrain.buildRevenueFormPayload(completedWork);
  const completionPayload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(completedWork, {
    workDate: '2026-07-01',
    customerName: '一本道 太郎',
    actualService: 'エアコン通常',
    service: 'エアコン通常',
    source: 'ヤマダ',
    amount: 18000,
    paymentStatus: 'pending',
    actualMemo: '作業完了',
    followMemo: ''
  });
  const revenue = {
    ...completionPayload,
    id: 'rev_486'
  };
  const withRevenueIntake = {
    ...withWorkIntake,
    relatedRevenueId: revenue.id
  };
  const revenueState = ReceptionBrain.getWorkflowState(withRevenueIntake, {
    leads: [],
    workOrders: [{ ...completedWork, actualRevenueId: revenue.id }],
    revenues: [revenue]
  });
  ({
    workOrder,
    openWorkState,
    completedState,
    formPayload,
    completionPayload,
    revenueState
  });
`, ctx);

assert(result.workOrder.intakeId === 'intake_486', 'work order should keep intakeId');
assert(result.workOrder.receptionIntakeId === 'intake_486', 'work order should keep receptionIntakeId');
assert(result.workOrder.sourceIntakeId === 'intake_486', 'work order should keep sourceIntakeId');
assert(result.workOrder.source === 'ヤマダ', 'work order should inherit source');
assert(result.openWorkState.primaryAction === 'openWorkOrder', 'existing work order should open work order');
assert(result.completedState.primaryAction === 'fillRevenue', 'completed work without revenue should go to revenue');
assert(result.formPayload.intakeId === 'intake_486', 'revenue form payload should keep intakeId');
assert(result.formPayload.source === 'ヤマダ', 'revenue form payload should keep source');
assert(result.completionPayload.sourceWorkOrderId === 'work_486', 'completion revenue should keep sourceWorkOrderId');
assert(result.completionPayload.intakeId === 'intake_486', 'completion revenue should keep intakeId');
assert(result.completionPayload.receptionIntakeId === 'intake_486', 'completion revenue should keep receptionIntakeId');
assert(result.completionPayload.source === 'ヤマダ', 'completion revenue should keep source');
assert(result.revenueState.primaryAction === 'openRevenue', 'registered revenue should open revenue');
assert(result.revenueState.hasRevenue === true, 'registered revenue state should have revenue');

const appJs = loadScript('app.js');
assert(appJs.includes('linkReceptionToWorkOrder'), 'app should link reception to work order');
assert(appJs.includes('linkReceptionToRevenue'), 'app should link reception to revenue');
assert(appJs.includes('getReceptionLinkedRevenue'), 'app should guard duplicate reception revenue');
assert(appJs.includes('この受付には既に売上が登録されています'), 'app should warn on duplicate reception revenue');
assert(appJs.includes('data-wo-open-revenue'), 'work order cards should open linked revenue');

console.log('OK: reception to work order to revenue flow');

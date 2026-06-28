/**
 * Budil v4.8.22 reception primary-action safety verification.
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

console.log('== v4.8.22 reception primary-action check ==');
execSync(`node --check "${join(jsDir, 'reception-brain.js')}"`, { stdio: 'inherit' });

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
  parseInt,
  undefined,
  MapBrain: {
    detectAreaFromAddress: () => ''
  }
});

runInContext(loadScript('reception-brain.js'), ctx, { filename: 'reception-brain.js' });

const cases = runInContext(`
  const base = {
    id: 'intake_1',
    customerName: '受付テスト',
    source: 'LINE',
    serviceText: '剪定',
    estimateAmount: 12000
  };
  const lead = { id: 'lead_1', company: '受付テスト' };
  const openWork = { id: 'wo_1', intakeId: 'intake_1', status: 'scheduled' };
  const completedWork = { id: 'wo_2', intakeId: 'intake_1', status: 'completed' };
  const revenue = { id: 'rev_1', customerName: '受付テスト', amount: 12000 };
  ({
    fresh: ReceptionBrain.getWorkflowState(base, { leads: [], workOrders: [], revenues: [] }),
    leadOnly: ReceptionBrain.getWorkflowState(
      { ...base, relatedLeadId: 'lead_1' },
      { leads: [lead], workOrders: [], revenues: [] }
    ),
    withWork: ReceptionBrain.getWorkflowState(
      { ...base, relatedLeadId: 'lead_1', relatedWorkOrderId: 'wo_1' },
      { leads: [lead], workOrders: [openWork], revenues: [] }
    ),
    completedNoRevenue: ReceptionBrain.getWorkflowState(
      { ...base, relatedLeadId: 'lead_1', relatedWorkOrderId: 'wo_2' },
      { leads: [lead], workOrders: [completedWork], revenues: [] }
    ),
    withRevenue: ReceptionBrain.getWorkflowState(
      { ...base, relatedLeadId: 'lead_1', relatedWorkOrderId: 'wo_2', relatedRevenueId: 'rev_1' },
      { leads: [lead], workOrders: [completedWork], revenues: [revenue] }
    )
  });
`, ctx);

assert(cases.fresh.primaryAction === 'case', 'fresh intake should start with case action');
assert(cases.leadOnly.primaryAction === 'createWorkOrder', 'lead-only intake should create work order');
assert(cases.withWork.primaryAction === 'openWorkOrder', 'scheduled work order should open work order');
assert(cases.completedNoRevenue.primaryAction === 'fillRevenue', 'completed work without revenue should fill revenue');
assert(cases.withRevenue.primaryAction === 'openRevenue', 'linked revenue should open revenue');
assert(cases.withRevenue.hasLead && cases.withRevenue.hasWorkOrder && cases.withRevenue.hasRevenue, 'state flags should reflect linked records');

const appSource = loadScript('app.js');
assert(appSource.includes('renderReceptionActionBlock'), 'app should render reception action block');
assert(appSource.includes('reception-legacy-actions hidden'), 'legacy reception actions should be hidden, not deleted');
assert(appSource.includes('simplifyExecutiveReceptionActions'), 'executive reception actions should be simplified');

console.log('OK: reception primary actions, labels, hidden legacy actions');

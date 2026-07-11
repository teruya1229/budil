/**
 * Budil v4.12.5 - customer memo quick edit verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of [
  'js/app.js', 'js/storage.js', 'js/data-backup.js', 'js/reception-brain.js', 'js/follow-up-brain.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const CUSTOMER_TYPE_LABELS = [
  '\u672a\u8a2d\u5b9a',
  'A\uff1a\u5b89\u5fc3\u91cd\u8996\u578b',
  'B\uff1a\u4ed5\u4e0a\u304c\u308a\u91cd\u8996\u578b',
  'C\uff1a\u52b9\u7387\u91cd\u8996\u578b',
  'D\uff1a\u9632\u5fa1\u578b\u5408\u7406\u30e2\u30fc\u30c9',
  'E\uff1a\u76e3\u67fb\u578b',
  'F\uff1a\u78ba\u8a8d\u5b89\u5fc3\u578b'
];

const FORBIDDEN_EXTRA_FIELDS = [
  'homeSiteMemo',
  'airconInstallMemo',
  'customerHandlingMemo',
  'homeMemo',
  'airconMemo'
];

const NG_TERMS = [
  '\u898b\u8fbc\u307f\u58f2\u4e0a', '\u898b\u8fbc\u307f\u5229\u76ca', '\u4eca\u6708\u58f2\u4e0a', '\u4eca\u6708\u5229\u76ca',
  '\u58f2\u4e0a\u767b\u9332\u3078', '\u4e00\u62ec\u58f2\u4e0a\u767b\u9332', '\u4f5c\u696d\u5b8c\u4e86\u5f8c',
  '\u58f2\u4e0a\u767b\u9332\u6e08\u307f', '\u4f5c\u696d\u5f8c\u78ba\u5b9a'
];

console.log('== v4.12.5 customer-memo-quick-edit ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.11'), 'index.html should show v4.12.11');
assert(indexHtml.includes('js/app.js?v=4.12.11'), 'app.js cache buster should be v4.12.11');
assert(indexHtml.includes('css/style.css?v=4.12.11'), 'style.css cache buster should be v4.12.11');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.11'"), 'storage version should be v4.12.11');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.11'"), 'data-backup version should be v4.12.11');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.11'), 'calendar-candidate cache buster should be v4.12.11');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.5');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.5');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.5');

console.log('== shared customer memo edit modal ==');
assert(indexHtml.includes('id="customer-memo-edit-modal"'), 'customer memo edit modal should exist');
assert(indexHtml.includes('\u9867\u5ba2\u30e1\u30e2\u7de8\u96c6'), 'modal title should be customer memo edit');
assert(indexHtml.includes('id="customer-memo-edit-customer-type-major"'), 'quick edit major select should exist');
assert(indexHtml.includes('id="customer-memo-edit-customer-type-minor"'), 'quick edit minor select should exist');
assert(indexHtml.includes('id="customer-memo-edit-customer-memo"'), 'quick edit memo textarea should exist');
assert(indexHtml.includes('id="customer-memo-edit-lead-id"'), 'quick edit lead id hidden field should exist');
assert(
  indexHtml.includes('\u6b21\u56de\u306e\u53d7\u4ed8\u30fb\u4f5c\u696d\u4e88\u5b9a\u30fb\u30d5\u30a9\u30ed\u30fc\u3067\u53c2\u7167\u3067\u304d\u307e\u3059'),
  'modal description should explain save target'
);
assert(indexHtml.includes('id="btn-customer-memo-edit-cancel"'), 'cancel button should exist');

for (const label of CUSTOMER_TYPE_LABELS) {
  const majorIdx = indexHtml.indexOf('id="customer-memo-edit-customer-type-major"');
  const minorIdx = indexHtml.indexOf('id="customer-memo-edit-customer-type-minor"');
  const modalEnd = indexHtml.indexOf('id="work-completion-modal"');
  const modalSlice = indexHtml.slice(majorIdx, modalEnd);
  assert(modalSlice.includes(label), `quick edit modal should include option: ${label}`);
}

console.log('== v4.12.1 work completion fields preserved ==');
assert(indexHtml.includes('id="work-completion-customer-type-major"'), 'work completion major select should remain');
assert(indexHtml.includes('id="work-completion-customer-memo"'), 'work completion customer memo should remain');
assert(indexHtml.includes('id="lead-customer-memo"'), 'lead form customer memo should remain');

console.log('== v4.12.5 calendar import workflow preserved ==');
assert(indexHtml.includes('btn-calendar-export-latest'), 'export latest button should remain');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'JSON import button should remain');

console.log('== no extra memo fields / CRM ==');
for (const field of FORBIDDEN_EXTRA_FIELDS) {
  assert(!indexHtml.includes(field), `forbidden extra field in index.html: ${field}`);
  assert(!appJs.includes(field), `forbidden extra field in app.js: ${field}`);
}
assert(!indexHtml.includes('id="view-crm"'), 'CRM view must not be added');
assert(!appJs.includes('autoClassifyCustomer'), 'customer auto classification must not be added');

console.log('== app.js quick edit wiring ==');
assert(appJs.includes('openCustomerMemoEditModal'), 'open modal helper should exist');
assert(appJs.includes('saveCustomerMemoEditModal'), 'save modal helper should exist');
assert(appJs.includes('renderCustomerMemoEditButton'), 'edit button renderer should exist');
assert(appJs.includes('bindCustomerMemoEditButtons'), 'edit button binder should exist');
assert(appJs.includes('initCustomerMemoEditModal'), 'modal init should exist');
assert(appJs.includes('refreshAfterCustomerMemoEdit'), 'refresh helper should exist');
assert(appJs.includes('saveCustomerAssetMemoToLead'), 'lead save helper should remain');
assert(appJs.includes('readCustomerAssetMemoFromForm(\'customer-memo-edit\')') || appJs.includes('readCustomerAssetMemoFromForm("customer-memo-edit")'),
  'should read quick edit form via customer-memo-edit prefix');
assert(appJs.includes('fillCustomerAssetMemoForm(\'customer-memo-edit\''), 'should fill quick edit form');

console.log('== screen entry points ==');
assert(appJs.includes('data-customer-memo-edit'), 'customer memo edit data attribute should exist');
assert(appJs.includes('renderCustomerMemoEditButton(linkedLead.id)'), 'work order should expose quick edit');
assert(appJs.includes('renderCustomerMemoEditButton(target.leadId)'), 'follow-up expanded should expose quick edit');
assert(appJs.includes('renderCustomerMemoEditButtonWrap(linkedLead.id)'), 'reception list should expose quick edit');
assert(appJs.includes('data-customer-memo-edit="${esc(record.leadId)}"'), 'revenue list should expose quick edit when lead linked');

console.log('== save only to lead, no duplicate storage ==');
const saveModal = appJs.match(/function saveCustomerMemoEditModal[\s\S]*?^  }/m);
assert(saveModal, 'saveCustomerMemoEditModal should exist');
assert(saveModal[0].includes('saveCustomerAssetMemoToLead'), 'quick edit should save to lead only');
assert(!saveModal[0].includes('updateRevenueRecord'), 'quick edit must not update revenue records');
assert(!saveModal[0].includes('updateReceptionIntake'), 'quick edit must not update reception intakes');
assert(!saveModal[0].includes('updateWorkOrder'), 'quick edit must not update work orders');

const openModal = appJs.match(/function openCustomerMemoEditModal[\s\S]*?^  }/m);
assert(openModal, 'openCustomerMemoEditModal should exist');
assert(openModal[0].includes('resolveLeadById'), 'open should resolve lead by explicit id');
assert(openModal[0].includes('\u55b6\u696d\u5148\u306b\u7d10\u3065\u3044\u3066\u3044\u306a\u3044'), 'unlinked lead should show alert');

console.log('== css / layout safety ==');
assert(css.includes('customer-memo-edit-action'), 'quick edit action css should exist');
assert(css.includes('overflow-x: hidden') || css.includes('@media (max-width: 390px)'),
  'layout should guard horizontal scroll');
assert(!indexHtml.includes('src=""'), 'index.html must not contain empty img/iframe src');

console.log('== data safety ==');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden in app.js');
assert(storageJs.includes('budil_leads'), 'lead storage key should remain');

for (const term of NG_TERMS) {
  assert(!indexHtml.includes(term), `NG term should not appear in index.html: ${term}`);
}

console.log('== chain prior customer asset memo and calendar workflow ==');
execSync('node scripts/verify-v4121-customer-asset-memo.mjs', { cwd: root, stdio: 'inherit' });
execSync('node scripts/verify-v4123-calendar-export-import-workflow.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.12.5 customer-memo-quick-edit checks passed.');

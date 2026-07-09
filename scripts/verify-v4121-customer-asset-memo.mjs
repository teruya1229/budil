/**
 * Budil v4.12.3 - customer asset memo verification.
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

console.log('== v4.12.3 customer-asset-memo ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.3'), 'index.html should show v4.12.3');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.12.3');
assert(indexHtml.includes('css/style.css?v=4.12.3'), 'style.css cache buster should be v4.12.3');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.3'"), 'storage version should be v4.12.3');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.3'"), 'data-backup version should be v4.12.3');
assert(!indexHtml.includes('?v=4.12.0'), 'old cache buster v4.12.0 should be gone');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.11.1'), 'calendar-candidate cache buster should remain v4.11.1');

console.log('== lead form fields ==');
assert(indexHtml.includes('id="lead-customer-type-major"'), 'lead major select should exist');
assert(indexHtml.includes('id="lead-customer-type-minor"'), 'lead minor select should exist');
assert(indexHtml.includes('id="lead-customer-memo"'), 'lead customer memo textarea should exist');
assert(indexHtml.includes('\u9867\u5ba2\u8cc7\u7523\u30e1\u30e2'), 'customer asset memo section label should exist');

console.log('== work completion modal fields ==');
assert(indexHtml.includes('id="work-completion-customer-type-major"'), 'work completion major select should exist');
assert(indexHtml.includes('id="work-completion-customer-type-minor"'), 'work completion minor select should exist');
assert(indexHtml.includes('id="work-completion-customer-memo"'), 'work completion customer memo textarea should exist');
assert(indexHtml.includes('\u9867\u5ba2\u8cc7\u7523\u30e1\u30e2\uff08\u4eca\u306e\u3046\u3061\u306b\u8a18\u9332\uff09'),
  'work completion customer asset memo legend should exist');
assert(indexHtml.includes('id="work-completion-lead-id"'), 'work completion lead id hidden field should exist');

for (const label of CUSTOMER_TYPE_LABELS) {
  assert(indexHtml.includes(label), `customer type option should exist: ${label}`);
}

console.log('== no extra memo fields ==');
for (const field of FORBIDDEN_EXTRA_FIELDS) {
  assert(!indexHtml.includes(field), `forbidden extra field in index.html: ${field}`);
  assert(!appJs.includes(field), `forbidden extra field in app.js: ${field}`);
}

console.log('== app.js save/display wiring ==');
assert(appJs.includes('customerTypeMajor'), 'app.js should reference customerTypeMajor');
assert(appJs.includes('customerTypeMinor'), 'app.js should reference customerTypeMinor');
assert(appJs.includes('customerMemo'), 'app.js should reference customerMemo');
assert(appJs.includes('saveCustomerAssetMemoToLead'), 'lead save helper should exist');
assert(appJs.includes('renderCustomerAssetMemoReferenceHtml'), 'reference display helper should exist');
assert(appJs.includes('readCustomerAssetMemoFromForm'), 'form read helper should exist');
assert(appJs.includes('fillCustomerAssetMemoForm'), 'form fill helper should exist');
assert(appJs.includes('resolveLeadForWorkOrder'), 'work order lead resolver should exist');
assert(appJs.includes('renderReceptionCustomerAssetRef'), 'reception reference renderer should exist');

console.log('== work completion save to lead ==');
const submitWorkCompletion = appJs.match(/function submitWorkCompletion[\s\S]*?^  }/m);
assert(submitWorkCompletion, 'submitWorkCompletion should exist');
assert(submitWorkCompletion[0].includes('saveCustomerAssetMemoToLead'), 'work completion should save customer asset memo to lead');
assert(submitWorkCompletion[0].includes('work-completion-lead-id'), 'work completion should read linked lead id');

console.log('== reception/follow-up reference display ==');
assert(appJs.includes('renderCustomerAssetMemoReferenceHtml(resolveLeadForIntake(intake)'),
  'reception list should reference lead customer asset memo');
assert(appJs.includes('resolveLeadById(target.leadId)'), 'follow-up should reference lead customer asset memo');

console.log('== no new CRM/analysis screens ==');
assert(!indexHtml.includes('id="view-crm"'), 'CRM view must not be added');
assert(!indexHtml.includes('\u9867\u5ba2\u5206\u6790'), 'customer analysis screen must not be added');
assert(!appJs.includes('autoClassifyCustomer'), 'customer auto classification must not be added');
assert(!appJs.includes('customerScore'), 'customer scoring must not be added');

console.log('== css / layout safety ==');
assert(css.includes('customer-asset-memo-section'), 'customer asset memo css should exist');
assert(css.includes('overflow-x: hidden') || css.includes('@media (max-width: 390px)'),
  'layout should guard horizontal scroll');
assert(!indexHtml.includes('src=""'), 'index.html must not contain empty img/iframe src');

console.log('== data safety ==');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden in app.js');
assert(storageJs.includes('budil_leads'), 'lead storage key should remain');
assert(dataBackupJs.includes('exportPayload'), 'backup export helper should exist');

console.log('== chain prior operational rehearsal ==');
execSync('node scripts/verify-v4120-operational-workflow-rehearsal.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.12.3 customer-asset-memo checks passed.');

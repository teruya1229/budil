import assert from 'node:assert/strict';
import {verifyOwnerBackupSelection as verify} from '../supabase/functions/budil-calendar-write/snapshot-authority.mjs';
const TENANT='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const SNAP='33333333-3333-4333-8333-333333333333';
const HASH='a'.repeat(64);
const ID='b'+'a'.repeat(64);
const NOW=Date.parse('2099-11-14T11:00:00Z');
const baseline={
  id:SNAP,tenant_id:TENANT,created_by:OWNER,
  created_at:new Date(NOW-20000).toISOString(),is_test:false,content_hash:HASH,
  payload:{app:'Budil',data:{
    budil_leads:[{id:'customer-1',name:'FICTIONAL'}],
    budil_work_orders:[{id:'work-1',leadId:'customer-1',status:'confirmed',
      scheduledDate:'2099-11-20',startTime:'10:00',endTime:'11:00',
      calendarEventSource:'transaction',calendarSyncStatus:'verified',
      calendarEventId:ID,calendarEtag:'"etag1"',
      calendarTargetId:'fictional-calendar@example.com'}]
  }}
};
function mock(row=baseline,error=null){
  const checks=[],client={
    from(name){assert.equal(name,'budil_snapshots');return this;},
    select(fields){assert.ok(fields.includes('payload'));return this;},
    eq(k,v){checks.push([k,v]);return this;},
    order(k,opts){assert.equal(k,'created_at');assert.equal(opts.ascending,false);return this;},
    limit(n){assert.equal(n,1);return this;},
    async maybeSingle(){return {data:row,error};}
  };return {client,checks};
}
const args={tenantId:TENANT,ownerUserId:OWNER,expectedHash:HASH,
  customerId:'customer-1',action:'booking',nowMs:NOW};
let n=0;
async function check(name,opts,expected){
  const db=mock(opts.row===undefined?baseline:opts.row,opts.error||null);
  const query={...args,...opts,adminClient:db.client};
  delete query.row;delete query.error;
  const out=await verify(query);
  assert.equal(out.ok,expected,name);
  assert.equal(out.writeAllowed,false,name+' never grants writes');
  if(opts.code)assert.equal(out.code,opts.code,name);
  if(expected){assert.equal(out.customerVerified,true);assert.equal(out.source,'verified_owner_backup');}
  if(!opts.skipQuery){assert.deepEqual(db.checks,[
    ['tenant_id',TENANT],['created_by',OWNER],['is_test',false]
  ],name+' tenant + owner + non-test filter');}
  n++;console.log('PASS',name);
}
await check('fresh immutable owner backup verifies booking',{},true);
await check('no backup is fail-closed',{row:null,code:'SNAPSHOT_REQUIRED'},false);
await check('backup owner mismatch',{row:{...baseline,created_by:'foreign'},code:'SNAPSHOT_MISMATCH'},false);
await check('backup hash mismatch',{row:{...baseline,content_hash:'b'.repeat(64)},code:'SNAPSHOT_MISMATCH'},false);
await check('test backup rejected',{row:{...baseline,is_test:true},code:'SNAPSHOT_MISMATCH'},false);
await check('stale backup refused',{row:{...baseline,created_at:new Date(NOW-900000).toISOString()},code:'SNAPSHOT_STALE'},false);
await check('future backup refused',{row:{...baseline,created_at:new Date(NOW+90000).toISOString()},code:'SNAPSHOT_STALE'},false);
await check('no leads rejects',{row:{...baseline,payload:{app:'Budil',data:{budil_work_orders:[]}}},code:'SNAPSHOT_SHAPE_INVALID'},false);
await check('ambiguous customer fails',{row:{...baseline,payload:{...baseline.payload,data:{...baseline.payload.data,budil_leads:[...baseline.payload.data.budil_leads,...baseline.payload.data.budil_leads]}}},code:'CUSTOMER_MISSING_OR_DUPLICATED'},false);
await check('reschedule verifies existing Google event',{
  action:'reschedule',workOrderId:'work-1'},true);
await check('reschedule missing order fails',{
  action:'reschedule',workOrderId:'work-404',code:'ORDER_MISSING_OR_DUPLICATED'},false);
await check('reschedule missing link fails',{
  action:'reschedule',workOrderId:'work-1',
  row:{...baseline,payload:{...baseline.payload,data:{...baseline.payload.data,
    budil_work_orders:[{...baseline.payload.data.budil_work_orders[0],calendarEventId:''}]}}},
  code:'ORDER_NOT_VERIFIED_FOR_RESCHEDULE'},false);
await check('reschedule foreign customer fails',{
  action:'reschedule',workOrderId:'work-1',customerId:'customer-other',
  code:'CUSTOMER_MISSING_OR_DUPLICATED'},false);
await check('server failure not treated as empty schedule',{error:{code:'500'},code:'SNAPSHOT_UNAVAILABLE'},false);
await check('unauthorized identity fails before DB query',{
  ownerUserId:'fake',code:'SELECTION_INVALID',skipQuery:true},false);
console.log('BUDIL_SNAPSHOT_AUTHORITY_MOCK PASS',n,'FAIL 0');

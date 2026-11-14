import assert from 'node:assert/strict';
import {BudilPostgresCalendarSlots} from '../supabase/functions/budil-calendar-write/slots.mjs';
const tenantId='11111111-1111-4111-8111-111111111111';
const ownerUserId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const slotId='44444444-4444-4444-8444-444444444444';
const calendarId='fictional-calendar@example.com',workOrderId='fictional-work-1';
const eventId='b'+'a'.repeat(64);
const candidate={tenantId,ownerUserId,slotId,requestId,workOrderId,calendarId,
 startAt:'2099-11-20T10:00:00+09:00',endAt:'2099-11-20T11:00:00+09:00'};
function fixture(){
 const rows=new Map(),calls={insert:0,update:0,read:0,finalize:0};
 let fault=null;
 const query=table=>{
  assert.equal(table,'budil_calendar_write_slots');
  return {
   insert(row){return {select(){return {async single(){
     calls.insert++;
     if(fault==='23P01')return {error:{code:'23P01'}};
     if(fault==='23505')return {error:{code:'23505'}};
     rows.set(row.id,{...row});
     return {data:{id:row.id,tenant_id:row.tenant_id,
       work_order_id:row.work_order_id,status:row.status},error:null};
   }}}}},
   update(fields){const filters=[];return {
    eq(k,v){filters.push([k,v]);return this;},
    select(){return this;},
    async maybeSingle(){calls.update++;
      const target=[...rows.values()].find(r=>filters.every(([k,v])=>r[k]===v));
      if(!target)return {data:null,error:null};
      Object.assign(target,fields);
      return {data:{id:target.id},error:null};
    }
   }},
   select(){const filters=[];return {
    eq(k,v){filters.push([k,v]);return this;},
    async maybeSingle(){calls.read++;
      const row=[...rows.values()].find(r=>filters.every(([k,v])=>r[k]===v));
      return {data:row||null,error:null};
    }
   }}
  };
 };
 const adminClient={from:query,async rpc(name,body){
  assert.equal(name,'budil_calendar_slots_finalize');calls.finalize++;
  if(fault==='db-error')return {data:null,error:{code:'DB_UNAVAILABLE'}};
  const row=rows.get(body.p_slot_id);
  if(!row||row.tenant_id!==body.p_tenant_id)return {data:false,error:null};
  row.status='verified';row.google_event_id=body.p_event_id;
  return {data:true,error:null};
 }};
 return {slots:new BudilPostgresCalendarSlots({adminClient}),rows,calls,setFault:x=>fault=x};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
const proof={verified:true,eventId,workOrderId,
 calendarAndTenantMatch:true,exactTimeMatch:true};
await test('reserved interval persisted as pending',async()=>{
 const x=fixture(),r=await x.slots.reserve(candidate);
 assert.equal(r.ok,true);assert.equal(r.status,'pending');
 assert.equal(x.rows.get(slotId).calendar_id,calendarId);assert.equal(x.calls.insert,1);
});
await test('database overlapping EXCLUDE error maps to conflict',async()=>{
 const x=fixture();x.setFault('23P01');
 assert.equal((await x.slots.reserve(candidate)).code,'SLOT_CONFLICT');
 assert.equal(x.calls.insert,1);
});
await test('duplicate request index is not retried',async()=>{
 const x=fixture();x.setFault('23505');
 assert.equal((await x.slots.reserve(candidate)).code,'SLOT_ALREADY_RESERVED');
 assert.equal(x.calls.insert,1);
});
await test('invalid interval cannot access DB',async()=>{
 const x=fixture();
 assert.equal((await x.slots.reserve({...candidate,endAt:candidate.startAt})).code,'SLOT_INVALID');
 assert.equal(x.calls.insert,0);
});
await test('past missing identity cannot access DB',async()=>{
 const x=fixture();
 assert.equal((await x.slots.reserve({...candidate,tenantId:'wrong'})).code,'SLOT_INVALID');
 assert.equal(x.calls.insert,0);
});
await test('external attempt unknown retains protected interval',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const r=await x.slots.markIndeterminate({tenantId,slotId,requestId});
 assert.equal(r.status,'indeterminate');assert.equal(r.autoRetryAllowed,false);
 assert.equal(x.rows.get(slotId).status,'indeterminate');
});
await test('mark unknown wrong request refused',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const wrong='99999999-9999-4999-8999-999999999999';
 assert.equal((await x.slots.markIndeterminate({tenantId,slotId,requestId:wrong})).code,'SLOT_UNCHANGED');
 assert.equal(x.rows.get(slotId).status,'pending');
});
await test('missing Google GET proof cannot release old slot',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const old='55555555-5555-4555-8555-555555555555';
 const r=await x.slots.finalizeVerified({tenantId,slotId,requestId,workOrderId,
  eventId,etag:'"etag-2"',oldSlotId:old,readbackProof:{...proof,exactTimeMatch:false}});
 assert.equal(r.code,'GOOGLE_READBACK_PROOF_REQUIRED');
 assert.equal(x.calls.finalize,0);
});
await test('confirmed Google GET allows atomic database finalize',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const old='55555555-5555-4555-8555-555555555555';
 const r=await x.slots.finalizeVerified({tenantId,slotId,requestId,workOrderId,
  eventId,etag:'"etag-2"',oldSlotId:old,readbackProof:proof});
 assert.equal(r.ok,true);assert.equal(r.oldSlotReleased,true);
 assert.equal(x.calls.finalize,1);assert.equal(x.rows.get(slotId).status,'verified');
});
await test('DB failure is not misreported verified',async()=>{
 const x=fixture();await x.slots.reserve(candidate);x.setFault('db-error');
 const r=await x.slots.finalizeVerified({tenantId,slotId,requestId,workOrderId,
  eventId,etag:'"etag-2"',readbackProof:proof});
 assert.equal(r.code,'FINALIZE_DB_UNAVAILABLE');
 assert.equal(x.rows.get(slotId).status,'pending');
});
await test('other tenant cannot inspect slot row',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const r=await x.slots.read({tenantId:'99999999-9999-4999-8999-999999999999',slotId});
 assert.equal(r.code,'SLOT_NOT_FOUND');
});
await test('slot read never claims retries available',async()=>{
 const x=fixture();await x.slots.reserve(candidate);
 const r=await x.slots.read({tenantId,slotId});
 assert.equal(r.autoRetryAllowed,false);
});
console.log('BUDIL_CALENDAR_POSTGRES_SLOT_ADAPTER PASS',count,'FAIL 0');

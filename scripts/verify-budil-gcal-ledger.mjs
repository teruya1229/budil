import assert from 'node:assert/strict';
import {SupabaseCalendarAttemptLedger,CALENDAR_WRITE_OPERATION} from
 '../supabase/functions/budil-calendar-write/ledger.mjs';
const tenantId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const id='44444444-4444-4444-8444-444444444444';
const requestHash='a'.repeat(64),eventId='b'+'a'.repeat(64);
const base={tenantId,userId,requestId,requestHash};
function fake(){
 const rows=new Map(),calls={insert:0,update:0,read:0};
 const key=x=>[x.tenant_id,x.operation,x.idempotency_key].join('|');
 const adminClient={from(table){
   assert.equal(table,'idempotency_requests');
   return {
     insert(row){return {select(){return {async single(){
       calls.insert++;
       const k=key(row);
       if(rows.has(k))return {data:null,error:{code:'23505'}};
       rows.set(k,{...row,id});
       return {data:{id},error:null};
     }}}}},
     update(changes){const clauses=[];return {
       eq(k,v){clauses.push([k,v]);return this;},
       select(){return this;},
       async maybeSingle(){
         calls.update++;
         const existing=[...rows.values()].find(x=>clauses.every(([k,v])=>x[k]===v));
         if(!existing)return {data:null,error:null};
         Object.assign(existing,changes);
         return {data:{id:existing.id},error:null};
       }
     }},
     select(){const clauses=[];return {
       eq(k,v){clauses.push([k,v]);return this;},
       async maybeSingle(){
         calls.read++;
         const existing=[...rows.values()].find(x=>clauses.every(([k,v])=>x[k]===v));
         return {data:existing||null,error:null};
       }
     }}
   };
 }};
 return {ledger:new SupabaseCalendarAttemptLedger({adminClient}),rows,calls};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
await test('claim writes indeterminate before provider call',async()=>{
 const x=fake(),r=await x.ledger.claim(base);
 assert.equal(r.ok,true);assert.equal(r.status,'indeterminate');assert.equal(x.calls.insert,1);
 assert.equal([...x.rows.values()][0].operation,CALENDAR_WRITE_OPERATION);
 assert.equal([...x.rows.values()][0].response_body,undefined);
});
await test('duplicate request never enables another Google call',async()=>{
 const x=fake();await x.ledger.claim(base);
 const d=await x.ledger.claim(base);
 assert.equal(d.ok,false);assert.equal(d.code,'ALREADY_ATTEMPTED');assert.equal(x.rows.size,1);
});
await test('lookup unknown is not a free retry',async()=>{
 const x=fake();await x.ledger.claim(base);
 const r=await x.ledger.find({tenantId,requestId});
 assert.equal(r.status,'indeterminate');assert.equal(r.autoRetryAllowed,false);
 assert.equal(r.operatorInspectionRequired,true);
});
await test('verified state requires Google GET proof and linked work order',async()=>{
 const x=fake();await x.ledger.claim(base);
 const denied=await x.ledger.markVerified({id,tenantId,requestHash,workOrderId:'wo-1',
  eventId,etag:'"etag"',googleReadbackVerified:false,workOrderLinked:true});
 assert.equal(denied.code,'VERIFICATION_REQUIRED');assert.equal(x.calls.update,0);
});
await test('verified outcome stores only IDs not customer PII',async()=>{
 const x=fake();await x.ledger.claim(base);
 const r=await x.ledger.markVerified({id,tenantId,requestHash,workOrderId:'wo-1',
  eventId,etag:'"etag"',googleReadbackVerified:true,workOrderLinked:true});
 assert.equal(r.ok,true);assert.equal(x.calls.update,1);
 const stored=[...x.rows.values()][0].response_body;
 assert.deepEqual(Object.keys(stored).sort(),['etag','eventId','googleReadbackVerified','workOrderId','workOrderLinked'].sort());
 assert.equal((await x.ledger.find({tenantId,requestId})).status,'verified');
});
await test('same verified attempt cannot be marked twice',async()=>{
 const x=fake();await x.ledger.claim(base);
 const args={id,tenantId,requestHash,workOrderId:'wo-1',eventId,etag:'"etag"',
  googleReadbackVerified:true,workOrderLinked:true};
 assert.equal((await x.ledger.markVerified(args)).ok,true);
 assert.equal((await x.ledger.markVerified(args)).code,'LEDGER_CHANGED');
});
await test('wrong request hash cannot change stored status',async()=>{
 const x=fake();await x.ledger.claim(base);
 const r=await x.ledger.markVerified({id,tenantId,requestHash:'b'.repeat(64),
  workOrderId:'wo-1',eventId,etag:'"etag"',googleReadbackVerified:true,workOrderLinked:true});
 assert.equal(r.code,'LEDGER_CHANGED');
});
await test('reject invalid idempotency UUID before SQL',async()=>{
 const x=fake();const r=await x.ledger.claim({...base,requestId:'not-uuid'});
 assert.equal(r.code,'CLAIM_INVALID');assert.equal(x.calls.insert,0);
});
await test('reject invalid Google event ID before SQL',async()=>{
 const x=fake();await x.ledger.claim(base);
 const r=await x.ledger.markVerified({id,tenantId,requestHash,workOrderId:'wo-1',
  eventId:'bad',etag:'"etag"',googleReadbackVerified:true,workOrderLinked:true});
 assert.equal(r.code,'VERIFICATION_REQUIRED');assert.equal(x.calls.update,0);
});
await test('tenant isolation of lookup',async()=>{
 const x=fake();await x.ledger.claim(base);
 const r=await x.ledger.find({tenantId:'99999999-9999-4999-8999-999999999999',requestId});
 assert.equal(r.code,'NOT_FOUND');
});
console.log('BUDIL_GCAL_EXISTING_POSTGRES_LEDGER PASS',count,'FAIL 0');

/**
 * Full non-production server contract: owner approval -> live busy recheck ->
 * durable-attempt model -> Google HTTP insert/get/patch/get -> WorkOrder link.
 * All inputs, users, events and access tokens are fictional; NO network.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GoogleWriteEvents} from '../supabase/functions/budil-calendar-write/google-write-events.mjs';
const require=createRequire(import.meta.url);
const {CalendarTransaction,MemoryDb}=require('../experiments/budil-gcal-write-sandbox/transaction.cjs');
const calendarId='fake-warehouse-calendar@example.com';
const now=Date.parse('2099-11-01T10:00:00+09:00');
const candidate=(extra={})=>({
  action:'booking',date:'2099-11-20',startTime:'10:00',endTime:'11:00',
  customerId:'fictional-1',customerName:'Fictional Customer',
  serviceText:'Fictional Aircon Service',...extra
});
function environment(){
  const events=new Map(),calls={create:0,update:0,get:0,busy:0};
  let fault=null,version=0;
  const fetcher=async(url,options)=>{
    const u=new URL(url);
    if(u.searchParams.has('timeMin')){
      calls.busy++;
      if(fault==='busy-failure')return {status:503};
      const first=Date.parse(u.searchParams.get('timeMin')),last=Date.parse(u.searchParams.get('timeMax'));
      const items=[...events.values()].filter(e=>{
        const a=Date.parse(e.start.dateTime),b=Date.parse(e.end.dateTime);
        return a<last&&first<b;
      }).map(e=>({id:e.id,status:'confirmed',start:e.start,end:e.end}));
      return {status:200,json:async()=>({items})};
    }
    if(options.method==='POST'){
      calls.create++;
      if(fault==='create-timeout')throw Error('offline');
      const b=JSON.parse(options.body);
      if(events.has(b.id))return {status:409};
      const ev={...b,etag:'"fictional-'+(++version)+'"'};
      events.set(b.id,ev);
      if(fault==='lost-response')throw Error('response missing');
      return {status:201,json:async()=>ev};
    }
    const id=u.pathname.slice(u.pathname.lastIndexOf('/')+1);
    if(options.method==='GET'){
      calls.get++;
      if(fault==='get-failure')return {status:503};
      if(!events.has(id))return {status:404};
      return {status:200,json:async()=>events.get(id)};
    }
    if(options.method==='PATCH'){
      calls.update++;
      if(fault==='patch-timeout')throw Error('offline');
      const old=events.get(id);
      if(!old||options.headers['If-Match']!==old.etag)return {status:412};
      const b=JSON.parse(options.body);
      const ev={...old,...b,id,etag:'"fictional-'+(++version)+'"'};
      events.set(id,ev);
      return {status:200,json:async()=>ev};
    }
    throw Error('UNEXPECTED_METHOD');
  };
  const http=new GoogleWriteEvents({calendarId,
    tokenForRequest:async()=> 'fictional-bearer-token-xyz',
    fetcher,timeoutMs:500});
  const db=new MemoryDb();
  db.bindings.set('tenant-fake',{tenantId:'tenant-fake',ownerId:'owner-fake',
    calendarId,active:true,writeEnabled:true,readOnly:false});
  const service=new CalendarTransaction({db,provider:http,enabled:true,
    clock:()=>now,authenticate:s=>s==='owner'?{
      authenticated:true,memberActive:true,tenantActive:true,memberId:'owner-member',
      ownerId:'owner-fake',tenantId:'tenant-fake'}:null,
    resolveCustomer:({customerId,tenantId})=>customerId==='fictional-1'&&tenantId==='tenant-fake'?
      {id:customerId,name:'Fictional Customer',active:true}:null,
    verifyApproval:({proof})=>proof==='FICTIONAL_USER_APPROVED'});
  return {db,events,calls,http,service,setFault:x=>fault=x};
}
let passed=0;
async function test(name,fn){await fn();console.log('PASS',name);passed++;}
const approve=async (x,request)=>{
  const r=await x.service.prepare({session:'owner',candidate:request});
  const a=await x.service.approve({session:'owner',draftId:r.draftId,
    proof:'FICTIONAL_USER_APPROVED'});
  return a.approvalId;
};
await test('create returns verified only after Google GET readback',async()=>{
 const x=environment(),approvalId=await approve(x,candidate());
 const saved=await x.service.commit({session:'owner',approvalId});
 assert.equal(saved.status,'verified');assert.equal(saved.calendarUpdated,true);
 assert.equal(saved.readbackVerified,true);assert.equal(saved.unsynced,false);
 assert.equal(x.calls.create,1);assert.equal(x.calls.get,1);
 assert.equal(x.db.orders.get(saved.workOrderId).eventId,saved.eventId);
 assert.equal(x.events.size,1);
});
await test('same Google event ID is PATCHed on reschedule',async()=>{
 const x=environment();
 const id=await approve(x,candidate());
 const created=await x.service.commit({session:'owner',approvalId:id});
 const changed=await approve(x,candidate({action:'reschedule',date:'2099-11-21',
   startTime:'12:00',endTime:'13:00',workOrderId:created.workOrderId}));
 const saved=await x.service.commit({session:'owner',approvalId:changed});
 assert.equal(saved.eventId,created.eventId);
 assert.equal(x.events.size,1);assert.equal(x.calls.create,1);assert.equal(x.calls.update,1);
 assert.equal(x.db.orders.get(saved.workOrderId).scheduledDate,'2099-11-21');
 assert.equal(x.db.orders.get(saved.workOrderId).etag,saved.etag);
});
await test('same approval cannot create a duplicate event',async()=>{
 const x=environment(),id=await approve(x,candidate());
 await x.service.commit({session:'owner',approvalId:id});
 await assert.rejects(x.service.commit({session:'owner',approvalId:id}),e=>e.code==='ALREADY_ATTEMPTED');
 assert.equal(x.calls.create,1);assert.equal(x.events.size,1);
});
await test('new approval overlapping with event fails before Google write',async()=>{
 const x=environment(),id=await approve(x,candidate());
 await x.service.commit({session:'owner',approvalId:id});
 await assert.rejects(x.service.prepare({session:'owner',candidate:candidate()}),
   e=>e.code==='CONFLICT');
 assert.equal(x.calls.create,1);assert.equal(x.events.size,1);
});
await test('busy provider failure cannot count as free',async()=>{
 const x=environment();x.setFault('busy-failure');
 await assert.rejects(x.service.prepare({session:'owner',candidate:candidate()}),
   e=>e.code==='BUSY_UNVERIFIED_OR_STALE');
 assert.equal(x.calls.create,0);
});
await test('provider HTTP timeout leaves indeterminate and no retry',async()=>{
 const x=environment(),id=await approve(x,candidate());x.setFault('create-timeout');
 await assert.rejects(x.service.commit({session:'owner',approvalId:id}),
   e=>e.code==='PROVIDER_OUTCOME_UNKNOWN');
 assert.equal(x.calls.create,1);assert.equal(x.db.ops.get(id).status,'indeterminate');
 await assert.rejects(x.service.commit({session:'owner',approvalId:id}));
 assert.equal(x.calls.create,1);
});
await test('lost HTTP response can reconcile via GET without re-create',async()=>{
 const x=environment(),id=await approve(x,candidate());x.setFault('lost-response');
 await assert.rejects(x.service.commit({session:'owner',approvalId:id}),
   e=>e.code==='PROVIDER_OUTCOME_UNKNOWN');
 assert.equal(x.calls.create,1);x.setFault(null);
 const reconciled=await x.service.reconcile({session:'owner',approvalId:id});
 assert.equal(reconciled.status,'verified');assert.equal(reconciled.readbackVerified,true);
 assert.equal(x.calls.create,1);assert.equal(x.events.size,1);
});
await test('readback failure cannot mark the work order synchronized',async()=>{
 const x=environment(),id=await approve(x,candidate());x.setFault('get-failure');
 await assert.rejects(x.service.commit({session:'owner',approvalId:id}),
   e=>e.code==='READBACK_UNKNOWN');
 assert.equal(x.db.orders.size,0);assert.equal(x.db.ops.get(id).status,'indeterminate');
 assert.equal(x.calls.create,1);
});
await test('foreign unauthorized user cannot prepare',async()=>{
 const x=environment();await assert.rejects(x.service.prepare({session:'other',candidate:candidate()}),
   e=>e.code==='AUTH_REQUIRED');assert.equal(x.calls.busy,0);
});
console.log('BUDIL_GCAL_FAKE_FULL_HTTP_FLOW PASS',passed,'FAIL 0');

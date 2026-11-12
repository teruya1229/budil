import assert from 'node:assert/strict';
import {GoogleWriteEvents} from '../supabase/functions/budil-calendar-write/google-write-events.mjs';
const cid='fictional-bc-calendar@example.com';
const eventId='b'+'a'.repeat(64);
const metadata={tenantId:'fictional-tenant',ownerId:'fictional-owner',workOrderId:'fictional-work'};
const payload={eventId,start:'2099-11-11T10:00:00+09:00',
  end:'2099-11-11T11:00:00+09:00',timeZone:'Asia/Tokyo',metadata};
const targetStart=payload.start,targetEnd=payload.end;
const fakeEvent=(body,id=eventId,etag='"etag1"')=>({id,etag,
  start:body.start,end:body.end,extendedProperties:body.extendedProperties});
let count=0;
async function test(name,fn){await fn();console.log('PASS',name);count++;}
function make(){
 const calls=[];const events=new Map();let fault=null;
 const fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method,headers:opts.headers,body:opts.body});
  if(fault==='timeout')throw Error('offline');
  if(fault==='403')return {status:403};
  if(fault==='412')return {status:412};
  if(fault==='409')return {status:409};
  if(fault==='503')return {status:503};
  if(opts.method==='POST'){
   const body=JSON.parse(opts.body);
   const event=fakeEvent(body,body.id);events.set(body.id,event);
   return {status:201,json:async()=>event};
  }
  if(opts.method==='GET'){
   const id=url.split('/').at(-1);
   const ev=events.get(id);
   return ev?{status:200,json:async()=>ev}:{status:404};
  }
  if(opts.method==='PATCH'){
   const body=JSON.parse(opts.body),id=url.slice(url.lastIndexOf('/')+1).split('?')[0];
   const old=events.get(id);
   if(!old||opts.headers['If-Match']!==old.etag)return {status:412};
   const fresh=fakeEvent(body,id,'"etag2"');events.set(id,fresh);
   return {status:200,json:async()=>fresh};
  }
  throw Error('UNEXPECTED_FETCH');
 };
 const provider=new GoogleWriteEvents({calendarId:cid,tokenForRequest:async()=> 'fictional-token-123',
   fetcher,timeoutMs:500});
 return {provider,calls,events,setFault:x=>fault=x};
}
await test('create on fixed calendar and readback',async()=>{const x=make();const created=await x.provider.create(cid,payload);
 assert.equal(created.eventId,eventId);assert.equal(created.metadata.workOrderId,metadata.workOrderId);
 const read=await x.provider.get(cid,eventId);assert.equal(read.etag,'"etag1"');
 assert.equal(x.calls[0].method,'POST');assert.equal(x.calls[1].method,'GET');
 assert.ok(!x.calls[0].body.includes('fictional private client'));
 assert.equal(JSON.parse(x.calls[0].body).summary,'BCサービス 作業予定');
 assert.equal(JSON.parse(x.calls[0].body).attendees,undefined);
});
await test('reschedule is PATCH same ID with If-Match',async()=>{const x=make();await x.provider.create(cid,payload);
 const {eventId:omitEventId,...baseUpdate}=payload;
 const changed={...baseUpdate,start:'2099-11-12T10:00:00+09:00',end:'2099-11-12T11:00:00+09:00'};
 const r=await x.provider.update(cid,eventId,changed,{ifMatch:'"etag1"'});
 assert.equal(r.eventId,eventId);assert.equal(r.etag,'"etag2"');
 const read=await x.provider.get(cid,eventId);assert.equal(read.start,changed.start);
 assert.equal(x.calls[1].headers['If-Match'],'"etag1"');
});
await test('wrong calendar never calls Google',async()=>{const x=make();await assert.rejects(x.provider.create('other',payload));assert.equal(x.calls.length,0)});
await test('primary calendar shortcut cannot construct provider',async()=>{assert.throws(()=>new GoogleWriteEvents({calendarId:'primary',fetcher:async()=>{},tokenForRequest:async()=> 'abcdefghi'}));});
await test('invalid event id refused',async()=>{const x=make();await assert.rejects(x.provider.create(cid,{...payload,eventId:'invalid'}));assert.equal(x.calls.length,0)});
await test('invalid schedule refused',async()=>{const x=make();await assert.rejects(x.provider.create(cid,{...payload,end:targetStart}));assert.equal(x.calls.length,0)});
await test('client title injection impossible',async()=>{const x=make();await assert.rejects(x.provider.create(cid,{...payload,summary:'private name'}));assert.equal(x.calls.length,0)});
await test('custom metadata refused',async()=>{const x=make();await assert.rejects(x.provider.create(cid,{...payload,metadata:{...metadata,userId:'fake'}}));assert.equal(x.calls.length,0)});
await test('If-Match required for updates',async()=>{const x=make();await assert.rejects(x.provider.update(cid,eventId,payload,{}));assert.equal(x.calls.length,0)});
await test('409 is collision not replayed',async()=>{const x=make();x.setFault('409');await assert.rejects(x.provider.create(cid,payload),e=>e.code==='DUPLICATE_EVENT_ID');assert.equal(x.calls.length,1)});
await test('412 is conflict not retried',async()=>{const x=make();x.setFault('412');await assert.rejects(x.provider.update(cid,eventId,payload,{ifMatch:'"etag1"'}),e=>e.code==='ETAG_CONFLICT');assert.equal(x.calls.length,1)});
await test('403 is denied',async()=>{const x=make();x.setFault('403');await assert.rejects(x.provider.create(cid,payload),e=>e.code==='GOOGLE_AUTH_DENIED');assert.equal(x.calls.length,1)});
await test('503 is indeterminate no retry',async()=>{const x=make();x.setFault('503');await assert.rejects(x.provider.create(cid,payload),e=>e.code==='OUTCOME_UNKNOWN');assert.equal(x.calls.length,1)});
await test('network loss is unknown no retry',async()=>{const x=make();x.setFault('timeout');await assert.rejects(x.provider.create(cid,payload),e=>e.code==='OUTCOME_UNKNOWN');assert.equal(x.calls.length,1)});
await test('GET 404 means absent',async()=>{const x=make();assert.equal(await x.provider.get(cid,eventId),null)});
console.log('BUDIL_GOOGLE_WRITE_HTTP PASS',count,'FAIL 0');

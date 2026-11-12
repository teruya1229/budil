import assert from 'node:assert/strict';
import {GoogleWriteEvents} from '../supabase/functions/budil-calendar-write/google-write-events.mjs';

const calendarId='fake-budil-calendar@example.com';
const tenantId='11111111-1111-4111-8111-111111111111';
const ownerId='22222222-2222-4222-8222-222222222222';
const workOrderId='test-budil-calendar-33333333-3333-4333-8333-333333333333';
const eventId='b'+'a'.repeat(64);
const start='2099-11-25T10:00:00+09:00';
const end='2099-11-25T11:00:00+09:00';
const metadata={tenantId,ownerId,workOrderId};
const payload={eventId,start,end,timeZone:'Asia/Tokyo',metadata};
const claim={tenantId,ownerId,workOrderId,expectedEtag:'"etag-one"',expectedStart:start,expectedEnd:end};
const fixture=()=>{
  const events=new Map();
  const calls={post:0,patch:0,delete:0,get:0};
  let responseStatus=204,keepOnDelete=false;
  const fetcher=async(url,opts)=>{
    const u=new URL(url);
    const id=u.pathname.split('/').at(-1);
    if(opts.method==='POST'){
      calls.post++;
      const body=JSON.parse(opts.body);
      const event={...body,etag:'"etag-one"'};
      events.set(body.id,event);
      return {status:201,json:async()=>event};
    }
    if(opts.method==='GET'){
      calls.get++;
      const item=events.get(id);
      return item?{status:200,json:async()=>item}:{status:404};
    }
    if(opts.method==='DELETE'){
      calls.delete++;
      if(responseStatus!==204)return {status:responseStatus};
      if(!keepOnDelete)events.delete(id);
      return {status:204};
    }
    throw Error('UNKNOWN_METHOD');
  };
  const provider=new GoogleWriteEvents({calendarId,
    tokenForRequest:async()=> 'fake-server-only-access-token',
    fetcher,timeoutMs:500});
  return {provider,events,calls,
    status:x=>responseStatus=x,stuck:x=>keepOnDelete=x};
};
let count=0;
const test=async(label,fn)=>{await fn();count++;console.log('PASS',label);};
await test('synthetic event labelled as test at creation',async()=>{
  const x=fixture();
  await x.provider.create(calendarId,payload);
  assert.equal(x.events.get(eventId).summary,'【開発テスト】BCサービス 予約確認（自動削除予定）');
});
await test('create/readback/verified cleanup/readback absent',async()=>{
  const x=fixture();
  await x.provider.create(calendarId,payload);
  const r=await x.provider.deleteVerifiedTestEvent(calendarId,eventId,claim);
  assert.equal(r.deleted,true);assert.equal(r.readbackVerified,true);
  assert.equal(x.events.size,0);assert.equal(x.calls.delete,1);assert.equal(x.calls.get,2);
});
await test('no deletion without fully verified metadata',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,
    {...claim,workOrderId:'normal-work-123'}),e=>e.code==='TEST_DELETE_AUTHORITY_INVALID');
  assert.equal(x.calls.delete,0);
});
await test('reject wrong tenant even if event ID exists',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,
    {...claim,tenantId:'99999999-9999-4999-8999-999999999999'}),
    e=>e.code==='TEST_DELETE_EVENT_MISMATCH');
  assert.equal(x.calls.delete,0);
});
await test('reject changed ETag',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,
    {...claim,expectedEtag:'"other"'}),e=>e.code==='TEST_DELETE_EVENT_MISMATCH');
  assert.equal(x.calls.delete,0);
});
await test('reject wrong calendar target before HTTP request',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);
  await assert.rejects(x.provider.deleteVerifiedTestEvent('foreign@example.com',eventId,claim));
  assert.equal(x.calls.get,0);assert.equal(x.calls.delete,0);
});
await test('refuse cleanup when provider rejects DELETE with 403',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);x.status(403);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,claim),
    e=>e.code==='GOOGLE_AUTH_DENIED');
  assert.equal(x.events.size,1);
});
await test('200/201 response cannot be accepted as DELETE success',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);x.status(200);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,claim),
    e=>e.code==='OUTCOME_UNKNOWN');
  assert.equal(x.events.size,1);
});
await test('a claimed 204 without missing GET is not cleanup success',async()=>{
  const x=fixture();await x.provider.create(calendarId,payload);x.stuck(true);
  await assert.rejects(x.provider.deleteVerifiedTestEvent(calendarId,eventId,claim),
    e=>e.code==='TEST_DELETE_READBACK_UNVERIFIED');
  assert.equal(x.events.size,1);
});
await test('idempotent absence is distinguishable from deletion',async()=>{
  const x=fixture();
  const r=await x.provider.deleteVerifiedTestEvent(calendarId,eventId,claim);
  assert.equal(r.deleted,false);assert.equal(r.absent,true);
  assert.equal(x.calls.delete,0);
});
console.log('BUDIL_GCAL_TEST_EVENT_CLEANUP_PASS',count,'FAIL 0');

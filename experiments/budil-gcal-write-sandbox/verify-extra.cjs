'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse,complete}=require('./booking-command.cjs');
const {call,validate}=require('./production-call-adapter.cjs');
const {fixture}=require('./fakes.cjs');
const {BudilGptBooking}=require('./existing-read-booking.js');
const {AtomicLedger}=require('./atomic-ledger.cjs');
const now=new Date('2026-11-11T02:00:00Z');
const candidate=(extra={})=>({action:'booking',date:'2099-01-03',startTime:'10:00',endTime:'11:00',
  customerId:'fictional-customer-1',customerName:'Fictional Customer',serviceText:'Fake Service',...extra});
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name)}catch(e){fail++;console.log('FAIL '+name+' '+e.message)}}
async function approved(f,c=candidate()){const d=await f.service.prepare({session:'owner',candidate:c});
  await f.service.approve({session:'owner',draftId:d.draftId,proof:f.grant(d)});return d.draftId;}
async function rejects(p,code){await assert.rejects(p,e=>e.code===code)}
(async()=>{
  await test('short Japanese command uses current JST year',()=>{
    const x=parse('11月20日10時にエアコンクリーニングを予約して',{now});
    assert.equal(x.date,'2026-11-20');assert.equal(x.startTime,'10:00');
    assert.deepEqual(x.missing,['customerId','customerName','endTime']);assert.equal(x.approvalRequired,true);
  });
  await test('short command requires explicit customer and duration',()=>{
    const x=parse('11月20日10時にエアコンクリーニングを予約して',{now});
    assert.equal(complete(x,{customerId:'c-1',customerName:'Test',endTime:'11:00'}).ok,false);
    assert.equal(complete(x,{customerId:'c-1',customerName:'Test',endTime:'11:00',explicitCustomerSelection:true,explicitDurationSelection:true}).ok,true);
  });
  await test('explicit past day refused',()=>assert.equal(parse('11月10日10時にエアコンクリーニングを予約して',{now}).code,'PAST_DATE'));
  await test('invalid day refused',()=>assert.equal(parse('11月31日10時にエアコンクリーニングを予約して',{now}).code,'DATE_INVALID'));
  await test('existing long grammar accepted',()=>{const x=parse('2099-01-03の10時に田中さんのエアコンクリーニング1台を予約して税込12,000円で見積書も作って',{now});assert.equal(x.ok,true);assert.equal(x.amount,12000)});
  await test('existing availability grammar remains accepted',()=>{const x=parse('2099-01-03の10時空いてる？',{now});assert.equal(x.action,'availability');assert.equal(x.startTime,'10:00')});
  await test('existing reschedule grammar asks for exact target',()=>{const x=parse('田中さんの予約を2099-01-04に変更して',{now});assert.equal(x.action,'reschedule');assert.ok(x.missing.includes('calendarEventId'))});
  await test('feature OFF makes zero network calls',async()=>{const prior=global.fetch;let calls=0;global.fetch=async()=>{calls++};try{assert.equal((await call('/commit',{})).code,'FEATURE_OFF');assert.equal(calls,0)}finally{global.fetch=prior}});
  await test('invented verified response remains unsaved',()=>assert.equal(validate('/commit',{ok:true,status:'verified',eventId:'fake-id'}).saved,false));
  await test('unknown status remains unsaved',()=>assert.equal(validate('/commit',{status:'unknown'}).saved,false));
  await test('strict verified contract accepted by pure validator',()=>assert.equal(validate('/commit',{status:'verified',calendarUpdated:true,workOrderId:'work-123',eventId:'event-123',readbackVerified:true,unsynced:false}).saved,true));
  await test('no browser gateway backdoor in candidate production files',()=>{
    for(const file of ['transaction.cjs','booking-command.cjs','production-call-adapter.cjs','google-calendar-http.cjs']){
      const s=fs.readFileSync(path.join(__dirname,file),'utf8');
      assert.ok(!s.includes(['__Budil','CalendarWrite','Fixture'].join('')));
      assert.ok(!s.includes(['fixture','Mode'].join('')));
    }
  });
  await test('fake create fetch update fetch delete lifecycle',async()=>{
    const f=fixture(),id=await approved(f),r=await f.service.commit({session:'owner',approvalId:id});
    assert.ok(await f.provider.get('calendar-fake',r.eventId));
    const change=await approved(f,candidate({action:'reschedule',workOrderId:r.workOrderId,date:'2099-01-04'}));
    const changed=await f.service.commit({session:'owner',approvalId:change});
    assert.equal(changed.eventId,r.eventId);assert.equal((await f.provider.get('calendar-fake',r.eventId)).start.slice(0,10),'2099-01-04');
    assert.equal(await f.provider.delete('calendar-fake',r.eventId),true);
    assert.equal(await f.provider.get('calendar-fake',r.eventId),null);
    assert.equal(f.provider.calls.create,1);assert.equal(f.provider.calls.update,1);
  });
  await test('inactive member refused',async()=>{const f=fixture();f.sessions.get('owner').memberActive=false;await rejects(f.service.prepare({session:'owner',candidate:candidate()}),'AUTH_REQUIRED')});
  await test('inactive tenant refused',async()=>{const f=fixture();f.sessions.get('owner').tenantActive=false;await rejects(f.service.prepare({session:'owner',candidate:candidate()}),'AUTH_REQUIRED')});
  await test('inactive calendar binding refused',async()=>{const f=fixture();f.db.bindings.get('tenant-fake').active=false;await rejects(f.service.prepare({session:'owner',candidate:candidate()}),'OWNER_REQUIRED')});
  await test('unknown customer ID cannot be selected by text alone',async()=>{const f=fixture();await rejects(f.service.prepare({session:'owner',candidate:candidate({customerId:'invented-customer'})}),'CUSTOMER_SELECTION_REQUIRED')});
  await test('customer name must match resolved lead',async()=>{const f=fixture();await rejects(f.service.prepare({session:'owner',candidate:candidate({customerName:'Wrong Person'})}),'CUSTOMER_SELECTION_REQUIRED')});
  await test('403 provider leaves order unsynced',async()=>{const f=fixture(),id=await approved(f);f.provider.create=async()=>{throw Object.assign(Error('denied'),{status:403})};await rejects(f.service.commit({session:'owner',approvalId:id}),'PROVIDER_OUTCOME_UNKNOWN');assert.equal(f.db.orders.size,0)});
  await test('timeout never automatic retry',async()=>{const f=fixture(),id=await approved(f);let calls=0;f.provider.create=async()=>{calls++;throw Error('timeout')};await rejects(f.service.commit({session:'owner',approvalId:id}),'PROVIDER_OUTCOME_UNKNOWN');await rejects(f.service.commit({session:'owner',approvalId:id}),'APPROVAL_INVALID');assert.equal(calls,1)});
  await test('concurrent commit has one provider create',async()=>{const f=fixture(),id=await approved(f);await Promise.allSettled([f.service.commit({session:'owner',approvalId:id}),f.service.commit({session:'owner',approvalId:id})]);assert.equal(f.provider.calls.create,1)});
  await test('expired approval does not call provider',async()=>{const f=fixture(),id=await approved(f);f.advance(120001);await rejects(f.service.commit({session:'owner',approvalId:id}),'APPROVAL_EXPIRED');assert.equal(f.provider.calls.create,0)});
  await test('wrong reschedule event ID refused',async()=>{const f=fixture(),id=await approved(f),r=await f.service.commit({session:'owner',approvalId:id});await rejects(f.service.prepare({session:'owner',candidate:candidate({action:'reschedule',workOrderId:r.workOrderId,targetEventId:'wrong'})}),'CANDIDATE_INVALID')});
  await test('missing provider fetch refuses reschedule',async()=>{const f=fixture(),id=await approved(f),r=await f.service.commit({session:'owner',approvalId:id});f.provider.events.delete(r.eventId);await rejects(f.service.prepare({session:'owner',candidate:candidate({action:'reschedule',workOrderId:r.workOrderId,date:'2099-01-04'})}),'TARGET_UNOWNED')});
  await test('one-click Google availability remains pure READ',()=>{const r=BudilGptBooking.googleScheduleReview([{start:'2099-01-03T11:00:00+09:00',end:'2099-01-03T12:00:00+09:00'}],'2099-01-03','10:00','11:00');assert.equal(r.ok,true);assert.equal(r.hasConflict,false)});
  await test('atomic ledger uses unique claim and detects hash conflict',async()=>{
    let stored=null;const tx={query:async(sql,args)=>{
      if(sql.includes('INSERT')){if(stored)return {rows:[]};stored={state:'claimed',snapshot_sha256:args[3],event_id:args[6]};return {rows:[stored]}}
      return {rows:[stored]};
    }};const ledger=new AtomicLedger(tx),key='a'.repeat(64),digest='b'.repeat(64);
    const item={tenantId:'tenant',operation:'booking',idempotencyKey:key,digest,workOrderId:'work',calendarId:'cal',eventId:'event'};
    assert.equal((await ledger.claim(item)).claimedNew,true);
    assert.equal((await ledger.claim(item)).claimedNew,false);
    await rejects(ledger.claim({...item,digest:'c'.repeat(64)}),'KEY_HASH_CONFLICT');
  });
  console.log(`RESULT PASS ${pass} FAIL ${fail}`);if(fail)process.exitCode=1;
})().catch(e=>{console.error('HARNESS_FAILURE',e);process.exitCode=1});

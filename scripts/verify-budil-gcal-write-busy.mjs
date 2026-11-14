import assert from 'node:assert/strict';
import {GoogleWriteEvents} from '../supabase/functions/budil-calendar-write/google-write-events.mjs';
const cid='fictional-calendar@example.com';
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
const setup=({pages=[],status=200,throwNetwork=false}={})=>{
 let calls=0;
 const provider=new GoogleWriteEvents({calendarId:cid,tokenForRequest:async()=> 'fictional-token-xyz',
  fetcher:async(url,opts)=>{
   calls++;
   assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
   assert.equal(opts.headers.Accept,'application/json');
   assert.equal(new URL(url).pathname,
     '/calendar/v3/calendars/'+encodeURIComponent(cid)+'/events');
   assert.equal(new URL(url).searchParams.get('singleEvents'),'true');
   assert.equal(new URL(url).searchParams.get('showDeleted'),'false');
   assert.equal(new URL(url).searchParams.get('fields'),'nextPageToken,items(id,status,start,end)');
   assert.equal(new URL(url).searchParams.get('maxResults'),'250');
   if(throwNetwork)throw Error('offline');
   const page=pages[calls-1]??{items:[]};
   return {status,json:async()=>page};
  },timeoutMs:500});
 return {provider,calls:()=>calls};
};
const busyDate='2099-11-20',now=Date.parse('2099-11-01T10:00:00+09:00');
const timed={id:'outside-123',status:'confirmed',
 start:{dateTime:'2099-11-20T10:00:00+09:00'},
 end:{dateTime:'2099-11-20T11:00:00+09:00'}};
const allDay={id:'all-day-other',status:'confirmed',
 start:{date:'2099-11-20'},end:{date:'2099-11-21'}};
await test('no events returns fresh verified empty snapshot',async()=>{
 const x=setup(),r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,true);assert.equal(r.date,busyDate);
 assert.equal(r.checkedAtMs,now);assert.deepEqual(r.events,[]);
 assert.equal(r.readOnly,true);assert.equal(r.calendarWritePerformed,false);
 assert.equal(x.calls(),1);
});
await test('busy event fields only, no private title',async()=>{
 const x=setup({pages:[{items:[{...timed,summary:'private fictional customer',location:'fictional address'}]}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,true);assert.deepEqual(r.events,[{eventId:'outside-123',
  start:timed.start.dateTime,end:timed.end.dateTime}]);
 assert.ok(!JSON.stringify(r).includes('private fictional customer'));
});
await test('all-day event remains a block',async()=>{
 const x=setup({pages:[{items:[allDay]}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.deepEqual(r.events,[{eventId:'all-day-other',start:'2099-11-20',end:'2099-11-21'}]);
});
await test('cancelled event skipped',async()=>{
 const x=setup({pages:[{items:[{id:'deleted',status:'cancelled'},timed]}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.events.length,1);
});
await test('multi-page list never treats page one as full result',async()=>{
 const x=setup({pages:[{items:[timed],nextPageToken:'page-two'},
  {items:[allDay]}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,true);assert.equal(r.events.length,2);assert.equal(x.calls(),2);
});
await test('malformed second page denies entire snapshot',async()=>{
 const x=setup({pages:[{items:[timed],nextPageToken:'page-two'},{invalid:true}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,false);assert.equal(x.calls(),2);
});
await test('server error is never empty availability',async()=>{
 const x=setup({status:503});const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,false);assert.equal(x.calls(),1);
});
await test('network error is never empty availability',async()=>{
 const x=setup({throwNetwork:true});const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,false);assert.equal(x.calls(),1);
});
await test('invalid date causes zero requests',async()=>{
 const x=setup();const r=await x.provider.busy(cid,'2099-02-30',now);
 assert.equal(r.ok,false);assert.equal(x.calls(),0);
});
await test('zero duration event denies entire snapshot',async()=>{
 const x=setup({pages:[{items:[{...timed,end:timed.start}]}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,false);
});
await test('fractional seconds are valid Google RFC3339',async()=>{
 const x=setup({pages:[{items:[{...timed,
  start:{dateTime:'2099-11-20T10:00:00.123+09:00'}}]}]});
 const r=await x.provider.busy(cid,busyDate,now);assert.equal(r.ok,true);
});
await test('repeated page token denies entire snapshot',async()=>{
 const x=setup({pages:[{items:[timed],nextPageToken:'repeat'},
  {items:[timed],nextPageToken:'repeat'}]});
 const r=await x.provider.busy(cid,busyDate,now);
 assert.equal(r.ok,false);assert.equal(x.calls(),2);
});
await test('wrong calendar cannot get busy data',async()=>{
 const x=setup();await assert.rejects(x.provider.busy('wrong',busyDate,now));
 assert.equal(x.calls(),0);
});
console.log('BUDIL_GOOGLE_WRITE_BUSY PASS',checks,'FAIL 0');

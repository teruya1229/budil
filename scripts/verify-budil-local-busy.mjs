import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const cloudSrc=readFileSync(new URL('../js/budil-cloud.js',import.meta.url),'utf8');
const uiSrc=readFileSync(new URL('../js/budil-gpt-offline-ui.js',import.meta.url),'utf8');
const fakeEvent={start:'2026-11-08T00:00:00.000Z',end:'2026-11-08T00:15:00.000Z'};
function mount({hostname='teruya1229.github.io',response=null,error=null}={}){
 const seen=[];
 const scope={
   location:{hostname},
   sessionStorage:{getItem(){return null},setItem(){throw Error('unexpected session write')},removeItem(){}}
 };
 const fetch=async(url,options)=>{
   seen.push({url,method:options.method,headers:options.headers,body:options.body});
   if(error)throw error;
   const value=response??{ok:true,readOnly:true,calendarWritePerformed:false,
     events:[{...fakeEvent}]};
   return {status:200,text:async()=>JSON.stringify(value)};
 };
 runInNewContext(cloudSrc,{window:scope,fetch,AbortController,
   setTimeout,clearTimeout,Date,JSON,Promise});
 return {cloud:scope.BudilCloud,seen};
}
const p=mount();const out=await p.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08');
assert.equal(out.ok,true);
assert.equal(out.readOnly,true);
assert.equal(out.calendarWritePerformed,false);
assert.equal(out.customerRecordsSent,false);
assert.equal(out.source,'pc_local_calendar');
assert.equal(p.seen.length,1);
assert.equal(p.seen[0].url,'http://127.0.0.1:43821/busy');
assert.deepEqual(Object.keys(p.seen[0].headers),['Content-Type']);
assert.deepEqual(JSON.parse(p.seen[0].body),{date:'2026-11-08'});
assert.equal(JSON.stringify(p.seen[0]).includes('Bearer'),false);
assert.equal(p.seen[0].body.includes('customer'),false);
assert.equal(p.seen[0].body.includes('calendarId'),false);
for(const invalid of ['2026-11-08/other','2026-02-30','2026-11-8','2026-11-09']){
 const e=await p.cloud.fetchLocalScheduleBlocks('2026-11-08',invalid);
 assert.equal(e.ok,false);
}
assert.equal(p.seen.length,1,'bad dates must not issue a request');
const denied=mount({hostname:'untrusted.example'});
assert.equal((await denied.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08')).code,'calendar_origin_unavailable');
assert.equal(denied.seen.length,0);
const stage=mount({hostname:'localhost'});
assert.equal((await stage.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08')).code,'calendar_origin_unavailable');
assert.equal(stage.seen.length,0);
const privateData=mount({response:{ok:true,readOnly:true,calendarWritePerformed:false,events:[
  {...fakeEvent,summary:'SHOULD_NOT_LEAK',location:'SECRET_ADDRESS'}
]}});
const blocked=await privateData.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08');
assert.equal(blocked.ok,false);
assert.equal(blocked.code,'calendar_response_invalid');
assert.equal(JSON.stringify(blocked).includes('SECRET'),false);
const failwrite=mount({response:{ok:true,readOnly:true,calendarWritePerformed:true,events:[fakeEvent]}});
assert.equal((await failwrite.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08')).code,'calendar_response_invalid');
const wrongtime=mount({response:{ok:true,readOnly:true,calendarWritePerformed:false,events:[
 {start:'2026-11-08T10:00:00.000Z',end:'2026-11-08T09:00:00.000Z'}
]}});
assert.equal((await wrongtime.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08')).code,'calendar_response_invalid');
const offline=mount({error:new Error('No loopback service')});
assert.equal((await offline.cloud.fetchLocalScheduleBlocks('2026-11-08','2026-11-08')).code,'local_calendar_unavailable');
assert.ok(uiSrc.includes('await cloud.fetchLocalScheduleBlocks(target.date,target.date)'));
assert.ok(uiSrc.includes("code==='local_calendar_unavailable'"),'explain loopback local read failures');
assert.ok(uiSrc.includes('ローカルネットワーク／ループバックへのアクセス'),'user can identify Chrome permission');
assert.ok(uiSrc.includes('Googleの空き確定にはしません。'),'failed read never claims availability');
assert.ok(!uiSrc.includes('await cloud.fetchScheduleBlocks(target.date,target.date)'));
console.log('BUDIL_LOCAL_BUSY_READ_PASS local first, no JWT/PII, no fallback, invalid date/origin, safe failures');

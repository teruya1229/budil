/**
 * BudilCloud credential diagnostics: existing session only, read-only, no
 * customer or secret forwarding. Fake network; NEVER reaches real Supabase.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/budil-cloud.js',import.meta.url),'utf8');
function setup({host='teruya1229.github.io',logged=true,response=null,code=200}={}){
 const calls=[],storage=new Map();
 if(logged)storage.set('budil-cloud.auth.v1.session',JSON.stringify({
   env:'production',expires_at:Math.floor(Date.now()/1000)+3600,
   access_token:'fake-owner-jwt',refresh_token:'fake-owner-refresh'
 }));
 const window={
  location:{hostname:host},URL,JSON,Date,Math,Promise,
  setTimeout,clearTimeout,AbortController,
  sessionStorage:{
   getItem:key=>storage.get(key)||null,
   setItem:(key,v)=>storage.set(key,v),removeItem:key=>storage.delete(key)
  },
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {status:code,text:async()=>JSON.stringify(response??{
    ok:true,stage:'calendar_read',code:'GOOGLE_EVENTS_READ_OK',
    writeEnabled:false,calendarWritePerformed:false
   })};
  }
 };
 window.window=window;
 vm.createContext(window);
 vm.runInContext(source,window,{timeout:2500});
 return {cloud:window.BudilCloud,calls,storage};
}
let count=0;
async function test(label,cb){await cb();count++;console.log('PASS',label);}
await test('single authorized POST; only empty body, no customer info',async()=>{
 const x=setup();const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.ok,true);assert.equal(v.calendarWritePerformed,false);
 assert.equal(x.calls.length,1);
 const req=x.calls[0];
 assert.equal(req.options.method,'POST');
 assert.equal(new URL(req.url).pathname,
   '/functions/v1/budil-calendar-write/diagnostic');
 assert.equal(req.options.headers.Authorization,'Bearer fake-owner-jwt');
 assert.equal(req.options.body,'{}');
 assert.equal(JSON.stringify(v).includes('fake-owner-jwt'),false);
 assert.equal(JSON.stringify(v).includes('fake-owner-refresh'),false);
});
await test('logged-out user makes zero calls',async()=>{
 const x=setup({logged:false});const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.code,'not_signed_in');assert.equal(x.calls.length,0);
});
await test('local Chrome cannot send auth to production',async()=>{
 const x=setup({host:'localhost'});const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.code,'calendar_diagnostic_origin_unavailable');
 assert.equal(x.calls.length,0);
});
await test('unknown host cannot send requests',async()=>{
 const x=setup({host:'unregistered.invalid'});
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.code,'calendar_diagnostic_origin_unavailable');
 assert.equal(x.calls.length,0);
});
await test('expired login on other environment never crosses',async()=>{
 const x=setup();
 const session=JSON.parse(x.storage.get('budil-cloud.auth.v1.session'));
 session.env='staging';
 x.storage.set('budil-cloud.auth.v1.session',JSON.stringify(session));
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.code,'not_signed_in');assert.equal(x.calls.length,0);
});
await test('server negative response is not misread as saved',async()=>{
 const x=setup({code:503,response:{
  ok:false,stage:'oauth',code:'GOOGLE_OAUTH_FAILED',
  writeEnabled:false,calendarWritePerformed:false}});
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.ok,false);assert.equal(v.code,'GOOGLE_OAUTH_FAILED');
 assert.equal(v.calendarWritePerformed,false);
});
await test('disallow server response claiming write ON',async()=>{
 const x=setup({response:{ok:true,stage:'calendar_read',
  code:'GOOGLE_EVENTS_READ_OK',writeEnabled:true,calendarWritePerformed:false}});
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.ok,false);
 assert.equal(v.code,'calendar_diagnostic_response_invalid');
});
await test('disallow server response claiming event write',async()=>{
 const x=setup({response:{ok:true,stage:'calendar_read',
  code:'GOOGLE_EVENTS_READ_OK',writeEnabled:false,calendarWritePerformed:true}});
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.ok,false);
 assert.equal(v.code,'calendar_diagnostic_response_invalid');
});
await test('arbitrary diagnostic fields not propagated',async()=>{
 const x=setup({response:{ok:true,stage:'calendar_read',
  code:'GOOGLE_EVENTS_READ_OK',writeEnabled:false,calendarWritePerformed:false,
  accessToken:'DO_NOT_RETURN',privateKey:'DO_NOT_RETURN'}});
 const v=await x.cloud.diagnoseCalendarWriteCredential();
 assert.equal(v.ok,true);
 assert.ok(!JSON.stringify(v).includes('DO_NOT_RETURN'));
});
console.log('BUDIL_CLOUD_DIAGNOSTIC_CLIENT_PASS',count,'FAIL 0');

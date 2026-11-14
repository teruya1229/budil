import assert from 'node:assert/strict';
import {createDiagnosticHttpHandler} from
 '../supabase/functions/budil-calendar-write/diagnostic-route.mjs';
const endpoint='https://localhost/functions/v1/budil-calendar-write/diagnostic';
const jwt='Bearer abc.def.ghi';
const make=({origin='https://teruya1229.github.io',auth=jwt,method='POST',
 url=endpoint}={})=>new Request(url,{method,headers:{
 ...(origin?{Origin:origin}:{}),...(auth?{Authorization:auth}:{})
 }});
const fake=()=>{let runs=0,read=0;
 const route=createDiagnosticHttpHandler({ports:{},
  readSecret:()=>{read++;return 'NEVER_ECHO_A_REAL_SECRET'},
  probe:async({token,readSecret})=>{runs++;assert.equal(token,'abc.def.ghi');
   assert.equal(typeof readSecret,'function');
   return {ok:true,stage:'calendar_read',code:'GOOGLE_EVENTS_READ_OK',
    privateKey:'LEAK_SHOULD_NEVER_LEAVE',accessToken:'DO_NOT_RETURN'};}});
 return {route,stats:()=>({runs,read})};
};
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
await test('valid authenticated first party request returns ONLY stage and code',async()=>{
 const x=fake(),r=await x.route(make());assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,stage:'calendar_read',
  code:'GOOGLE_EVENTS_READ_OK',writeEnabled:false,calendarWritePerformed:false});
 assert.deepEqual(x.stats(),{runs:1,read:0});});
await test('missing JWT denies without probe',async()=>{
 const x=fake(),r=await x.route(make({auth:''}));
 assert.equal(r.status,401);assert.equal(x.stats().runs,0);
});
await test('unregistered origin denies without probe',async()=>{
 const x=fake(),r=await x.route(make({origin:'https://evil.invalid'}));
 assert.equal(r.status,403);assert.equal(x.stats().runs,0);
});
await test('absent origin denies without probe',async()=>{
 const x=fake(),r=await x.route(make({origin:''}));
 assert.equal(r.status,403);assert.equal(x.stats().runs,0);
});
await test('only POST permitted',async()=>{
 const x=fake(),r=await x.route(make({method:'GET'}));
 assert.equal(r.status,405);assert.equal(x.stats().runs,0);
});
await test('OPTIONS does not inspect token or secret',async()=>{
 const x=fake(),r=await x.route(make({method:'OPTIONS',auth:''}));
 assert.equal(r.status,204);assert.equal(x.stats().runs,0);
});
await test('other URL cannot invoke probe',async()=>{
 const x=fake(),r=await x.route(make({
 url:'https://localhost/functions/v1/budil-calendar-write/commit'}));
 assert.equal(r.status,404);assert.equal(x.stats().runs,0);
});
await test('backend error message cannot leak',async()=>{
 const x=createDiagnosticHttpHandler({ports:{},readSecret:()=>{},
  probe:async()=>{throw Error('secret=NEVER_PRINT_THIS_VALUE')}});
 const r=await x(make()),s=await r.text();
 assert.equal(r.status,503);assert.ok(!s.includes('NEVER_PRINT_THIS_VALUE'));
});
await test('auth errors give deny status, no secret result',async()=>{
 const x=createDiagnosticHttpHandler({ports:{},readSecret:()=>{},
  probe:async()=>({ok:false,stage:'owner',code:'ACTIVE_OWNER_REQUIRED',
   privateKey:'NEVER_LEAK'})});
 const r=await x(make()),s=await r.text();
 assert.equal(r.status,403);assert.ok(!s.includes('NEVER_LEAK'));
});
await test('unavailable Google GET is non-success',async()=>{
 const x=createDiagnosticHttpHandler({ports:{},readSecret:()=>{},
  probe:async()=>({ok:false,stage:'calendar_read',code:'CALENDAR_READ_DENIED'})});
 const r=await x(make());assert.equal(r.status,503);
 assert.equal((await r.json()).calendarWritePerformed,false);
});
console.log('BUDIL_GOOGLE_WRITE_DIAGNOSTIC_ROUTE PASS',passed,'FAIL 0');

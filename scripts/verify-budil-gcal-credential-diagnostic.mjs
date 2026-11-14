import assert from 'node:assert/strict';
import {probeGoogleWriteCredential} from
 '../supabase/functions/budil-calendar-write/diagnostic.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const tid='22222222-2222-4222-8222-222222222222';
const iid='33333333-3333-4333-8333-333333333333';
const credential={type:'service_account',
 client_email:'budil-calendar-write@budil-gbp-performance.iam.gserviceaccount.com',
 project_id:'budil-gbp-performance',
 private_key:'-----BEGIN PRIVATE KEY-----\\nfictional-not-a-key\\n-----END PRIVATE KEY-----\\n'};
function fixture(){
 const calls={secret:0,oauth:0,google:0,user:0};
 const membership={tenant_id:tid,role:'owner',status:'active'};
 const tenant={id:tid,code:'mi-bcs',status:'active'};
 const integration={id:iid,tenant_id:tid,status:'disabled',
  provider:'google_calendar',auth_mode:'service_account_share',
  secret_ref:'BUDIL_GOOGLE_CALENDAR_WRITE_SERVICE_ACCOUNT_JSON'};
 const binding={tenant_id:tid,operation:'calendar_event_write',resource_role:'calendar_target',
  status:'disabled',access_mode:'write',config:{allowCalendarEventWrite:false},
  integration_id:iid,external_resource_id:'fictional-personal-calendar@example.com',
  tenant_integrations:integration};
 let status=200,kind='calendar#events',json=JSON.stringify(credential);
 const ports={
  async verifyUser(token){calls.user++;return token==='fictional-owner-jwt'?
   {id:uid}:null;},
  async memberships(){return [membership];},
  async tenant(){return tenant;},
  async bindings(){return [binding];}
 };
 const readSecret=(key)=>{calls.secret++;assert.equal(key,
   'BUDIL_GOOGLE_CALENDAR_WRITE_SERVICE_ACCOUNT_JSON');return json;};
 const exchangeToken=async({credential,fetcher,nowSeconds})=>{
  calls.oauth++;assert.equal(credential.project_id,'budil-gbp-performance');
  assert.equal(typeof fetcher,'function');assert.ok(nowSeconds>1000000000);
  return 'fictional-oauth-token';
 };
 const fetcher=async(url,options)=>{
  calls.google++;const u=new URL(url);
  assert.equal(u.origin,'https://www.googleapis.com');
  assert.equal(u.pathname,'/calendar/v3/calendars/fictional-personal-calendar%40example.com/events');
  assert.equal(u.searchParams.get('fields'),'kind');
  assert.equal(u.searchParams.get('maxResults'),'1');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer fictional-oauth-token');
  assert.equal(options.body,undefined);
  return {status,json:async()=>({kind})};
 };
 const run=(args={})=>probeGoogleWriteCredential({
  token:'fictional-owner-jwt',ports,readSecret,exchangeToken,fetcher,
  nowSeconds:1800000000,...args});
 return {calls,membership,tenant,binding,integration,ports,run,
  setStatus:x=>status=x,setKind:x=>kind=x,setJson:x=>json=x};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
await test('owner with dedicated disabled binding may diagnose read-only',async()=>{
 const x=fixture(),r=await x.run();
 assert.equal(r.ok,true);assert.equal(r.code,'GOOGLE_EVENTS_READ_OK');
 assert.equal(r.calendarWritePerformed,false);assert.equal(r.writeEnabled,false);
 assert.deepEqual(x.calls,{secret:1,oauth:1,google:1,user:1});
 assert.ok(!JSON.stringify(r).includes('oauth-token'));
 assert.ok(!JSON.stringify(r).includes('calendar@example.com'));
});
await test('no authorization cannot read secret',async()=>{
 const x=fixture(),r=await x.run({token:'wrong'});
 assert.equal(r.code,'OWNER_AUTH_REQUIRED');assert.equal(x.calls.secret,0);
});
await test('active member but non-owner cannot read secret',async()=>{
 const x=fixture();x.membership.role='member';const r=await x.run();
 assert.equal(r.code,'ACTIVE_OWNER_REQUIRED');assert.equal(x.calls.secret,0);
});
await test('suspended owner cannot read secret',async()=>{
 const x=fixture();x.membership.status='disabled';
 assert.equal((await x.run()).code,'ACTIVE_OWNER_REQUIRED');assert.equal(x.calls.secret,0);
});
await test('different tenant cannot read secret',async()=>{
 const x=fixture();x.tenant.code='other';
 assert.equal((await x.run()).code,'TENANT_NOT_AUTHORIZED');assert.equal(x.calls.secret,0);
});
await test('write binding ACTIVE disables diagnostic',async()=>{
 const x=fixture();x.binding.status='active';
 assert.equal((await x.run()).code,'BINDING_NOT_READY');assert.equal(x.calls.secret,0);
});
await test('enabled write flag disables diagnostic',async()=>{
 const x=fixture();x.binding.config.allowCalendarEventWrite=true;
 assert.equal((await x.run()).code,'BINDING_NOT_READY');assert.equal(x.calls.secret,0);
});
await test('read-only binding cannot invoke probe',async()=>{
 const x=fixture();x.binding.operation='schedule_blocks_list';
 assert.equal((await x.run()).code,'BINDING_NOT_READY');assert.equal(x.calls.secret,0);
});
await test('missing secret stays unknown',async()=>{
 const x=fixture();x.setJson('');
 assert.equal((await x.run()).code,'SECRET_NOT_READY');assert.equal(x.calls.google,0);
});
await test('malformed JSON never reaches Google',async()=>{
 const x=fixture();x.setJson('{invalid json'+'x'.repeat(120));
 assert.equal((await x.run()).code,'SECRET_JSON_INVALID');assert.equal(x.calls.oauth,0);
});
await test('wrong service account identity cannot sign',async()=>{
 const x=fixture();x.setJson(JSON.stringify({...credential,
  client_email:'wrong@example.com'}));
 assert.equal((await x.run()).code,'CREDENTIAL_IDENTITY_OR_FORMAT_INVALID');
 assert.equal(x.calls.oauth,0);
});
await test('OAuth failure does not call Calendar API',async()=>{
 const x=fixture(),r=await x.run({
  exchangeToken:async()=>{throw Error('private google body MUST NOT LEAK')},
 });
 assert.equal(r.code,'GOOGLE_OAUTH_FAILED');
 assert.equal(x.calls.google,0);
 assert.ok(!JSON.stringify(r).includes('private'));
});
await test('403 Google Calendar read is not a success',async()=>{
 const x=fixture();x.setStatus(403);
 assert.equal((await x.run()).code,'CALENDAR_READ_DENIED');
});
await test('404 Google Calendar read is not a success',async()=>{
 const x=fixture();x.setStatus(404);
 assert.equal((await x.run()).code,'CALENDAR_NOT_ACCESSIBLE');
});
await test('503 Google Calendar error fails closed',async()=>{
 const x=fixture();x.setStatus(503);
 assert.equal((await x.run()).code,'GOOGLE_EVENTS_READ_UNAVAILABLE');
});
await test('wrong Google kind fails closed',async()=>{
 const x=fixture();x.setKind('something');
 assert.equal((await x.run()).code,'GOOGLE_EVENTS_RESPONSE_INVALID');
});
await test('no client-defined calendar target accepted',async()=>{
 const x=fixture(),r=await x.run({calendarId:'another@example.com'});
 assert.equal(r.ok,true);assert.equal(x.calls.google,1);
});
console.log('BUDIL_GOOGLE_WRITE_CREDENTIAL_DIAGNOSTIC PASS',count,'FAIL 0');

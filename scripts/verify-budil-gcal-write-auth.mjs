import assert from 'node:assert/strict';
import {authorizeCalendarWrite,cleanBearer,WRITE_OPERATION,WRITE_RESOURCE_ROLE,WRITE_SECRET_REF,
  createSupabaseAuthorityPorts} from '../supabase/functions/budil-calendar-write/authority.mjs';
import {createCalendarWriteHandler} from '../supabase/functions/budil-calendar-write/handler.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const tid='22222222-2222-4222-8222-222222222222';
const iid='33333333-3333-4333-8333-333333333333';
const jwt='Bearer aaaaa.bbbbb.ccccc';
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS',name);}
function fixtures(){
  const calls={user:0,membership:0,tenant:0,binding:0,backend:0};
  const user={id:uid};
  const member={tenant_id:tid,role:'owner',status:'active'};
  const tenant={id:tid,status:'active',code:'mi-bcs'};
  const integration={id:iid,tenant_id:tid,status:'active',
    provider:'google_calendar',auth_mode:'service_account_share',secret_ref:WRITE_SECRET_REF};
  const binding={tenant_id:tid,operation:WRITE_OPERATION,resource_role:WRITE_RESOURCE_ROLE,
    status:'active',access_mode:'write',version:1,config:{allowCalendarEventWrite:true},
    integration_id:iid,external_resource_id:'calendar@example.com',tenant_integrations:integration};
  const ports={
    async verifyUser(token){calls.user++;assert.equal(token,'aaaaa.bbbbb.ccccc');return user;},
    async memberships(id){calls.membership++;assert.equal(id,uid);return [member];},
    async tenant(id){calls.tenant++;assert.equal(id,tid);return tenant;},
    async bindings(id,op,role){calls.binding++;assert.deepEqual([id,op,role],[tid,WRITE_OPERATION,WRITE_RESOURCE_ROLE]);return [binding];}
  };
  const backend={async prepare(){calls.backend++;return {status:'prepared',draftId:'draft'};},
    async commit(){calls.backend++;return {status:'verified',calendarUpdated:true,
      readbackVerified:true,unsynced:false,eventId:'event123',workOrderId:'work123'};}};
  const make=(path='/commit',body={},opts={})=>new Request('https://example.invalid/functions/v1/budil-calendar-write/'+path,{
    method:opts.method||'POST',headers:{Origin:opts.origin??'https://teruya1229.github.io',
    Authorization:opts.auth??jwt,'Content-Type':'application/json'},
    ...((opts.method||'POST')==='POST'?{body:JSON.stringify(body)}:{})
  });
  return {calls,user,member,tenant,integration,binding,ports,backend,make};
}
await test('valid owner dedicated binding',async()=>{const x=fixtures(),r=await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports});
  assert.equal(r.ok,true);assert.equal(r.identity.tenantId,tid);assert.equal(r.identity.calendarId,'calendar@example.com');
  assert.ok(!('secretRef' in r.identity));});
await test('reject all foreign tenant memberships',async()=>{const x=fixtures();x.member.tenant_id='99999999-9999-4999-8999-999999999999';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).ok,false);});
await test('reject member role',async()=>{const x=fixtures();x.member.role='member';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'ACTIVE_OWNER_MEMBERSHIP_REQUIRED');});
await test('reject duplicate memberships',async()=>{const x=fixtures();x.ports.memberships=async()=>[x.member,x.member];assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'ACTIVE_OWNER_MEMBERSHIP_REQUIRED');});
await test('reject suspended tenant',async()=>{const x=fixtures();x.tenant.status='suspended';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'TENANT_NOT_AUTHORIZED');});
await test('reject other active tenant by code',async()=>{const x=fixtures();x.tenant.code='foreign';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'TENANT_NOT_AUTHORIZED');});
await test('no default to read binding',async()=>{const x=fixtures();x.binding.operation='schedule_blocks_list';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject read-only access',async()=>{const x=fixtures();x.binding.access_mode='read';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('require explicit write opt in config',async()=>{const x=fixtures();x.binding.config={};assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject disabled binding',async()=>{const x=fixtures();x.binding.status='disabled';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject duplicate bindings',async()=>{const x=fixtures();x.ports.bindings=async()=>[x.binding,x.binding];assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject reused read service account credential',async()=>{const x=fixtures();x.integration.secret_ref='BUDIL_GOOGLE_CALENDAR_READ_SERVICE_ACCOUNT_JSON';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject other provider',async()=>{const x=fixtures();x.integration.provider='make';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEDICATED_WRITE_BINDING_REQUIRED');});
await test('reject primary calendar shortcut',async()=>{const x=fixtures();x.binding.external_resource_id='primary';assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'INVALID_WRITE_TARGET');});
await test('deny absent JWT',async()=>{assert.equal(cleanBearer(''),null);assert.equal(cleanBearer('Bearer short'),null);assert.equal(cleanBearer(jwt),'aaaaa.bbbbb.ccccc');});
await test('deny error on member lookup',async()=>{const x=fixtures();x.ports.memberships=async()=>{throw Error('network')};assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'DEPENDENCY_UNAVAILABLE');});
await test('deny auth failure',async()=>{const x=fixtures();x.ports.verifyUser=async()=>{throw Error('invalid')};assert.equal((await authorizeCalendarWrite({token:'aaaaa.bbbbb.ccccc',ports:x.ports})).code,'AUTH_UNAVAILABLE');});
await test('fail closed on missing origin',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports});const r=await h(new Request('https://example.invalid/functions/v1/budil-calendar-write/commit',{method:'POST',headers:{Authorization:jwt}}));assert.equal(r.status,403);assert.equal(x.calls.user,0);});
await test('fail closed on foreign origin before auth',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports});const r=await h(x.make('commit',{}, {origin:'https://evil.example'}));assert.equal(r.status,403);assert.equal(x.calls.user,0);});
await test('preflight allowed only for allowlisted origin',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports});const r=await h(x.make('commit',{}, {method:'OPTIONS'}));assert.equal(r.status,204);assert.equal(x.calls.user,0);});
await test('GET blocked',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports});const r=await h(x.make('capability',{}, {method:'GET'}));assert.equal(r.status,405);assert.equal(x.calls.user,0);});
await test('feature off prevents backend and Google',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports,writeEnabled:false,backend:x.backend});const r=await h(x.make());assert.equal(r.status,423);assert.equal((await r.json()).code,'FEATURE_OFF');assert.equal(x.calls.backend,0);assert.equal(r.headers.get('cache-control'),'no-store');});
await test('no backend even if feature flag mistakenly true',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true});const r=await h(x.make());assert.equal(r.status,503);assert.equal((await r.json()).code,'DURABLE_BACKEND_NOT_CONNECTED');});
await test('capability does not leak secret or calendar id',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports});const r=await h(x.make('capability'));assert.equal(r.status,200);const body=await r.json();assert.equal(body.writeEnabled,false);assert.ok(!JSON.stringify(body).includes('calendar@example.com'));assert.ok(!JSON.stringify(body).includes(WRITE_SECRET_REF));});
await test('commit never infers saved from fake result',async()=>{const x=fixtures();x.backend.commit=async()=>({status:'verified',calendarUpdated:true,readbackVerified:false,unsynced:false,eventId:'one',workOrderId:'two'});const h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true,backend:x.backend});const r=await h(x.make());assert.equal(r.status,409);assert.equal((await r.json()).saved,false);});
await test('reject client-authored tenant claim before backend',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true,backend:x.backend});const r=await h(x.make('commit',{candidate:{tenantId:tid}}));assert.equal(r.status,400);assert.equal(x.calls.backend,0);});
await test('reject client-authored calendarId',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true,backend:x.backend});const r=await h(x.make('commit',{calendarId:'other@example.com'}));assert.equal(r.status,400);assert.equal(x.calls.backend,0);});
await test('reject backend exception as unknown',async()=>{const x=fixtures();x.backend.commit=async()=>{throw Error('timeout')};const h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true,backend:x.backend});const r=await h(x.make());assert.equal(r.status,409);assert.equal((await r.json()).saved,false);});
await test('strict commitment success only from verified mock backend',async()=>{const x=fixtures(),h=createCalendarWriteHandler({ports:x.ports,writeEnabled:true,backend:x.backend});const r=await h(x.make());assert.equal(r.status,200);assert.equal((await r.json()).readbackVerified,true);assert.equal(x.calls.backend,1);});
await test('require real auth SDK ports',async()=>{assert.throws(()=>createSupabaseAuthorityPorts({authClient:{},adminClient:{}}));});
console.log('BUDIL_CALENDAR_WRITE_AUTH_BOUNDARY PASS',tests,'FAIL 0');

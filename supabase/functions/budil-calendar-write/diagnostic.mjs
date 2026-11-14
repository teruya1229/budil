/**
 * Read-only, owner-authenticated credential check for the dedicated Budil
 * Google Calendar WRITE service account. NO events are created/changed/deleted.
 * The disabled write binding is inspected but NOT activated.
 * Never log, expose, return or persist the service account JSON or OAuth token.
 */
import {WRITE_OPERATION,WRITE_RESOURCE_ROLE,WRITE_SECRET_REF} from './authority.mjs';
import {exchangeCalendarWriteToken} from './google-write-token.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_EMAIL='budil-calendar-write@budil-gbp-performance.iam.gserviceaccount.com';
const EXPECTED_PROJECT='budil-gbp-performance';
const fail=(stage,code)=>Object.freeze({ok:false,stage,code,writeEnabled:false,calendarWritePerformed:false});
const ok=()=>Object.freeze({ok:true,stage:'calendar_read',code:'GOOGLE_EVENTS_READ_OK',writeEnabled:false,calendarWritePerformed:false});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export async function probeGoogleWriteCredential({
 token,ports,readSecret,exchangeToken=exchangeCalendarWriteToken,
 fetcher=fetch,nowSeconds=Math.floor(Date.now()/1000)
}={}){
  // Never touch a secret or Google network before owner authentication.
  if(typeof token!=='string'||token.length<8||token.length>4500||
     !ports||typeof ports.verifyUser!=='function'||
     typeof ports.memberships!=='function'||
     typeof ports.tenant!=='function'||typeof ports.bindings!=='function')
    return fail('owner','OWNER_AUTH_REQUIRED');
  let user;
  try{user=await ports.verifyUser(token);}
  catch{return fail('owner','OWNER_AUTH_UNAVAILABLE');}
  if(!object(user)||!UUID.test(user.id||''))return fail('owner','OWNER_AUTH_REQUIRED');
  let memberships;
  try{memberships=await ports.memberships(user.id);}
  catch{return fail('owner','OWNER_MEMBERSHIP_UNAVAILABLE');}
  if(!Array.isArray(memberships)||memberships.length!==1||
     memberships[0]?.role!=='owner'||memberships[0]?.status!=='active'||
     !UUID.test(memberships[0].tenant_id||''))
    return fail('owner','ACTIVE_OWNER_REQUIRED');
  const tenantId=memberships[0].tenant_id;
  let tenant;
  try{tenant=await ports.tenant(tenantId);}
  catch{return fail('owner','TENANT_UNAVAILABLE');}
  if(!object(tenant)||tenant.id!==tenantId||
     tenant.code!=='mi-bcs'||tenant.status!=='active')
    return fail('owner','TENANT_NOT_AUTHORIZED');
  let bindings;
  try{bindings=await ports.bindings(tenantId,WRITE_OPERATION,WRITE_RESOURCE_ROLE);}
  catch{return fail('binding','BINDING_UNAVAILABLE');}
  if(!Array.isArray(bindings)||bindings.length!==1)return fail('binding','BINDING_NOT_READY');
  const b=bindings[0],i=b?.tenant_integrations;
  // The probe is ONLY usable in the safe OFF state.
  if(!object(b)||!object(i)||b.tenant_id!==tenantId||
     b.operation!==WRITE_OPERATION||b.resource_role!==WRITE_RESOURCE_ROLE||
     b.status!=='disabled'||b.access_mode!=='write'||
     b.config?.allowCalendarEventWrite!==false||
     i.id!==b.integration_id||i.tenant_id!==tenantId||
     i.status!=='disabled'||i.provider!=='google_calendar'||
     i.auth_mode!=='service_account_share'||i.secret_ref!==WRITE_SECRET_REF||
     typeof b.external_resource_id!=='string'||
     b.external_resource_id==='primary'||b.external_resource_id.length<3||
     b.external_resource_id.length>254||/[/\\?#\s\x00-\x1f]/.test(b.external_resource_id))
    return fail('binding','BINDING_NOT_READY');

  if(typeof readSecret!=='function'||typeof exchangeToken!=='function'||
     typeof fetcher!=='function')return fail('secret','PROBE_NOT_CONFIGURED');
  let raw;
  try{raw=readSecret(WRITE_SECRET_REF);}
  catch{return fail('secret','SECRET_UNAVAILABLE');}
  if(typeof raw!=='string'||raw.length<100||raw.length>24000)
    return fail('secret','SECRET_NOT_READY');
  let credential;
  try{credential=JSON.parse(raw);}
  catch{return fail('secret','SECRET_JSON_INVALID');}
  if(!object(credential)||credential.type!=='service_account'||
     credential.client_email!==EXPECTED_EMAIL||
     credential.project_id!==EXPECTED_PROJECT||
     typeof credential.private_key!=='string'||
     !credential.private_key.startsWith('-----BEGIN PRIVATE KEY-----'))
    return fail('secret','CREDENTIAL_IDENTITY_OR_FORMAT_INVALID');

  let accessToken;
  try{
    accessToken=await exchangeToken({
      credential,fetcher,nowSeconds,timeoutMs:10000
    });
  }catch{return fail('oauth','GOOGLE_OAUTH_FAILED');}
  if(typeof accessToken!=='string'||accessToken.length<8||/\s/.test(accessToken))
    return fail('oauth','GOOGLE_OAUTH_FAILED');

  const calendarUrl=new URL(
    'https://www.googleapis.com/calendar/v3/calendars/'+
    encodeURIComponent(b.external_resource_id)+'/events'
  );
  calendarUrl.searchParams.set('fields','kind');
  calendarUrl.searchParams.set('maxResults','1');
  calendarUrl.searchParams.set('showDeleted','false');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  let response;
  try{
    response=await fetcher(calendarUrl.toString(),{
      method:'GET',
      headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
      signal:controller.signal,redirect:'error',cache:'no-store'
    });
  }catch{return fail('calendar_read','GOOGLE_EVENTS_READ_UNAVAILABLE');}
  finally{clearTimeout(timer);}
  if(response?.status===401||response?.status===403)
    return fail('calendar_read','CALENDAR_READ_DENIED');
  if(response?.status===404)return fail('calendar_read','CALENDAR_NOT_ACCESSIBLE');
  if(response?.status!==200)return fail('calendar_read','GOOGLE_EVENTS_READ_UNAVAILABLE');
  let body;
  try{body=await response.json();}
  catch{return fail('calendar_read','GOOGLE_EVENTS_RESPONSE_INVALID');}
  if(!object(body)||body.kind!=='calendar#events')
    return fail('calendar_read','GOOGLE_EVENTS_RESPONSE_INVALID');
  return ok();
}

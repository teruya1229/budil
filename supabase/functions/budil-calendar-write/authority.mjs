/**
 * Budil calendar WRITE authority. Deno/Node-compatible, pure policy.
 * No fallback to the existing schedule_blocks_list READ binding.
 * The returned binding must NEVER be sent to a client or logged.
 */
export const WRITE_OPERATION='calendar_event_write';
export const WRITE_RESOURCE_ROLE='calendar_target';
export const WRITE_SECRET_REF='BUDIL_GOOGLE_CALENDAR_WRITE_SERVICE_ACCOUNT_JSON';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>({ok:false,code});
const ordinary=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function cleanBearer(raw){
  if(typeof raw!=='string'||raw.length>5000)return null;
  const m=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(raw);
  return m?m[1]:null;
}
export async function authorizeCalendarWrite({token,ports}={}){
  if(typeof token!=='string'||token.length>4500||!ports||
     typeof ports.verifyUser!=='function'||typeof ports.memberships!=='function'||
     typeof ports.tenant!=='function'||typeof ports.bindings!=='function')
    return fail('AUTH_REQUIRED');
  let user;
  try{user=await ports.verifyUser(token);}catch{return fail('AUTH_UNAVAILABLE');}
  if(!ordinary(user)||!uuid.test(user.id||''))return fail('AUTH_REQUIRED');
  let members;
  try{members=await ports.memberships(user.id);}catch{return fail('DEPENDENCY_UNAVAILABLE');}
  if(!Array.isArray(members)||members.length!==1)return fail('ACTIVE_OWNER_MEMBERSHIP_REQUIRED');
  const member=members[0];
  if(!ordinary(member)||!uuid.test(member.tenant_id||'')||
     member.role!=='owner'||member.status!=='active')
    return fail('ACTIVE_OWNER_MEMBERSHIP_REQUIRED');
  let tenant;
  try{tenant=await ports.tenant(member.tenant_id);}catch{return fail('DEPENDENCY_UNAVAILABLE');}
  if(!ordinary(tenant)||tenant.id!==member.tenant_id||
     tenant.status!=='active'||tenant.code!=='mi-bcs')return fail('TENANT_NOT_AUTHORIZED');
  let rows;
  try{rows=await ports.bindings(tenant.id,WRITE_OPERATION,WRITE_RESOURCE_ROLE);}
  catch{return fail('DEPENDENCY_UNAVAILABLE');}
  if(!Array.isArray(rows)||rows.length!==1)return fail('DEDICATED_WRITE_BINDING_REQUIRED');
  const binding=rows[0],integration=binding?.tenant_integrations;
  if(!ordinary(binding)||!ordinary(integration)||
     binding.tenant_id!==tenant.id||binding.operation!==WRITE_OPERATION||
     binding.resource_role!==WRITE_RESOURCE_ROLE||binding.status!=='active'||
     !['write','read_write'].includes(binding.access_mode)||
     !Number.isInteger(binding.version)||binding.version<1||
     !ordinary(binding.config)||binding.config.allowCalendarEventWrite!==true||
     !uuid.test(binding.integration_id||'')||integration.id!==binding.integration_id||
     integration.tenant_id!==tenant.id||integration.status!=='active'||
     integration.provider!=='google_calendar'||
     integration.auth_mode!=='service_account_share'||
     integration.secret_ref!==WRITE_SECRET_REF)
    return fail('DEDICATED_WRITE_BINDING_REQUIRED');
  const calendarId=binding.external_resource_id;
  if(typeof calendarId!=='string'||calendarId==='primary'||calendarId.length<3||
     calendarId.length>254||/[/\\?#\s\x00-\x1f]/.test(calendarId))
    return fail('INVALID_WRITE_TARGET');
  return {ok:true,identity:Object.freeze({userId:user.id,tenantId:tenant.id,
    calendarId,writeSecretRef:WRITE_SECRET_REF,bindingVersion:binding.version})};
}
export function createSupabaseAuthorityPorts({authClient,adminClient}={}){
  if(typeof authClient?.auth?.getUser!=='function'||typeof adminClient?.from!=='function')
    throw Error('AUTH_PORTS_INVALID');
  const requireData=(response)=>{
    if(response?.error)throw Error('AUTH_DEPENDENCY_FAILED');
    return response?.data;
  };
  return Object.freeze({
    async verifyUser(token){
      const data=requireData(await authClient.auth.getUser(token));
      return data?.user||null;
    },
    async memberships(userId){
      const data=requireData(await adminClient.from('tenant_memberships')
        .select('tenant_id,role,status').eq('user_id',userId).eq('status','active').limit(2));
      return data;
    },
    async tenant(tenantId){
      return requireData(await adminClient.from('tenants')
        .select('id,code,status').eq('id',tenantId).eq('status','active').maybeSingle());
    },
    async bindings(tenantId,operation,resourceRole){
      return requireData(await adminClient.from('tenant_operation_bindings')
        .select('tenant_id,operation,resource_role,integration_id,external_resource_id,access_mode,config,status,version,tenant_integrations(id,tenant_id,provider,auth_mode,secret_ref,status)')
        .eq('tenant_id',tenantId).eq('operation',operation)
        .eq('resource_role',resourceRole).limit(2));
    }
  });
}

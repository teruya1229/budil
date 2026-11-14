/**
 * Budil calendar reservations backed by a dedicated Postgres exclusion table.
 * Server-only and not deployed. Operate ONLY through server-verified tenant/
 * calendar/work-order identifiers; no identifiers are selected from the browser.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_ID=/^[0-9a-v]{65}$/;
const stamp=x=>typeof x==='string'&&/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:\d\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const fail=code=>({ok:false,code});
export class BudilPostgresCalendarSlots {
 constructor({adminClient}={}){
  if(typeof adminClient?.from!=='function'||typeof adminClient?.rpc!=='function')
   throw Error('SERVER_DB_REQUIRED');
  this.db=adminClient;
 }
 async reserve({slotId,tenantId,ownerUserId,calendarId,workOrderId,
               requestId,startAt,endAt}={}){
  if(![slotId,tenantId,ownerUserId,requestId].every(x=>UUID.test(x||''))||
    typeof calendarId!=='string'||calendarId==='primary'||calendarId.length<3||
    typeof workOrderId!=='string'||workOrderId.length<3||workOrderId.length>256||
    !stamp(startAt)||!stamp(endAt)||Date.parse(endAt)<=Date.parse(startAt)||
    Date.parse(endAt)-Date.parse(startAt)>86400000)
   return fail('SLOT_INVALID');
  const row={id:slotId,tenant_id:tenantId,owner_user_id:ownerUserId,
   calendar_id:calendarId,work_order_id:workOrderId,request_id:requestId,
   start_at:startAt,end_at:endAt,status:'pending'};
  let result;
  try{result=await this.db.from('budil_calendar_write_slots')
    .insert(row).select('id,tenant_id,work_order_id,status').single();}
  catch{return fail('SLOT_DB_UNAVAILABLE');}
  if(result?.error){
   if(result.error.code==='23P01')return fail('SLOT_CONFLICT');
   if(result.error.code==='23505')return fail('SLOT_ALREADY_RESERVED');
   return fail('SLOT_DB_UNAVAILABLE');
  }
  const got=result?.data;
  if(got?.id!==slotId||got.tenant_id!==tenantId||
     got.work_order_id!==workOrderId||got.status!=='pending')
   return fail('SLOT_UNVERIFIED');
  return {ok:true,slotId,requestId,status:'pending',externalWriteAllowed:true};
 }
 async markIndeterminate({slotId,tenantId,requestId}={}){
  if(![slotId,tenantId,requestId].every(x=>UUID.test(x||'')))
   return fail('SLOT_INVALID');
  let result;
  try{result=await this.db.from('budil_calendar_write_slots')
    .update({status:'indeterminate',updated_at:new Date().toISOString()})
    .eq('id',slotId).eq('tenant_id',tenantId).eq('request_id',requestId)
    .eq('status','pending').select('id').maybeSingle();}
  catch{return fail('SLOT_DB_UNAVAILABLE');}
  if(result?.error)return fail('SLOT_DB_UNAVAILABLE');
  if(result?.data?.id!==slotId)return fail('SLOT_UNCHANGED');
  return {ok:true,status:'indeterminate',operatorInspectionRequired:true,
    autoRetryAllowed:false};
 }
 async finalizeVerified({tenantId,slotId,requestId,workOrderId,
                         eventId,etag,oldSlotId=null,readbackProof}={}){
  if(![tenantId,slotId,requestId].every(x=>UUID.test(x||''))||
    (oldSlotId!==null&&!UUID.test(oldSlotId||''))||
    typeof workOrderId!=='string'||workOrderId.length<3||
    !GOOGLE_ID.test(eventId||'')||!/^"[^"\r\n]{1,256}"$/.test(etag||'')||
    !readbackProof||readbackProof.verified!==true||
    readbackProof.eventId!==eventId||readbackProof.workOrderId!==workOrderId||
    readbackProof.calendarAndTenantMatch!==true||
    readbackProof.exactTimeMatch!==true)
   return fail('GOOGLE_READBACK_PROOF_REQUIRED');
  let result;
  try{result=await this.db.rpc('budil_calendar_slots_finalize',{
    p_tenant_id:tenantId,p_slot_id:slotId,p_request_id:requestId,
    p_work_order_id:workOrderId,p_event_id:eventId,
    p_event_etag:etag,p_old_slot_id:oldSlotId
  });}
  catch{return fail('FINALIZE_DB_UNAVAILABLE');}
  if(result?.error)return fail('FINALIZE_DB_UNAVAILABLE');
  if(result?.data!==true)return fail('SLOT_FINALIZE_REFUSED');
  return {ok:true,status:'verified',slotId,workOrderId,eventId,
    readbackVerified:true,oldSlotReleased:oldSlotId!==null};
 }
 async read({tenantId,slotId}={}){
  if(!UUID.test(tenantId||'')||!UUID.test(slotId||''))
   return fail('SLOT_INVALID');
  let response;
  try{response=await this.db.from('budil_calendar_write_slots')
   .select('id,tenant_id,work_order_id,request_id,status,google_event_id')
   .eq('tenant_id',tenantId).eq('id',slotId).maybeSingle();}
  catch{return fail('SLOT_DB_UNAVAILABLE');}
  if(response?.error)return fail('SLOT_DB_UNAVAILABLE');
  if(!response?.data||response.data.tenant_id!==tenantId)return fail('SLOT_NOT_FOUND');
  if(!['pending','indeterminate','verified','released'].includes(response.data.status))
   return fail('SLOT_UNVERIFIED');
  return {ok:true,status:response.data.status,workOrderId:response.data.work_order_id,
    eventId:response.data.google_event_id||null,autoRetryAllowed:false};
 }
}

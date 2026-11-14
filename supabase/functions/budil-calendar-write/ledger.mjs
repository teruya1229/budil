/**
 * Server-only durable attempt journal using existing idempotency_requests.
 * This is a NO-DEPLOY library: adminClient must be supplied by an authenticated
 * owner-only Edge server. Do not expose this module directly through PostgREST.
 *
 * Each new attempt is stored as indeterminate BEFORE its first external Google
 * request. A timeout, crash or duplicate never triggers automatic re-insert.
 * This table does NOT itself guarantee cross-key slot exclusivity; that still
 * requires a separate server-authoritative reservation mechanism.
 */
export const CALENDAR_WRITE_OPERATION='calendar_event_write';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex=/^[a-f0-9]{64}$/;
const gid=/^[0-9a-v]{65}$/;
const fail=code=>({ok:false,code});
const str=x=>typeof x==='string'&&x.length>0&&x.length<=256;
export class SupabaseCalendarAttemptLedger {
  constructor({adminClient}={}){
    if(typeof adminClient?.from!=='function')throw Error('LEDGER_ADMIN_REQUIRED');
    this.admin=adminClient;
  }
  async claim({tenantId,userId,requestId,requestHash}={}){
    if(!uuid.test(tenantId||'')||!uuid.test(userId||'')||
       !uuid.test(requestId||'')||!hex.test(requestHash||''))
      return fail('CLAIM_INVALID');
    const row={tenant_id:tenantId,user_id:userId,operation:CALENDAR_WRITE_OPERATION,
      idempotency_key:requestId,request_hash:requestHash,status:'indeterminate'};
    let response;
    try{
      response=await this.admin.from('idempotency_requests')
        .insert(row).select('id').single();
    }catch{return fail('LEDGER_UNAVAILABLE');}
    if(response?.error){
      if(response.error.code==='23505')return fail('ALREADY_ATTEMPTED');
      return fail('LEDGER_UNAVAILABLE');
    }
    if(!uuid.test(response?.data?.id||''))return fail('CLAIM_UNVERIFIED');
    return {ok:true,id:response.data.id,requestId,tenantId,requestHash,
      status:'indeterminate',externalCallAllowed:true};
  }
  async markVerified({id,tenantId,requestHash,workOrderId,eventId,etag,
    googleReadbackVerified=false,workOrderLinked=false}={}){
    if(!uuid.test(id||'')||!uuid.test(tenantId||'')||
       !hex.test(requestHash||'')||!str(workOrderId)||
       !gid.test(eventId||'')||typeof etag!=='string'||
       !/^"[^"\r\n]{1,256}"$/.test(etag)||
       googleReadbackVerified!==true||workOrderLinked!==true)
      return fail('VERIFICATION_REQUIRED');
    const body={workOrderId,eventId,etag,googleReadbackVerified:true,workOrderLinked:true};
    let response;
    try{
      response=await this.admin.from('idempotency_requests')
        .update({status:'succeeded',response_status:200,response_body:body,
          completed_at:new Date().toISOString()})
        .eq('id',id).eq('tenant_id',tenantId).eq('operation',CALENDAR_WRITE_OPERATION)
        .eq('request_hash',requestHash).eq('status','indeterminate')
        .select('id').maybeSingle();
    }catch{return fail('LEDGER_UNAVAILABLE');}
    if(response?.error)return fail('LEDGER_UNAVAILABLE');
    if(response?.data?.id!==id)return fail('LEDGER_CHANGED');
    return {ok:true,status:'verified',workOrderId,eventId,etag};
  }
  async find({tenantId,requestId}={}){
    if(!uuid.test(tenantId||'')||!uuid.test(requestId||''))
      return fail('LOOKUP_INVALID');
    let response;
    try{
      response=await this.admin.from('idempotency_requests')
        .select('id,request_hash,status,response_body')
        .eq('tenant_id',tenantId).eq('operation',CALENDAR_WRITE_OPERATION)
        .eq('idempotency_key',requestId).maybeSingle();
    }catch{return fail('LEDGER_UNAVAILABLE');}
    if(response?.error)return fail('LEDGER_UNAVAILABLE');
    const r=response?.data;
    if(!r)return fail('NOT_FOUND');
    if(!uuid.test(r.id||'')||!hex.test(r.request_hash||'')||
       !['indeterminate','succeeded'].includes(r.status))return fail('LEDGER_UNVERIFIED');
    if(r.status==='indeterminate')return {ok:true,status:'indeterminate',
      operatorInspectionRequired:true,autoRetryAllowed:false};
    const b=r.response_body;
    if(!b||typeof b!=='object'||b.googleReadbackVerified!==true||
       b.workOrderLinked!==true||!str(b.workOrderId)||!gid.test(b.eventId||''))
      return fail('LEDGER_UNVERIFIED');
    return {ok:true,status:'verified',workOrderId:b.workOrderId,eventId:b.eventId,
      autoRetryAllowed:false};
  }
}

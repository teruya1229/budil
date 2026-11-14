/**
 * Server-only, read-only verification of owner-approved Budil cloud backups.
 * Never accepts browser-supplied customer names, event IDs or calendar IDs as
 * authoritative. Not connected to a production write path.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
const localId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{3,256}$/.test(x);
const eventId=x=>typeof x==='string'&&/^[0-9a-v]{65}$/.test(x);
const etag=x=>typeof x==='string'&&/^"[^"\r\n]{1,256}"$/.test(x);
const fail=code=>Object.freeze({ok:false,code,writeAllowed:false});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

/**
 * Caller MUST be an authenticated owner-only server route; identity arguments
 * must come from verified JWT/tenant membership, never from request JSON.
 * The snapshot is a user-approved immutable backup, refreshed within 10 min.
 * Backend may only use this proof to start a separate durable transaction.
 */
export async function verifyOwnerBackupSelection({
  adminClient,tenantId,ownerUserId,expectedHash,customerId,
  action,workOrderId=null,nowMs=Date.now(),maxAgeMs=600000
}={}){
  if(!adminClient||typeof adminClient.from!=='function'||
     !uuid.test(tenantId||'')||!uuid.test(ownerUserId||'')||
     !hash.test(expectedHash||'')||!localId(customerId)||
     !['booking','reschedule'].includes(action)||
     (action==='reschedule'&&!localId(workOrderId))||
     (action==='booking'&&workOrderId!==null)||
     !Number.isSafeInteger(nowMs)||!Number.isSafeInteger(maxAgeMs)||
     maxAgeMs<60000||maxAgeMs>600000)
    return fail('SELECTION_INVALID');
  let response;
  try{
    response=await adminClient.from('budil_snapshots')
      .select('id,tenant_id,created_by,created_at,is_test,content_hash,payload')
      .eq('tenant_id',tenantId).eq('created_by',ownerUserId)
      .eq('is_test',false).order('created_at',{ascending:false})
      .limit(1).maybeSingle();
  }catch{return fail('SNAPSHOT_UNAVAILABLE');}
  if(response?.error)return fail('SNAPSHOT_UNAVAILABLE');
  const s=response?.data;
  if(!s)return fail('SNAPSHOT_REQUIRED');
  if(!uuid.test(s.id||'')||s.tenant_id!==tenantId||
     s.created_by!==ownerUserId||s.is_test!==false||
     s.content_hash!==expectedHash)return fail('SNAPSHOT_MISMATCH');
  const created=Date.parse(s.created_at);
  if(!Number.isFinite(created)||created>nowMs+30000||
     nowMs-created>maxAgeMs)return fail('SNAPSHOT_STALE');
  const p=s.payload;
  if(!object(p)||p.app!=='Budil'||!object(p.data)||
     !Array.isArray(p.data.budil_leads)||
     !Array.isArray(p.data.budil_work_orders)||
     p.data.budil_leads.length>100000||
     p.data.budil_work_orders.length>100000)
    return fail('SNAPSHOT_SHAPE_INVALID');
  const leads=p.data.budil_leads.filter(l=>object(l)&&l.id===customerId);
  if(leads.length!==1)return fail('CUSTOMER_MISSING_OR_DUPLICATED');
  if(action==='booking')return Object.freeze({
    ok:true,customerVerified:true,snapshotId:s.id,
    source:'verified_owner_backup',writeAllowed:false
  });
  const orders=p.data.budil_work_orders.filter(w=>object(w)&&w.id===workOrderId);
  if(orders.length!==1)return fail('ORDER_MISSING_OR_DUPLICATED');
  const w=orders[0];
  if(!['tentative','confirmed'].includes(w.status)||
     w.candidateMeta||w.isAllDay===true||
     (w.scheduledEndDate&&w.scheduledEndDate!==w.scheduledDate)||
     (w.leadId||w.customerId)!==customerId||
     w.calendarEventSource!=='transaction'||
     w.calendarSyncStatus!=='verified'||
     !eventId(w.calendarEventId)||!etag(w.calendarEtag)||
     typeof w.calendarTargetId!=='string'||w.calendarTargetId.length<3)
    return fail('ORDER_NOT_VERIFIED_FOR_RESCHEDULE');
  return Object.freeze({
    ok:true,customerVerified:true,workOrderVerified:true,snapshotId:s.id,
    workOrderId:w.id,eventId:w.calendarEventId,etag:w.calendarEtag,
    calendarId:w.calendarTargetId,source:'verified_owner_backup',
    writeAllowed:false
  });
}

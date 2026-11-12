/**
 * Server-verified Google event -> existing Budil WorkOrder local bridge.
 *
 * DEVELOPMENT ONLY: do not load into the current Budil page before an
 * authenticated server response and explicit owner approval are wired.
 * Server must produce the verified response; browser data is never authority.
 */
const BudilGptCalendarLink = (() => {
  'use strict';
  const eventIdOk = x => typeof x === 'string' && /^[0-9a-v]{65}$/.test(x);
  const etagOk = x => typeof x === 'string' && /^"[^"\r\n]{1,256}"$/.test(x);
  const dateOk = x => typeof x === 'string' && /^20\d\d-\d\d-\d\d$/.test(x);
  const timeOk = x => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
  const fail = code => Object.freeze({ok:false,code,saved:false});
  function applyVerifiedExisting({storage,expectedSnapshot,serverResult,
    approvedDate,approvedStart,approvedEnd}={}){
    if(!storage||typeof storage.getWorkOrders!=='function'||
       typeof storage.updateWorkOrder!=='function'||
       typeof storage.createSafetyBackup!=='function')return fail('STORAGE_UNAVAILABLE');
    const r=serverResult, order=r&&r.order;
    if(!r||r.status!=='verified'||r.calendarUpdated!==true||
       r.readbackVerified!==true||r.unsynced!==false||
       !r.workOrderId||!eventIdOk(r.eventId)||!etagOk(r.etag)||
       !order||order.id!==r.workOrderId||
       order.eventId!==r.eventId||order.etag!==r.etag||
       typeof order.calendarId!=='string'||order.calendarId.length<3||
       !dateOk(order.scheduledDate)||!timeOk(order.startTime)||
       !timeOk(order.endTime)||order.endTime<=order.startTime||
       !order.customerName||!order.serviceText||
       !dateOk(approvedDate)||!timeOk(approvedStart)||!timeOk(approvedEnd)||
       order.scheduledDate!==approvedDate||order.startTime!==approvedStart||
       order.endTime!==approvedEnd)
      return fail('SERVER_READBACK_UNVERIFIED');
    if(typeof expectedSnapshot!=='string'||!expectedSnapshot||
       expectedSnapshot.length>100000)return fail('SNAPSHOT_REQUIRED');
    let snapshot;
    try{snapshot=JSON.parse(expectedSnapshot);}catch{return fail('SNAPSHOT_INVALID');}
    if(!snapshot||snapshot.id!==r.workOrderId||snapshot.customerName!==order.customerName||
       snapshot.serviceText!==order.serviceText||
       !['tentative','confirmed'].includes(snapshot.status)||
       snapshot.isAllDay||snapshot.candidateMeta)return fail('TARGET_INVALID');
    let orders;
    try{orders=storage.getWorkOrders();}catch{return fail('STORAGE_UNAVAILABLE');}
    if(!Array.isArray(orders))return fail('STORAGE_UNAVAILABLE');
    const originals=orders.filter(w=>w&&w.id===r.workOrderId);
    if(originals.length!==1)return fail('TARGET_MISSING_OR_DUPLICATED');
    const current=originals[0];
    if(JSON.stringify(current)!==expectedSnapshot)return fail('LOCAL_ORDER_CHANGED');
    if(current.calendarEventId && current.calendarEventId!==r.eventId)
      return fail('EVENT_ID_CHANGED');
    if(current.calendarTargetId && current.calendarTargetId!==order.calendarId)
      return fail('CALENDAR_BINDING_CHANGED');
    if(orders.some(w=>w&&w.id!==r.workOrderId&&w.calendarEventId===r.eventId))
      return fail('EVENT_ID_COLLISION');
    const patch={
      scheduledDate:order.scheduledDate,
      scheduledEndDate:current.scheduledEndDate?order.scheduledDate:'',
      startTime:order.startTime,endTime:order.endTime,
      calendarAdded:true,calendarEventId:r.eventId,
      calendarEtag:r.etag,calendarTargetId:order.calendarId,
      calendarEventSource:'transaction',calendarSyncStatus:'verified'
    };
    try{
      const backup=storage.createSafetyBackup({reason:'budil_gpt_calendar_verified_link',
        targetKey:storage.KEYS?.WORK_ORDERS,targetId:r.workOrderId,
        data:orders,beforeCount:orders.length});
      if(!backup||!backup.id)return fail('BACKUP_FAILED');
      const saved=storage.updateWorkOrder(r.workOrderId,patch);
      if(!saved||saved.id!==r.workOrderId)return fail('PERSIST_UNKNOWN');
      const readback=storage.getWorkOrders().filter(w=>w&&w.id===r.workOrderId);
      if(readback.length!==1||readback[0].calendarEventId!==r.eventId||
         readback[0].calendarEtag!==r.etag||
         readback[0].calendarSyncStatus!=='verified'||
         readback[0].scheduledDate!==order.scheduledDate||
         readback[0].startTime!==order.startTime||
         readback[0].endTime!==order.endTime||
         readback[0].calendarAdded!==true)return fail('PERSIST_UNKNOWN');
      return Object.freeze({ok:true,saved:true,workOrderId:r.workOrderId,
        eventId:r.eventId,calendarSynced:true});
    }catch{return fail('PERSIST_UNKNOWN');}
  }
  return Object.freeze({applyVerifiedExisting});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptCalendarLink};

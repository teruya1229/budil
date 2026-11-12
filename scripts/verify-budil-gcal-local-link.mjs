import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../js/budil-gpt-calendar-link.js',import.meta.url),'utf8');
const link=runInNewContext(src+'\nBudilGptCalendarLink;',{}, {timeout:3000});
const workOrderId='fictional-work-1';
const id='b'+'a'.repeat(64);
const original={id:workOrderId,customerName:'Fictional Customer',
 serviceText:'Fictional aircon service',scheduledDate:'2099-11-20',
 startTime:'10:00',endTime:'11:00',status:'tentative',calendarAdded:false};
const after={id:workOrderId,customerName:original.customerName,
 serviceText:original.serviceText,calendarId:'fictional-calendar@example.com',
 scheduledDate:'2099-11-21',startTime:'12:00',endTime:'13:00',eventId:id,etag:'"etag2"'};
const result={status:'verified',calendarUpdated:true,readbackVerified:true,
 unsynced:false,workOrderId,eventId:id,etag:'"etag2"',order:after};
const inputs={serverResult:result,expectedSnapshot:JSON.stringify(original),
 approvedDate:'2099-11-21',approvedStart:'12:00',approvedEnd:'13:00'};
function storage(rows=[original]){
 const list=structuredClone(rows),calls={update:0,backup:0};
 return {
  KEYS:{WORK_ORDERS:'orders'},
  getWorkOrders:()=>structuredClone(list),
  createSafetyBackup:()=>{calls.backup++;return {id:'fictional-backup'};},
  updateWorkOrder(id,patch){calls.update++;const n=list.findIndex(x=>x.id===id);if(n<0)return null;
   list[n]={...list[n],...patch};return structuredClone(list[n]);},
  calls,read:()=>structuredClone(list)
 };
}
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS',name);};
test('verified server GET result is saved once and read back',()=>{
 const s=storage();const x=link.applyVerifiedExisting({...inputs,storage:s});
 assert.equal(x.ok,true);assert.equal(x.calendarSynced,true);
 assert.equal(s.calls.backup,1);assert.equal(s.calls.update,1);
 assert.equal(s.read()[0].calendarEventId,id);
 assert.equal(s.read()[0].calendarEtag,'"etag2"');
 assert.equal(s.read()[0].scheduledDate,'2099-11-21');
});
test('missing Google readback proof cannot mutate local work order',()=>{
 const s=storage();
 const x=link.applyVerifiedExisting({...inputs,storage:s,
  serverResult:{...result,readbackVerified:false}});
 assert.equal(x.saved,false);assert.equal(s.calls.update,0);assert.equal(s.calls.backup,0);
});
test('changed local record stops blind overwriting Google-linked state',()=>{
 const s=storage([{...original,scheduledDate:'2099-11-22'}]);
 const x=link.applyVerifiedExisting({...inputs,storage:s});
 assert.equal(x.code,'LOCAL_ORDER_CHANGED');assert.equal(s.calls.update,0);
});
test('another work order cannot reuse same Google event ID',()=>{
 const s=storage([original,{...original,id:'other',calendarEventId:id}]);
 const x=link.applyVerifiedExisting({...inputs,storage:s});
 assert.equal(x.code,'EVENT_ID_COLLISION');assert.equal(s.calls.update,0);
});
test('other existing Google event ID is not overwritten',()=>{
 const s=storage([{...original,calendarEventId:'different'}]);
 const x=link.applyVerifiedExisting({...inputs,storage:s,
  expectedSnapshot:JSON.stringify({...original,calendarEventId:'different'})});
 assert.equal(x.code,'EVENT_ID_CHANGED');assert.equal(s.calls.update,0);
});
test('explicitly approved date mismatch rejects the server result',()=>{
 const s=storage(),x=link.applyVerifiedExisting({...inputs,storage:s,
  approvedDate:'2099-11-22'});
 assert.equal(x.code,'SERVER_READBACK_UNVERIFIED');assert.equal(s.calls.backup,0);
});
test('backup failure leaves work order untouched',()=>{
 const s=storage();s.createSafetyBackup=()=>null;
 const x=link.applyVerifiedExisting({...inputs,storage:s});
 assert.equal(x.code,'BACKUP_FAILED');assert.equal(s.calls.update,0);
});
test('storage write failure is never called synced',()=>{
 const s=storage();s.updateWorkOrder=()=>null;
 const x=link.applyVerifiedExisting({...inputs,storage:s});
 assert.equal(x.code,'PERSIST_UNKNOWN');assert.equal(x.saved,false);
});
test('reschedule with existing matching event ID updates ETag only',()=>{
 const prev={...original,calendarEventId:id,calendarEtag:'"etag1"',
  calendarTargetId:'fictional-calendar@example.com',calendarEventSource:'transaction'};
 const s=storage([prev]);const x=link.applyVerifiedExisting({...inputs,storage:s,
  expectedSnapshot:JSON.stringify(prev)});
 assert.equal(x.ok,true);assert.equal(s.read()[0].calendarEtag,'"etag2"');
});
console.log('BUDIL_CALENDAR_LOCAL_SYNC_LINK PASS',passed,'FAIL 0');

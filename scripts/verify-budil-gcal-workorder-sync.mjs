import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const brain=runInNewContext(readFileSync(new URL('../js/work-order-brain.js',import.meta.url),'utf8')+
 '\nWorkOrderBrain;',{}, {timeout:3000});
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS',name)};
const eventId='b'+'a'.repeat(64),calendar='fictional-calendar@example.com';
const baseline={id:'work-fictional',leadId:'customer-fictional',customerName:'Fictional Customer',
 serviceText:'Fictional cleaning',scheduledDate:'2099-11-20',startTime:'10:00',
 endTime:'11:00',status:'confirmed',calendarAdded:false};
check('legacy work order keeps schedule',()=>{
 const a=brain.normalizeWorkOrder(baseline);
 assert.equal(a.scheduledDate,baseline.scheduledDate);
 assert.equal(a.startTime,baseline.startTime);
 assert.equal(a.calendarAdded,false);
 assert.equal(a.calendarSyncStatus,'unsynced');
});
check('verified ID and ETag survive normalization',()=>{
 const a=brain.normalizeWorkOrder({...baseline,calendarAdded:true,
  calendarEventId:eventId,calendarEtag:'"etag-1"',
  calendarTargetId:calendar,calendarEventSource:'transaction',
  calendarSyncStatus:'verified'});
 assert.equal(a.calendarEventId,eventId);
 assert.equal(a.calendarEtag,'"etag-1"');
 assert.equal(a.calendarTargetId,calendar);
 assert.equal(a.calendarEventSource,'transaction');
 assert.equal(a.calendarSyncStatus,'verified');
 assert.equal(a.calendarAdded,true);
});
check('event identity survives Storage-style update and serialization',()=>{
 const first=brain.normalizeWorkOrder({...baseline,calendarAdded:true,
  calendarEventId:eventId,calendarEtag:'"etag-1"',
  calendarTargetId:calendar,calendarEventSource:'transaction',
  calendarSyncStatus:'verified'});
 const updated=brain.normalizeWorkOrder({...first,scheduledDate:'2099-11-21',
  startTime:'12:00',endTime:'13:00',calendarEtag:'"etag-2"'});
 const roundTrip=brain.normalizeWorkOrder(JSON.parse(JSON.stringify(updated)));
 assert.equal(roundTrip.calendarEventId,eventId);
 assert.equal(roundTrip.calendarEtag,'"etag-2"');
 assert.equal(roundTrip.scheduledDate,'2099-11-21');
 assert.equal(roundTrip.startTime,'12:00');
});
check('imported Google event IDs preserved without inventing verification',()=>{
 const imported=brain.normalizeWorkOrder({...baseline,
  calendarEventId:'legacy-import-google-id@example.com',calendarEventSource:'imported'});
 assert.equal(imported.calendarEventId,'legacy-import-google-id@example.com');
 assert.equal(imported.calendarSyncStatus,'unsynced');
 assert.equal(imported.calendarAdded,false);
});
check('invalid status does not fabricate verified',()=>{
 const a=brain.normalizeWorkOrder({...baseline,calendarSyncStatus:'approved'});
 assert.equal(a.calendarSyncStatus,'unsynced');
});
console.log('BUDIL_GOOGLE_WORKORDER_ID_PERSISTENCE PASS',passed,'FAIL 0');

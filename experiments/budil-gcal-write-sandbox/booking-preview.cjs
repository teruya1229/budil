/** Isolated local contract. Pure functions: no storage, network, clock or logging. */
'use strict';

const fail = code => ({ok:false, code});
const dateRe = /^20\d\d-\d\d-\d\d$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const stampRe = /^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:\d\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const text = value => typeof value === 'string' ? value.trim() : '';
function day(value) {
  if (!dateRe.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
function bound(value) {
  if (day(value)) return Date.parse(value + 'T00:00:00+09:00'); // all-day exclusive end
  if (!stampRe.test(value) || !day(value.slice(0,10))) return NaN;
  return Date.parse(value);
}
function slot(date,startTime,endTime) {
  if (!day(date) || !timeRe.test(startTime) || !timeRe.test(endTime) || endTime <= startTime)
    return null;
  return {start:Date.parse(date+'T'+startTime+':00+09:00'),
    end:Date.parse(date+'T'+endTime+':00+09:00')};
}
const overlaps = (a,b) => a.start < b.end && b.start < a.end;
function orderInterval(order,date) {
  const first=text(order.scheduledDate), last=text(order.scheduledEndDate)||first;
  if (!day(first) || !day(last) || last < first) return {unknown:true};
  if (date < first || date > last) return null;
  if (order.isAllDay === true) return {allDay:true};
  const interval=slot(date,order.startTime,order.endTime);
  return interval || {unknown:true};
}
function preview(input) {
  if (!input || typeof input !== 'object') return fail('INPUT_INVALID');
  const {candidate,orders,busy,nowMs,authorization}=input;
  if (!candidate || !['booking','reschedule'].includes(candidate.action) ||
      !Array.isArray(orders) || orders.length>10000 || !Number.isSafeInteger(nowMs)) return fail('INPUT_INVALID');
  const c=candidate, interval=slot(c.date,c.startTime,c.endTime);
  if (!interval || interval.start<=nowMs) return fail('TIME_INVALID');
  if (!text(c.ownerId) || !text(c.tenantId) || !text(c.writeTargetId) ||
      !authorization || authorization.ownerId!==c.ownerId ||
      authorization.tenantId!==c.tenantId || authorization.writeTargetId!==c.writeTargetId ||
      authorization.canWrite!==true) return fail('AUTHORIZATION_REQUIRED');
  if (!text(c.customerId) || !text(c.customerName) || !text(c.serviceText)) return fail('IDENTITY_REQUIRED');
  if (c.action==='booking' && text(c.workOrderId)) return fail('TARGET_INVALID');
  if (c.action==='reschedule' && !text(c.workOrderId)) return fail('TARGET_REQUIRED');
  const target=c.action==='reschedule' ? orders.filter(w=>w && String(w.id)===c.workOrderId) : [];
  if (c.action==='reschedule' && (target.length!==1 ||
      !['tentative','confirmed'].includes(target[0].status) ||
      target[0].candidateMeta || target[0].isAllDay ||
      (target[0].scheduledEndDate && target[0].scheduledEndDate!==target[0].scheduledDate) ||
      text(target[0].customerName)!==c.customerName ||
      text(target[0].serviceText)!==c.serviceText ||
      (target[0].customerId && String(target[0].customerId)!==c.customerId))) return fail('TARGET_INVALID');
  if (!busy || busy.ok!==true || busy.readOnly!==true || busy.calendarWritePerformed!==false ||
      busy.customerRecordsSent!==false || busy.date!==c.date ||
      !Number.isSafeInteger(busy.checkedAtMs) || busy.checkedAtMs>nowMs ||
      nowMs-busy.checkedAtMs>120000 || !Array.isArray(busy.events) || busy.events.length>1000)
    return fail('BUSY_UNVERIFIED_OR_STALE');
  let localConflicts=0, unknownLocal=0, googleConflicts=0;
  for (const w of orders) {
    if (!w || typeof w!=='object') return fail('LOCAL_UNVERIFIABLE');
    if (c.action==='reschedule' && String(w.id)===c.workOrderId) continue;
    if (['cancelled','completed','archived'].includes(w.status)) continue;
    const other=orderInterval(w,c.date);
    if (other?.unknown) unknownLocal++;
    else if (other && (other.allDay || overlaps(interval,other))) localConflicts++;
  }
  for (const event of busy.events) {
    if (!event || typeof event!=='object' || Array.isArray(event) ||
        Object.keys(event).sort().join(',')!=='end,start') return fail('GOOGLE_UNVERIFIABLE');
    const start=bound(event.start), end=bound(event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start) return fail('GOOGLE_UNVERIFIABLE');
    if (overlaps(interval,{start,end})) googleConflicts++;
  }
  if (localConflicts || unknownLocal || googleConflicts)
    return {ok:false,code:'CONFLICT',localConflicts,unknownLocal,googleConflicts};
  const draft=Object.freeze({action:c.action,date:c.date,startTime:c.startTime,endTime:c.endTime,
    timeZone:'Asia/Tokyo',customerId:c.customerId,customerName:c.customerName,
    serviceText:c.serviceText,workOrderId:c.action==='reschedule'?c.workOrderId:null,
    targetSnapshot:c.action==='reschedule'?JSON.stringify(target[0]):null,
    targetEventId:c.action==='reschedule'?c.targetEventId:null,
    targetEtag:c.action==='reschedule'?c.targetEtag:null,
    busyCheckedAtMs:busy.checkedAtMs,reviewedAtMs:nowMs,
    ownerId:c.ownerId,tenantId:c.tenantId,writeTargetId:c.writeTargetId});
  return {ok:true,draft,approvalRequired:true,calendarWritePerformed:false};
}
function approve(review, approval) {
  if (!review?.ok || !review.draft || !review.approvalRequired) return fail('PREVIEW_REQUIRED');
  if (!approval || approval.confirmedByOwner!==true ||
      approval.ownerId!==review.draft.ownerId || approval.tenantId!==review.draft.tenantId ||
      approval.writeTargetId!==review.draft.writeTargetId || approval.canWrite!==true ||
      approval.candidateSignature!==JSON.stringify(review.draft)) return fail('OWNER_APPROVAL_REQUIRED');
  return {ok:true,approvedDraft:review.draft,signature:approval.candidateSignature,
    approvedAtMs:approval.approvedAtMs};
}
function release(approved, currentReview, state, nowMs) {
  if (!approved?.ok || !currentReview?.ok || !Number.isSafeInteger(nowMs) ||
      !Number.isSafeInteger(approved.approvedAtMs) || approved.approvedAtMs>nowMs ||
      nowMs-approved.approvedAtMs>120000) return fail('APPROVAL_INVALID');
  if (approved.signature!==JSON.stringify(currentReview.draft) ||
      approved.signature!==JSON.stringify(approved.approvedDraft)) return fail('APPROVAL_EXPIRED');
  if (approved.approvedDraft.ownerId!==currentReview.draft.ownerId ||
      approved.approvedDraft.tenantId!==currentReview.draft.tenantId ||
      approved.approvedDraft.writeTargetId!==currentReview.draft.writeTargetId)
    return fail('AUTHORIZATION_REQUIRED');
  if (state?.lastSignature===approved.signature && Number.isSafeInteger(state.lastAtMs) &&
      nowMs-state.lastAtMs<3000) return fail('RAPID_REPEAT');
  if (state?.consumedSignatures?.includes(approved.signature)) return fail('ALREADY_RELEASED');
  return {ok:true,approvedDraft:approved.approvedDraft,
    nextState:{lastSignature:approved.signature,lastAtMs:nowMs,
      consumedSignatures:[...(state?.consumedSignatures||[]),approved.signature]},
    effect:'NONE',calendarWritePerformed:false};
}
module.exports={preview,approve,release};

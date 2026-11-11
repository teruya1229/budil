'use strict';
// Browser adapter for a future same-origin authenticated route. Feature remains OFF.
// The server must own identity, tenant, calendar binding, approval and Google credentials.
const ENDPOINT='/api/calendar-write/v1';
const WRITE_ENABLED=false;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{3,256}$/.test(x);
const fail=code=>({ok:false,code,saved:false});
function validate(path,data){
  if(!data||typeof data!=='object'||Array.isArray(data))return fail('RESPONSE_UNVERIFIED');
  if(path==='/commit'||path==='/result'){
    if(data.status!=='verified'||data.calendarUpdated!==true||!id(data.workOrderId)||
      !id(data.eventId)||data.readbackVerified!==true||data.unsynced!==false)
      return fail('RESULT_UNVERIFIED');
    return {ok:true,saved:true,workOrderId:data.workOrderId,eventId:data.eventId};
  }
  if(path==='/prepare'&&data.status==='prepared'&&id(data.draftId)&&
    /^[a-f0-9]{64}$/.test(data.digest)&&Number.isSafeInteger(data.expiresAt))
    return {ok:true,saved:false,draftId:data.draftId,digest:data.digest,expiresAt:data.expiresAt};
  if(path==='/approve'&&data.status==='approved'&&id(data.approvalId)&&Number.isSafeInteger(data.expiresAt))
    return {ok:true,saved:false,approvalId:data.approvalId,expiresAt:data.expiresAt};
  return fail('RESPONSE_UNVERIFIED');
}
async function call(path,payload){
  if(WRITE_ENABLED!==true)return fail('FEATURE_OFF');
  if(!['/prepare','/approve','/commit','/result'].includes(path))return fail('ROUTE_INVALID');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return fail('REQUEST_INVALID');
  let response;
  try{response=await fetch(ENDPOINT+path,{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(payload),cache:'no-store',redirect:'error'});}
  catch{return fail('TRANSPORT_UNKNOWN');}
  if(!response||response.ok!==true||response.headers.get('content-type')?.split(';')[0]!=='application/json')
    return fail('RESPONSE_UNVERIFIED');
  let data;try{data=await response.json();}catch{return fail('RESPONSE_UNVERIFIED');}
  return validate(path,data);
}
module.exports={call,validate,ENDPOINT};

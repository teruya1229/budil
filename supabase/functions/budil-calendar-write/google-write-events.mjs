/**
 * Server-only Google Calendar v3 EVENTS create/change/readback transport.
 * Credentials are provided by the separately approved write-token provider.
 * This module never imports or reuses the existing READ-ONLY credential.
 * Intended only for future server wiring; not deployed.
 */
const BASE='https://www.googleapis.com/calendar/v3/calendars/';
const eid=/^[0-9a-v]{65}$/;
const etag=/^"[^"\r\n]{1,256}"$/;
const iso=/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:\d\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const err=(code,status=0)=>Object.assign(new Error(code),{code,status});
const ts=x=>typeof x==='string'&&iso.test(x)&&Number.isFinite(Date.parse(x));
function validateEvent(payload,includeId){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw err('EVENT_INVALID');
  const fields=Object.keys(payload).sort().join(',');
  if(fields!==(includeId?'end,eventId,metadata,start,timeZone':'end,metadata,start,timeZone')||
    !ts(payload.start)||!ts(payload.end)||Date.parse(payload.end)<=Date.parse(payload.start)||
    payload.timeZone!=='Asia/Tokyo'||(includeId&&!eid.test(payload.eventId)))
    throw err('EVENT_INVALID');
  const m=payload.metadata;
  if(!m||typeof m!=='object'||Array.isArray(m)||
    Object.keys(m).sort().join(',')!=='ownerId,tenantId,workOrderId'||
    Object.values(m).some(x=>typeof x!=='string'||x.length<3||x.length>256))
    throw err('EVENT_METADATA_INVALID');
  return {id:includeId?payload.eventId:undefined,summary:'BCサービス 作業予定',
    start:{dateTime:payload.start,timeZone:'Asia/Tokyo'},
    end:{dateTime:payload.end,timeZone:'Asia/Tokyo'},
    extendedProperties:{private:{...m}}};
}
function normalize(event,calendarId){
  if(!event||typeof event!=='object'||!eid.test(event.id)||
    !etag.test(event.etag||'')||!ts(event.start?.dateTime)||!ts(event.end?.dateTime)||
    event.start?.timeZone!=='Asia/Tokyo'||event.end?.timeZone!=='Asia/Tokyo'||
    !event.extendedProperties?.private)return null;
  const metadata=event.extendedProperties.private;
  if(!metadata||Object.keys(metadata).sort().join(',')!=='ownerId,tenantId,workOrderId'||
    Object.values(metadata).some(x=>typeof x!=='string'||!x))return null;
  return {eventId:event.id,calendarId,etag:event.etag,start:event.start.dateTime,
    end:event.end.dateTime,timeZone:'Asia/Tokyo',metadata};
}
export class GoogleWriteEvents {
  constructor({calendarId,tokenForRequest,fetcher=fetch,timeoutMs=15000}={}){
    if(typeof calendarId!=='string'||calendarId==='primary'||calendarId.length<3||
      calendarId.length>254||/[/\\?#\s\x00-\x1f]/.test(calendarId)||
      typeof tokenForRequest!=='function'||typeof fetcher!=='function'||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>30000)
      throw err('PROVIDER_CONFIG_INVALID');
    this.calendarId=calendarId;this.tokenForRequest=tokenForRequest;
    this.fetcher=fetcher;this.timeoutMs=timeoutMs;
    this.events=BASE+encodeURIComponent(calendarId)+'/events';
  }
  assertTarget(calendarId,eventId){
    if(calendarId!==this.calendarId)throw err('TARGET_MISMATCH');
    if(eventId!==undefined&&!eid.test(eventId))throw err('EVENT_ID_INVALID');
  }
  async request(method,url,{body,ifMatch}={}){
    // Reject any dynamic endpoint besides exactly this calendar's event path.
    if(!(url===this.events+'?sendUpdates=none'||
      (url.startsWith(this.events+'/')&&
        eid.test(url.slice(this.events.length+1).split('?')[0])&&
        (url.endsWith('?sendUpdates=none')||!url.includes('?')))))
      throw err('TARGET_URL_INVALID');
    const token=await this.tokenForRequest();
    if(typeof token!=='string'||token.length<8||/\s/.test(token))throw err('GOOGLE_TOKEN_UNAVAILABLE');
    const headers={Authorization:'Bearer '+token,Accept:'application/json'};
    if(body)headers['Content-Type']='application/json';
    if(ifMatch)headers['If-Match']=ifMatch;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    let response;
    try{response=await this.fetcher(url,{method,headers,signal:controller.signal,
      redirect:'error',cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});}
    catch{throw err('OUTCOME_UNKNOWN');}
    finally{clearTimeout(timer);}
    if(!response||!Number.isInteger(response.status))throw err('OUTCOME_UNKNOWN');
    if(response.status===412)throw err('ETAG_CONFLICT',412);
    if(response.status===409)throw err(method==='POST'?'DUPLICATE_EVENT_ID':'EVENT_CONFLICT',409);
    if(response.status===401||response.status===403)throw err('GOOGLE_AUTH_DENIED',response.status);
    if(method==='GET'&&response.status===404)return null;
    if(response.status===429)throw err('RATE_LIMITED',429);
    if(response.status>=500)throw err('OUTCOME_UNKNOWN',response.status);
    if(![200,201].includes(response.status))throw err('GOOGLE_REJECTED',response.status);
    let parsed;try{parsed=await response.json();}catch{throw err('OUTCOME_UNKNOWN');}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw err('OUTCOME_UNKNOWN');
    return parsed;
  }
  async create(calendarId,payload){
    this.assertTarget(calendarId);
    const body=validateEvent(payload,true);
    const response=await this.request('POST',this.events+'?sendUpdates=none',{body});
    if(response.id!==payload.eventId)throw err('CREATE_UNVERIFIED');
    const normalized=normalize(response,this.calendarId);
    if(!normalized)throw err('CREATE_UNVERIFIED');
    return normalized;
  }
  async get(calendarId,eventId){
    this.assertTarget(calendarId,eventId);
    const response=await this.request('GET',this.events+'/'+eventId);
    if(response===null)return null;
    if(response.id!==eventId)throw err('READBACK_INVALID');
    const normalized=normalize(response,this.calendarId);
    if(!normalized)throw err('READBACK_INVALID');
    return normalized;
  }
  async update(calendarId,eventId,payload,{ifMatch}={}){
    this.assertTarget(calendarId,eventId);
    if(!etag.test(ifMatch||''))throw err('ETAG_REQUIRED');
    const body=validateEvent(payload,false);
    const response=await this.request('PATCH',this.events+'/'+eventId+'?sendUpdates=none',
      {body,ifMatch});
    if(response.id!==eventId)throw err('UPDATE_UNVERIFIED');
    const normalized=normalize(response,this.calendarId);
    if(!normalized)throw err('UPDATE_UNVERIFIED');
    return normalized;
  }
}

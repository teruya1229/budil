/**
 * Server-only Google Calendar v3 EVENTS create/change/readback transport.
 * Credentials are provided by the separately approved write-token provider.
 * This module never imports or reuses the existing READ-ONLY credential.
 * Intended only for future server wiring; not deployed.
 */
const BASE='https://www.googleapis.com/calendar/v3/calendars/';
const eid=/^[0-9a-v]{65}$/;
const etag=/^"[^"\r\n]{1,256}"$/;
const iso=/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:\d\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
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
  /**
   * Fresh server-side busy snapshot (one JST day) for the same explicit
   * calendar binding. Never trusts a client-provided busy list.
   * All pages must be read; failure is UNKNOWN, not an empty schedule.
   */
  async busy(calendarId,date,nowMs=Date.now()){
    this.assertTarget(calendarId);
    const validDate=typeof date==='string'&&/^20\d\d-\d\d-\d\d$/.test(date)&&
      new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
    if(!validDate||!Number.isSafeInteger(nowMs))return {ok:false,code:'BUSY_INPUT_INVALID'};
    const start=Date.parse(date+'T00:00:00+09:00');
    const next=new Date(Date.parse(date+'T00:00:00Z')+86400000)
      .toISOString().slice(0,10);
    const end=Date.parse(next+'T00:00:00+09:00');
    if(!Number.isFinite(start)||!Number.isFinite(end))return {ok:false,code:'BUSY_INPUT_INVALID'};
    const collected=[],seenTokens=new Set();
    let pageToken='';
    for(let page=0;page<6;page++){
      const url=new URL(this.events);
      url.searchParams.set('timeMin',new Date(start).toISOString());
      url.searchParams.set('timeMax',new Date(end).toISOString());
      url.searchParams.set('singleEvents','true');
      url.searchParams.set('showDeleted','false');
      url.searchParams.set('maxResults','250');
      url.searchParams.set('fields','nextPageToken,items(id,status,start,end)');
      if(pageToken)url.searchParams.set('pageToken',pageToken);
      let token;
      try{token=await this.tokenForRequest();}
      catch{return {ok:false,code:'BUSY_TOKEN_UNAVAILABLE'};}
      if(typeof token!=='string'||token.length<8||/\s/.test(token))
        return {ok:false,code:'BUSY_TOKEN_UNAVAILABLE'};
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
      let response;
      try{response=await this.fetcher(url.toString(),{
        method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
        cache:'no-store',redirect:'error',signal:controller.signal
      });}
      catch{return {ok:false,code:'BUSY_UNVERIFIED'};}
      finally{clearTimeout(timer);}
      if(!response||response.status!==200)return {ok:false,code:'BUSY_UNVERIFIED'};
      let data;
      try{data=await response.json();}
      catch{return {ok:false,code:'BUSY_UNVERIFIED'};}
      if(!data||!Array.isArray(data.items)||data.items.length>250)
        return {ok:false,code:'BUSY_UNVERIFIED'};
      for(const e of data.items){
        if(!e||typeof e!=='object'||Array.isArray(e))
          return {ok:false,code:'BUSY_UNVERIFIED'};
        if(e.status==='cancelled')continue;
        const eventId=e.id,from=e.start?.dateTime||e.start?.date,
          to=e.end?.dateTime||e.end?.date;
        if(typeof eventId!=='string'||eventId.length<1||eventId.length>1024||
          typeof from!=='string'||typeof to!=='string'||
          !((ts(from)||/^\d{4}-\d\d-\d\d$/.test(from))&&
            (ts(to)||/^\d{4}-\d\d-\d\d$/.test(to)))||
          Date.parse(from)>=Date.parse(to))
          return {ok:false,code:'BUSY_UNVERIFIED'};
        collected.push({eventId,start:from,end:to});
        if(collected.length>1250)return {ok:false,code:'BUSY_TOO_MANY_EVENTS'};
      }
      const nextToken=data.nextPageToken||'';
      if(typeof nextToken!=='string'||nextToken.length>2000)
        return {ok:false,code:'BUSY_UNVERIFIED'};
      if(!nextToken){
        return {ok:true,readOnly:true,calendarWritePerformed:false,
          customerRecordsSent:false,date,checkedAtMs:nowMs,events:collected};
      }
      if(seenTokens.has(nextToken))return {ok:false,code:'BUSY_UNVERIFIED'};
      seenTokens.add(nextToken);pageToken=nextToken;
    }
    return {ok:false,code:'BUSY_PAGE_LIMIT'};
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

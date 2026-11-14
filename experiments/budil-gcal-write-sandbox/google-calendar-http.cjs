'use strict';
// Narrow server-side Google Calendar v3 transport. No client supplied URL or calendar target.
const BASE='https://www.googleapis.com/calendar/v3/calendars/';
const fail=(code,status)=>Object.assign(new Error(code),{code,status,indeterminate:code==='INDETERMINATE'});
const eventIdOk=id=>typeof id==='string'&&/^[0-9a-v]{65}$/.test(id);
const etagOk=tag=>typeof tag==='string'&&/^"[^"\r\n]+"$/.test(tag);
const timeOk=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const metadataOk=m=>m&&Object.keys(m).sort().join(',')==='ownerId,tenantId,workOrderId'&&Object.values(m).every(v=>typeof v==='string'&&v.length>0&&v.length<=256);
class GoogleCalendarHttp {
  constructor({fetch,token,calendarId}){
    if(typeof fetch!=='function'||typeof token!=='string'||!token||typeof calendarId!=='string'||!calendarId||/[/\?#\r\n]/.test(calendarId))throw fail('CONFIG_INVALID');
    this.fetch=fetch;this.token=token;this.calendarId=calendarId;
    this.eventsUrl=BASE+encodeURIComponent(calendarId)+'/events';
  }
  target(calendarId){if(calendarId!==this.calendarId)throw fail('CALENDAR_TARGET_INVALID');}
  body(payload,withId){
    if(!payload||typeof payload!=='object'||Object.keys(payload).sort().join(',')!==(withId?'end,eventId,metadata,start,timeZone':'end,metadata,start,timeZone')||!timeOk(payload.start)||!timeOk(payload.end)||Date.parse(payload.start)>=Date.parse(payload.end)||payload.timeZone!=='Asia/Tokyo'||!metadataOk(payload.metadata)||(withId&&!eventIdOk(payload.eventId)))throw fail('EVENT_INVALID');
    return {...(withId?{id:payload.eventId}:{}),start:{dateTime:payload.start,timeZone:payload.timeZone},end:{dateTime:payload.end,timeZone:payload.timeZone},eventType:'default',attendees:[],extendedProperties:{private:{...payload.metadata}}};
  }
  async request(method,url,{body,ifMatch}={}){
    if(!url.startsWith(this.eventsUrl)||!url.startsWith(BASE))throw fail('URL_INVALID');
    const headers={Authorization:'Bearer '+this.token,Accept:'application/json'};
    if(body)headers['Content-Type']='application/json';
    if(ifMatch)headers['If-Match']=ifMatch;
    let response;try{response=await this.fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});}catch{throw fail('INDETERMINATE');}
    if(!response||typeof response.status!=='number')throw fail('INDETERMINATE');
    if(response.status===409)throw fail(method==='POST'?'CREATE_ID_COLLISION':'GOOGLE_REJECTED',409);
    if(response.status===412)throw fail('CONFLICT_ETAG',412);
    if(response.status===401||response.status===403)throw fail('DENIED',response.status);
    if(method==='GET'&&response.status===404)return null;
    if(!((method==='POST'||method==='PATCH')?(response.status===200||response.status===201):response.status===200))throw fail(response.status>=500?'INDETERMINATE':'GOOGLE_REJECTED',response.status);
    let data;try{data=await response.json();}catch{throw fail('INDETERMINATE');}
    if(!data||typeof data!=='object')throw fail('INDETERMINATE');
    return data;
  }
  normalize(data){return {eventId:data.id,calendarId:this.calendarId,etag:data.etag,start:data.start?.dateTime,end:data.end?.dateTime,timeZone:data.start?.timeZone,metadata:data.extendedProperties?.private};}
  async create(calendarId,payload){this.target(calendarId);const body=this.body(payload,true);const url=this.eventsUrl+'?sendUpdates=none';const data=await this.request('POST',url,{body});if(data.id!==payload.eventId)throw fail('INDETERMINATE');return this.normalize(data);}
  async get(calendarId,eventId){this.target(calendarId);if(!eventIdOk(eventId))throw fail('EVENT_ID_INVALID');const data=await this.request('GET',this.eventsUrl+'/'+eventId);if(data===null)return null;if(data.id!==eventId||!etagOk(data.etag))throw fail('INDETERMINATE');return this.normalize(data);}
  async update(calendarId,eventId,payload,{ifMatch}={}){this.target(calendarId);if(!eventIdOk(eventId)||!etagOk(ifMatch))throw fail('UPDATE_INVALID');const body=this.body(payload,false);const data=await this.request('PATCH',this.eventsUrl+'/'+eventId+'?sendUpdates=none',{body,ifMatch});if(data.id!==eventId)throw fail('INDETERMINATE');return this.normalize(data);}
}
module.exports={GoogleCalendarHttp};

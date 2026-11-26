/** Budil GPT chat client guards. Pure functions; no storage, network or mutations. */
const BudilGptChat=(()=>{
  'use strict';
  const allowed=Object.freeze(['none','work.date','work.search','customer.search',
    'customer.timeline','document.period','document.search','receivables.summary',
    'profit.summary','proposal']);
  const deny=code=>({ok:false,code});
  // Owner-typed text is processed after fresh, account-scoped AI consent.
  // Local customer records are never appended to a provider prompt.
  const MAX_CHAT_CHARS=4000;
  const SECRET_RE=/\bsk-(?:proj-|svcacct-|admin-)[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:APIキー|パスワード|秘密鍵|password|api[_ -]?key|private[_ -]?key)\s*[:=：]\s*\S{8,}/iu;
  function approvedOutbound(value){
    return typeof value==='string'&&!!value.trim()&&value.length<=MAX_CHAT_CHARS&&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)&&!SECRET_RE.test(value);
  }
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function prepare(raw,_leads,previousAliases){
    if(typeof raw!=='string'||!raw.trim()||raw.length>MAX_CHAT_CHARS)return deny('MESSAGE_INVALID');
    if(!approvedOutbound(raw))return deny('SECRET_INPUT');
    return {ok:true,message:raw.trim(),
      aliases:Object.assign(Object.create(null),previousAliases||{})};
  }
  function verify(response,aliases,sourceText=''){
    if(!response||typeof response!=='object'||response.ok!==true||
       response.phase!=='chat_plan_only'||response.can_execute!==false||
       response.persisted!==false||response.customer_records_sent!==false)
      return deny('UNSAFE_CHAT_RESPONSE');
    const action=response.action;
    if(!allowed.includes(action)||typeof response.reply!=='string'||response.reply.length>800||
       typeof response.query!=='string'||response.query.length>100||
       typeof response.date!=='string'||response.date.length>10||
       typeof response.month!=='string'||response.month.length>7||
       !['none','estimate','invoice'].includes(response.docType)||
       typeof response.needs_confirmation!=='boolean')
      return deny('INVALID_CHAT_RESPONSE');
    if(action==='proposal'){
      if(!response.needs_confirmation)return deny('APPROVAL_REQUIRED');
      return {ok:true,action,reply:response.reply,request:null,proposal:true};
    }
    if(response.needs_confirmation)return deny('UNEXPECTED_APPROVAL');
    if(action==='none')return {ok:true,action,reply:response.reply,request:null};
    const date=response.date;
    if(['work.date','receivables.summary','profit.summary'].includes(action)&&!validDate(date))
      return deny('INVALID_DATE');
    if(action==='work.date')return {ok:true,action,reply:response.reply,request:{action,date,limit:10}};
    if(action==='receivables.summary'||action==='profit.summary')
      return {ok:true,action,reply:response.reply,request:{action,date}};
    if(action==='document.period'){
      if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(response.month)||response.docType==='none')
        return deny('INVALID_PERIOD');
      return {ok:true,action,reply:response.reply,request:{action,month:response.month,docType:response.docType,limit:10}};
    }
    if(!response.query.trim())return deny('QUERY_REQUIRED');
    let query=response.query.trim();
    const token=query.match(/^顧客[A-H]$/u);
    if(token){
      if(!Object.prototype.hasOwnProperty.call(aliases,query))return deny('UNKNOWN_CUSTOMER_ALIAS');
      query=aliases[query];
    }else if(['customer.search','customer.timeline','work.search'].includes(action)){
      // No invented customer lookup: the owner must have typed the name.
      const compact=value=>String(value||'').replace(/[\s　]+/gu,'');
      if(!compact(sourceText).includes(compact(query)))return deny('UNREQUESTED_CUSTOMER_QUERY');
    }
    return {ok:true,action,reply:response.reply,request:{action,query,limit:10}};
  }
  /**
   * Summarize only start/end windows from an authenticated, read-only Google
   * calendar result. Never expose event titles, locations, IDs or customer data.
   * Google all-day end dates are exclusive, and a zero count is NOT a free-day
   * guarantee (other calendars and unsynced work orders may exist).
   */
  // The desktop's existing local Google READ worker may be used only when
  // the authenticated cloud Google service credential failed. Never bypass a
  // failed Budil user session, owner authorization or forbidden operation.
  function shouldUseLocalCalendarFallback(response){
    return !!(response&&response.ok===false&&
      ['secret_invalid','secret_not_configured','token_exchange_failed']
        .includes(response.code));
  }
  function summarizeCalendarRead(response,date){
    if(!validDate(date)||!response||response.ok!==true||
       response.readOnly!==true||response.calendarWritePerformed!==false||
       !Array.isArray(response.events)||response.events.length>1000)
      return deny('CALENDAR_READ_UNVERIFIED');
    const dayStart=Date.parse(date+'T00:00:00+09:00');
    const dayEnd=dayStart+86400000;
    const asMs=value=>{
      if(typeof value!=='string'||value.length>45)return NaN;
      if(validDate(value))return Date.parse(value+'T00:00:00+09:00');
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
         !validDate(value.slice(0,10)))return NaN;
      return Date.parse(value);
    };
    const intervals=[];
    for(const event of response.events){
      if(!event||typeof event!=='object'||Array.isArray(event)||
         typeof event.start!=='string'||typeof event.end!=='string')
        return deny('CALENDAR_READ_INVALID');
      const start=asMs(event.start),end=asMs(event.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
        return deny('CALENDAR_READ_INVALID');
      if(start<dayEnd&&end>dayStart)
        intervals.push({start:Math.max(start,dayStart),end:Math.min(end,dayEnd)});
    }
    intervals.sort((a,b)=>a.start-b.start||a.end-b.end);
    const merged=[];
    for(const item of intervals){
      const last=merged[merged.length-1];
      if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);
      else merged.push({start:item.start,end:item.end});
    }
    const fmt=ms=>ms===dayEnd?'24:00':new Date(ms+9*3600000).toISOString().slice(11,16);
    const windows=Object.freeze(merged.slice(0,12).map(item=>
      Object.freeze({start:fmt(item.start),end:fmt(item.end)})));
    return Object.freeze({ok:true,date,source:response.source==='pc_local_calendar'?
      'pc_local_calendar':'active_google_calendar_binding',
      busyEventCount:response.events.length,busySlotCount:merged.length,
      windows,hasMore:merged.length>windows.length,confirmedFree:false,
      customerDataSent:false,writePerformed:false});
  }
  function safeHistory(history){
    if(!Array.isArray(history))return [];
    const recent=history.filter(x=>x&&['user','assistant'].includes(x.role)&&
      typeof x.content==='string'&&x.content.length<=MAX_CHAT_CHARS).slice(-8);
    const selected=[];let total=0;
    for(let i=recent.length-1;i>=0;i--){
      if(total+recent[i].content.length>7000)continue;
      total+=recent[i].content.length;
      selected.unshift({role:recent[i].role,content:recent[i].content});
    }
    return selected;
  }
  return Object.freeze({prepare,verify,safeHistory,validDate,summarizeCalendarRead,approvedOutbound,
    shouldUseLocalCalendarFallback,actions:allowed});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptChat};

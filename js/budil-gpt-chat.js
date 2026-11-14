/** Budil GPT chat client guards. Pure functions; no storage, network or mutations. */
const BudilGptChat=(()=>{
  'use strict';
  const allowed=Object.freeze(['none','work.date','work.search','customer.search',
    'customer.timeline','document.period','document.search','receivables.summary',
    'profit.summary','proposal']);
  const deny=code=>({ok:false,code});
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  const escapeRe=s=>s.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
  function prepare(raw,leads,previousAliases){
    if(typeof raw!=='string'||!raw.trim()||raw.length>550)return deny('MESSAGE_INVALID');
    const original=raw.trim();
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(original))return deny('MESSAGE_INVALID');
    if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+81|0)\d[\d\s-]{8,}|(?:電話番号|住所|口座番号|〒|パスワード|APIキー|秘密鍵|振込先)/iu.test(original))
      return deny('SENSITIVE_INPUT');
    if(!Array.isArray(leads))return deny('LOCAL_DATA_UNAVAILABLE');
    let message=original;
    const aliases=Object.assign(Object.create(null),previousAliases||{});
    let aliasIndex=Object.keys(aliases).length;
    const keyFor=name=>{
      for(const [key,value] of Object.entries(aliases))if(value===name)return key;
      if(aliasIndex>=8)return '';
      const key='顧客'+String.fromCharCode(65+aliasIndex++);
      aliases[key]=name;
      return key;
    };
    const replaceName=name=>{
      if(!name||name.length<2||name.length>60||!message.includes(name))return;
      const key=keyFor(name);
      if(!key)return;
      message=message.replace(new RegExp(escapeRe(name),'gu'),key);
    };
    const names=[...new Set(leads.flatMap(x=>{
      if(!x||typeof x!=='object')return[];
      return [x.name,x.customerName,x.company,x.contact]
        .filter(v=>typeof v==='string'&&v.trim().length>=2)
        .map(v=>v.trim());
    }))].sort((a,b)=>b.length-a.length);
    for(const name of names)replaceName(name);
    // A surname search such as 田中さん is a candidate lookup, never an
    // automatic identity match. Keep that surname locally behind the alias.
    for(const surname of new Set(names.filter(v=>v.length>=3).map(v=>v.slice(0,2)))){
      if(message.includes(surname+'さん')||message.includes(surname+'様'))replaceName(surname);
    }
    message=message.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,12})(さん|様)/gu,
      (whole,name,suffix)=>{
        if(name.startsWith('顧客')&&/^顧客[A-H]$/.test(name))return whole;
        const key=keyFor(name);
        return key?key+suffix:whole;
      });
    if(/[\p{Script=Han}]{2,12}(?:さん|様)/u.test(message.replace(/顧客[A-H](?:さん|様)?/g,'')))
      return deny('SENSITIVE_INPUT');
    // If the alias limit is reached, never send leftover known names.
    if(names.some(name=>name.length>=3&&message.includes(name)))
      return deny('SENSITIVE_INPUT');
    if(/(?:https?:\/\/|www\.|@|(?:\d{2,4}-){2}\d{3,4})/i.test(message))
      return deny('SENSITIVE_INPUT');
    return {ok:true,message,aliases};
  }
  function verify(response,aliases){
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
      return deny('UNKNOWN_CUSTOMER_ALIAS');
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
    if(!Array.isArray(history))return[];
    return history.filter(x=>x&&['user','assistant'].includes(x.role)&&
      typeof x.content==='string'&&x.content.length<=550)
      .slice(-8).map(x=>({role:x.role,content:x.content}));
  }
  return Object.freeze({prepare,verify,safeHistory,validDate,summarizeCalendarRead,
    shouldUseLocalCalendarFallback,actions:allowed});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptChat};

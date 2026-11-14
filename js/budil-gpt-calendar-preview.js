/**
 * Budil compact booking and reschedule preview. Pure, on-device and write-free.
 * Not a booking API; cannot save a work order or Google event.
 */
const BudilGptCalendarPreview = (() => {
  'use strict';
  const fail = code => ({ok:false,code});
  const nameRe=/^[一-龯々ぁ-んァ-ヶー・A-Za-z]{2,40}$/u;
  const validDate = s => {
    if(!/^20\d\d-\d\d-\d\d$/.test(s))return false;
    const d=new Date(s+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
  };
  const validTime=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
  function normalize(raw){
    return raw.normalize('NFKC').replace(/[\s　]/g,'').replace(/[。！!]+$/u,'');
  }
  function parseDate(year,month,day,today){
    const date=String(year||today.slice(0,4))+'-'+String(month).padStart(2,'0')+
      '-'+String(day).padStart(2,'0');
    if(!validDate(date))return fail('DATE_INVALID');
    if(date<today)return fail('PAST_DATE');
    return {ok:true,date};
  }
  function parseClock(ampm,hour,minute){
    let h=Number(hour),m=Number(minute||0);
    if(!Number.isInteger(h)||!Number.isInteger(m)||m>59||h>23)return fail('TIME_INVALID');
    if(ampm){
      if(h<1||h>12)return fail('TIME_INVALID');
      if(ampm==='午後'&&h<12)h+=12;
      if(ampm==='午前'&&h===12)h=0;
    }
    const startTime=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    return validTime(startTime)?{ok:true,startTime}:fail('TIME_INVALID');
  }
  function parse(raw,today){
    if(typeof raw!=='string'||raw.length>220||!raw.trim()||
      /[\x00-\x1f]/.test(raw)||!validDate(today))return fail('INPUT_INVALID');
    const s=normalize(raw);
    const when='(?:(20\\d{2})年)?(\\d{1,2})月(\\d{1,2})日(午前|午後)?(\\d{1,2})時(?:([0-9]{1,2})分)?';
    let m=s.match(new RegExp('^'+when+'に(.+?)を予約して$','u'));
    if(m){
      const d=parseDate(m[1],m[2],m[3],today),t=parseClock(m[4],m[5],m[6]);
      if(!d.ok)return d;if(!t.ok)return t;
      const text=m[7],named=text.match(/^(.+?)(?:さん|様)の(.+)$/u);
      const customerName=named?named[1]:'';
      const serviceText=named?named[2]:text;
      if(customerName&&!nameRe.test(customerName))return fail('NAME_INVALID');
      if(serviceText.length<2||serviceText.length>80||/[<>{}]/.test(serviceText))
        return fail('SERVICE_INVALID');
      return Object.freeze({ok:true,mode:'calendar_preview',action:'booking',
        date:d.date,startTime:t.startTime,customerName,serviceText,
        explicitSelectionRequired:true,calendarWriteEnabled:false});
    }
    m=s.match(new RegExp('^(?:(.+?)(?:さん|様)の)?予約を'+when+'に変更して$','u'));
    if(m){
      const name=m[1]||'';
      if(name&&!nameRe.test(name))return fail('NAME_INVALID');
      const d=parseDate(m[2],m[3],m[4],today),t=parseClock(m[5],m[6],m[7]);
      if(!d.ok)return d;if(!t.ok)return t;
      return Object.freeze({ok:true,mode:'calendar_preview',action:'reschedule',
        date:d.date,startTime:t.startTime,customerName:name,serviceText:'',
        explicitSelectionRequired:true,calendarWriteEnabled:false});
    }
    return fail('UNSUPPORTED_COMMAND');
  }
  function review(intent,{orders,selectedCustomer,selectedOrder,endTime,now=new Date(),bookingBrain}={}){
    if(!intent?.ok||intent.mode!=='calendar_preview'||!Array.isArray(orders)||
      !bookingBrain||typeof bookingBrain.scheduleReview!=='function')return fail('INPUT_INVALID');
    if(!validTime(endTime)||endTime<=intent.startTime||
      bookingBrain.isPast(intent.date,intent.startTime,now))return fail('TIME_INVALID');
    let customerId='',customerName='',serviceText='',excludeId='',eventId='';
    if(intent.action==='booking'){
      if(!selectedCustomer||!selectedCustomer.explicitlySelected||
        !selectedCustomer.id||!selectedCustomer.name)return fail('CUSTOMER_SELECTION_REQUIRED');
      customerId=String(selectedCustomer.id);customerName=String(selectedCustomer.name);
      if(intent.customerName&&intent.customerName!==customerName)return fail('CUSTOMER_MISMATCH');
      serviceText=intent.serviceText;
    }else if(intent.action==='reschedule'){
      const target=selectedOrder&&orders.find(w=>String(w&&w.id||'')===String(selectedOrder.id));
      if(!target||!selectedOrder.explicitlySelected||
        !['tentative','confirmed'].includes(target.status)||
        target.candidateMeta||target.isAllDay||
        (target.scheduledEndDate&&target.scheduledEndDate!==target.scheduledDate)||
        !target.customerName||!target.serviceText)return fail('TARGET_SELECTION_REQUIRED');
      if(intent.customerName&&target.customerName!==intent.customerName &&
        !target.customerName.startsWith(intent.customerName))return fail('TARGET_MISMATCH');
      if(target.scheduledDate===intent.date&&target.startTime===intent.startTime&&
        target.endTime===endTime)return fail('NO_CHANGE');
      excludeId=String(target.id);
      customerId=String(target.leadId||target.customerId||'');
      customerName=String(target.customerName);
      serviceText=String(target.serviceText);
      eventId=String(target.calendarEventId||'');
    }else return fail('INPUT_INVALID');
    const checked=bookingBrain.scheduleReview(orders,intent.date,intent.startTime,endTime,excludeId);
    if(!checked.ok)return fail('SCHEDULE_INVALID');
    const duplicate=bookingBrain.duplicates(orders,{
      date:intent.date,startTime:intent.startTime,customerName,serviceText
    },excludeId);
    if(checked.overlaps.length||checked.unknown.length||duplicate.length)
      return {ok:false,code:'LOCAL_CONFLICT',overlapCount:checked.overlaps.length,
        unknownCount:checked.unknown.length,duplicateCount:duplicate.length};
    return Object.freeze({ok:true,action:intent.action,date:intent.date,
      startTime:intent.startTime,endTime,customerId,customerName,serviceText,
      workOrderId:excludeId,eventId,googleWritePerformed:false,
      workOrderSaved:false,googleBusyVerified:false,canSave:false});
  }
  return Object.freeze({parse,review,validDate,validTime});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptCalendarPreview};

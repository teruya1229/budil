'use strict';
// Pure Japanese command parser. It never chooses a customer, duration or target.
const {BudilGptBooking:legacy}=require('./existing-read-booking.js');
const bad = code => ({ok:false,code});
const validDay = s => /^20\d\d-\d\d-\d\d$/.test(s) &&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const validClock = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
function jstToday(now) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',
    month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=k=>parts.find(p=>p.type===k).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function parse(raw,{now=new Date()}={}) {
  if(typeof raw!=='string'||raw.length>220||/[\x00-\x1f]/.test(raw))return bad('INPUT_INVALID');
  const s=raw.normalize('NFKC').replace(/[\s　]/g,'').replace(/[。！!]+$/,'');
  const today=jstToday(now);
  const short=s.match(/^(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日(?:(午前|午後))?(\d{1,2})時(?:(\d{1,2})分)?に(.+?)を予約して$/u);
  if(short){
    const year=Number(short[1]||today.slice(0,4)),month=Number(short[2]),day=Number(short[3]);
    const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    let hour=Number(short[5]);const minute=Number(short[6]||0);
    if(short[4] && (hour<1||hour>12))return bad('TIME_INVALID');
    if(short[4]==='午後'&&hour<12)hour+=12;
    if(short[4]==='午前'&&hour===12)hour=0;
    const startTime=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    if(!validDay(date))return bad('DATE_INVALID');
    if(date<today)return bad('PAST_DATE');
    if(!validClock(startTime))return bad('TIME_INVALID');
    const serviceText=short[7];
    if(!/^[^<>]{2,80}$/u.test(serviceText))return bad('SERVICE_INVALID');
    return {ok:true,action:'booking',date,startTime,serviceText,
      missing:['customerId','customerName','endTime'],selectionRequired:true,
      approvalRequired:true};
  }
  // Delegate every established long-form command to its unchanged parser.
  const old=legacy.parse(raw,today);
  if(!old.ok)return old;
  if(old.action==='availability')return old;
  if(old.action==='booking')return {ok:true,action:'booking',date:old.date,
    startTime:old.startTime,customerName:old.name,serviceText:old.service,
    quantity:old.quantity,amount:old.amount,tax:old.tax,
    missing:['customerId','endTime'],selectionRequired:true,approvalRequired:true};
  if(old.action==='reschedule')return {ok:true,action:'reschedule',date:old.date,
    customerName:old.name,missing:['workOrderId','calendarEventId','startTime','endTime'],
    selectionRequired:true,approvalRequired:true};
  return bad('UNSUPPORTED_COMMAND');
}
function complete(intent,selection){
  if(!intent?.ok||intent.action!=='booking'||!selection||
    typeof selection.customerId!=='string'||!selection.customerId.trim()||
    typeof selection.customerName!=='string'||!selection.customerName.trim()||
    !validClock(selection.endTime)||selection.endTime<=intent.startTime||
    selection.explicitCustomerSelection!==true||selection.explicitDurationSelection!==true)
    return bad('EXPLICIT_SELECTION_REQUIRED');
  if(intent.customerName&&intent.customerName!==selection.customerName)return bad('CUSTOMER_MISMATCH');
  return {ok:true,action:'booking',date:intent.date,startTime:intent.startTime,
    endTime:selection.endTime,customerId:selection.customerId,
    customerName:selection.customerName,serviceText:intent.serviceText,
    approvalRequired:true};
}
module.exports={parse,complete,jstToday};

/** Strict, on-device booking grammar and schedule review. No storage or network access. */
const BudilGptBooking = (() => {
  'use strict';
  const fail = code => ({ok:false, code});
  const weekdays = {日曜日:0,月曜日:1,火曜日:2,水曜日:3,木曜日:4,金曜日:5,土曜日:6};
  const nameRe = /^[一-龯々ぁ-んァ-ヶー・A-Za-z]{2,40}$/u;
  const dateRe = /^(20\d\d)-(\d\d)-(\d\d)$/;
  function validDate(s) {
    const m = String(s).match(dateRe);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return d.toISOString().slice(0,10) === s;
  }
  function dateFor(label,today) {
    if (!validDate(today)) return '';
    if (validDate(label)) return label;
    if (!(label in weekdays)) return '';
    const base = new Date(today+'T00:00:00Z');
    const offset = (weekdays[label]-base.getUTCDay()+7)%7;
    base.setUTCDate(base.getUTCDate()+offset);
    return base.toISOString().slice(0,10);
  }
  function time(hour,minute='00',ampm='') {
    let h=Number(hour), m=Number(minute);
    if (!Number.isInteger(h)||!Number.isInteger(m)||m>59||h>23) return '';
    if (ampm==='午前' && h>11) return '';
    if (ampm==='午後') { if(h<1||h>12)return ''; if(h<12)h+=12; }
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
  const day='(20\\d\\d-\\d\\d-\\d\\d|[日月火水木金土]曜日)';
  const clock='(午前|午後)?([0-9]{1,2})時(?:([0-9]{1,2})分)?';
  function parse(raw,today) {
    if(typeof raw!=='string'||!raw.trim()||raw.length>220||/[\x00-\x1f]/.test(raw))return fail('INPUT_INVALID');
    const s=raw.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0))
      .replace(/[　\s]/g,'').replace(/[，]/g,',').replace(/[？?。]+$/,'');
    let m=s.match(new RegExp('^'+day+'の'+clock+'[、,]?空いてる(?:でしょうか|かな|の)?$'));
    if(m) {
      const date=dateFor(m[1],today), startTime=time(m[3],m[4],m[2]);
      if(!date)return fail('DATE_INVALID');if(!startTime)return fail('TIME_INVALID');
      return {ok:true,action:'availability',date,startTime};
    }
    m=s.match(new RegExp('^'+day+'の'+clock+'に(.+?)(?:さん|様)の(エアコン洗浄|エアコンクリーニング)([0-9]{1,2})台を予約して[。、,]?(税込|税抜)?([0-9][0-9,]*)円で見積書も作って$'));
    if(m) {
      const date=dateFor(m[1],today),startTime=time(m[3],m[4],m[2]);
      const quantity=Number(m[7]),amountText=m[9],amount=Number(amountText.replace(/,/g,''));
      if(!date)return fail('DATE_INVALID');if(date<today)return fail('PAST_DATE');
      if(!startTime)return fail('TIME_INVALID');
      if(!nameRe.test(m[5]))return fail('NAME_INVALID');
      if(quantity<1||quantity>30)return fail('QUANTITY_INVALID');
      if(!/^(?:[1-9][0-9]{0,8}|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(amountText)||amount>100000000)return fail('AMOUNT_INVALID');
      return {ok:true,action:'booking',date,startTime,name:m[5],service:m[6],quantity,amount,
        tax:m[8]==='税込'?'included':m[8]==='税抜'?'excluded':null};
    }
    m=s.match(new RegExp('^(.+?)(?:さん|様)の予約を'+day+'に変更して$'));
    if(m) {
      const date=dateFor(m[2],today);
      if(!date)return fail('DATE_INVALID');if(date<today)return fail('PAST_DATE');
      if(!nameRe.test(m[1]))return fail('NAME_INVALID');
      return {ok:true,action:'reschedule',name:m[1],date};
    }
    return fail('UNSUPPORTED_COMMAND');
  }
  function validTime(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');}
  function isPast(date,startTime,now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get=k=>(parts.find(p=>p.type===k)||{}).value||'';
    const today=get('year')+'-'+get('month')+'-'+get('day');
    const clock=get('hour')+':'+get('minute');
    return date<today||(date===today&&startTime<=clock);
  }
  // Legacy records may lack status; do not treat them as free time.
  function active(w){return w && !['cancelled','completed','archived'].includes(w.status);}
  function scheduleReview(orders,date,startTime,endTime,excludeId='') {
    if(!validDate(date)||!validTime(startTime)|| (endTime && (!validTime(endTime)||endTime<=startTime)))return fail('SCHEDULE_INVALID');
    const overlaps=[],unknown=[];
    for(const w of orders||[]) {
      if(!active(w)||String(w.id||'')===excludeId)continue;
      const first=String(w.scheduledDate||''),last=String(w.scheduledEndDate||first);
      if(date<first||date>last)continue;
      if(w.isAllDay===true){overlaps.push(w);continue;}
      if(!validTime(w.startTime)||!validTime(w.endTime)||w.endTime<=w.startTime){unknown.push(w);continue;}
      if(endTime ? startTime<w.endTime && w.startTime<endTime : w.startTime<=startTime && startTime<w.endTime)overlaps.push(w);
    }
    return {ok:true,overlaps,unknown};
  }
  function duplicates(orders,draft,excludeId='') {
    return (orders||[]).filter(w=>active(w)&&String(w.id||'')!==excludeId&&
      w.scheduledDate===draft.date&&w.startTime===draft.startTime&&
      w.customerName===draft.customerName&&w.serviceText===draft.serviceText);
  }
  return Object.freeze({parse,validDate,validTime,isPast,scheduleReview,duplicates});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptBooking};

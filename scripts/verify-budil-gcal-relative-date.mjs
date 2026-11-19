import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {BudilGptCalendarPreview:mod}=require('../js/budil-gpt-calendar-preview.js');
let passed=0;
const check=(description,input,today,expected)=>{
  const r=mod.parse(input,today);
  if(expected.ok===false){
    assert.equal(r.ok,false,description);
    if(expected.code)assert.equal(r.code,expected.code,description);
  } else {
    assert.equal(r.ok,true,description+': parse');
    assert.equal(r.action,expected.action,description+': action');
    assert.equal(r.date,expected.date,description+': date');
    assert.equal(r.startTime,expected.start,description+': start');
    assert.equal(r.calendarWriteEnabled,false,description+': no write');
    assert.equal(r.explicitSelectionRequired,true,description+': selection');
  }
  passed++;console.log('PASS',description);
};
check('tomorrow JST 10:00 booking','明日の10時に田中さんのエアコンクリーニングを予約して','2026-11-14',{action:'booking',date:'2026-11-15',start:'10:00'});
check('tomorrow no particle booking','明日10時に田中さんのエアコンクリーニングを予約して','2026-11-14',{action:'booking',date:'2026-11-15',start:'10:00'});
check('day after tomorrow afternoon','明後日午後2時30分に田中さんの清掃を予約して','2026-11-14',{action:'booking',date:'2026-11-16',start:'14:30'});
check('year rollover tomorrow','明日の9時に田中さんの清掃を予約して','2026-12-31',{action:'booking',date:'2027-01-01',start:'09:00'});
check('leap day tomorrow','明日の10時に田中さんの清掃を予約して','2028-02-28',{action:'booking',date:'2028-02-29',start:'10:00'});
check('reschedule tomorrow','田中さんの予約を明日10時に変更して','2026-11-14',{action:'reschedule',date:'2026-11-15',start:'10:00'});
check('reschedule tomorrow particle','田中さんの予約を明日の10時に変更して','2026-11-14',{action:'reschedule',date:'2026-11-15',start:'10:00'});
check('reschedule day after tomorrow','田中さんの予約を明後日午後3時に変更して','2026-11-14',{action:'reschedule',date:'2026-11-16',start:'15:00'});
check('explicit full date unchanged','2026年11月20日10時に田中さんの清掃を予約して','2026-11-14',{action:'booking',date:'2026-11-20',start:'10:00'});
check('past exact date rejected','2026年11月13日10時に田中さんの清掃を予約して','2026-11-14',{ok:false,code:'PAST_DATE'});
check('unrelated request does not save','予定をすべて変更して','2026-11-14',{ok:false,code:'UNSUPPORTED_COMMAND'});
check('no customer or service inference','明日の10時に予約して','2026-11-14',{ok:false,code:'UNSUPPORTED_COMMAND'});

const {BudilGptBooking}=require('../js/budil-gpt-booking.js');
const surname=mod.parse('明日の10時に田中さんのエアコン洗浄を予約して','2026-11-19');
assert.equal(surname.ok,true);
const selected={id:'fictional-id-2',name:'田中次郎',explicitlySelected:true};
const review=mod.review(surname,{orders:[],selectedCustomer:selected,
  endTime:'11:00',now:new Date('2026-11-19T01:00:00Z'),bookingBrain:BudilGptBooking});
assert.equal(review.ok,true,'surname prefix with manually selected exact ID is allowed');
assert.equal(review.customerId,'fictional-id-2');
assert.equal(review.customerName,'田中次郎');
assert.equal(review.googleWritePerformed,false);
assert.equal(review.workOrderSaved,false);
assert.equal(review.canSave,false);
passed++;
const unrelated=mod.review(surname,{orders:[],selectedCustomer:{id:'fictional-id-3',
  name:'山田太郎',explicitlySelected:true},endTime:'11:00',
  now:new Date('2026-11-19T01:00:00Z'),bookingBrain:BudilGptBooking});
assert.equal(unrelated.code,'CUSTOMER_MISMATCH','unrelated manual customer cannot pass');
passed++;
const noChoice=mod.review(surname,{orders:[],selectedCustomer:{id:'fictional-id-2',
  name:'田中次郎',explicitlySelected:false},endTime:'11:00',
  now:new Date('2026-11-19T01:00:00Z'),bookingBrain:BudilGptBooking});
assert.equal(noChoice.code,'CUSTOMER_SELECTION_REQUIRED','no automatic surname selection');
passed++;
console.log('BUDIL_GCAL_RELATIVE_DATE PASS',passed,'FAIL 0');

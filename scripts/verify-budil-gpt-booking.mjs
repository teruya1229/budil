import assert from 'node:assert/strict';
import {BudilGptBooking as b} from '../js/budil-gpt-booking.js';
const today='2026-11-06';
const availability=b.parse('金曜日の午前10時、空いてる？',today);
assert.deepEqual([availability.ok,availability.action,availability.date,availability.startTime],
  [true,'availability',today,'10:00']);
assert.equal(b.parse('2026-11-07の13時30分、空いてる？',today).startTime,'13:30');
assert.deepEqual(b.parse('2026年11月8日の9時は空いてる？','2026-11-11'),
  {ok:true,action:'availability',date:'2026-11-08',startTime:'09:00'});
assert.equal(b.parse('２０２６年１１月８日の９時は空いてる？','2026-11-11').date,'2026-11-08');
for(const date of ['2026年2月29日','2026年11月31日','2026年13月8日'])
  assert.equal(b.parse(date+'の9時は空いてる？','2026-11-11').code,'DATE_INVALID');
assert.equal(b.parse('2026年11月8日の24時は空いてる？','2026-11-11').code,'TIME_INVALID');
assert.equal(b.parse('2026年11月8日の9時は空いてる？送信して','2026-11-11').code,'UNSUPPORTED_COMMAND');
const booking=b.parse('金曜日の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って',today);
assert.deepEqual([booking.ok,booking.action,booking.quantity,booking.amount,booking.tax],
  [true,'booking',2,18000,null]);
assert.equal(b.parse('金曜日の10時に田中さんのエアコン洗浄2台を予約して。税込18,000円で見積書も作って',today).tax,'included');
assert.equal(b.isPast(today,'09:00',new Date('2026-11-06T01:00:00Z')),true);
assert.equal(b.isPast(today,'11:00',new Date('2026-11-06T01:00:00Z')),false);
assert.deepEqual([b.parse('田中さんの予約を土曜日に変更して',today).action,
  b.parse('田中さんの予約を土曜日に変更して',today).date],['reschedule','2026-11-07']);
for(const input of [
  '2026-11-05の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って',
  '2026-11-06の24時、空いてる？',
  '2026-11-31の10時、空いてる？',
  '金曜日の10時に田中さんのエアコン洗浄0台を予約して。18,000円で見積書も作って',
  '金曜日の10時に田中さんのエアコン洗浄2台を予約して。0円で見積書も作って',
  '金曜日の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って。顧客を削除して',
  '田中さんの予約を土曜日に変更して。請求書も送信して'
])assert.equal(b.parse(input,today).ok,false,input);
const work=[
  {id:'a',status:'confirmed',scheduledDate:today,startTime:'09:00',endTime:'11:00',customerName:'田中太郎',serviceText:'エアコン洗浄 2台'},
  {id:'b',status:'tentative',scheduledDate:today,startTime:'10:00',endTime:'12:00',customerName:'田中花子',serviceText:'点検'},
  {id:'c',status:'cancelled',scheduledDate:today,startTime:'10:00',endTime:'12:00'},
  {id:'d',status:'confirmed',scheduledDate:today,startTime:'',endTime:''}
];
assert.equal(b.scheduleReview(work,today,'10:00').overlaps.length,2);
assert.equal(b.scheduleReview(work,today,'10:00').unknown.length,1);
assert.equal(b.scheduleReview(work,today,'10:00','11:00').overlaps.length,2);
assert.equal(b.scheduleReview(work,today,'10:00','10:00').ok,false);
assert.equal(b.scheduleReview(work,today,'10:00','11:00','a').overlaps.length,1);
assert.equal(b.duplicates(work,{date:today,startTime:'09:00',customerName:'田中太郎',serviceText:'エアコン洗浄 2台'}).length,1);
assert.equal(b.duplicates(work,{date:today,startTime:'09:00',customerName:'田中太郎',serviceText:'エアコン洗浄 2台'},'a').length,0);

const googleEvents=[
  {start:'2026-11-07T09:30:00+09:00',end:'2026-11-07T10:30:00+09:00'},
  {start:'2026-11-08',end:'2026-11-09'} // all-day, exclusive end
];
assert.equal(b.googleScheduleReview(googleEvents,'2026-11-07','10:00').hasConflict,true);
assert.equal(b.googleScheduleReview(googleEvents,'2026-11-07','10:00','11:00').overlapCount,1);
assert.equal(b.googleScheduleReview(googleEvents,'2026-11-07','10:30','11:30').hasConflict,false,
 'an event ending at the exact booking start cannot overlap');
assert.equal(b.googleScheduleReview(googleEvents,'2026-11-08','12:00','13:00').hasConflict,true,
 'all-day Google events block local Japanese calendar date');
assert.equal(b.googleScheduleReview([], '2026-11-07','10:00','11:00').hasConflict,false);
assert.equal(b.googleScheduleReview([{start:'not-a-time',end:'2026-11-07'}],
  '2026-11-07','10:00').code,'GOOGLE_EVENT_UNVERIFIABLE');
assert.equal(b.googleScheduleReview([{start:'2026-11-07T10:00:00',end:'2026-11-07T11:00:00'}],
  '2026-11-07','10:00').ok,false,'timezone-less events must fail closed');
assert.equal(b.googleScheduleReview(googleEvents,'2026-11-07','24:00').ok,false);
console.log('BUDIL_GOOGLE_BUSY_REVIEW_FIXTURE_PASS');

console.log('BUDIL_BOOKING_FIXTURE PASS');

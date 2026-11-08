/** Reassess the *original* 19 practical utterances, no wishful PASS. */
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
const parser=runInNewContext(readFileSync('js/budil-gpt-local-commands.js','utf8')+';BudilGptLocalCommands',{Date,Intl});
const anon=runInNewContext(readFileSync('js/budil-gpt-anonymize.js','utf8')+';BudilGptAnonymize',{Date,Intl});
const booking=runInNewContext(readFileSync('js/budil-gpt-booking.js','utf8')+';BudilGptBooking',{Date,Intl});
const conversation=runInNewContext(readFileSync('js/budil-gpt-conversation.js','utf8')+';BudilGptConversation',{Date,Intl});
// An accepted sentence alone is not proof of a working UI. Run disposable
// browser fixtures and only credit the exact or equivalent flow they exercise.
const p0=spawnSync(process.execPath,['scripts/verify-budil-ai-p0-browser.mjs'],{encoding:'utf8',timeout:60000});
const bookingE2e=spawnSync(process.execPath,['scripts/verify-budil-gpt-booking-browser.mjs'],{encoding:'utf8',timeout:60000});
const invoiceE2e=spawnSync(process.execPath,['scripts/verify-budil-gpt-invoice-browser.mjs'],{encoding:'utf8',timeout:90000});
const bankE2e=spawnSync(process.execPath,['scripts/verify-budil-gpt-bank-browser.mjs'],{encoding:'utf8',timeout:90000});
const p0Ok=p0.status===0&&p0.stdout.includes('BUDIL_AI_P0_BROWSER_PASS');
const p0Extended=p0Ok&&p0.stdout.includes('BUDIL_ORIGINAL_MISSING_4_BROWSER_PASS');
const bookingOk=bookingE2e.status===0&&bookingE2e.stdout.includes('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');
const invoiceOk=invoiceE2e.status===0&&invoiceE2e.stdout.includes('BUDIL_INVOICE_CHROME_390_WINDOWS PASS');
const bankOk=bankE2e.status===0&&bankE2e.stdout.includes('BUDIL_BANK_CHROME_390_WINDOWS PASS');
// These indices have corresponding actual-page fixture paths. Others stay
// unverified even when the local parser accepts them.
const p0Flows=new Set([1,8,9,11,13,14,15,17,18]);
const p0ExtendedFlows=new Set([2,3,4,10]);
// Booking E2E covers Budil-local plans, not live Google availability or writes.
const bookingFlows=new Set();
const cases=[
  ['田中太郎さんを探して','customer.search'],
  ['田中さんを探して','customer.search'],
  ['田中太郎を探して','customer.search'],
  ['田中さんを新規顧客として登録して','customer.create'],
  ['金曜日の午前10時、空いてる？','calendar.availability'],
  ['金曜日の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って','booking.and.quote'],
  ['田中さんの予約を土曜日に変更して','calendar.reschedule'],
  ['田中太郎さんの作業予定を教えて','work.search'],
  ['田中太郎さんのエアコン洗浄2台を税込18,000円で見積して','quote.draft'],
  ['田中さん、エアコン洗浄2台で18,000円の見積お願い','quote.draft'],
  ['田中さんのエアコン洗浄2台で見積を作って','quote.draft'],
  ['田中さんの作業を完了にして請求書を作って','work.complete.and.invoice'],
  ['田中太郎さんの請求書を探して','document.search'],
  ['未入金合計を教えて','receivables.summary'],
  ['今月の未入金を教えて','receivables.this_month'],
  ['銀行明細と請求書を照合して','bank.reconcile'],
  ['先月の見積書を探して','document.search.period'],
  ['今月の利益はいくら？','profit.current_month'],
  ['その見積を請求書にして','context.next_step']
];
const rows=cases.map(([input,wanted],i)=>{
 const actual=parser.parse(input,{today:'2026-11-06',anonymizer:anon});
 const bookingParsed=booking.parse(input,'2026-11-06');
 let supported=actual.ok && actual.action===wanted;
 if(i>=4&&i<=6)supported=bookingParsed.ok&&
   bookingParsed.action===({5:'availability',6:'booking',7:'reschedule'}[i+1]);
 if(i===9||i===10)supported=conversation.start(input).ok;
 if(i===3)supported=p0Extended; // surname-only customer creation needs a second full-name turn
 if(wanted==='profit.current_month')
   supported=actual.ok && actual.action==='profit.summary' && actual.scope==='current_month_estimate';
 if(wanted==='receivables.this_month')
   supported=actual.ok && actual.action==='receivables.summary' && actual.scope==='this_month_expected';
 if(wanted==='document.search.period')
   supported=actual.ok && actual.action==='document.period' && actual.request.month==='2026-10';
 if(i===11||i===18)supported=invoiceOk; // Actual-page combined completion or approved quote flow.
 if(i===15)supported=bankOk;
 const e2e=supported&&((p0Flows.has(i+1)&&p0Ok)||(p0ExtendedFlows.has(i+1)&&p0Extended)||(bookingFlows.has(i+1)&&bookingOk)||((i===11||i===18)&&invoiceOk)||(i===15&&bankOk));
 return {no:i+1,input,wanted,actual:i===3&&p0Extended?'customer.create.full_name_confirmed':i===11&&invoiceOk?'work.complete.and.invoice.pending_then_saved':i===18&&invoiceOk?'quote.invoice.preview':i===15&&bankOk?'bank.csv.preview.and.confirmed_payment':bookingParsed.ok?bookingParsed.action:
   ((i===9||i===10)&&conversation.start(input).ok?'quote.intake':(actual.ok?actual.action:actual.code)),
   parsed:supported,e2e};
});
const count=rows.filter(x=>x.e2e).length;
console.log('BUDIL_ORIGINAL_AUDIT '+count+'/'+cases.length+' fixture E2E verified');
console.log('P0_EXTENDED '+(p0Extended?'PASS':'FAIL'));
console.log('P0_BROWSER '+(p0Ok?'PASS':'FAIL')+' BOOKING_BROWSER '+(bookingOk?'PASS':'FAIL')+' INVOICE_BROWSER '+(invoiceOk?'PASS':'FAIL')+' BANK_BROWSER '+(bankOk?'PASS':'FAIL'));
for(const r of rows)console.log(String(r.no).padStart(2,'0')+' '+
  (r.e2e?'E2E_VERIFIED':[5,6,7].includes(r.no)&&bookingOk?'LOCAL_ONLY_GOOGLE_UNSUPPORTED':r.parsed?'PARSED_ONLY':'NOT_IMPLEMENTED')+' '+r.wanted+' -> '+r.actual);
console.log('BANK: selected local CSV only; online banking auto-connect unsupported. GOOGLE: live availability and writes unsupported.');
if(!p0Ok||!bookingOk||!invoiceOk||!bankOk)process.exitCode=1;

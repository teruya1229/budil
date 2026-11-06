/** Reassess the *original* 19 practical utterances, no wishful PASS. */
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const parser=runInNewContext(readFileSync('js/budil-gpt-local-commands.js','utf8')+';BudilGptLocalCommands',{Date,Intl});
const anon=runInNewContext(readFileSync('js/budil-gpt-anonymize.js','utf8')+';BudilGptAnonymize',{Date,Intl});
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
 let supported=actual.ok && actual.action===wanted;
 if(wanted==='profit.current_month')
   supported=actual.ok && actual.action==='profit.summary' && actual.scope==='current_month_estimate';
 if(wanted==='receivables.this_month')
   supported=actual.ok && actual.action==='receivables.summary' && actual.scope==='this_month_expected';
 if(wanted==='document.search.period')
   supported=actual.ok && actual.action==='document.period' && actual.request.month==='2026-10';
 return {no:i+1,input,wanted,actual:actual.ok?actual.action:actual.code,supported};
});
const count=rows.filter(x=>x.supported).length;
console.log('BUDIL_ORIGINAL_AUDIT '+count+'/'+cases.length+' supported');
for(const r of rows)console.log(String(r.no).padStart(2,'0')+' '+(r.supported?'PASS':'NOT_IMPLEMENTED')+' '+r.wanted+' -> '+r.actual);
if(count<10)process.exitCode=1;

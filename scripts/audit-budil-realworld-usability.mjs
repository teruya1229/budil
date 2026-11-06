/**
 * Independent product usability audit. Do NOT convert failures to "PASS".
 * All names in cases are fictional. Report is evidence, not release approval.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {join} from 'node:path';
const parser=runInNewContext(readFileSync('js/budil-gpt-local-commands.js','utf8')+'\nBudilGptLocalCommands',{Date,Intl});
const anonymizer=runInNewContext(readFileSync('js/budil-gpt-anonymize.js','utf8')+'\nBudilGptAnonymize',{Date,Intl});
const cases=[
 {category:'顧客',label:'正確な氏名で探す',input:'田中太郎さんを探して',wanted:'customer.search'},
 {category:'顧客',label:'姓だけで探す',input:'田中さんを探して',wanted:'customer.search'},
 {category:'顧客',label:'呼び捨てで探す',input:'田中太郎を探して',wanted:'customer.search'},
 {category:'顧客',label:'新規顧客を登録',input:'田中さんを新規顧客として登録して',wanted:'customer.create'},
 {category:'予約',label:'空き状況を聞く',input:'金曜日の午前10時、空いてる？',wanted:'calendar.availability'},
 {category:'予約',label:'予約と見積をまとめて依頼',input:'金曜日の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って',wanted:'booking.and.quote'},
 {category:'予約',label:'予定を変更',input:'田中さんの予約を土曜日に変更して',wanted:'calendar.reschedule'},
 {category:'予定',label:'作業予定を氏名検索',input:'田中太郎さんの作業予定を教えて',wanted:'work.search'},
 {category:'見積',label:'定型の見積下書き',input:'田中太郎さんのエアコン洗浄2台を税込18,000円で見積して',wanted:'quote.draft'},
 {category:'見積',label:'自然な言い回しの見積',input:'田中さん、エアコン洗浄2台で18,000円の見積お願い',wanted:'quote.draft'},
 {category:'見積',label:'価格未指定で見積を依頼',input:'田中さんのエアコン洗浄2台で見積を作って',wanted:'quote.draft'},
 {category:'請求',label:'作業完了と請求書作成',input:'田中さんの作業を完了にして請求書を作って',wanted:'work.complete.and.invoice'},
 {category:'請求',label:'既存請求書を検索',input:'田中太郎さんの請求書を探して',wanted:'document.search'},
 {category:'未入金',label:'未入金合計の確認',input:'未入金合計を教えて',wanted:'receivables.summary'},
 {category:'未入金',label:'今月の未入金一覧',input:'今月の未入金を教えて',wanted:'receivables.this_month'},
 {category:'入金',label:'入金明細の照合',input:'銀行明細と請求書を照合して',wanted:'bank.reconcile'},
 {category:'資料',label:'先月の見積書検索',input:'先月の見積書を探して',wanted:'document.search.period'},
 {category:'売上',label:'今月の利益を確認',input:'今月の利益はいくら？',wanted:'profit.current_month'},
 {category:'連続',label:'続けて作業依頼',input:'その見積を請求書にして',wanted:'context.next_step'},
];
const rows=cases.map((c,i)=>{
 const got=parser.parse(c.input,{today:'2026-11-06',anonymizer});
 return {no:i+1,category:c.category,label:c.label,desired:c.wanted,
  actual:got.ok?got.action:got.code,
  result:got.ok && got.action===c.wanted?'SUPPORTED':'UNSUPPORTED_OR_MISMATCH'
 };
});
const supported=rows.filter(x=>x.result==='SUPPORTED').length;
const summary={sampleSize:rows.length,supported,unsupported:rows.length-supported,
  weightedFinding:'These scripted requests are representative examples, not a population survey.',
  noActualDeviceVoiceTest:true,noRealCustomerDataUsed:true,
  source:'Public main Budil parser as of 2026-11-06'};
console.log('BUDIL_USABILITY_AUDIT '+JSON.stringify(summary));
for(const [i,row] of rows.entries())console.log(String(i+1).padStart(2,'0')+' '+row.result+' ['+row.category+'] '+row.label+' => '+row.actual);
const dir=process.env.BUDIL_AUDIT_DIR||'/tmp/budil-usability-audit';
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'report.json'),JSON.stringify({summary,rows},null,2));

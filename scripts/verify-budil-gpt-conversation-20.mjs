/** Twenty independent real-world Japanese utterance checks: no customer writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('js/budil-gpt-local-commands.js','utf8');
const tool=runInNewContext(source+';BudilGptLocalCommands',{Date,Intl,console});
const parse=text=>tool.parse(text,{today:'2026-11-06'});
const cases=[
  ['未入金はいくら？',true,'receivables.summary','all'],
  ['未入金の金額を教えてください。',true,'receivables.summary','all'],
  ['現在の未入金合計を確認したい',true,'receivables.summary','all'],
  ['今月の未入金はいくらですか？',true,'receivables.summary','this_month_expected'],
  ['今月の未入金額を見せてください',true,'receivables.summary','this_month_expected'],
  ['先月の見積書を探してください',true,'document.period','2026-10'],
  ['先月の見積書一覧を見せて',true,'document.period','2026-10'],
  ['今月の請求書を確認したい',true,'document.period','2026-11'],
  ['今月の見積書一覧を出して',true,'document.period','2026-11'],
  ['田中太郎さんの請求書を検索してください',true,'document.search','田中太郎'],
  ['田中太郎様の見積書を確認したい',true,'document.search','田中太郎'],
  ['田中太郎さんの作業予定を教えてください',true,'work.search','田中太郎'],
  ['田中太郎さんを探してください',true,'customer.search','田中太郎'],
  ['田中太郎さんを確認して',true,'customer.search','田中太郎'],
  ['来月の見積書を探して',false,null,null],
  ['先週の請求書を検索して',false,null,null],
  ['未入金はいくら？ 銀行と照合して',false,null,null],
  ['田中太郎さんを削除して',false,null,null],
  ['未入金を入金済みにして',false,null,null],
  ['田中太郎さんの秘密メモを確認して',false,null,null],
];
let passed=0;
for(let i=0;i<cases.length;i++){
 const [input,ok,action,scope]=cases[i];
 const r=parse(input);
 assert.equal(r.ok,ok,'case '+(i+1)+' '+input);
 if(ok){
   assert.equal(r.action,action,'case '+(i+1)+' action');
   assert.equal(r.networkUsed,false,'case '+(i+1)+' offline');
   assert.equal(r.readOnly,true,'case '+(i+1)+' read');
   if(action==='receivables.summary')assert.equal(r.scope,scope);
   if(action==='document.period')assert.equal(r.request.month,scope);
   if(action==='customer.search'||action==='document.search'||action==='work.search')
     assert.equal(r.request.query,scope);
 }
 passed++;console.log('PASS scenario '+(i+1));
}
console.log('BUDIL_CONVERSATION_SCENARIOS '+passed+'/20 PASS');

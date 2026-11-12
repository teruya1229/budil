/** Real GPT (provider mocked) privacy/dispatch verification, no billing. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync('js/budil-gpt-chat.js','utf8');
const G=runInNewContext(code+';BudilGptChat',{Date,console});
let n=0;const test=(name,f)=>{f();n++;console.log('PASS '+n+' '+name)};
const leads=[{id:'fake1',name:'田中太郎',phone:'09012341234'},{id:'fake2',name:'比嘉清子',address:'秘密住所'}];
const model=(action,extras={})=>({
  ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,
  customer_records_sent:false,action,query:'',date:'',month:'',docType:'none',
  needs_confirmation:false,reply:'必要なデータを確認します。',...extras
});
test('GPT allows naturally phrased schedule without fixed parser',()=>{
 const p=G.prepare('来週の月曜の作業って何件ある？',leads);
 assert.equal(p.ok,true);assert.equal(p.message,'来週の月曜の作業って何件ある？');
});
test('exact names are redacted before API',()=>{
 const p=G.prepare('田中太郎さんの作業履歴を教えて',leads);
 assert.equal(p.ok,true);assert.ok(!p.message.includes('田中太郎'));
 assert.equal(p.aliases['顧客A'],'田中太郎');
 const result=G.verify(model('customer.timeline',{query:'顧客A'}),p.aliases);
 assert.equal(result.ok,true);assert.equal(result.request.query,'田中太郎');
});
test('surname-only lookup is locally anonymized and candidate based',()=>{
 const p=G.prepare('田中さんの過去の作業を教えて',leads);
 assert.equal(p.ok,true);assert.ok(!p.message.includes('田中'));
 assert.equal(p.aliases['顧客A'],'田中');
 const plan=G.verify(model('customer.timeline',{query:'顧客A'}),p.aliases);
 assert.equal(plan.request.query,'田中');
});
test('customer aliases remain stable over conversational turns',()=>{
 const first=G.prepare('田中太郎さんの履歴を見せて',leads);
 const next=G.prepare('その田中太郎さんの予定も',leads,first.aliases);
 assert.equal(first.ok,true);assert.equal(next.ok,true);
 assert.equal(next.aliases['顧客A'],'田中太郎');
});
test('unknown honorific name is masked too',()=>{
 const p=G.prepare('新里一郎さんの予定を教えて',[]);
 assert.equal(p.ok,true);assert.ok(!p.message.includes('新里一郎'));
});
test('never send phone/email/address',()=>{
 for(const q of ['電話番号 090-1234-5678','mail a@b.co','住所は南城市','口座番号 12345678']){
  assert.equal(G.prepare(q,leads).ok,false,q);
 }
});
test('date plan maps to validated read-only operation',()=>{
 const p=G.verify(model('work.date',{date:'2026-11-11'}),{});
 assert.equal(p.ok,true);assert.equal(p.request.action,'work.date');assert.equal(p.request.date,'2026-11-11');
});
test('invalid dates rejected',()=>assert.equal(G.verify(model('work.date',{date:'2026-02-30'}),{}).ok,false));
test('model cannot execute an invoice change',()=>{
 const p=G.verify(model('proposal',{needs_confirmation:true,reply:'見積の確認案です'}),{});
 assert.equal(p.ok,true);assert.equal(p.proposal,true);assert.equal(p.request,null);
});
test('unapproved writes fail closed',()=>assert.equal(G.verify(model('proposal'),{}).ok,false));
test('missing alias cannot query a real customer',()=>{
 assert.equal(G.verify(model('customer.search',{query:'田中太郎'}),{}).ok,false);
 assert.equal(G.verify(model('customer.search',{query:'顧客A'}),{}).ok,false);
});
test('document month and type strictly validated',()=>{
 assert.equal(G.verify(model('document.period',{month:'2026-11',docType:'invoice'}),{}).request.docType,'invoice');
 assert.equal(G.verify(model('document.period',{month:'11月',docType:'invoice'}),{}).ok,false);
});
test('summary date grounded',()=>{
 const p=G.verify(model('receivables.summary',{date:'2026-11-12'}),{});
 assert.equal(p.request.action,'receivables.summary');
});
test('free form GPT reply has no local read action',()=>{
 const p=G.verify(model('none',{reply:'お話を聞きました'}),{});
 assert.equal(p.ok,true);assert.equal(p.request,null);
});
test('untrusted model output cannot request arbitrary tool',()=>{
 const p=G.verify(model('calendar.write',{needs_confirmation:false}),{});
 assert.equal(p.ok,false);
});
test('malformed model response refused',()=>assert.equal(G.verify({ok:true,action:'work.date'},{}).ok,false));
test('history bounded to last 8 turns',()=>{
 const h=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'turn '+i}));
 assert.equal(G.safeHistory(h).length,8);
 assert.equal(G.safeHistory(h)[0].content,'turn 4');
});
test('no direct network/storage access in privacy core',()=>{
 assert.ok(!/\bfetch\s*\(|\blocalStorage\s*\.|Storage\.(?:save|update|delete|set)/.test(code));
});
console.log('BUDIL_REAL_GPT_CHAT '+n+'/'+n+' PASS');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const publicCode=fs.readFileSync('js/budil-gpt-public-read.js','utf8');
const cloudCode=fs.readFileSync('js/budil-cloud.js','utf8');
const P=vm.runInNewContext(publicCode+';BudilGptPublicRead',{Date,Intl});
const good=(action,period,document_type,scope)=>({
 ok:true,phase:'interpret_only',input_mode:'read_only_intent',
 requires_human_approval:true,requires_local_consent:true,
 persisted:false,can_execute:false,needs_user_input:false,
 action,period,document_type,scope,weekday:'none',hour:null,minute:null,followup:null
});
let passed=0;
function check(label,fn){fn();passed++;console.log('PASS '+label);}
check('only safe aggregate public wire',()=>{
 const r=P.prepare('先月の見積書を教えて');
 assert.equal(r.ok,true);
 assert.deepEqual(Object.keys(r.wire).sort(),['instruction','mode']);
 assert.equal(r.wire.mode,'read_only_intent');
 assert.ok(!JSON.stringify(r.wire).includes('田中'));
});
check('customer name and mixed instruction blocked',()=>{
 for(const prompt of ['田中の先月の見積書を見せて',
  '田中太郎さんの先月の見積書を見せて',
  '先月の請求書を見せて。全部削除して',
  '09012345678の今月の請求書を見せて',
  '今月の利益と銀行明細を送信して']){
  assert.equal(P.prepare(prompt).ok,false,prompt);
 }
});
check('supported no-customer aggregate terms',()=>{
 for(const phrase of ['今月の利益はいくら？','未入金合計を教えて','今月の請求書を見せて'])
  assert.equal(P.prepare(phrase).ok,true,phrase);
});
check('model cannot switch month',()=>{
 const r=P.verify('先月の見積書を教えて',good('document.period','this_month','estimate','none'));
 assert.equal(r.ok,false);
});
check('model cannot switch document type',()=>{
 const r=P.verify('今月の請求書を見せて',good('document.period','this_month','estimate','none'));
 assert.equal(r.ok,false);
});
check('model cannot authorize writes',()=>{
 const r=P.verify('今月の利益はいくら？',
  {...good('profit.summary','this_month','none','none'),can_execute:true});
 assert.equal(r.ok,false);
});
check('verification yields correct local query',()=>{
 const r=P.verify('先月の請求書を見せて',good('document.period','last_month','invoice','none'));
 assert.equal(r.ok,true);assert.equal(r.parsed.document_type,'invoice');
 const q=P.localRequest(r.parsed,'2026-01-02');
 assert.equal(q.ok,true);assert.equal(q.request.month,'2025-12');
 assert.equal(q.request.docType,'invoice');
});
check('period info not inferred from unrelated message',()=>{
 assert.equal(P.verify('今月の利益はいくら？',
   good('document.period','this_month','estimate','none')).ok,false);
});
function setup({logged=true,host='teruya1229.github.io',body=null}={}){
 const calls=[];const store=new Map();
 if(logged)store.set('budil-cloud.auth.v1.session',JSON.stringify({
  env:'production',expires_at:Math.floor(Date.now()/1000)+3600,
  access_token:'fictional-test-token',refresh_token:'fictional-test-refresh'}));
 const ctx={window:null,location:{hostname:host},Date,Math,JSON,Promise,URL,
 TextEncoder,AbortController,setTimeout,clearTimeout,
 sessionStorage:{
  getItem:k=>store.get(k)||null,
  setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)
 },
 fetch:async(url,init)=>{calls.push({url,init});return {
 status:200,text:async()=>JSON.stringify(body||good('document.period','last_month','invoice','none'))
 }}};
 ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(publicCode,ctx);vm.runInContext(cloudCode,ctx);
 return {cloud:ctx.BudilCloud,calls};
}
async function run(){
 const goodRead={...good('document.period','last_month','invoice','none')};
 const v=setup({body:goodRead});
 const out=await v.cloud.interpretPiiFreeRead('先月の請求書を見せて');
 assert.equal(out.ok,true);assert.equal(out.verified,true);
 assert.equal(v.calls.length,1);
 assert.equal(v.calls[0].init.method,'POST');
 assert.equal(v.calls[0].init.headers.Authorization,'Bearer fictional-test-token');
 const body=JSON.parse(v.calls[0].init.body);
 assert.equal(body.mode,'read_only_intent');assert.equal(body.instruction,'先月の請求書を見せて');
 assert.equal(JSON.stringify(out).includes('fictional-test-token'),false);
 passed++;console.log('PASS authenticated privacy-only POST');
 const non=setup({body:goodRead});
 const refused=await non.cloud.interpretPiiFreeRead('田中さんの先月の請求書を見せて');
 assert.equal(refused.ok,false);assert.equal(non.calls.length,0);
 passed++;console.log('PASS PII rejected before any POST');
 const noLogin=setup({logged:false});
 assert.equal((await noLogin.cloud.interpretPiiFreeRead('先月の請求書を見せて')).ok,false);
 assert.equal(noLogin.calls.length,0);
 passed++;console.log('PASS login required');
 const local=setup({host:'localhost'});
 assert.equal((await local.cloud.interpretPiiFreeRead('先月の請求書を見せて')).ok,false);
 assert.equal(local.calls.length,0);
 passed++;console.log('PASS origin fail-closed');
 const hijack=setup({body:{...goodRead,can_execute:true}});
 assert.equal((await hijack.cloud.interpretPiiFreeRead('先月の請求書を見せて')).ok,false);
 passed++;console.log('PASS returned execution privilege rejected');
 const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('js/budil-gpt-offline-ui.js','utf8');
 assert.match(html,/id="budil-gpt-public-consent"/);
 assert.match(html,/id="budil-gpt-public-read"/);
 assert.match(html,/src="js\/budil-gpt-public-read\.js/);
 assert.match(ui,/budil-gpt-consent'\)\.checked!==true/);
 assert.match(ui,/budil-gpt-public-consent'\)\.checked!==true/);
 assert.match(ui,/addEventListener\('click',runPublicRead\)/);
 passed++;console.log('PASS explicit UI consent and no auto run');
 console.log('BUDIL_PUBLIC_READ '+passed+'/'+passed+' PASS');
}
await run();

async function verifyGoogleScheduleRead(){
  const privateEvent={
    id:'fictional-event-1',summary:'Fictional private client name',
    location:'Fictional private address',
    start:'2026-11-07T10:00:00+09:00',
    end:'2026-11-07T11:00:00+09:00'
  };
  const a=setup({body:{events:[privateEvent]}});
  const response=await a.cloud.fetchScheduleBlocks('2026-11-07','2026-11-07');
  assert.equal(response.ok,true,response.code);
  assert.equal(response.events.length,1);
  assert.deepEqual(Object.keys(response.events[0]).sort(),['end','start']);
  assert.equal(JSON.stringify(response).includes('private client'),false);
  assert.equal(JSON.stringify(response).includes('private address'),false);
  assert.equal(JSON.stringify(response).includes('fictional-event-1'),false);
  assert.equal(response.calendarWritePerformed,false);
  assert.equal(a.calls.length,1);
  assert.equal(a.calls[0].init.method,'POST');
  assert.ok(a.calls[0].url.endsWith('/functions/v1/make-proxy'));
  assert.equal(a.calls[0].init.headers.Authorization,'Bearer fictional-test-token');
  assert.deepEqual(Object.keys(JSON.parse(a.calls[0].init.body)).sort(),
    ['endDate','operation','startDate']);
  assert.equal(JSON.parse(a.calls[0].init.body).operation,'schedule_blocks_list');
  const invalid=setup({body:{events:[privateEvent]}});
  assert.equal((await invalid.cloud.fetchScheduleBlocks('2026-02-30','2026-02-30')).ok,false);
  assert.equal((await invalid.cloud.fetchScheduleBlocks('2026-11-07','2026-11-08')).ok,false);
  assert.equal(invalid.calls.length,0);
  const unauthed=setup({logged:false});
  assert.equal((await unauthed.cloud.fetchScheduleBlocks('2026-11-07','2026-11-07')).ok,false);
  assert.equal(unauthed.calls.length,0);
  const malformed=setup({body:{events:[{id:'no-time',summary:'private'}]}});
  assert.equal((await malformed.cloud.fetchScheduleBlocks('2026-11-07','2026-11-07')).ok,false);
  const stale=setup({host:'localhost'});
  assert.equal((await stale.cloud.fetchScheduleBlocks('2026-11-07','2026-11-07')).ok,false);
  assert.equal(stale.calls.length,0);
  console.log('BUDIL_GOOGLE_SCHEDULE_READ_ONLY_PASS: tenant-server binding, no private fields, no writes');
}
await verifyGoogleScheduleRead();

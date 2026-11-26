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
test('typed customer names reach GPT without uploading stored records',()=>{
 const p=G.prepare('田中太郎さんの作業履歴を教えて',leads);
 assert.equal(p.ok,true);assert.equal(p.message,'田中太郎さんの作業履歴を教えて');
 assert.equal(Object.keys(p.aliases).length,0);
 const v=G.verify(model('customer.timeline',{query:'田中太郎'}),p.aliases,p.message);
 assert.equal(v.ok,true);assert.equal(v.request.query,'田中太郎');
 assert.equal(G.prepare('こんにちは',leads).message,'こんにちは');
});
test('unknown names and multiline invoice rows are allowed',()=>{
 const text=['架空鈴子 交換部品 2026/11/02 11200 12320',
  '架空次郎 換気扇清掃 2026/11/16 3200 3520','請求作って'].join(String.fromCharCode(10));
 const p=G.prepare(text,leads);assert.equal(p.ok,true);assert.equal(p.message,text);
 assert.equal(G.prepare('新里一郎さんの予定を教えて',[]).ok,true);
});
test('business contact details are allowed, but credential values blocked',()=>{
 for(const s of ['電話番号 090-1234-5678','mail a@b.co','住所は南城市','口座番号 12345678'])
  assert.equal(G.prepare(s,leads).ok,true,s);
 for(const s of ['APIキー: sk-proj-123456789012345','パスワード: supersecretvalue'])
  assert.equal(G.prepare(s,leads).code,'SECRET_INPUT');
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
test('a customer query must be grounded in owner-supplied text',()=>{
 assert.equal(G.verify(model('customer.search',{query:'田中太郎'}),{},'別人を探して').ok,false);
 const v=G.verify(model('customer.search',{query:'田中太郎'}),{},'田中太郎さんを探して');
 assert.equal(v.ok,true);assert.equal(v.request.query,'田中太郎');
 assert.equal(G.verify(model('customer.search',{query:'顧客A'}),{},'田中太郎さんを探して').ok,false);
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
test('server real GPT pilot is limited to MI.BCS owner only',()=>{
 const server=readFileSync('supabase/functions/budil-gpt-chat/index.ts','utf8');
 assert.match(server,/\.select\("tenant_id,role"\)/);
 assert.match(server,/\.select\("id,code"\)/);
 assert.match(server,/const ownerPilot=tenant\.code==="mi-bcs"&&memberships\[0\]\.role==="owner"/);
 assert.match(server,/ownerPilot&&Deno\.env\.get\("BUDIL_GPT_CHAT_ENABLED"\)!=="false"/);
 assert.match(server,/if\(!enabled\)return bad\(503,"chat_disabled",origin\)/);
 assert.match(server,/try_consume_tenant_operation_rate_limit/);
 assert.match(server,/max_output_tokens:700,store:false/);
});
test('schema mismatch safely clarifies without repeat billing or business execution',()=>{
 const server=readFileSync('supabase/functions/budil-gpt-chat/index.ts','utf8');
 const start=server.indexOf('function safeModelClarification(v:unknown):string{');
 const end=server.indexOf('\nexport default {',start);
 assert.ok(start>=0&&end>start,'safe clarification function must exist');
 const js=server.slice(start,end).replace('v:unknown):string','v)');
 const clarify=runInNewContext(js+';safeModelClarification',{isObj:v=>v!==null&&typeof v==='object'&&!Array.isArray(v)});
 assert.ok(clarify({action:'work.date',date:''}).includes('日付'));
 assert.ok(clarify({action:'document.period',month:''}).includes('年月'));
 assert.ok(clarify({action:'customer.search',query:''}).includes('条件'));
 assert.ok(clarify({action:'proposal',needs_confirmation:false}).includes('行っていません'));
 assert.ok(clarify(null).includes('変更していません'));
 assert.ok(server.includes('if(!result){'));
 assert.ok(server.includes('reply(200,{ok:true,phase:"chat_plan_only",reply:safeModelClarification(parsed)'));
 assert.ok(server.includes('needs_confirmation:false,can_execute:false,persisted:false,'));
 assert.ok(server.includes('customer_records_sent:false,clarification_required:true'));
 assert.ok(!server.includes('if(!result)return bad(422'));
 assert.ok(server.includes('max_output_tokens:700,store:false'),'bounded single provider request');
 assert.equal((server.match(/await fetch\("https:\/\/api\.openai\.com\/v1\/responses"/g)||[]).length,1);
});

test('free-form Japanese and unregistered names pass without a whitelist',()=>{
 for(const s of ['新里一郎の予定を教えて','さやかの予約を確認して',
  'ののかの予定を教えて','サトウの見積書を探して',
  '山田花子の売上は？','佐々木商会の入金を確認して','君は何が出来る？']){
  const v=G.prepare(s,[]);
  assert.equal(v.ok,true,s+': '+v.code);
  assert.equal(v.message,s);
 }
});
test('normal business questions remain available to natural GPT chat',()=>{
 for(const text of ['今日の予定教えて','来週の月曜の作業って何件ある？',
  '11日の作業、どれくらいある？','金曜日の午前10時、空いてる？',
  '今月の未入金合計は？','じゃあその予定を変更したい',
  '会話復元を試したい','こんにちは']){
  const result=G.prepare(text,[]);
  assert.equal(result.ok,true,text+': '+result.code);
 }
});
test('browser and Edge allow owner data while retaining authentication and write boundaries',()=>{
 const server=readFileSync('supabase/functions/budil-gpt-chat/index.ts','utf8');
 assert.equal(code.includes('APPROVED_OUTBOUND_TERMS'),false);
 assert.equal(server.includes('APPROVED_OUTBOUND_TERMS'),false);
 assert.match(server,/secret_input_rejected/);
 assert.match(server,/const ownerPilot=/);
 assert.match(server,/customer_records_sent:false/);
 assert.match(server,/store:false/);
 assert.equal(G.approvedOutbound('架空太郎さんの請求 2026/11/02 13200円'),true);
 assert.equal(G.approvedOutbound('パスワード: secretpassword123'),false);
 const html=readFileSync('index.html','utf8');
 assert.match(html,/id="budil-gpt-input"[^>]*maxlength="4000"/);
 assert.match(html,/入力した氏名・会社名・住所・電話・金額/);
});

// Google read-only windows are verified locally, never sent to GPT.
const busy=(events,date='2026-11-13')=>G.summarizeCalendarRead({
 ok:true,readOnly:true,calendarWritePerformed:false,events},date);
test('Google time windows are calendar-bound and do not confirm free time',()=>{
 const r=busy([{start:'2026-11-13T09:00:00+09:00',end:'2026-11-13T11:30:00+09:00'}]);
 assert.equal(r.ok,true);assert.equal(r.busySlotCount,1);
 assert.equal(r.windows[0].start,'09:00');assert.equal(r.windows[0].end,'11:30');
 assert.equal(r.confirmedFree,false);assert.equal(r.writePerformed,false);
});
test('overlapping and adjacent calendar events merge without duplicate busy ranges',()=>{
 const r=busy([{start:'2026-11-13T09:00:00+09:00',end:'2026-11-13T10:00:00+09:00'},
 {start:'2026-11-13T09:30:00+09:00',end:'2026-11-13T11:00:00+09:00'},
 {start:'2026-11-13T11:00:00+09:00',end:'2026-11-13T12:00:00+09:00'}]);
 assert.equal(r.busyEventCount,3);assert.equal(r.busySlotCount,1);
 assert.equal(r.windows[0].start,'09:00');assert.equal(r.windows[0].end,'12:00');
});
test('empty calendar result never proves a free day',()=>{
 const r=busy([]);
 assert.equal(r.ok,true);assert.equal(r.busySlotCount,0);assert.equal(r.confirmedFree,false);
});
test('all-day Google events use exclusive end and show 00:00 to 24:00',()=>{
 const r=busy([{start:'2026-11-13',end:'2026-11-14'}]);
 assert.equal(r.ok,true);assert.equal(r.windows[0].start,'00:00');
 assert.equal(r.windows[0].end,'24:00');
});
test('Google midnight-spanning events are clipped to requested JST date',()=>{
 const r=busy([{start:'2026-11-12T23:00:00+09:00',end:'2026-11-13T01:30:00+09:00'}]);
 assert.equal(r.ok,true);assert.equal(r.windows[0].start,'00:00');
 assert.equal(r.windows[0].end,'01:30');
});
test('Google UTC timestamps display JST',()=>{
 const r=busy([{start:'2026-11-13T00:30:00Z',end:'2026-11-13T02:00:00Z'}]);
 assert.equal(r.ok,true);assert.equal(r.windows[0].start,'09:30');
 assert.equal(r.windows[0].end,'11:00');
});
test('out-of-day Google events cannot inflate selected date',()=>{
 const r=busy([{start:'2026-11-12T08:00:00+09:00',end:'2026-11-12T09:00:00+09:00'}]);
 assert.equal(r.ok,true);assert.equal(r.busySlotCount,0);
});
test('invalid and inverted event boundaries fail closed',()=>{
 for(const input of [
 {start:'2026-11-13T14:00:00+09:00',end:'2026-11-13T12:00:00+09:00'},
 {start:'not-time',end:'2026-11-13T12:00:00+09:00'},
 {start:'2026-11-13T10:00:00+09:00',end:'invalid'},
 {start:'2026-02-30',end:'2026-03-01'}
 ])assert.equal(busy([input]).ok,false);
});
test('failed, unsigned and write-capable responses are never trusted',()=>{
 for(const b of [{ok:false,readOnly:true,calendarWritePerformed:false,events:[]},
 {ok:true,readOnly:false,calendarWritePerformed:false,events:[]},
 {ok:true,readOnly:true,calendarWritePerformed:true,events:[]},
 {ok:true,readOnly:true,calendarWritePerformed:false,events:'bad'}])
 assert.equal(G.summarizeCalendarRead(b,'2026-11-13').ok,false);
});
test('oversized Google responses fail closed',()=>{
 assert.equal(busy(Array.from({length:1001},()=>({start:'2026-11-13',end:'2026-11-14'}))).ok,false);
});
test('Google event PII is never included in the safe summary',()=>{
 const r=busy([{start:'2026-11-13T09:00:00+09:00',end:'2026-11-13T10:00:00+09:00',
 summary:'架空顧客ABC',description:'電話090-1234-5678',location:'個人宅',calendarId:'private'}]);
 assert.equal(r.ok,true);
 for(const secret of ['架空顧客ABC','090-1234-5678','個人宅','private'])
  assert.equal(JSON.stringify(r).includes(secret),false);
});
test('calendar slots show only 12 intervals and retain count',()=>{
 const events=Array.from({length:24},(_,i)=>{
   const hour=String(i).padStart(2,'0');
   const end=String(i+1).padStart(2,'0');
   return {start:'2026-11-13T'+hour+':00:00+09:00',end:'2026-11-13T'+hour+':30:00+09:00'};
 });
 const r=busy(events);assert.equal(r.ok,true);
 assert.equal(r.busySlotCount,24);assert.equal(r.windows.length,12);
 assert.equal(r.hasMore,true);
});
test('PC-local fallback allowed only on cloud service credential failure',()=>{
 for(const code of ['secret_invalid','secret_not_configured','token_exchange_failed'])
   assert.equal(G.shouldUseLocalCalendarFallback({ok:false,code}),true,code);
});
test('login, owner denial, network or unrelated failures cannot bypass to PC worker',()=>{
 for(const code of ['not_signed_in','unauthorized','forbidden','calendar_binding_denied',
   'tenant_not_found','network_error','fixture_google_unavailable'])
   assert.equal(G.shouldUseLocalCalendarFallback({ok:false,code}),false,code);
 assert.equal(G.shouldUseLocalCalendarFallback({ok:true,code:'secret_invalid'}),false);
 assert.equal(G.shouldUseLocalCalendarFallback(null),false);
});
test('PC Google busy read retains source and does not include private event data',()=>{
 const response={ok:true,readOnly:true,calendarWritePerformed:false,source:'pc_local_calendar',
   events:[{start:'2026-11-13T09:00:00+09:00',end:'2026-11-13T10:30:00+09:00',
            summary:'架空氏名',location:'非公開現場住所'}]};
 const v=G.summarizeCalendarRead(response,'2026-11-13');
 assert.equal(v.ok,true);assert.equal(v.source,'pc_local_calendar');
 assert.equal(v.windows[0].start,'09:00');assert.equal(v.windows[0].end,'10:30');
 assert.equal(v.writePerformed,false);assert.equal(v.confirmedFree,false);
 assert.equal(JSON.stringify(v).includes('架空氏名'),false);
 assert.equal(JSON.stringify(v).includes('非公開現場住所'),false);
});
test('PC invalid payload cannot be used as calendar evidence',()=>{
 const invalid=G.summarizeCalendarRead({ok:true,readOnly:true,
   calendarWritePerformed:true,source:'pc_local_calendar',events:[]},'2026-11-13');
 assert.equal(invalid.ok,false);
});
console.log('BUDIL_REAL_GPT_CHAT '+n+'/'+n+' PASS');

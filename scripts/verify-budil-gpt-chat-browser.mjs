/** Standalone fake-data E2E. Disposable Chrome, no authenticated profiles. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,existsSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const profile=mkdtempSync(join(tmpdir(),'budil-real-gpt-chat-'));
const chromePath=[process.env.CHROME_BIN,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x));
if(!chromePath)throw Error('CHROME_NOT_FOUND');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+(process.platform==='win32'?'\\':'/'))||!existsSync(file)||!statSync(file).isFile()){
   res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(file));
 }catch{res.writeHead(500);res.end();}
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--no-sandbox','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let port;
 for(let i=0;i<300;i++){
  try{
   const txt=readFileSync(join(profile,'DevToolsActivePort'),'utf8');
   port=Number(txt.split(/\r?\n/)[0]);if(port)break;
  }catch(e){if(!['ENOENT','EBUSY','EACCES','EPERM'].includes(e.code))throw e;}
  if(chrome.exitCode!==null)throw Error('CHROME_EXITED');
  await sleep(100);
 }
 if(!port)throw Error('CHROME_TIMEOUT');
 const tabs=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true});});
 let seq=0;const pending=new Map();
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);const p=pending.get(m.id);if(!p)return;
  pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});
 });
 const cmd=(method,params={})=>new Promise((ok,fail)=>{
  const id=++seq;pending.set(id,{resolve:ok,reject:fail});ws.send(JSON.stringify({id,method,params}));
 });
 const ev=async expression=>{
  const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('RUNTIME_EVAL '+r.exceptionDetails.text);
  return r.result?.value;
 };
 await cmd('Page.enable');await cmd('Runtime.enable');
 for(const width of [390,320]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
  await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
  await sleep(150);
  for(let i=0;i<160;i++){
   if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;
   await sleep(100);
  }
  assert.equal(await ev('document.readyState'),'complete');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  // Consent is intentionally persistent. Clear it BEFORE a reload so each
  // viewport independently verifies the first-time experience.
  await ev("localStorage.removeItem('budil-gpt.chat-consent.v1');location.reload()");
  await sleep(200);
  for(let i=0;i<160;i++){
   if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;
   await sleep(100);
  }
  assert.equal(await ev('document.readyState'),'complete');
  await ev("localStorage.setItem('budil_work_orders',JSON.stringify([{id:'fake-w1',customerName:'架空一郎',scheduledDate:'2026-11-11',startTime:'09:00',status:'confirmed'},{id:'fake-w2',customerName:'架空二郎',scheduledDate:'2026-11-11',status:'planned'},{id:'fake-w3',customerName:'別日',scheduledDate:'2026-11-12',status:'planned'}]));document.getElementById('budil-gpt-open').click()");
  await ev("window.__dateReads=0;window.__dateNetwork=0;window.__dateWrites=0;const oldWorkRead=Storage.getWorkOrders;Storage.getWorkOrders=function(){window.__dateReads++;return oldWorkRead.apply(this,arguments)};const oldFetch=window.fetch;window.fetch=function(){window.__dateNetwork++;return oldFetch.apply(this,arguments)}");
  await ev("document.getElementById('budil-gpt-input').value='2026-11-11の予定教えて';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev('window.__dateReads'),0,'consent gate before local reads');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  const result=await ev("document.getElementById('budil-gpt-result').textContent");
  assert.ok(result.includes('2026-11-11'),'date shown');
  assert.ok(result.includes('架空一郎')&&result.includes('架空二郎'),'two matching records shown');
  assert.ok(!result.includes('別日'),'other dates excluded');
  assert.ok(result.includes('未照合'),'Google not claimed');
  assert.equal(await ev('window.__dateNetwork'),0,'no external network activity after click');
  assert.equal(await ev('window.__dateReads'),1,'one consented local read');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='2026-11-10の予定教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('空き確定ではありません')"),true);
  console.log('PASS '+width+'px: consent, two fictional appointments, no Google/extra reads, no overflow, unknown availability');

  // Real regression: a fresh tab has no BudilCloud session, even when
  // another Chrome tab is already authenticated. It must not send GPT data.
  await ev("window.__qaSignedIn=false;window.__qaSessionScope='staging:00000000-0000-0000-0000-000000000001';BudilCloud.getGptSessionScope=()=>window.__qaSignedIn?window.__qaSessionScope:'';window.__qaLoginCalls=0;BudilCloud.getAuthState=()=>({available:true,signedIn:window.__qaSignedIn});BudilCloud.login=async function(email,pwd){window.__qaLoginCalls++;if(email==='qa@example.invalid'&&pwd==='fixture-password'){window.__qaSignedIn=true;return {ok:true}}return {ok:false,message:'invalid_credentials'}};BudilCloud.getGptChatReadiness=async()=>({ok:true,ready:true})");
  await ev("document.getElementById('budil-gpt-input').value='こんにちは';document.getElementById('budil-gpt-consent').checked=false;document.getElementById('budil-gpt-chat-consent').checked=false;document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-auth').hidden"),false,
    'missing auth reveals login form in the GPT dialog');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('ログイン')"),true,
    'auth error explains next action, never opaque not_signed_in');
  assert.equal(await ev('window.__dateNetwork'),0,'unauthenticated request cannot reach provider');
  await ev("document.getElementById('budil-gpt-chat-email').value='qa@example.invalid';document.getElementById('budil-gpt-chat-password').value='fixture-password';document.getElementById('budil-gpt-chat-login').click()");
  for(let i=0;i<30;i++){
   if(await ev("document.getElementById('budil-gpt-chat-auth').hidden"))break;
   await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-auth').hidden"),true,
    'successful same-tab Budil login closes auth form');
  assert.equal(await ev('window.__qaLoginCalls'),1,'exactly one login attempt');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-password').value"),'',
    'no password retained after login');
  for(let i=0;i<30;i++){
   if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('接続準備')"))break;
   await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('接続準備')"),true,
    'readiness after login is automatically checked without a paid POST');
  await ev("document.getElementById('budil-gpt-input').value='今日は何？';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('①')"),true,
    'missing consent after login shows both explicit required checks');
  assert.equal(await ev('window.__dateNetwork'),0,'no paid network call from missing consent');

  // Never call live Google or paid GPT in this disposable browser fixture.
  await ev("window.__googleCalls=0;BudilCloud.fetchScheduleBlocks=async function(date,end){window.__googleCalls++;window.__lastGoogleDates=[date,end];return {ok:false,code:'fixture_google_unavailable'}}");
  // Real GPT path: mock ONLY the external provider response. Exercise the
  // actual Budil UI and actual local-read gateway, without API billing.
  await ev("window.__chatCalls=0;BudilCloud.sendGptChat=async function(msg,history,today){window.__chatCalls++;window.__sentChatMsg=msg;return {ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'11月11日の予定を確認しますね。どの作業内容や顧客に関連する予定をお知りになりたいですか？',action:'work.date',query:'',date:'2026-11-11',month:'',docType:'none',needs_confirmation:false}}");
  await ev("document.getElementById('budil-gpt-input').value='11日の作業、どれくらいある？';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev('window.__chatCalls'),0,'chat requires two consents');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('架空二郎')"))break;
    await sleep(100);
  }
  const chatText=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(chatText.includes('架空一郎')&&chatText.includes('架空二郎'),'GPT tool plan displays actual local fixture');
  assert.ok(!chatText.includes('別日'),'GPT tool results are date scoped');
  assert.ok(chatText.includes('未照合'),'Google calendar is not assumed free');
  assert.ok(chatText.includes('この端末に登録された作業予定は2件です'),'verified count is presented as the answer');
  assert.ok(!chatText.includes('どの作業内容や顧客'),'pre-read model follow-up must not override a successful local read');
  assert.equal(await ev('window.__chatCalls'),1,'exactly one mocked GPT call');
  assert.equal(await ev('window.__googleCalls'),1,'exactly one consented Google read attempt for work.date');
  assert.equal(await ev("window.__lastGoogleDates.join(',')"),'2026-11-11,2026-11-11','server reads selected date only');
  assert.equal(await ev('window.__dateNetwork'),0,'mocked GPT and local read cause no external requests');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  await ev("document.getElementById('budil-gpt-input').value='新里一郎の予約を確認して';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev('window.__chatCalls'),1,'unknown personal name must be blocked before provider');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('外部AIへ送信しません')"),true,
    'privacy guard must explain no external send');
  // A second natural-language turn must retain sanitized context. The model
  // can propose a change, but it can never write it directly.
  await ev("BudilCloud.sendGptChat=async function(msg,history,today){window.__chatCalls++;window.__historyLength=history.length;window.__historyAssistant=history[1]?.content||'';return {ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'予約変更案を確認してください。まだ保存しません。',action:'proposal',query:'',date:'',month:'',docType:'none',needs_confirmation:true}}");
  await ev("document.getElementById('budil-gpt-input').value='じゃあその予定を変更したい';document.getElementById('budil-gpt-chat-consent').checked=false;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('予約変更案を確認')"))break;
    await sleep(100);
  }
  assert.equal(await ev('window.__chatCalls'),2,'two actual chat interactions');
  assert.equal(await ev('window.__historyLength'),2,'conversation context is carried into turn two');
  assert.equal(await ev("localStorage.getItem('budil-gpt.chat-consent.v1')"),'accepted',
    'first consent is persisted for normal later GPT turns');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-consent-panel').hidden"),true,
    'consent panel stays out of the way after first acceptance');
  assert.equal(await ev("window.__historyAssistant.includes('どの作業内容や顧客')"),false,
    'unfounded model question is excluded from subsequent GPT history');
  assert.equal(await ev("window.__historyAssistant.includes('work.date')"),true,
    'the safe local-read context remains available to the next turn');
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('予約・帳票・顧客データは変更していません'));
  assert.equal(await ev('window.__dateNetwork'),0,'no network after mocked proposal');
  assert.equal(await ev('window.__googleCalls'),1,'calendar is not queried for a proposal');

  // Real chat UI must combine the LOCAL work orders and authenticated Google
  // busy windows without sending private event titles to the GPT provider.
  await ev("BudilCloud.fetchScheduleBlocks=async function(date,end){window.__googleCalls++;return {ok:true,readOnly:true,calendarWritePerformed:false,events:[{start:'2026-11-11T09:00:00+09:00',end:'2026-11-11T10:00:00+09:00',summary:'private_fixture_title'},{start:'2026-11-11T09:30:00+09:00',end:'2026-11-11T11:30:00+09:00'}]}};BudilCloud.sendGptChat=async function(){window.__chatCalls++;return {ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'予定を確認します。',action:'work.date',query:'',date:'2026-11-11',month:'',docType:'none',needs_confirmation:false}};document.getElementById('budil-gpt-input').value='11/11の予定を教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<80;i++){
   if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('忙しい時間枠は1枠')"))break;
   await sleep(100);
  }
  const mergedHistory=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(mergedHistory.includes('架空一郎')&&mergedHistory.includes('架空二郎'),'local work records retained');
  assert.ok(mergedHistory.includes('09:00〜11:30')&&mergedHistory.includes('忙しい時間枠は1枠'),'overlapping Google windows merged in real UI');
  assert.ok(!mergedHistory.includes('private_fixture_title'),'Google private title not rendered');
  assert.ok(mergedHistory.includes('空き確定ではありません'),'never claim unverified availability');
  assert.equal(await ev('window.__googleCalls'),2,'one Google read for each work-date consent');
  assert.equal(await ev('window.__dateNetwork'),0,'all provider and Google fixture responses intercepted');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true,'no Google busy UI mobile overflow');
  console.log('PASS '+width+'px: real chat UI combines work orders with private-safe Google busy windows');

  // Actual root cause from real owner session: cloud schedule_blocks_list
  // returns secret_invalid, but existing PC-local READ works.
  await ev("document.getElementById('budil-gpt-chat-clear').click();window.__pcCalls=0;BudilCloud.fetchScheduleBlocks=async()=>({ok:false,code:'secret_invalid'});BudilCloud.fetchLocalScheduleBlocks=async(date,end)=>{window.__pcCalls++;return {ok:true,readOnly:true,calendarWritePerformed:false,source:'pc_local_calendar',events:[{start:'2026-11-11T09:00:00+09:00',end:'2026-11-11T10:30:00+09:00',summary:'秘密の予定名'}]}};document.getElementById('budil-gpt-input').value='11/11の予定';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<75;i++){
    if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('PCローカル連携で取得')"))break;
    await sleep(100);
  }
  const pcHistory=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(pcHistory.includes('PCローカル連携で取得したGoogleカレンダー'),'real UI clearly labels PC fallback');
  assert.ok(pcHistory.includes('09:00〜10:30')&&pcHistory.includes('架空一郎'),
    'local-only Google time window and Budil work orders combined');
  assert.ok(!pcHistory.includes('秘密の予定名'),'Google private event summary never rendered');
  assert.equal(await ev('window.__pcCalls'),1,'one and only one fallback read');
  assert.equal(await ev('window.__dateNetwork'),0,'no real external requests on cloud-failure fixture');

  // User auth failures MUST NOT trigger a PC-local fallback.
  await ev("document.getElementById('budil-gpt-chat-clear').click();BudilCloud.fetchScheduleBlocks=async()=>({ok:false,code:'unauthorized'});document.getElementById('budil-gpt-input').value='11/11の予定';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<75;i++){
    if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('Googleカレンダーは未照合')"))break;
    await sleep(100);
  }
  assert.equal(await ev('window.__pcCalls'),1,'auth failure never bypasses to local worker');
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('空き確定ではありません'),
    'denied Google read never claims availability');
  console.log('PASS '+width+'px: real UI fallback for secret_invalid and strict auth-denied no-fallback');

  // If Budil local storage fails, do NOT say that both sources were checked
  // just because Google returned a valid busy window.
  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getWorkOrders=()=>{throw new Error('FAKE_LOCAL_READ_FAILURE')};BudilCloud.fetchScheduleBlocks=async()=>({ok:true,readOnly:true,calendarWritePerformed:false,events:[{start:'2026-11-11T09:00:00+09:00',end:'2026-11-11T10:00:00+09:00'}]});BudilCloud.sendGptChat=async()=>({ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'確認します',action:'work.date',query:'',date:'2026-11-11',month:'',docType:'none',needs_confirmation:false});document.getElementById('budil-gpt-input').value='11/11の予定';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<60;i++){
   if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Budil端末内データは取得できませんでした')"))break;
   await sleep(100);
  }
  const partialHistory=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(partialHistory.includes('端末内データを読み取れませんでした')&&partialHistory.includes('忙しい時間枠は1枠'),
    'local failure and Google success must both be displayed accurately');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Budil端末内データは取得できませんでした')"),true,
    'partial success cannot claim both sources checked');
  assert.equal(await ev('window.__dateNetwork'),0,'partial success never calls live services in fixture');
  await ev("BudilCloud.fetchScheduleBlocks=async function(){window.__googleCalls++;return {ok:false,code:'fixture_google_unavailable'}}");

  await ev("BudilCloud.getGptChatReadiness=async function(){return {ok:true,ready:false,enabled:false}};document.getElementById('budil-gpt-chat-readiness').click()");
  for(let i=0;i<20;i++){
    if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('サーバー設定は未準備')"))break;
    await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('サーバー設定は未準備')"),true);

  // Real screenshot regression: "today's schedule" must answer immediately
  // with the local result; it must not repeat an unfounded GPT clarification.
  // This fixture has no work orders for the requested date.
  await ev("Storage.getWorkOrders=()=>[];BudilCloud.sendGptChat=async function(msg,history,today){return {ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'今日の予定を確認しますね。どの作業内容や顧客に関連する予定をお知りになりたいですか？',action:'work.date',query:'',date:today,month:'',docType:'none',needs_confirmation:false}};document.getElementById('budil-gpt-input').value='今日の予定教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<50;i++){
   if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('作業予定は0件')"))break;
   await sleep(100);
  }
  const todayText=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(todayText.includes('今日（')&&todayText.includes('作業予定は0件です'),
   'today: actual zero-result from device with correct date');
  assert.ok(todayText.includes('Googleカレンダーは未照合'),'today: no claim of full Google calendar coverage');
  assert.ok(!todayText.includes('どの作業内容や顧客'),'today: remove pointless pre-read clarifying question');
  assert.ok(!todayText.includes('今日は予定がありません'),'zero local records does not prove empty schedule');
  assert.equal(await ev('window.document.documentElement.scrollWidth<=innerWidth+2'),true);
  // The regular GPT surface must show the same customer type, site
  // environment and activity notes as Budil's existing offline tool.
  // No customer details are fetched until the exact-ID candidate is clicked.
  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getLeads=()=>[{id:'fixture-c1',name:'架空一郎',customerTypeMajor:'A',customerTypeMinor:'F',customerMemo:'現場の天井が高い。駐車は裏口',activityLogs:[{date:'2026-11-10',title:'連絡',memo:'養生を準備'}]},{id:'fixture-c2',name:'架空二郎',customerMemo:'他人だけのメモ'}];Storage.getWorkOrders=()=>[{id:'fixture-w1',leadId:'fixture-c1',scheduledDate:'2026-11-11',serviceText:'現場点検',memo:'室外機はベランダ'},{id:'fixture-w2',leadId:'fixture-c2',scheduledDate:'2026-11-10',serviceText:'他のお客様の施工',memo:'他人の専用メモ'}];BudilCloud.sendGptChat=async()=>({ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'顧客候補を確認します',action:'customer.timeline',query:'顧客A',date:'',month:'',docType:'none',needs_confirmation:false});document.getElementById('budil-gpt-input').value='架空一郎さんの作業履歴を教えて';document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<60;i++){
   if(await ev("!!document.querySelector('#budil-gpt-chat-history button')"))break;
   await sleep(100);
  }
  assert.ok(await ev("!!document.querySelector('#budil-gpt-chat-history button')"),
   'exact-ID customer selection must be offered by GPT local read tool');
  assert.ok(!(await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('現場の天井が高い'),
   'private site memo must be hidden before exact-customer selection');
  await ev("document.querySelector('#budil-gpt-chat-history button').click()");
  const customerDetail=await ev("document.getElementById('budil-gpt-chat-history').textContent");
  assert.ok(customerDetail.includes('お客様タイプ：A：安心重視型 / F：確認安心型'),
   'customer type is rendered after exact lead selection');
  assert.ok(customerDetail.includes('現場の天井が高い')&&customerDetail.includes('室外機はベランダ')&&customerDetail.includes('養生を準備'),
   'site environment, linked work note and activity log display locally');
  assert.ok(!customerDetail.includes('他人だけのメモ')&&!customerDetail.includes('他人の専用メモ'),
   'unlinked other customer notes remain hidden');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true,
   'no overflow after private local note display');
  await ev("document.getElementById('budil-gpt-close').click()");
  assert.notEqual(await ev("document.getElementById('budil-gpt-chat-history').textContent"),'',
    'closing the GPT panel does not erase conversation history');
  await ev("document.getElementById('budil-gpt-open').click();document.getElementById('budil-gpt-chat-clear').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-history').textContent"),'');
  // If refresh failed after previously signing in, expose the login form
  // instead of the unhelpful low-level not_signed_in code.
  await ev("BudilCloud.sendGptChat=async()=>({ok:false,code:'not_signed_in'});document.getElementById('budil-gpt-input').value='こんにちは';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<30;i++){
   if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('認証が切れています')"))break;
   await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-auth').hidden"),false,
    'expired session opens recovery login without requesting customer data');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('認証が切れています')"),true);
  assert.equal(await ev('window.__dateNetwork'),0,'expired session cannot write or call external network');
  // Page reload restores ONLY anonymized conversation, not private local
  // work records, aliasMap, or Google event details. All credentials below
  // are fake values in the disposable localhost test profile.
  await ev("window.__qaSignedIn=true;BudilCloud.sendGptChat=async()=>({ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'再読込のあとも会話を続けます。',action:'none',query:'',date:'',month:'',docType:'none',needs_confirmation:false});document.getElementById('budil-gpt-input').value='会話復元を試したい';document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<40;i++){
   if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('再読込のあとも')"))break;
   await sleep(100);
  }
  assert.ok((await ev("sessionStorage.getItem('budil-gpt.safe-history.v2')||''")).includes('会話復元を試したい'),
   'safe anonymized chat persisted in current-tab sessionStorage');
  await ev("(()=>{const sub='00000000-0000-0000-0000-000000000001';const jwt='fixture.'+btoa(JSON.stringify({sub})).replace(/=/g,'')+'.signature';localStorage.setItem('budil-cloud.auth.v1.session',JSON.stringify({access_token:jwt,refresh_token:'fixture-not-a-real-refresh',expires_at:Math.floor(Date.now()/1000)+1800,env:'staging'}));location.reload()})()");
  await sleep(200);
  for(let i=0;i<160;i++){
   if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-chat-history')"))break;
   await sleep(100);
  }
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('会話復元を試したい'),
   'safe conversation restored after page reload with the same signed-in session');
  assert.ok(!(await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('架空一郎'),
   'raw customer records never restored into the GPT transcript');
  // Same-tab login to a different account immediately invalidates the old transcript.
  await ev("(()=>{const sub='00000000-0000-0000-0000-000000000002';const jwt='fixture.'+btoa(JSON.stringify({sub})).replace(/=/g,'')+'.signature';localStorage.setItem('budil-cloud.auth.v1.session',JSON.stringify({access_token:jwt,refresh_token:'fixture-not-a-real-refresh',expires_at:Math.floor(Date.now()/1000)+1800,env:'staging'}));window.dispatchEvent(new Event('budil-cloud-auth-changed'))})()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-history').textContent"),'',
    'account switch must remove old user transcript');
  assert.equal(await ev("sessionStorage.getItem('budil-gpt.safe-history.v2')"),null,
    'account switch must remove cached user A history');
  await ev("document.getElementById('budil-gpt-chat-clear').click()");
  assert.equal(await ev("sessionStorage.getItem('budil-gpt.safe-history.v2')"),null,
   'explicit reset deletes the only saved conversation cache');
  await ev("sessionStorage.setItem('budil-gpt.safe-history.v2',JSON.stringify({scope:'staging:00000000-0000-0000-0000-000000000002',savedAt:Date.now(),history:[{role:'user',content:'ログアウト前の内緒の会話'}]}));localStorage.removeItem('budil-cloud.auth.v1.session');location.reload()");
  await sleep(200);
  for(let i=0;i<160;i++){
   if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-chat-history')"))break;
   await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-history').textContent"),'',
   'signed-out reload must not reveal prior account chat');
  assert.equal(await ev("sessionStorage.getItem('budil-gpt.safe-history.v2')"),null,
   'signed-out reload destroys any stale cached chat');
  // Unified one-click local booking preparation: no paid GPT call and no
  // WorkOrder write; the user still selects customer/tax/end time and approves.
  await ev("window.__qaSignedIn=true;window.__qaSessionScope='staging:00000000-0000-0000-0000-000000000001';BudilCloud.getAuthState=()=>({available:true,signedIn:true});BudilCloud.getGptSessionScope=()=>window.__qaSessionScope;window.__previewProviderCalls=0;BudilCloud.sendGptChat=async()=>{window.__previewProviderCalls++;throw Error('GPT_PROVIDER_MUST_NOT_BE_CALLED')};Storage.getLeads=()=>[{id:'fake-preview-lead',name:'架空一郎'}];Storage.getWorkOrders=()=>[];Storage.addWorkOrder=()=>{throw Error('UNAPPROVED_WRITE')};document.getElementById('budil-gpt-clear').click()");
  await ev("document.getElementById('budil-gpt-input').value='2030年12月20日の午前10時に架空一郎さんのエアコン洗浄2台を予約して。税込18,000円で見積書も作って';document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<40;i++){
   if(await ev("document.getElementById('budil-gpt-booking').hidden===false"))break;
   await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-booking').hidden"),false,
    'known local booking grammar stages existing booking review');
  assert.equal(await ev("document.getElementById('budil-gpt-booking-fields').hidden"),false,
    'requires tax/end-time verification before a customer-specific quote');
  assert.equal(await ev("document.getElementById('budil-gpt-booking-save').hidden"),true,
    'no local booking write without explicit owner approval');
  assert.equal(await ev("window.__previewProviderCalls"),0,'no paid GPT call for supported local grammar');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('端末内の予約確認画面')"),true);
  console.log('PASS '+width+'px: strict booking prompts directly stage local review, zero GPT cost, zero writes');
  // An unfinished booking must not be silently discarded or called completed.
  await ev("document.getElementById('budil-gpt-input').value='2030年12月20日の午前11時に架空一郎さんのエアコン洗浄2台を予約して。税込18,000円で見積書も作って';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('準備は未完了')"),true,
    'conflicting second booking must not be reported as a new successful preview');
  assert.equal(await ev("window.__previewProviderCalls"),0,'failed local preview does not leak raw customer data to GPT');
  // Bank matching opens an existing import preview, not a payment write.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='銀行明細と請求書を照合して';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-bank').hidden"),false,
    'bank reconciliation opens the existing CSV preview in one conversation turn');
  assert.equal(await ev("window.__previewProviderCalls"),0,'bank preview does not spend GPT tokens');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('端末内の入金確認画面')"),true);
  console.log('PASS '+width+'px: bank import preview opens locally, no paid model or automatic write');

  // A natural quote in the same GPT input stages the existing draft; it must
  // ask the owner to choose the exact customer before it creates any PDF.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='架空一郎さんのエアコン洗浄2台を税込18000円で見積して';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-candidates').hidden"),false,
    'natural quote command stages the known customer selection');
  assert.equal(await ev("document.getElementById('budil-gpt-candidate-list').querySelectorAll('button').length"),1,
    'one explicit exact-ID candidate is shown');
  assert.equal(await ev("document.getElementById('budil-gpt-draft').hidden"),true,
    'quote is not created before the owner selects a customer');
  await ev("document.getElementById('budil-gpt-candidate-list').querySelector('button').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-draft').hidden"),false,
    'owner selection creates a local quote draft');
  assert.equal(await ev("document.getElementById('budil-gpt-draft-preview').textContent.includes('18,000')"),true,
    'existing Budil quote calculator produced the requested amount');
  assert.equal(await ev("window.__previewProviderCalls"),0,'quote drafting never transmits customer name to paid model');
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('端末内の見積確認画面')"),true);
  console.log('PASS '+width+'px: natural quote to exact-customer draft, local-only, zero provider cost');

  await ev("document.getElementById('budil-gpt-input').value='金額を税込20,000円に変更';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-draft-preview').textContent.includes('20,000')"),true,
    'natural follow-up revises the same local draft instead of creating a new quote');
  assert.equal(await ev("document.getElementById('budil-gpt-draft').hidden"),false,
    'owner approval remains required after quote revision');
  assert.equal(await ev("window.__previewProviderCalls"),0,'price revision does not incur paid provider calls');
  console.log('PASS '+width+'px: continuous natural-language amount revision, no automatic approval');

  // The calendar preview is a real browser integration using fictional local data.
  // It must never invoke the paid GPT provider or a work-order / Google WRITE.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-chat-clear').click();window.__calWrites=0;window.__calReads=0;Storage.getLeads=()=>[{id:'fake-preview-lead',name:'架空一郎',municipality:'南城市'}];Storage.getWorkOrders=()=>[];Storage.addWorkOrder=Storage.updateWorkOrder=()=>{window.__calWrites++;throw Error('WRITE_FORBIDDEN')};window.__calTomorrow=(()=>{let d=new Date(BudilGptLocalCommands.todayTokyo()+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)})();BudilCloud.fetchScheduleBlocks=async(a,b)=>{window.__calReads++;if(a!==window.__calTomorrow||b!==a)throw Error('WRONG_DAY');return {ok:true,readOnly:true,calendarWritePerformed:false,events:[{start:a+'T08:30:00+09:00',end:a+'T09:00:00+09:00'}]}}");
  await ev("document.getElementById('budil-gpt-input').value='明日の10時に架空一郎さんのエアコン洗浄を予約して';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('予約の仮確認'));
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-chat-history button').length"),1,'owner must select exact customer');
  await ev("document.querySelector('#budil-gpt-chat-history button').click();document.getElementById('budil-gpt-input').value='11:00まで';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('Googleは未照合'),'not claim Google availability');
  assert.equal(await ev("window.__calWrites"),0);
  assert.equal(await ev("window.__calReads"),0,'Google read must require separate click');
  assert.equal(await ev("window.__previewProviderCalls"),0,'local preview must not use GPT API');
  await ev("Array.from(document.querySelectorAll('#budil-gpt-chat-history button')).find(b=>b.textContent.includes('Googleの予定を照合')).click()");
  for(let i=0;i<40;i++){if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Google読取成功')"))break;await sleep(100);}
  assert.equal(await ev("window.__calReads"),1,'one date-only authorized Google read');
  assert.equal(await ev("window.__calWrites"),0);
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('予約確定ではありません')"),true);
  console.log('PASS '+width+'px: tomorrow booking + exact lead + optional Google busy read, no writes');

  // Google busy time must block optimistic availability, and a failed
  // calendar read must remain UNKNOWN rather than being treated as free.
  await sleep(120);
  await ev("BudilCloud.fetchScheduleBlocks=async(a,b)=>{window.__calReads++;return {ok:true,readOnly:true,calendarWritePerformed:false,events:[{start:a+'T10:30:00+09:00',end:a+'T11:30:00+09:00'}]}};Array.from(document.querySelectorAll('#budil-gpt-chat-history button')).find(b=>b.textContent.includes('Googleの予定を照合')).click()");
  for(let i=0;i<40;i++){if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Google予定に重複')"))break;await sleep(100);}
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Google予定に重複')"),true);
  assert.equal(await ev("window.__calWrites"),0);
  await sleep(120);
  await ev("BudilCloud.fetchScheduleBlocks=async()=>({ok:false,code:'fixture_unavailable'});Array.from(document.querySelectorAll('#budil-gpt-chat-history button')).find(b=>b.textContent.includes('Googleの予定を照合')).click()");
  for(let i=0;i<40;i++){if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('Google未照合')"))break;await sleep(100);}
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('予約確定ではありません')"),true);
  assert.equal(await ev("window.__calWrites"),0);
  console.log('PASS '+width+'px: Google conflict and unavailable both fail closed');


  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getWorkOrders=()=>[{id:'fake-conflict',customerName:'別の架空顧客',serviceText:'清掃',scheduledDate:window.__calTomorrow,startTime:'10:30',endTime:'11:30',status:'confirmed'}];document.getElementById('budil-gpt-input').value='明日10時に架空一郎さんのエアコン洗浄を予約して';document.getElementById('budil-gpt-chat-send').click()");
  await ev("document.querySelector('#budil-gpt-chat-history button').click();document.getElementById('budil-gpt-input').value='11:00';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('LOCAL_CONFLICT'),'local overlap must block');
  assert.equal(await ev("window.__calWrites"),0);

  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getWorkOrders=()=>[{id:'fake-existing-w1',customerName:'架空一郎',serviceText:'清掃',scheduledDate:window.__calTomorrow,startTime:'09:00',endTime:'10:00',status:'tentative'}];document.getElementById('budil-gpt-input').value='架空一郎さんの予約を明後日11時に変更して';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('対象を本人が1件選択'));
  await ev("document.querySelector('#budil-gpt-chat-history button').click();document.getElementById('budil-gpt-input').value='12:00';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('端末内の予定に重複は見つかりません'));
  assert.equal(await ev("window.__calWrites"),0,'date change remains preview-only');
  assert.equal(await ev("window.__previewProviderCalls"),0,'work order details never sent to model');
  console.log('PASS '+width+'px: conflict fail-closed and exact WorkOrder reschedule preview');

  // Invalid customer name may be shown only as a local rejection. GPT and
  // Google calls must remain at their prior counts, with no business write.
  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getWorkOrders=()=>[];document.getElementById('budil-gpt-input').value='明日の10時に未登録花子さんのエアコン洗浄を予約して';document.getElementById('budil-gpt-chat-send').click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('顧客が見つかりません'));
  assert.equal(await ev("window.__previewProviderCalls"),0);
  assert.equal(await ev("window.__calWrites"),0);
  console.log('PASS '+width+'px: unknown customer not inferred, no GPT send');

  // A candidate button from the preceding draft must never select a lead
  // inside a NEW draft in the same account. No implicit cross-draft selection.
  await ev("document.getElementById('budil-gpt-chat-clear').click();Storage.getLeads=()=>[{id:'fake-lead-one',name:'架空一郎'},{id:'fake-lead-two',name:'架空二郎'}];document.getElementById('budil-gpt-input').value='明日の9時に架空一郎さんのエアコン洗浄を予約して';document.getElementById('budil-gpt-chat-send').click()");
  await ev("window.__staleCalendarButton=document.querySelector('#budil-gpt-chat-history button');document.getElementById('budil-gpt-input').value='明日の11時に架空二郎さんのエアコン洗浄を予約して';document.getElementById('budil-gpt-chat-send').click()");
  await ev("window.__staleCalendarButton.click();document.getElementById('budil-gpt-input').value='12:00';document.getElementById('budil-gpt-chat-send').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('顧客または変更対象を選択')"),true,
    'stale button cannot implicitly select another draft customer');
  await ev("Array.from(document.querySelectorAll('#budil-gpt-chat-history button')).filter(b=>b.textContent.includes('架空二郎')).at(-1).click()");
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('Googleは未照合'),
    'only new selected customer can complete second preview');
  assert.equal(await ev("window.__calWrites"),0);
  assert.equal(await ev("window.__previewProviderCalls"),0);
  console.log('PASS '+width+'px: old customer buttons cannot corrupt new booking preview');






  console.log('PASS '+width+'px: safe reload recovery, reset and signed-out privacy');
  console.log('PASS '+width+'px: same-tab login gate, consent ordering, expired session recovery');
  console.log('PASS '+width+'px: screenshot regression zero local results, no premature GPT question, Google unverified');
  console.log('PASS '+width+'px: real GPT plan/consent/local execution, fictional data, zero network');

 }
 console.log('BUDIL_REAL_GPT_BROWSER_PASS');
}finally{
 try{ws?.close();}catch{}
 try{chrome?.kill();}catch{}
 await new Promise(ok=>server.close(ok));
 try{rmSync(profile,{recursive:true,force:true});}catch{}
}

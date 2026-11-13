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
  for(let i=0;i<160;i++){
   if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;
   await sleep(100);
  }
  assert.equal(await ev('document.readyState'),'complete');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
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
  await ev("window.__qaSignedIn=false;window.__qaLoginCalls=0;BudilCloud.getAuthState=()=>({available:true,signedIn:window.__qaSignedIn});BudilCloud.login=async function(email,pwd){window.__qaLoginCalls++;if(email==='qa@example.invalid'&&pwd==='fixture-password'){window.__qaSignedIn=true;return {ok:true}}return {ok:false,message:'invalid_credentials'}};BudilCloud.getGptChatReadiness=async()=>({ok:true,ready:true})");
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
  assert.equal(await ev('window.__dateNetwork'),0,'mocked GPT and local read cause no external requests');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  // A second natural-language turn must retain sanitized context. The model
  // can propose a change, but it can never write it directly.
  await ev("BudilCloud.sendGptChat=async function(msg,history,today){window.__chatCalls++;window.__historyLength=history.length;window.__historyAssistant=history[1]?.content||'';return {ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,reply:'予約変更案を確認してください。まだ保存しません。',action:'proposal',query:'',date:'',month:'',docType:'none',needs_confirmation:true}}");
  await ev("document.getElementById('budil-gpt-input').value='じゃあその予定を変更したい';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-chat-consent').checked=true;document.getElementById('budil-gpt-chat-send').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-chat-history').textContent.includes('予約変更案を確認')"))break;
    await sleep(100);
  }
  assert.equal(await ev('window.__chatCalls'),2,'two actual chat interactions');
  assert.equal(await ev('window.__historyLength'),2,'conversation context is carried into turn two');
  assert.equal(await ev("window.__historyAssistant.includes('どの作業内容や顧客')"),false,
    'unfounded model question is excluded from subsequent GPT history');
  assert.equal(await ev("window.__historyAssistant.includes('work.date')"),true,
    'the safe local-read context remains available to the next turn');
  assert.ok((await ev("document.getElementById('budil-gpt-chat-history').textContent")).includes('予約・帳票・顧客データは変更していません'));
  assert.equal(await ev('window.__dateNetwork'),0,'no network after mocked proposal');
  await ev("BudilCloud.getGptChatReadiness=async function(){return {ok:true,ready:false,enabled:false}};document.getElementById('budil-gpt-chat-readiness').click()");
  for(let i=0;i<20;i++){
    if(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('有効化されていません')"))break;
    await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-chat-status').textContent.includes('有効化されていません')"),true);

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
  await ev("document.getElementById('budil-gpt-chat-clear').click()");
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

/** Disposable Chrome profile, fictional local records, actual Budil page at 390px. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,existsSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const output=process.env.BUDIL_TEST_OUTPUT_DIR||mkdtempSync(join(tmpdir(),'budil-booking-'));
const profile=mkdtempSync(join(tmpdir(),'budil-booking-chrome-'));
const browser=[process.env.CHROME_BIN,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p));
if(!browser)throw Error('CHROME_NOT_FOUND');
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
let chrome,ws;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--no-sandbox','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let port=0;
  for(let i=0;i<300;i++){
    const f=join(profile,'DevToolsActivePort');
    try{
      if(existsSync(f)){
        const candidate=Number(readFileSync(f,'utf8').split(/\r?\n/)[0]);
        if(candidate){port=candidate;break;}
      }
    }catch(e){
      // Windows Chrome may hold DevToolsActivePort exclusively for a moment
      // while initializing. Recheck rather than treating the transient
      // sharing violation as a failed browser launch.
      if(!e||!['EBUSY','EPERM','EACCES','ENOENT'].includes(e.code))throw e;
    }
    if(chrome.exitCode!==null)throw Error('CHROME_EXITED');
    await sleep(100);
  }
  if(!port)throw Error('CHROME_TIMEOUT');
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let seq=0;const pending=new Map();
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);if(!pending.has(m.id))return;
    const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});
  });
  function cmd(method,params={}){
    const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  }
  async function ev(expression){
    const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('EVAL '+r.exceptionDetails.text);
    return r.result?.value;
  }
  await cmd('Page.enable');await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
  for(let i=0;i<150;i++){if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;await sleep(100);}
  assert.equal(await ev('document.readyState'),'complete');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  await ev("localStorage.setItem('budil_leads',JSON.stringify([{id:'f1',name:'田中太郎',area:'南城市'},{id:'f2',name:'田中花子',area:'八重瀬町'}]));localStorage.setItem('budil_work_orders','[]')");
  await ev("document.getElementById('budil-gpt-open').click()");
  await ev("window.__reads=0;const old=Storage.getWorkOrders;Storage.getWorkOrders=function(){window.__reads++;return old.apply(this,arguments)}");
  await ev("window.__googleCalls=0;BudilCloud.fetchLocalScheduleBlocks=async()=>{window.__googleCalls++;return {ok:true,events:[{id:'private-1',summary:'fictional private client',location:'private address',start:'2026-11-08T08:30:00+09:00',end:'2026-11-08T09:15:00+09:00'}]}};document.getElementById('budil-gpt-input').value='2026年11月8日の9時は空いてる？';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev('window.__reads'),0,'consent before local read');
  assert.equal(await ev('window.__googleCalls'),0,'no Google request without consent');
  assert.equal(await ev("document.getElementById('budil-gpt-consent').parentElement.textContent.includes('Google予定の時刻情報も読取専用')"),true);
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('重なる予定')"))break;
    await sleep(100);
  }
  assert.equal(await ev('window.__googleCalls'),1,'one consent and one button, one Google request');
  assert.equal(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('重なる予定が1件')"),true);
  assert.equal(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('private client')"),false);
  assert.equal(await ev("document.getElementById('budil-gpt-google-consent-row').hidden"),true);
  assert.equal(await ev("document.getElementById('budil-gpt-google-check').hidden"),true);
  assert.equal(await ev("document.getElementById('budil-gpt-consent').checked"),false);
  assert.equal(await ev('Storage.getWorkOrders().length'),0,'availability must not save work');
  await ev("document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev('window.__googleCalls'),1,'second click without new consent cannot read Google');
  await ev("document.getElementById('budil-gpt-clear').click();BudilCloud.fetchLocalScheduleBlocks=async()=>{window.__googleCalls++;return {ok:false,code:'local_calendar_unavailable'}};document.getElementById('budil-gpt-input').value='2026年11月8日の9時は空いてる？';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('空き確定にはしません')"))break;
    await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('空き確定にはしません')"),true,'connection failure is not availability');
  assert.equal(await ev('Storage.getWorkOrders().length'),0);
  await ev("document.getElementById('budil-gpt-clear').click();BudilCloud.fetchLocalScheduleBlocks=async()=>{window.__googleCalls++;return {ok:true,events:[{start:'2099-11-06T09:30:00+09:00',end:'2099-11-06T10:15:00+09:00'}]}}");
  assert.equal(await ev("document.getElementById('budil-gpt-google-check').hidden"),false,'booking Google check remains available');
  assert.equal(await ev("document.getElementById('budil-gpt-google-consent-row').hidden"),false,'booking Google consent remains available');

  const beforeBookingRead=await ev('window.__reads');
  await ev("document.getElementById('budil-gpt-input').value='2099-11-06の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev('window.__reads'),beforeBookingRead,'booking consent before read');
  assert.equal(await ev("document.getElementById('budil-gpt-booking').hidden"),true);
  await ev("document.getElementById('budil-gpt-input').value='2099-11-06の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-booking-fields').hidden"),false);
  assert.equal(await ev('Storage.getWorkOrders().length'),0,'no auto save');
  await ev("document.getElementById('budil-gpt-booking-continue').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('税込・税抜')"),true);
  await ev("document.getElementById('budil-gpt-booking-tax').value='included';document.getElementById('budil-gpt-booking-end').value='12:00';document.getElementById('budil-gpt-booking-continue').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-candidate-list button').length"),2,'ambiguous candidates');
  assert.equal(await ev('Storage.getWorkOrders().length'),0);
  await ev("document.querySelector('#budil-gpt-candidate-list button').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-draft').hidden"),false);
  assert.equal(await ev("document.getElementById('budil-gpt-booking-save').hidden"),false);
  assert.equal(await ev('Storage.getWorkOrders().length'),0);
  assert.equal(await ev("document.getElementById('budil-gpt-google-read').hidden"),false);
  await ev("document.getElementById('budil-gpt-google-consent').checked=true;document.getElementById('budil-gpt-google-check').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('重なる予定')"))break;
    await sleep(100);
  }
  await ev("document.getElementById('budil-gpt-booking-save').click()");
  assert.equal(await ev('Storage.getWorkOrders().length'),0,'Google conflict blocks local tentative save');
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('GOOGLE_CALENDAR_CONFLICT')"),true);
  await ev("BudilCloud.fetchLocalScheduleBlocks=async()=>{window.__googleCalls++;return {ok:true,events:[]}};document.getElementById('budil-gpt-google-consent').checked=true;document.getElementById('budil-gpt-google-check').click()");
  for(let i=0;i<50;i++){
    if(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('見つかりませんでした')"))break;
    await sleep(100);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-google-status').textContent.includes('見つかりませんでした')"),true);
  assert.equal(await ev('Storage.getWorkOrders().length'),0,'Google read never persists booking');

  await ev("document.getElementById('budil-gpt-booking-save').click();document.getElementById('budil-gpt-booking-save').click()");
  assert.equal(await ev('Storage.getWorkOrders().length'),1,'concurrent click single write');
  assert.equal(await ev("Storage.getWorkOrders()[0].calendarAdded"),false);
  assert.equal(await ev("Storage.getWorkOrders()[0].status"),'tentative');
  assert.equal(await ev("Storage.getSafetyBackups().length>=1"),true);
  await ev("Storage.addWorkOrder({customerName:'田中花子',serviceText:'点検',scheduledDate:'2099-11-09',startTime:'14:00',endTime:'15:00',status:'confirmed'})");
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='田中さんの予約を2099-11-07に変更して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-booking-orders button').length"),2,'work-order ambiguity');
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.customerName==='田中太郎').scheduledDate"),'2099-11-06');
  await ev("[...document.querySelectorAll('#budil-gpt-booking-orders button')].find(b=>b.textContent.includes('田中太郎')).click()");
  assert.equal(await ev("document.getElementById('budil-gpt-booking-save').hidden"),false);
  await ev("document.getElementById('budil-gpt-booking-save').click()");
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.customerName==='田中太郎').scheduledDate"),'2099-11-07');
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.customerName==='田中花子').scheduledDate"),'2099-11-09');
  assert.equal(await ev("Storage.getSafetyBackups().length>=2"),true);
  await ev("Storage.addWorkOrder({customerName:'架空顧客',serviceText:'点検',scheduledDate:'2099-11-08',startTime:'10:30',endTime:'11:30',status:'confirmed'})");
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='2099-11-08の10時に田中さんのエアコン洗浄2台を予約して。18,000円で見積書も作って';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click();document.getElementById('budil-gpt-booking-tax').value='included';document.getElementById('budil-gpt-booking-end').value='12:00';document.getElementById('budil-gpt-booking-continue').click();document.querySelector('#budil-gpt-candidate-list button').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-booking-save').hidden"),true,'time conflict blocks write');
  assert.equal(await ev('Storage.getWorkOrders().length'),3);
  // Customer history entry point must be usable in the actual 390px dialog.
  // Every record is fictional, linked by exact lead ID and stays in Chrome.
  await ev("Storage.updateLead('f1',{customerTypeMajor:'A',customerTypeMinor:'F',customerMemo:'現場天井高め・駐車は裏側',activityLogs:[{date:'2099-11-05',title:'連絡',memo:'養生を準備'}]});Storage.addWorkOrder({leadId:'f1',customerName:'田中太郎',status:'completed',scheduledDate:'2099-11-04',serviceText:'現場点検',memo:'二階の室外機'});Storage.addWorkOrder({leadId:'f2',customerName:'田中花子',status:'completed',scheduledDate:'2099-11-03',serviceText:'他のお客様の洗浄',memo:'他人だけのメモ'})");
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='田中さんの現場環境を教えて';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('確認欄')"),true,'consent before customer lookup');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-result button').length"),2,'namesake candidates need selection');
  assert.equal(await ev("document.getElementById('budil-gpt-result').textContent.includes('現場天井高め')"),false,'private note not shown before selection');
  await ev("document.querySelector('#budil-gpt-result button').click()");
  const historyView=await ev("document.getElementById('budil-gpt-result').textContent");
  assert.ok(historyView.includes('現場天井高め'),'selected customer field memo shown');
  assert.ok(historyView.includes('現場点検'),'exact-linked work history shown');
  assert.ok(historyView.includes('養生を準備'),'activity log shown');
  assert.ok(!historyView.includes('他人だけのメモ'),'other customer notes hidden');
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth+2"),true);

  await ev("document.getElementById('budil-gpt-booking').scrollIntoView({block:'start'})");
  const shot=await cmd('Page.captureScreenshot',{format:'png'});
  if(process.env.BUDIL_TEST_OUTPUT_DIR)writeFileSync(join(output,'budil-booking-390.png'),Buffer.from(shot.data,'base64'));

  // Compact natural language booking: no customer read before consent, no save, and one Google read.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='2099年11月20日10時にエアコンクリーニングを予約して';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-sandbox').hidden"),true,'compact booking must require local read consent');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-sandbox').hidden"),false,'compact booking preview opens');
  assert.equal(await ev("document.getElementById('budil-gpt-booking').hidden"),true,'original booking panel not confused');
  const beforeCompact=await ev('Storage.getWorkOrders().length');
  await ev("document.getElementById('budil-gpt-calendar-preview-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('CUSTOMER_SELECTION_REQUIRED')"),true,'explicit customer selection required');
  await ev("document.getElementById('budil-gpt-calendar-name').value='田中';document.getElementById('budil-gpt-calendar-find').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-calendar-candidates button').length"),2,'two customer candidates');
  await ev("document.querySelector('#budil-gpt-calendar-candidates button').click();document.getElementById('budil-gpt-calendar-end').value='12:00';document.getElementById('budil-gpt-calendar-preview-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('Google予定：未確認')"),true,'Google not verified without consent');
  assert.equal(await ev('Storage.getWorkOrders().length'),beforeCompact,'no local write on preview');
  const beforeGoogle=await ev('window.__googleCalls');
  await ev("BudilCloud.fetchLocalScheduleBlocks=async()=>{window.__googleCalls++;return {ok:true,events:[]}};document.getElementById('budil-gpt-calendar-google-consent').checked=true;document.getElementById('budil-gpt-calendar-preview-run').click()");
  for(let i=0;i<50;i++){if(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('Google予定の重複なし')"))break;await sleep(100);}
  assert.equal(await ev('window.__googleCalls'),beforeGoogle+1,'one compact confirmation is one Google read');
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('Google予定の重複なし')"),true);
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('実書込は現在無効')"),true);
  assert.equal(await ev('Storage.getWorkOrders().length'),beforeCompact);
  // Compact reschedule: existing work order selected explicitly, date and time preview, NO mutation.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='田中太郎さんの予約を2099年11月21日10時に変更して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-sandbox').hidden"),false);
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-calendar-candidates button').length"),1,'one eligible work order selectable');
  await ev("document.querySelector('#budil-gpt-calendar-candidates button').click();document.getElementById('budil-gpt-calendar-end').value='12:00';document.getElementById('budil-gpt-calendar-preview-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('2099-11-21')"),true);
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('Google予定ID')"),true);
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.customerName==='田中太郎'&&w.status==='tentative').scheduledDate"),'2099-11-07','reschedule is preview-only');
  assert.equal(await ev('Storage.getWorkOrders().length'),beforeCompact);
  // Local conflict is fail closed and never reads Google.
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='2099年11月9日14時30分にエアコンクリーニングを予約して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click();document.getElementById('budil-gpt-calendar-name').value='田中';document.getElementById('budil-gpt-calendar-find').click();document.querySelector('#budil-gpt-calendar-candidates button').click();document.getElementById('budil-gpt-calendar-end').value='15:30';document.getElementById('budil-gpt-calendar-google-consent').checked=true;document.getElementById('budil-gpt-calendar-preview-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-result').textContent.includes('LOCAL_CONFLICT')"),true);
  assert.equal(await ev('Storage.getWorkOrders().length'),beforeCompact);
  assert.equal(await ev('window.__googleCalls'),beforeGoogle+1,'local conflict blocks Google read');
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth+2"),true,'390px compact booking no horizontal overflow');
  console.log('BUDIL_COMPACT_CALENDAR_CHROME_390 PASS');

  console.log('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');
}finally{
  try{ws?.close();}catch{}
  try{chrome?.kill();}catch{}
  await new Promise(r=>server.close(r));
}

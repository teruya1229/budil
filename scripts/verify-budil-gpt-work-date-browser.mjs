/** Standalone fake-data E2E. Disposable Chrome, no authenticated profiles. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,existsSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const profile=mkdtempSync(join(tmpdir(),'budil-workdate-'));
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
  await ev("document.getElementById('budil-gpt-input').value='11/11の予定\\n';document.getElementById('budil-gpt-run').click()");
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
  // Repeat the user journey with spoken-style and fullwidth input.
  for(const phrase of ['１１／１１の予定','11月11日は何か予定ある？','11/11に予定入ってる？']){
    await ev("document.getElementById('budil-gpt-clear').click()");
    await ev("document.getElementById('budil-gpt-input').value="+JSON.stringify(phrase)+";document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
    const text=await ev("document.getElementById('budil-gpt-result').textContent");
    assert.ok(text.includes('2026-11-11')&&text.includes('架空一郎')&&text.includes('架空二郎'),phrase);
    assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('Google Calendarは照合していません')"),true,phrase);
    assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true,phrase);
  }
  console.log('PASS '+width+'px: consent, two fictional appointments, no Google/extra reads, no overflow, unknown availability');
 }
 console.log('BUDIL_WORK_DATE_BROWSER_PASS');
}finally{
 try{ws?.close();}catch{}
 try{chrome?.kill();}catch{}
 await new Promise(ok=>server.close(ok));
 try{rmSync(profile,{recursive:true,force:true});}catch{}
}

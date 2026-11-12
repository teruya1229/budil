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

  assert.equal(await ev("typeof BudilCloud.diagnoseCalendarWriteCredential"),'function');
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-calendar-diagnostic').length"),1);
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-calendar-diagnostic-status').length"),1);
  await ev("localStorage.setItem('budil_work_orders','[]');document.getElementById('budil-gpt-open').click()");
  await ev("window.__probeCount=0;BudilCloud.diagnoseCalendarWriteCredential=async()=>{window.__probeCount++;await new Promise(r=>setTimeout(r,80));return {ok:true,code:'GOOGLE_EVENTS_READ_OK',calendarWritePerformed:false,writeEnabled:false}}");
  assert.equal(await ev("window.__probeCount"),0,'never auto-call Google auth');
  await ev("document.getElementById('budil-gpt-calendar-diagnostic').click();document.getElementById('budil-gpt-calendar-diagnostic').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-diagnostic').disabled"),true,'no double run');
  for(let i=0;i<30;i++){
   if(await ev("document.getElementById('budil-gpt-calendar-diagnostic-status').textContent.includes('読取に成功')"))break;
   await sleep(50);
  }
  assert.equal(await ev('window.__probeCount'),1,'one user click one probe');
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-diagnostic-status').textContent.includes('書込機能はまだOFF')"),true);
  assert.equal(await ev("Storage.getWorkOrders().length"),0,'no local business mutation');
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth+2"),true,'390px fit');
  await ev("BudilCloud.diagnoseCalendarWriteCredential=async()=>({ok:false,code:'not_signed_in'});document.getElementById('budil-gpt-calendar-diagnostic').click()");
  for(let i=0;i<30;i++){
   if(await ev("document.getElementById('budil-gpt-calendar-diagnostic-status').textContent.includes('ログイン')"))break;
   await sleep(50);
  }
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-diagnostic-status').textContent.includes('ログイン')"),true);
  await ev("document.getElementById('budil-gpt-clear').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-calendar-diagnostic-status').textContent"),'');
  console.log('BUDIL_DIAG_ONLY_CHROME_390 PASS');
}finally{
  try{ws?.close();}catch{}
  try{chrome?.kill();}catch{}
  await new Promise(r=>server.close(r));
}

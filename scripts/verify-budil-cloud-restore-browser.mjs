/**
 * Budil AI local-first release acceptance (actual index.html).
 * ONLY newly created fictional data in disposable profile. Uses a dedicated Chrome profile and localhost static server.
 * Run: node scripts/verify-budil-gpt-phase1-browser.mjs
 * Browser executable: CHROME_BIN or google-chrome/chromium.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workDir = process.env.BUDIL_TEST_OUTPUT_DIR || mkdtempSync(join(tmpdir(), "budil-gpt-browser-"));
mkdirSync(workDir, { recursive: true });
const userDataDir = join(workDir, "chrome-profile");
const downloadDir = join(workDir, "downloads");
mkdirSync(downloadDir, { recursive: true });
const browserCandidates = [
  process.env.CHROME_BIN,
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const browser = browserCandidates.find((p) => existsSync(p));
if (!browser) {
  console.error("BROWSER_NOT_FOUND: set CHROME_BIN to an installed Chrome/Chromium executable");
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typeMap = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
let chrome;
let server;
let socket;
let messages = 0;
function ensureSafePath(pathname) {
  const path = resolve(root, "." + decodeURIComponent(pathname));
  if (!path.startsWith(root + (process.platform === "win32" ? "\\" : "/"))) return null;
  return path;
}
function getFile(pathname, res) {
  const path = ensureSafePath(pathname);
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": typeMap[extname(path)] || "application/octet-stream",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(readFileSync(path));
}
function createCdp(wsUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const ws = new WebSocket(wsUrl);
    socket = ws;
    const inflight = new Map();
    let nextId = 0;
    const timer = setTimeout(() => rejectConnection(new Error("websocket_open_timeout")), 10000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolveConnection({
        command(method, params = {}) {
          const id = ++nextId;
          return new Promise((resolveCmd, rejectCmd) => {
            const timeout = setTimeout(() => { inflight.delete(id); rejectCmd(new Error("CDP_TIMEOUT " + method)); }, 25000);
            inflight.set(id, { resolveCmd, rejectCmd, timeout });
            ws.send(JSON.stringify({ id, method, params }));
          });
        }
      });
    }, { once: true });
    ws.addEventListener("error", () => rejectConnection(new Error("websocket_error")), { once: true });
    ws.addEventListener("message", (event) => {
      let parsed;
      try { parsed = JSON.parse(event.data); } catch { return; }
      if (!parsed.id || !inflight.has(parsed.id)) return;
      const pending = inflight.get(parsed.id);
      inflight.delete(parsed.id);
      clearTimeout(pending.timeout);
      if (parsed.error) pending.rejectCmd(new Error(parsed.error.message || "cdp_failed"));
      else pending.resolveCmd(parsed.result || {});
    });
  });
}
async function run() {
  // Optional production verification still uses a disposable Chrome profile.
  // Never use an existing user's browser or persistent Budil data.
  const liveUrl=process.env.BUDIL_LIVE_VERIFY_URL || '';
  if(liveUrl && liveUrl!=='https://teruya1229.github.io/budil/')
    throw new Error('live_origin_not_allowlisted');
  let port=0;
  if(!liveUrl){
    server=createServer((req,res)=>{
      try { getFile(new URL(req.url, "http://localhost").pathname,res); }
      catch { res.writeHead(500);res.end("error"); }
    });
    await new Promise((resolveOpen)=>server.listen(0,"127.0.0.1",resolveOpen));
    port=server.address().port;
  }
  chrome = spawn(browser, [
    "--headless=new", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--no-sandbox",
    "--disable-background-networking", "--remote-debugging-port=0",
    "--user-data-dir=" + userDataDir, "about:blank"
  ], { stdio: "ignore" });

  const activePortFile = join(userDataDir, "DevToolsActivePort");
  let remotePort = 0;
  for (let i = 0; i < 300; i++) {
    if (existsSync(activePortFile)) {
      remotePort = Number(readFileSync(activePortFile, "utf8").split(/\r?\n/)[0]);
      if (remotePort) break;
    }
    if (chrome.exitCode != null) throw new Error("chrome_exited_" + chrome.exitCode);
    await sleep(100);
  }
  if (!remotePort) throw new Error("chrome_debugging_port_not_open");
  const tabs = await (await fetch("http://127.0.0.1:" + remotePort + "/json")).json();
  const tab = tabs.find((x) => x.type === "page");
  if (!tab?.webSocketDebuggerUrl) throw new Error("no_page_target");
  const cdp = await createCdp(tab.webSocketDebuggerUrl);
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });
  await cdp.command("Browser.setDownloadBehavior", {
    behavior: "allow", downloadPath: downloadDir
  });
  const url=liveUrl || ("http://127.0.0.1:"+port+"/index.html");
  await cdp.command("Page.navigate",{url});
  async function evaluate(expression) {
    const result=await cdp.command("Runtime.evaluate",{
      expression,returnByValue:true,awaitPromise:true
    });
    if(result.exceptionDetails)throw Error("browser_eval:"+result.exceptionDetails.text);
    return result.result?.value;
  }
  for(let i=0;i<120;i++){
    if(await evaluate("document.readyState==='complete' && !!document.getElementById('budil-gpt-open')"))break;
    await sleep(100);
  }
  assert.equal(await evaluate("document.readyState"),"complete");

  assert.ok((await evaluate("document.documentElement.scrollWidth"))<=392);
  await evaluate("localStorage.setItem('budil_leads',JSON.stringify([{id:'old-fictional',name:'架空以前'}]))");
  await evaluate("(async()=>{ const payload={app:'Budil',version:'4.0',appVersion:'v4.13.20',backupVersion:'v4.13.20',exportedAt:'2026-11-06T09:00:00.000Z',dataKeys:['budil_leads'],data:{budil_leads:[{id:'new-fictional',name:'架空復元'}]}};const hash=await BudilCloudRestore.digest(payload,crypto);window.__latest={snapshotId:'b32c7fea-3a82-4628-b7cc-10e185d3e7b0',createdAt:'2026-11-06T09:00:00.000Z',contentHash:hash,payload};window.__get=0;BudilCloud.isAvailable=()=>true;BudilCloud.getAuthState=()=>({signedIn:true});BudilCloud.fetchLatestPayload=async()=>{window.__get++;return {ok:true,latest:window.__latest}};document.getElementById('cloud-backup-login-status').textContent='ログイン状態: ログイン済み';})()");
  for(let i=0;i<40;i++){
    if(await evaluate("!document.getElementById('btn-cloud-restore-preview').disabled"))break;
    await sleep(100);
  }
  assert.equal(await evaluate("document.getElementById('btn-cloud-restore-preview').disabled"),false);
  assert.equal(await evaluate("document.getElementById('btn-cloud-restore-apply').disabled"),true);
  assert.equal(await evaluate("Storage.getLeads()[0].id"),'old-fictional');
  await evaluate("document.getElementById('btn-cloud-restore-preview').click()");
  for(let i=0;i<50;i++){
    if(await evaluate("document.getElementById('cloud-restore-summary').textContent.includes('復元候補')"))break;
    await sleep(100);
  }
  assert.equal(await evaluate("window.__get"),1);
  assert.equal(await evaluate("document.getElementById('cloud-restore-summary').textContent.includes('復元候補')"),true);
  assert.equal(await evaluate("Storage.getLeads()[0].id"),'old-fictional');
  assert.equal(await evaluate("document.getElementById('btn-cloud-restore-apply').disabled"),true);
  await evaluate("document.getElementById('btn-cloud-restore-download').click()");
  let backedUp=false;
  for(let i=0;i<60;i++){
    backedUp=readdirSync(downloadDir).some(x=>x.endsWith('.json'));
    if(backedUp)break;
    await sleep(100);
  }
  assert.equal(backedUp,true,'local backup JSON download missing');
  await evaluate("const c=document.getElementById('cloud-restore-saved');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.getElementById('btn-cloud-restore-apply').disabled"),false);
  assert.equal(await evaluate("Storage.getLeads()[0].id"),'old-fictional');
  await evaluate("document.getElementById('btn-cloud-restore-apply').click()");
  for(let i=0;i<50;i++){
    if(await evaluate("document.getElementById('cloud-restore-summary').textContent.includes('復元が完了')"))break;
    await sleep(100);
  }
  assert.equal(await evaluate("Storage.getLeads()[0].id"),'new-fictional');
  assert.equal(await evaluate("document.getElementById('cloud-restore-summary').textContent.includes('復元が完了')"),true);
  assert.equal(await evaluate("document.getElementById('btn-cloud-restore-reload').classList.contains('hidden')"),false);
  const result=await cdp.command("Page.captureScreenshot",{format:"png"});
  if(result.data)writeFileSync(join(workDir,"budil-cloud-restore-390.png"),Buffer.from(result.data,"base64"));
  console.log("BUDIL_CLOUD_RESTORE_BROWSER_PASS: GET-only mock, user backup JSON, final approval, read-back, 390px");

}
try {
  await run();
} catch (err) {
  console.error("BUDIL_CLOUD_RESTORE_BROWSER_FAIL: " + String(err && err.message || err));
  process.exitCode = 1;
} finally {
  if (socket) { try { socket.close(); } catch {} }
  if (chrome && chrome.pid) { try { chrome.kill(); } catch {} }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  console.log("isolated_test_output=" + workDir);
}

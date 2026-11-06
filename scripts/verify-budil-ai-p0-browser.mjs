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
  server = createServer((req, res) => {
    try { getFile(new URL(req.url, "http://localhost").pathname, res); }
    catch { res.writeHead(500); res.end("error"); }
  });
  await new Promise((resolveOpen) => server.listen(0, "127.0.0.1", resolveOpen));
  const port = server.address().port;
  chrome = spawn(browser, [
    "--headless=new", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--no-sandbox",
    "--disable-background-networking", "--remote-debugging-port=0",
    "--user-data-dir=" + userDataDir, "about:blank"
  ], { stdio: "ignore" });

  const activePortFile = join(userDataDir, "DevToolsActivePort");
  let remotePort = 0;
  for (let i = 0; i < 120; i++) {
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
  const url="http://127.0.0.1:"+port+"/index.html";
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
  const width=await evaluate("({scroll:document.documentElement.scrollWidth,viewport:innerWidth})");
  assert.ok(width.scroll<=width.viewport+2,"390px horizontal overflow");
  assert.equal(await evaluate("document.getElementById('budil-gpt-shell').hidden"),true);
  // Must be a fresh temporary profile; seed ONLY made-up customer records.
  await evaluate("localStorage.setItem('budil_leads',JSON.stringify([{id:'fictional-1',name:'田中太郎',area:'南城市'},{id:'fictional-2',name:'田中太郎',area:'八重瀬町'}]))");
  await evaluate("localStorage.setItem('budil_documents',JSON.stringify([{id:'fictional-invoice',type:'invoice',number:'DEMO-INV-001',customerName:'田中太郎',total:18000,status:'issued',paymentStatus:'pending',paidAmount:0,unpaidAmount:18000,expectedPaymentDate:'2026-11-18'}]))");
  await evaluate("localStorage.setItem('budil_work_orders',JSON.stringify([{id:'fictional-job',customerName:'田中太郎',scheduledDate:'2026-11-13',status:'confirmed'}]))");
  await evaluate("localStorage.setItem('budil_revenue_records','[]')");
  await evaluate("document.getElementById('budil-gpt-open').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-shell').hidden"),false);
  assert.equal(await evaluate("document.querySelectorAll('#budil-gpt-candidate-list button').length"),0);
  const shot=await cdp.command("Page.captureScreenshot",{format:"png"});
  if(shot.data)writeFileSync(join(workDir,"budil-release-390.png"),Buffer.from(shot.data,"base64"));

  // Check consent-before-read by instrumenting the already-loaded Storage
  // instance. No test data is sent outside the temporary localhost browser.
  await evaluate("window.__reads=0;window.__oldGetLeads=Storage.getLeads;Storage.getLeads=function(){window.__reads++;return window.__oldGetLeads.apply(this,arguments)}");
  await evaluate("document.getElementById('budil-gpt-input').value='田中太郎さんを探して';document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("window.__reads"),0);
  assert.equal(await evaluate("document.getElementById('budil-gpt-status').textContent.includes('チェック')"),true);
  await evaluate("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-result').textContent.includes('顧客候補：2件')"),true);
  assert.equal(await evaluate("document.getElementById('budil-gpt-consent').checked"),false);
  console.log("PASS user-consent and two exact-name customers");

  await evaluate("document.getElementById('budil-gpt-input').value='田中太郎さんの請求書を探して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-result').textContent.includes('DEMO-INV-001')"),true);
  await evaluate("document.getElementById('budil-gpt-input').value='田中太郎さんの作業予定を教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-result').textContent.includes('2026-11-13')"),true);
  await evaluate("document.getElementById('budil-gpt-input').value='未入金合計を教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-result').textContent.includes('18,000円')"),true);
  console.log("PASS original Budil invoice/work/unpaid data read-only");

  await evaluate("document.getElementById('budil-gpt-input').value='田中太郎さんのエアコン洗浄2台を税込18,000円で見積して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.querySelectorAll('#budil-gpt-candidate-list button').length"),2);
  assert.equal(await evaluate("document.getElementById('budil-gpt-draft').hidden"),true);
  await evaluate("document.querySelectorAll('#budil-gpt-candidate-list button')[0].click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-draft-preview').textContent.includes('18,000円')"),true);
  await evaluate("document.getElementById('budil-gpt-revision').value='金額を税込20,000円に変更';document.getElementById('budil-gpt-revise').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-draft-preview').textContent.includes('20,000円')"),true);
  await evaluate("document.getElementById('budil-gpt-approve').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-approved').hidden"),false);
  assert.equal(await evaluate("Storage.getDocuments().length"),1,"No invoice writes");
  console.log("PASS original Budil unsaved quote revision and human approval");

  const old=new Set(readdirSync(downloadDir).filter(x=>x.endsWith('.pdf')));
  await evaluate("document.getElementById('budil-gpt-pdf').click()");
  let pdf='';
  for(let i=0;i<200;i++){
    const fresh=readdirSync(downloadDir).filter(x=>x.endsWith('.pdf')&&!old.has(x));
    if(fresh.length&&statSync(join(downloadDir,fresh[0])).size>5000){pdf=join(downloadDir,fresh[0]);break;}
    await sleep(100);
  }
  if(!pdf)throw Error("approved_PDF_not_saved:"+await evaluate("document.getElementById('budil-gpt-status').textContent"));
  const details=spawnSync("pdfinfo",[pdf],{encoding:"utf8"});
  assert.equal(details.status,0);
  assert.equal(Number((details.stdout.match(/^Pages:\s+(\d+)/m)||[])[1]),1);
  assert.equal(await evaluate("Storage.getDocuments().length"),1,"PDF must not save documents");
  await evaluate("document.getElementById('budil-gpt-close').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-shell').hidden"),true);
  assert.equal(await evaluate("document.getElementById('budil-gpt-input').value"),"");
  console.log("BUDIL_AI_RELEASE_BROWSER_PASS 390px A4 single page no writes");
  // P0 browser acceptance: use ONLY fictional data seeded into the same
  // temporary Chrome profile, never touch actual users or remote business APIs.
  const period=await evaluate("BudilGptLocalCommands.parse('先月の見積書を探して',{today:BudilGptLocalCommands.todayTokyo()}).request.month");
  const nowMonth=await evaluate("BudilGptLocalCommands.todayTokyo().slice(0,7)");
  const docs=[
    {id:'old-est',type:'estimate',number:'EST-PREV',customerName:'田中太郎',issueDate:period+'-15',total:18000,status:'draft'},
    {id:'new-est',type:'estimate',number:'EST-CURR',customerName:'山田花子',issueDate:nowMonth+'-03',total:20000,status:'draft'},
    {id:'current-inv',type:'invoice',number:'INV-CURR',customerName:'田中太郎',issueDate:nowMonth+'-02',
     expectedPaymentDate:nowMonth+'-18',total:18000,unpaidAmount:18000,paidAmount:0,paymentStatus:'pending',status:'issued'}
  ];
  await evaluate("localStorage.setItem('budil_documents',JSON.stringify("+JSON.stringify(docs)+"))");
  await evaluate("document.getElementById('budil-gpt-open').click()");
  await evaluate("document.getElementById('budil-gpt-input').value='先月の見積書を探して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  const lastView=await evaluate("document.getElementById('budil-gpt-result').textContent");
  assert.ok(lastView.includes('先月の見積書：1件'));
  assert.ok(lastView.includes('EST-PREV'));
  assert.ok(!lastView.includes('EST-CURR'));
  assert.ok(!lastView.includes('INV-CURR'));
  console.log("PASS: relative 'last month estimate' resolves issueDate, never customer name");
  await evaluate("document.getElementById('budil-gpt-input').value='今月の未入金を教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  const unpaidView=await evaluate("document.getElementById('budil-gpt-result').textContent");
  assert.ok(unpaidView.includes('今月入金予定')&&unpaidView.includes('18,000円'));
  const scopeInfo=await evaluate("document.getElementById('budil-gpt-status').textContent");
  assert.ok(scopeInfo.includes('入金予定日が今月'));
  console.log("PASS: current-month outstanding clearly scoped to expected payment month");
  await evaluate("document.getElementById('budil-gpt-input').value='田中太郎さんのエアコン洗浄2台を税込18,000円で見積して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("document.querySelectorAll('#budil-gpt-candidate-list button').length"),2);
  await evaluate("document.querySelectorAll('#budil-gpt-candidate-list button')[0].click()");
  assert.equal(await evaluate("!document.getElementById('budil-gpt-draft').hidden"),true);
  // Regression for previous P0 bug: the old handler reset the draft BEFORE
  // parsing any next utterance. Failure must NOT clear it.
  await evaluate("document.getElementById('budil-gpt-input').value='明日の天気教えて';document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("!document.getElementById('budil-gpt-draft').hidden"),true);
  assert.ok((await evaluate("document.getElementById('budil-gpt-draft-preview').textContent")).includes('18,000円'));
  const preserved=await evaluate("document.getElementById('budil-gpt-status').textContent");
  assert.ok(preserved.includes('保持'));
  console.log('PASS: unsupported next utterance does not delete unsaved quote');
  await evaluate("document.getElementById('budil-gpt-input').value='金額を税込20,000円に変更';document.getElementById('budil-gpt-run').click()");
  assert.equal(await evaluate("!document.getElementById('budil-gpt-draft').hidden"),true);
  assert.ok((await evaluate("document.getElementById('budil-gpt-draft-preview').textContent")).includes('20,000円'));
  console.log('PASS: main conversation box revises existing estimate without new customer consent');
  await evaluate("document.getElementById('budil-gpt-input').value='未入金合計を教えて';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.ok((await evaluate("document.getElementById('budil-gpt-draft-preview').textContent")).includes('20,000円'));
  assert.equal(await evaluate("!document.getElementById('budil-gpt-draft').hidden"),true);
  console.log('PASS: unrelated read command cannot silently overwrite the draft');
  // Only explicit clear is allowed to throw away the draft.
  await evaluate("document.getElementById('budil-gpt-clear').click()");
  assert.equal(await evaluate("document.getElementById('budil-gpt-draft').hidden"),true);
  assert.equal(await evaluate("document.getElementById('budil-gpt-input').value"),'');
  assert.equal(await evaluate("Storage.getDocuments().length"),3);
  console.log("BUDIL_AI_P0_BROWSER_PASS: no lost drafts, no fake month search, zero saved writes");


}

try {
  await run();
} catch (err) {
  console.error("BUDIL_GPT_BROWSER_E2E_FAIL: " + String(err && err.message || err));
  process.exitCode = 1;
} finally {
  if (socket) { try { socket.close(); } catch { /* ignore */ } }
  if (chrome && chrome.pid) { try { chrome.kill(); } catch { /* ignore */ } }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  console.log("isolated_test_output=" + workDir);
}

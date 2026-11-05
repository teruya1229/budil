/**
 * Budil GPT Phase 1 isolated headless browser acceptance.
 * ONLY fixture data. Uses a dedicated Chrome profile and localhost static server.
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
  const url = "http://127.0.0.1:" + port + "/budil-gpt-phase1-demo.html";
  await cdp.command("Page.navigate", { url });
  async function evaluate(expression) {
    const result = await cdp.command("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true
    });
    if (result.exceptionDetails) throw new Error("browser_exception: " +
      (result.exceptionDetails.text || "unknown"));
    return result.result?.value;
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate("document.readyState === 'complete' && !!window.BudilGptFixtureCore")) break;
    await sleep(100);
  }
  assert.equal(await evaluate("document.readyState"), "complete");
  console.log("PASS: fixture page rendered");
  const width = await evaluate("({scroll:document.documentElement.scrollWidth,inner:window.innerWidth})");
  assert.ok(width.scroll <= width.inner + 2, "390px horizontal overflow " + JSON.stringify(width));
  console.log("PASS: 390px layout no horizontal scroll");
  const screenshot = await cdp.command("Page.captureScreenshot", { format: "png" });
  if (screenshot.data) writeFileSync(join(workDir, "mobile-390.png"), Buffer.from(screenshot.data, "base64"));

  await evaluate("document.getElementById('fixture-start').click()");
  assert.equal(await evaluate("document.querySelectorAll('#fixture-candidate-list button').length"), 1);
  console.log("PASS: explicit customer selection step");
  await evaluate("document.querySelector('#fixture-candidate-list button').click()");
  assert.equal(await evaluate("document.getElementById('fixture-draft-summary').innerText.includes('18,000円')"), true);
  console.log("PASS: Budil original calculation displays 18,000 yen");

  await evaluate("document.getElementById('fixture-revision').value='金額を税込20,000円に変更';document.getElementById('fixture-revise').click()");
  assert.equal(await evaluate("document.getElementById('fixture-draft-summary').innerText.includes('20,000円')"), true);
  console.log("PASS: revision displays 20,000 yen");

  await evaluate("document.getElementById('fixture-approve').click()");
  assert.equal(await evaluate("document.getElementById('fixture-approved').classList.contains('fixture-hidden')"), false);
  console.log("PASS: user approval step");

  await evaluate("document.getElementById('fixture-pdf').click()");
  let pdf = "";
  for (let i = 0; i < 300; i++) {
    if (existsSync(downloadDir)) {
      const names = readdirSync(downloadDir);
      const hit = names.find((name) => name.toLowerCase().endsWith(".pdf") &&
        !name.endsWith(".crdownload"));
      if (hit) {
        const full = join(downloadDir, hit);
        if (statSync(full).size > 5000) { pdf = full; break; }
      }
    }
    await sleep(100);
  }
  if (!pdf) {
    const status = await evaluate("document.getElementById('fixture-status').textContent");
    throw new Error("pdf_not_downloaded: " + status);
  }
  const pdfBytes = readFileSync(pdf);
  assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
  const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
  if (info.status !== 0) throw new Error("pdfinfo_unavailable");
  const count = Number((info.stdout.match(/^Pages:\s+(\d+)/m) || [])[1]);
  assert.equal(count, 1, "PDF must be exactly 1 page; got " + count);
  const preview = spawnSync("pdftoppm", [
    "-f", "1", "-singlefile", "-png", "-r", "110", pdf,
    join(workDir, "estimate-preview")
  ], { encoding: "utf8" });
  assert.equal(preview.status, 0, "pdf_preview_render_failed");
  console.log("PASS: real browser PDF saved; size=" + pdfBytes.length + "; pages=" + count);
  // Never echo or persist any customer record; this is a demo-only PDF.
  // Continue in the *same* browser session: appointment -> completion ->
  // draft invoice -> explicit approval -> PDF -> unpaid -> safe match.
  await evaluate("document.getElementById('fixture-continue').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow').classList.contains('fixture-hidden')"),false);
  await evaluate("document.getElementById('fixture-work-interpret').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-review').classList.contains('fixture-hidden')"),false);
  await evaluate("document.getElementById('fixture-work-book').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-booked-summary').innerText.includes('Google未登録')"),true);
  console.log("PASS: fictional availability and explicit booking, no Google writes");
  await evaluate("document.getElementById('fixture-work-command').value='作業完了にして';document.getElementById('fixture-work-interpret').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-status').innerText.includes('承認')"),true);
  await evaluate("document.getElementById('fixture-complete').click()");
  await evaluate("document.getElementById('fixture-work-command').value='請求書を作って';document.getElementById('fixture-work-interpret').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-invoice-summary').innerText.includes('20,000円')"),true);
  console.log("PASS: existing Budil work completion and invoice draft");
  await evaluate("document.getElementById('fixture-invoice-approve').click()");
  await evaluate("document.getElementById('fixture-invoice-pdf').click()");
  let invoicePdf = "";
  for(let i=0;i<250;i++){
    const names=readdirSync(downloadDir);
    const match=names.find(n=>n.includes('請求書')&&n.toLowerCase().endsWith('.pdf')&&!n.endsWith('.crdownload'));
    if(match&&statSync(join(downloadDir,match)).size>5000){invoicePdf=join(downloadDir,match);break;}
    await sleep(100);
  }
  if(!invoicePdf)throw new Error("fixture_invoice_pdf_not_downloaded");
  const invoiceData=readFileSync(invoicePdf);
  assert.equal(invoiceData.subarray(0,5).toString('ascii'),'%PDF-');
  const invoiceInfo=spawnSync('pdfinfo',[invoicePdf],{encoding:'utf8'});
  assert.equal(invoiceInfo.status,0,"invoice_pdfinfo_failed");
  const invoicePageCount=Number((invoiceInfo.stdout.match(/^Pages:\s+(\d+)/m)||[])[1]);
  assert.equal(invoicePageCount,1,'Invoice A4 must fit in one page');
  const invoicePreview=spawnSync('pdftoppm',[
    '-f','1','-singlefile','-png','-r','110',invoicePdf,join(workDir,'invoice-preview')
  ],{encoding:'utf8'});
  assert.equal(invoicePreview.status,0,'invoice_preview_failed');
  console.log("PASS: actual 1-page fictional invoice PDF saved; size="+invoiceData.length);
  await evaluate("document.getElementById('fixture-work-command').value='未入金を教えて';document.getElementById('fixture-work-interpret').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-bank-summary').innerText.includes('20,000円')"),true);
  await evaluate("document.getElementById('fixture-bank-amount').value='20000';document.getElementById('fixture-bank-match').click()");
  assert.equal(await evaluate("document.getElementById('fixture-workflow-status').innerText.includes('未入金のまま')"),true);
  console.log("PASS: receivables computed and bank match did not mark paid");
  const width2=await evaluate("({scroll:document.documentElement.scrollWidth,inner:window.innerWidth})");
  assert.ok(width2.scroll<=width2.inner+2,'workflow has horizontal overflow');
  const screenshot2=await cdp.command('Page.captureScreenshot',{format:'png'});
  if(screenshot2.data)writeFileSync(join(workDir,'workflow-mobile-390.png'),Buffer.from(screenshot2.data,'base64'));
  // Fake server responses exercise the GPT-button flow WITHOUT any external API requests.
  await evaluate("document.getElementById('fixture-reset').click()");
  await evaluate("window.__gptFixtureReplies=[{\"ok\":true,\"phase\":\"interpret_only\",\"action\":\"estimate_create\",\"can_execute\":false,\"needs_user_input\":false,\"customer_name\":\"比嘉清子\",\"service_name\":\"エアコン洗浄\",\"quantity\":2,\"total_yen\":22000,\"amount_scope\":\"total\",\"tax_mode\":\"included\"},{\"ok\":true,\"phase\":\"interpret_only\",\"action\":\"estimate_create\",\"can_execute\":false,\"needs_user_input\":false,\"customer_name\":\"比嘉清子\",\"service_name\":\"エアコン洗浄\",\"quantity\":2,\"total_yen\":18000,\"amount_scope\":\"total\",\"tax_mode\":\"included\"},{\"ok\":true,\"phase\":\"interpret_only\",\"action\":\"estimate_revision\",\"can_execute\":false,\"needs_user_input\":false,\"total_yen\":20000,\"amount_scope\":\"total\",\"tax_mode\":\"included\"}];window.BudilCloud.interpretFixture=async()=>window.__gptFixtureReplies.shift()");
  await evaluate("document.getElementById('fixture-gpt-start').click()");
  for(let i=0;i<40;i++){
    if((await evaluate("document.getElementById('fixture-status').textContent")).includes('一致しません'))break;
    await sleep(30);
  }
  assert.equal(await evaluate("document.getElementById('fixture-candidates').classList.contains('fixture-hidden')"),true);
  console.log('PASS: simulated GPT hallucinated price rejected before customer confirmation');
  await evaluate("document.getElementById('fixture-gpt-start').click()");
  for(let i=0;i<40;i++){
    if(await evaluate("!document.getElementById('fixture-candidates').classList.contains('fixture-hidden')"))break;
    await sleep(30);
  }
  assert.equal(await evaluate("document.querySelectorAll('#fixture-candidate-list button').length"),1);
  await evaluate("document.querySelector('#fixture-candidate-list button').click()");
  await evaluate("document.getElementById('fixture-revision').value='金額を税込20,000円に変更';document.getElementById('fixture-gpt-revise').click()");
  for(let i=0;i<40;i++){
    if(await evaluate("document.getElementById('fixture-draft-summary').innerText.includes('20,000円')"))break;
    await sleep(30);
  }
  assert.equal(await evaluate("document.getElementById('fixture-draft-summary').innerText.includes('20,000円')"),true);
  assert.equal(await evaluate("document.getElementById('fixture-approved').classList.contains('fixture-hidden')"),true);
  await evaluate("document.getElementById('fixture-approve').click()");
  assert.equal(await evaluate("document.getElementById('fixture-approved-summary').innerText.includes('20,000円')"),true);
  console.log('PASS: mocked GPT quote and revision retain human approvals');
  // Entire anonymous quotation UI path with MOCKED GPT response. It must
  // never access or send real customers, and require manual selection.
  await evaluate("document.getElementById('privacy-preview').click()");
  const wireText=await evaluate("document.getElementById('privacy-wire').textContent");
  assert.ok(wireText.includes('お客様のエアコンクリーニング1台を税抜8000円'));
  assert.ok(!wireText.includes('山田花子'),'privacy preview must not expose original customer');
  console.log('PASS: browser anonymizes original fictitious name without network');

  const fakeReply={
    ok:true, phase:'interpret_only', input_mode:'anonymized',
    requires_human_approval:true, action:'estimate_create', can_execute:false,
    needs_user_input:false, customer_name:'お客様', service_name:'エアコン洗浄',
    quantity:2,total_yen:18000,tax_mode:'included',amount_scope:'total'
  };
  await evaluate("window.__privacyServerCalls=0;window.BudilCloud.interpretAnonymizedQuote=async()=>{window.__privacyServerCalls++;return "+JSON.stringify(fakeReply)+"}");
  await evaluate("document.getElementById('privacy-instruction').value='実顧客太郎さんのエアコン洗浄2台を税込18,000円で見積して';document.getElementById('privacy-send').click()");
  assert.equal(await evaluate("window.__privacyServerCalls"),0);
  assert.equal(await evaluate("document.getElementById('privacy-candidates').classList.contains('fixture-hidden')"),true);
  console.log('PASS: live/nonfictional name cannot trigger external request from demo');

  await evaluate("document.getElementById('privacy-instruction').value='田中太郎さんのエアコン洗浄2台を税込18,000円で見積して';document.getElementById('privacy-send').click()");
  for(let i=0;i<80;i++){
    if(await evaluate("!document.getElementById('privacy-candidates').classList.contains('fixture-hidden')"))break;
    await sleep(40);
  }
  assert.equal(await evaluate("window.__privacyServerCalls"),1);
  assert.equal(await evaluate("document.querySelectorAll('#privacy-candidate-list button').length"),2);
  console.log('PASS: anonymous GPT result reaches local customer resolution (2 equal names)');
  await evaluate("document.querySelectorAll('#privacy-candidate-list button')[1].click()");
  assert.equal(await evaluate("document.getElementById('privacy-draft-summary').innerText.includes('18,000円')"),true);
  assert.equal(await evaluate("document.getElementById('privacy-approved').classList.contains('fixture-hidden')"),true);
  await evaluate("document.getElementById('privacy-revision').value='金額を税込20,000円に変更';document.getElementById('privacy-revise').click()");
  assert.equal(await evaluate("document.getElementById('privacy-draft-summary').innerText.includes('20,000円')"),true);
  await evaluate("document.getElementById('privacy-approve').click()");
  assert.equal(await evaluate("document.getElementById('privacy-approved-summary').innerText.includes('20,000円')"),true);
  console.log('PASS: anonymous local quote revision and explicit approval');

  const existingPdfs=new Set(readdirSync(downloadDir).filter(x=>x.endsWith('.pdf')));
  await evaluate("document.getElementById('privacy-pdf').click()");
  let privatePdf='';
  for(let i=0;i<260;i++){
    const files=readdirSync(downloadDir).filter(x=>x.endsWith('.pdf')&&!existingPdfs.has(x));
    if(files.length){
      const full=join(downloadDir,files[0]);
      if(statSync(full).size>5000){privatePdf=full;break;}
    }
    await sleep(100);
  }
  if(!privatePdf){
    const msg=await evaluate("document.getElementById('privacy-status').textContent");
    throw Error('anonymized_fixture_pdf_not_saved: '+msg);
  }
  const pdfCheck=spawnSync('pdfinfo',[privatePdf],{encoding:'utf8'});
  assert.equal(pdfCheck.status,0);
  assert.equal(Number((pdfCheck.stdout.match(/^Pages:\s+(\d+)/m)||[])[1]),1);
  assert.equal((await evaluate("window.__privacyServerCalls")),1,
    'local revisions/approval/PDF must not send another GPT call');
  const safeWidth=await evaluate("({scroll:document.documentElement.scrollWidth,inner:window.innerWidth})");
  assert.ok(safeWidth.scroll<=safeWidth.inner+2,'privacy section 390px overflow');
  const shot=await cdp.command('Page.captureScreenshot',{format:'png'});
  if(shot.data)writeFileSync(join(workDir,'anonymized-mobile-390.png'),Buffer.from(shot.data,'base64'));
  console.log('PASS: anonymized quote A4 single-page PDF and 390px privacy view');
  console.log("BUDIL_GPT_BROWSER_E2E_PASS");

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

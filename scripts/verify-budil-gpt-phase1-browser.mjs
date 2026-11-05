/**
 * Budil GPT Phase 1 isolated headless browser acceptance.
 * ONLY fixture data. Uses a dedicated Chrome profile and localhost static server.
 * Run: node scripts/verify-budil-gpt-phase1-browser.mjs
 * Browser executable: CHROME_BIN or google-chrome/chromium.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workDir = mkdtempSync(join(tmpdir(), "budil-gpt-browser-"));
const userDataDir = join(workDir, "chrome-profile");
const downloadDir = join(workDir, "downloads");
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
  console.log("PASS: real browser PDF saved; size=" + pdfBytes.length);
  // Never echo or persist any customer record; this is a demo-only PDF.
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

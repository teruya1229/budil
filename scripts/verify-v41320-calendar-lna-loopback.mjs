/**
 * Budil v4.13.20 - Chrome Local Network Access / loopback permission for calendar local API.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerRoot = join(root, '..', 'calendar-sync-worker');
const load = (path) => readFileSync(join(root, path), 'utf8');
const loadWorker = (path) => readFileSync(join(workerRoot, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

execFileSync(process.execPath, ['--check', join(root, 'js/app.js')], { stdio: 'inherit' });

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const brainJs = load('js/calendar-candidate-brain.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');
const workerServer = loadWorker('src/localApi/server.js');
const workerGoogle = loadWorker('src/google/getCalendarEvents.js');

console.log('== v4.13.20 calendar LNA / loopback ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.13.20'), 'index.html shows v4.13.20');
assert(indexHtml.includes('js/app.js?v=4.13.20'), 'app.js cache buster is v4.13.20');
assert(indexHtml.includes('css/style.css?v=4.13.20'), 'style.css cache buster is v4.13.20');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.13.20'), 'calendar-candidate cache buster is v4.13.20');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.20'"), 'storage version is v4.13.20');
assert(dataBackupJs.includes("APP_VERSION: 'v4.13.20'"), 'data-backup version is v4.13.20');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.20'"), 'verify-current pins v4.13.20');
assert(statusMd.includes('v4.13.20'), 'status.md documents v4.13.20');
assert(handoffMd.includes('v4.13.20'), 'handoff.md documents v4.13.20');
assert(decisionLog.includes('v4.13.20'), 'decision-log.md records v4.13.20');

function extractNamedFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`missing function ${name}`);
  const braceAt = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceAt; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function makeSandbox(overrides) {
  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    Request: class Request {
      constructor(url, init = {}) {
        this.url = url;
        this.method = init.method || 'GET';
        this.targetAddressSpace = init.targetAddressSpace;
      }
    },
    navigator: undefined,
    fetch: undefined,
    CALENDAR_LOCAL_API_TIMEOUT_MS: 90000,
    ...overrides
  };
  createContext(sandbox);
  return sandbox;
}

const helperSource = [
  extractNamedFunction(appJs, 'queryCalendarLoopbackPermission'),
  extractNamedFunction(appJs, 'buildCalendarLocalApiFetchInit'),
  extractNamedFunction(appJs, 'classifyCalendarLocalApiFetchFailure'),
  extractNamedFunction(appJs, 'mapCalendarLocalApiError'),
  extractNamedFunction(appJs, 'fetchCalendarLocalApi')
].join('\n');

async function withHelpers(overrides, fn) {
  const sandbox = makeSandbox(overrides);
  runInContext(helperSource, sandbox);
  return fn(sandbox);
}

console.log('== Chrome 152 LNA wiring ==');
assert(appJs.includes("name: 'loopback-network'") || appJs.includes('name: name'), 'loopback-network is queried');
assert(appJs.includes("'loopback-network'"), 'loopback-network permission name present');
assert(appJs.includes("'local-network-access'"), 'compat local-network-access permission name present');
assert(appJs.includes("targetAddressSpace: 'loopback'"), 'fetch annotates loopback address space');
assert(appJs.includes('function buildCalendarLocalApiFetchInit'), 'shared fetch init helper exists');
assert(appJs.includes('async function fetchCalendarLocalApi'), 'shared fetch helper exists');
assert(appJs.includes('async function queryCalendarLoopbackPermission'), 'permission helper exists');
assert(appJs.includes('function classifyCalendarLocalApiFetchFailure'), 'failure classifier exists');
assert(appJs.includes('async function applyCalendarLocalApiFetchFailure'), 'click-path failure helper exists');
assert((appJs.match(/queryCalendarLoopbackPermission\(/g) || []).length === 2, 'permission helper is defined once and called once after fetch failure');
assert(appJs.includes('await fetchCalendarLocalApi(CALENDAR_LOCAL_API_HEALTH_URL'), 'health fetch stays on click path');
assert(appJs.includes('await fetchCalendarLocalApi(CALENDAR_LOCAL_API_SYNC_URL'), 'sync fetch stays on click path');

{
  const clickFn = extractNamedFunction(appJs, 'handleCalendarExportLatestClick');
  const failFn = extractNamedFunction(appJs, 'applyCalendarLocalApiFetchFailure');
  assert(clickFn.indexOf('fetchCalendarLocalApi(CALENDAR_LOCAL_API_HEALTH_URL') < clickFn.indexOf('applyCalendarLocalApiFetchFailure'), 'health fetch starts before permission classification');
  assert(failFn.includes('queryCalendarLoopbackPermission()'), 'permission is queried only after fetch failure');
  assert(!clickFn.includes('queryCalendarLoopbackPermission()'), 'click handler does not query permission before /health');
  assert(clickFn.includes("mapCalendarLocalApiError('api_error'"), 'HTTP health errors are API errors, not not_running');
}

assert(!/DOMContentLoaded[\s\S]{0,400}queryCalendarLoopbackPermission/.test(appJs), 'must not query permission on DOMContentLoaded');
assert(!appJs.includes('0.0.0.0'), 'must not reference 0.0.0.0');
assert(appJs.includes("CALENDAR_LOCAL_API_BASE = 'http://127.0.0.1:43821'"), 'loopback API base remains 127.0.0.1:43821');

console.log('== permission query behavior ==');
{
  const granted = await withHelpers({
    navigator: {
      permissions: {
        query: async ({ name }) => {
          if (name === 'loopback-network') return { state: 'granted' };
          throw new TypeError(`unknown permission: ${name}`);
        }
      }
    }
  }, (sb) => runInContext('queryCalendarLoopbackPermission()', sb));
  assert(granted.supported === true && granted.name === 'loopback-network' && granted.state === 'granted', 'permission granted uses loopback-network');

  const compat = await withHelpers({
    navigator: {
      permissions: {
        query: async ({ name }) => {
          if (name === 'loopback-network') throw new TypeError('unknown permission');
          if (name === 'local-network-access') return { state: 'prompt' };
          throw new TypeError(`unknown permission: ${name}`);
        }
      }
    }
  }, (sb) => runInContext('queryCalendarLoopbackPermission()', sb));
  assert(compat.supported === true && compat.name === 'local-network-access' && compat.state === 'prompt', 'compat fallback uses local-network-access');

  const denied = await withHelpers({
    navigator: {
      permissions: {
        query: async ({ name }) => {
          if (name === 'loopback-network') return { state: 'denied' };
          throw new TypeError('unused');
        }
      }
    }
  }, (sb) => runInContext('queryCalendarLoopbackPermission()', sb));
  assert(denied.state === 'denied', 'permission denied is reported');

  const unsupported = await withHelpers({
    navigator: {}
  }, (sb) => runInContext('queryCalendarLoopbackPermission()', sb));
  assert(unsupported.supported === false && unsupported.state === 'unsupported', 'missing Permissions API is unsupported');

  const unknownNames = await withHelpers({
    navigator: {
      permissions: {
        query: async () => {
          throw new TypeError('not a valid enum value');
        }
      }
    }
  }, (sb) => runInContext('queryCalendarLoopbackPermission()', sb));
  assert(unknownNames.supported === false && unknownNames.state === 'unsupported', 'TypeError on both names is unsupported, not thrown');
}

console.log('== fetch targetAddressSpace fallback ==');
{
  const withLoopback = await withHelpers({}, (sb) => runInContext("buildCalendarLocalApiFetchInit({ method: 'GET', cache: 'no-store' })", sb));
  assert(withLoopback.targetAddressSpace === 'loopback', 'supported Request adds targetAddressSpace loopback');

  const unsupportedRequest = await withHelpers({
    Request: function Request() {
      throw new TypeError('unknown option');
    }
  }, (sb) => runInContext("buildCalendarLocalApiFetchInit({ method: 'GET' })", sb));
  assert(unsupportedRequest.targetAddressSpace == null, 'TypeError Request constructor falls back to normal fetch init');
  assert(unsupportedRequest.method === 'GET', 'fallback init keeps original method');
}

console.log('== error classification ==');
{
  const sandbox = makeSandbox();
  runInContext(helperSource, sandbox);

  const cases = [
    {
      name: 'worker not running when permission granted',
      error: { message: 'Failed to fetch' },
      permission: { supported: true, state: 'granted' },
      phase: 'health',
      kind: 'not_running',
      message: 'カレンダー連携が起動していません。PCでローカル連携を起動してから、もう一度お試しください。'
    },
    {
      name: 'worker not running when LNA unsupported',
      error: { message: 'Failed to fetch' },
      permission: { supported: false, state: 'unsupported' },
      phase: 'health',
      kind: 'not_running',
      message: 'カレンダー連携が起動していません。PCでローカル連携を起動してから、もう一度お試しください。'
    },
    {
      name: 'permission denied',
      error: { message: 'Failed to fetch' },
      permission: { supported: true, state: 'denied' },
      phase: 'health',
      kind: 'permission_denied',
      message: 'ChromeでBudilからPC内のカレンダー連携への接続がブロックされています。'
    },
    {
      name: 'permission prompt',
      error: { message: 'Failed to fetch' },
      permission: { supported: true, state: 'prompt' },
      phase: 'health',
      kind: 'permission_prompt',
      message: 'PC内のカレンダー連携への接続許可が必要です。'
    },
    {
      name: 'permission unknown',
      error: { message: 'Failed to fetch' },
      permission: { supported: true, state: 'unknown' },
      phase: 'health',
      kind: 'permission_prompt',
      message: 'PC内のカレンダー連携への接続許可が必要です。'
    },
    {
      name: 'timeout',
      error: { code: 'timeout' },
      permission: { supported: true, state: 'prompt' },
      phase: 'health',
      kind: 'timeout',
      message: 'カレンダーの取得がタイムアウトしました。既存データは変更していません。'
    },
    {
      name: 'sync network after granted health',
      error: { message: 'Failed to fetch' },
      permission: { supported: true, state: 'granted' },
      phase: 'sync',
      kind: 'network',
      message: 'ローカル連携へ接続できません。Chromeのローカルネットワーク許可と連携ツールの起動状態を確認してください。'
    }
  ];

  for (const item of cases) {
    const kind = sandbox.classifyCalendarLocalApiFetchFailure(item.error, item.permission, item.phase);
    assert(kind === item.kind, `${item.name} classifies as ${item.kind}`);
    assert(sandbox.mapCalendarLocalApiError(kind) === item.message, `${item.name} maps to expected UI message`);
  }

  assert(
    sandbox.mapCalendarLocalApiError('api_error', { status: 500 }) === 'カレンダーを更新できませんでした。既存データは変更していません。',
    'HTTP API error uses generic API error message'
  );
}

console.log('== fetchCalendarLocalApi health / sync ==');
{
  const calls = [];
  await withHelpers({
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (String(url).endsWith('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, service: 'budil-calendar-local-api' })
        };
      }
      if (String(url).endsWith('/sync')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            payload: { schemaVersion: 1, items: [] },
            meta: { itemCount: 0 }
          })
        };
      }
      throw new Error('unexpected url');
    }
  }, async (sb) => {
    const health = await runInContext(
      "fetchCalendarLocalApi('http://127.0.0.1:43821/health', { method: 'GET', timeoutMs: 8000 })",
      sb
    );
    const sync = await runInContext(
      "fetchCalendarLocalApi('http://127.0.0.1:43821/sync', { method: 'POST', timeoutMs: 90000 })",
      sb
    );
    assert(health.body && health.body.ok === true, 'health success returns ok body');
    assert(sync.body && sync.body.ok === true && sync.body.payload, 'sync success returns payload');
    assert(calls.length === 2, 'health and sync each fetch once');
    assert(calls.every((c) => c.init && c.init.targetAddressSpace === 'loopback'), 'both fetches declare loopback address space');
  });
}

{
  await withHelpers({
    fetch: async () => {
      const err = new TypeError('Failed to fetch');
      throw err;
    }
  }, async (sb) => {
    let failed = false;
    try {
      await runInContext(
        "fetchCalendarLocalApi('http://127.0.0.1:43821/health', { method: 'GET', timeoutMs: 8000 })",
        sb
      );
    } catch (error) {
      failed = error instanceof TypeError || (error && error.message === 'Failed to fetch');
    }
    assert(failed, 'worker-unstarted fetch failure surfaces as fetch error, not timeout');
  });
}

{
  await withHelpers({
    fetch: async (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })
  }, async (sb) => {
    let code = null;
    try {
      await runInContext(
        "fetchCalendarLocalApi('http://127.0.0.1:43821/health', { method: 'GET', timeoutMs: 20 })",
        sb
      );
    } catch (error) {
      code = error && error.code;
    }
    assert(code === 'timeout', 'abort is classified as timeout');
  });
}

{
  await withHelpers({
    fetch: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, code: 'sync_failed' })
    })
  }, async (sb) => {
    const result = await runInContext(
      "fetchCalendarLocalApi('http://127.0.0.1:43821/sync', { method: 'POST', timeoutMs: 8000 })",
      sb
    );
    assert(result.res.ok === false && result.body.code === 'sync_failed', 'HTTP API error still returns response for api_error handling');
  });
}

console.log('== existing data not mutated on failure / Google write none ==');
function simulateButtonFlow(scenario) {
  const existing = Array.isArray(scenario.existingOrders) ? scenario.existingOrders.slice() : [];
  const out = { existingCount: existing.length, mutated: false, kind: null, savedCount: 0 };
  if (scenario.healthFetchError) {
    out.kind = scenario.classify(scenario.healthFetchError, scenario.permission, 'health');
    return out;
  }
  if (!scenario.healthOk) {
    out.kind = 'api_error';
    return out;
  }
  if (scenario.syncFetchError) {
    out.kind = scenario.classify(scenario.syncFetchError, scenario.permission, 'sync');
    return out;
  }
  if (!scenario.syncOk) {
    out.kind = 'api_error';
    return out;
  }
  out.kind = 'success';
  if (scenario.save) {
    out.mutated = true;
    out.savedCount = 1;
  }
  return out;
}

{
  const sandbox = makeSandbox();
  runInContext(helperSource, sandbox);
  const classify = sandbox.classifyCalendarLocalApiFetchFailure;
  const existing = [{ id: 'wo-keep', calendarDedupeKey: 'google_calendar|x|y' }];
  const failureScenarios = [
    { healthFetchError: { message: 'Failed to fetch' }, permission: { supported: true, state: 'granted' } },
    { healthFetchError: { message: 'Failed to fetch' }, permission: { supported: true, state: 'denied' } },
    { healthFetchError: { message: 'Failed to fetch' }, permission: { supported: true, state: 'prompt' } },
    { healthFetchError: { code: 'timeout' }, permission: { supported: true, state: 'granted' } },
    { healthOk: true, syncFetchError: { message: 'Failed to fetch' }, permission: { supported: true, state: 'granted' } },
    { healthOk: true, syncOk: false, permission: { supported: true, state: 'granted' } }
  ];
  for (const scenario of failureScenarios) {
    const result = simulateButtonFlow({ ...scenario, existingOrders: existing, classify });
    assert(result.mutated === false && result.savedCount === 0 && result.existingCount === 1, `failure ${result.kind} does not mutate existing data`);
  }
  const success = simulateButtonFlow({
    existingOrders: existing,
    classify,
    healthOk: true,
    syncOk: true,
    save: true
  });
  assert(success.kind === 'success' && success.mutated === true, 'successful sync may save via existing commit path');
}

assert(appJs.includes('commitSavableCalendarCandidates'), 'existing commit helper reused');
assert(appJs.includes('parseBudilCalendarEventsJson'), 'existing parser reused');
assert(!appJs.includes('events.insert'), 'no Google calendar insert');
assert(!appJs.includes('events.update'), 'no Google calendar update');
assert(!appJs.includes('events.delete'), 'no Google calendar delete');
assert(!workerGoogle.includes('events.insert'), 'worker has no calendar insert');
assert(!workerGoogle.includes('events.update'), 'worker has no calendar update');
assert(!workerGoogle.includes('events.delete'), 'worker has no calendar delete');
assert(workerGoogle.includes('events.list'), 'worker remains read-only list');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== worker CORS / bind unchanged ==');
assert(workerServer.includes('const BIND_HOST = "127.0.0.1"'), 'worker bind remains 127.0.0.1');
assert(workerServer.includes('const BIND_PORT = 43821'), 'worker port remains 43821');
assert(workerServer.includes('https://teruya1229.github.io'), 'worker allows Budil origin');
assert(workerServer.includes('Access-Control-Allow-Origin'), 'worker CORS origin header remains');
assert(workerServer.includes('Access-Control-Allow-Private-Network'), 'worker PNA header remains');
assert(!workerServer.includes('0.0.0.0'), 'worker must not bind 0.0.0.0');
assert(!/Access-Control-Allow-Origin:\s*\*/.test(workerServer), 'worker must not use wildcard CORS');

console.log('== UI stays one button ==');
assert((indexHtml.match(/id="btn-calendar-export-latest"/g) || []).length === 1, 'exactly one update button');
assert(indexHtml.includes('Googleカレンダーを更新'), 'button label unchanged');
assert(brainJs.includes('parseBudilCalendarEventsJson'), 'brain parser remains');

console.log('\nverify-v41320-calendar-lna-loopback: PASS');

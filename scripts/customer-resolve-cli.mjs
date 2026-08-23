#!/usr/bin/env node
/**
 * Budil customer-resolve CLI — leads Canonical Data の read-only 顧客解決入口。
 *
 * 使い方:
 *   node scripts/customer-resolve-cli.mjs resolve --leads-file <path>   < stdin.json
 *   node scripts/customer-resolve-cli.mjs shape-probe --leads-file <path>
 *
 * - 氏名・電話・メールを argv に載せない（stdin JSON のみ）
 * - `--input-json` 拒否
 * - leads への書込なし。前後ハッシュ一致を検証
 * - stdout は JSON 1行のみ。PII を stderr に出さない
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  statSync
} from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_STDIN_BYTES = 16 * 1024;
const MAX_LEADS_FILE_BYTES = 32 * 1024 * 1024;

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function loadJs(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function safeLog(message) {
  process.stderr.write(`[customer-resolve] ${message}\n`);
}

function printResult(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = val;
        i += 1;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

function createBrainContext() {
  const ctx = createContext({
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    RegExp,
    BigInt,
    module: { exports: {} },
    exports: {}
  });
  runInContext(loadJs('js/map-brain.js'), ctx, { filename: 'map-brain.js' });
  runInContext(loadJs('js/customer-resolve-entrypoint.js'), ctx, {
    filename: 'customer-resolve-entrypoint.js'
  });
  runInContext(
    'this.MapBrain = MapBrain; this.CustomerResolveEntrypoint = CustomerResolveEntrypoint;',
    ctx
  );
  return ctx;
}

function assertSafeLeadsPath(pathText) {
  const resolved = resolve(String(pathText));
  if (!resolved || resolved.includes('\0')) {
    throw new Error('path_rejected');
  }
  if (basename(resolved).includes('..')) {
    throw new Error('path_rejected');
  }
  // UNC / 相対混入拒否
  if (String(pathText).startsWith('\\\\') || String(pathText).includes('..')) {
    throw new Error('path_rejected');
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error('leads_file_missing');
  }
  const size = statSync(resolved).size;
  if (size <= 0 || size > MAX_LEADS_FILE_BYTES) {
    throw new Error('leads_file_size');
  }
  return resolved;
}

function unwrapScriptWrapper(text) {
  let body = String(text || '').trim();
  if (body.startsWith('Script ran on page')) {
    const fence = body.indexOf('```');
    if (fence >= 0) {
      const after = body.slice(fence);
      const m = after.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) body = m[1].trim();
    }
  }
  return body;
}

function extractLeadsArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.leads)) return parsed.leads;
    if (Array.isArray(parsed.budil_leads)) return parsed.budil_leads;
    if (parsed.data && typeof parsed.data === 'object') {
      const d = parsed.data;
      if (Array.isArray(d.budil_leads)) return d.budil_leads;
      if (typeof d.budil_leads === 'string') {
        const inner = JSON.parse(d.budil_leads);
        if (Array.isArray(inner)) return inner;
      }
    }
    if (typeof parsed.budil_leads === 'string') {
      const inner = JSON.parse(parsed.budil_leads);
      if (Array.isArray(inner)) return inner;
    }
  }
  if (typeof parsed === 'string') {
    return extractLeadsArray(JSON.parse(parsed));
  }
  throw new Error('leads_shape_invalid');
}

function loadLeadsFile(pathText) {
  const path = assertSafeLeadsPath(pathText);
  const buf = readFileSync(path);
  const hashBefore = sha256Hex(buf);
  const text = unwrapScriptWrapper(buf.toString('utf8'));
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 二重エンコードされた JSON 文字列
    try {
      parsed = JSON.parse(JSON.parse(text));
    } catch {
      throw new Error('leads_json_invalid');
    }
  }
  // exportPayload 形式でキーが文字列化されている場合
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.budil_leads === 'undefined') {
    // top-level keys may themselves be stringified records
    if (typeof parsed.exportedAt === 'string' || typeof parsed.version === 'string') {
      // already handled below via extract
    }
  }
  // 一部バックアップは top-level が string 値のキー集合
  if (parsed && typeof parsed === 'object' && typeof parsed.budil_leads === 'string') {
    try {
      const maybe = JSON.parse(parsed.budil_leads);
      if (Array.isArray(maybe)) {
        return { leads: maybe, hashBefore, path, bytes: buf.length };
      }
    } catch {
      /* fall through */
    }
  }
  const leads = extractLeadsArray(parsed);
  return { leads, hashBefore, path, bytes: buf.length };
}

function verifyUnchanged(path, hashBefore) {
  const buf = readFileSync(path);
  const hashAfter = sha256Hex(buf);
  if (hashAfter !== hashBefore) {
    throw new Error('side_effect_detected');
  }
  return hashAfter;
}

function readStdinLimited() {
  let buf;
  try {
    buf = readFileSync(0);
  } catch {
    throw new Error('input_required');
  }
  if (!buf || buf.length === 0) throw new Error('input_required');
  if (buf.length > MAX_STDIN_BYTES) throw new Error('stdin_too_large');
  return buf.toString('utf8');
}

function loadInput(args) {
  if (args['input-json']) {
    throw new Error('input_json_rejected');
  }
  if (args.input && args.input !== '-') {
    throw new Error('input_path_rejected');
  }
  const stdin = readStdinLimited();
  if (!stdin.trim()) throw new Error('input_required');
  return JSON.parse(stdin);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || !['resolve', 'shape-probe'].includes(command)) {
    printResult({
      ok: false,
      status: 'invalid_input',
      code: 'USAGE',
      message: 'resolve | shape-probe',
      invoiceApplyAllowed: false,
      memoryWrite: false
    });
    process.exit(2);
  }

  let loaded;
  try {
    if (!args['leads-file']) throw new Error('leads_file_required');
    loaded = loadLeadsFile(args['leads-file']);
  } catch (err) {
    const msg = err && err.message ? err.message : 'leads_load_failed';
    const codeMap = {
      path_rejected: 'PATH_REJECTED',
      leads_file_missing: 'LEADS_FILE_MISSING',
      leads_file_size: 'LEADS_FILE_SIZE',
      leads_json_invalid: 'LEADS_JSON_INVALID',
      leads_shape_invalid: 'LEADS_SHAPE_INVALID',
      leads_file_required: 'LEADS_FILE_REQUIRED'
    };
    printResult({
      ok: false,
      status: 'invalid_input',
      code: codeMap[msg] || 'LEADS_LOAD_FAILED',
      message: 'leads を読めません',
      invoiceApplyAllowed: false,
      memoryWrite: false
    });
    process.exit(msg === 'path_rejected' ? 2 : 1);
  }

  const ctx = createBrainContext();
  const Entrypoint = ctx.CustomerResolveEntrypoint;

  try {
    if (command === 'shape-probe') {
      const probe = Entrypoint.shapeProbe(loaded.leads);
      const hashAfter = verifyUnchanged(loaded.path, loaded.hashBefore);
      printResult({
        ...probe,
        hashBefore: loaded.hashBefore,
        hashAfter,
        hashMatch: hashAfter === loaded.hashBefore,
        bytes: loaded.bytes,
        invoiceApplyAllowed: false,
        memoryWrite: false,
        piiEmitted: false
      });
      safeLog(`shape-probe ok count=${probe.count}`);
      process.exit(0);
    }

    let input;
    try {
      input = loadInput(args);
    } catch (err) {
      const msg = err && err.message ? err.message : 'invalid_input';
      const code =
        msg === 'input_json_rejected'
          ? 'INPUT_JSON_REJECTED'
          : msg === 'stdin_too_large'
            ? 'STDIN_TOO_LARGE'
            : msg === 'input_path_rejected'
              ? 'INPUT_PATH_REJECTED'
              : 'INVALID_INPUT';
      printResult({
        ok: false,
        status: 'invalid_input',
        code,
        message: 'input JSON を読めません',
        invoiceApplyAllowed: false,
        memoryWrite: false
      });
      process.exit(code === 'INPUT_JSON_REJECTED' || code === 'STDIN_TOO_LARGE' ? 2 : 1);
    }

    const result = Entrypoint.resolve(input, { leads: loaded.leads });
    const hashAfter = verifyUnchanged(loaded.path, loaded.hashBefore);
    result.hashMatch = hashAfter === loaded.hashBefore;
    result.sideEffects = false;
    printResult(result);
    safeLog(`resolve ${result.status}`);
    if (result.status === 'invalid_input') process.exit(2);
    if (result.status === 'not_found' || result.status === 'too_many') process.exit(1);
    // matched / needs_confirmation / ambiguous → 0（呼び出し側が confirmation を扱う）
    process.exit(0);
  } catch (err) {
    const msg = err && err.message === 'side_effect_detected' ? 'SIDE_EFFECT' : 'INTERNAL';
    printResult({
      ok: false,
      status: 'invalid_input',
      code: msg,
      message: 'customer-resolve 失敗',
      invoiceApplyAllowed: false,
      memoryWrite: false
    });
    safeLog(`error ${msg}`);
    process.exit(1);
  }
}

main();

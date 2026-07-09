/**
 * Budil v4.12.7 current verify chain runner.
 * Runs v4.10.0–v4.10.42, v4.11.x, and v4.12.0–v4.12.7 feature verifies only.
 * Legacy v4.8/v4.9 verifies are excluded; see scripts/verify-legacy-reference.mjs.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptsDir = join(root, 'scripts');
const EXPECTED_VERSION = 'v4.12.7';

const CURRENT_PATTERN = /^verify-v4(10|11|12)\d.*\.mjs$/;

function discoverCurrentScripts() {
  return readdirSync(scriptsDir)
    .filter((name) => CURRENT_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const scripts = discoverCurrentScripts();

console.log(`== Budil ${EXPECTED_VERSION} current verify chain ==`);
console.log(`scripts: ${scripts.length}`);

const failures = [];
let passed = 0;

for (const script of scripts) {
  const path = join(scriptsDir, script);
  process.stdout.write(`\n-- ${script} --\n`);
  const result = spawnSync(process.execPath, [path], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) {
    passed += 1;
  } else {
    failures.push({ script, code: result.status ?? 1 });
  }
}

console.log('\n== current verify chain summary ==');
console.log(`passed: ${passed}/${scripts.length}`);
if (failures.length) {
  console.log('failed:');
  for (const f of failures) console.log(`  - ${f.script} (exit ${f.code})`);
  process.exit(1);
}

console.log(`All ${scripts.length} current-chain verify scripts passed.`);

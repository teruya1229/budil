/**
 * Budil legacy/reference verify runner (v4.8 / v4.9 era and auxiliary checks).
 * Not part of current release pass/fail. Run manually for historical regression.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptsDir = join(root, 'scripts');

const LEGACY_EXPLICIT = [
  'verify-intake-parser.mjs',
  'verify-reception-actions.mjs',
  'verify-calendar-past-recovery.mjs'
];

const LEGACY_PATTERN = /^verify-v48\d.*\.mjs$|^verify-v49\d.*\.mjs$/;

function discoverLegacyScripts() {
  const fromDir = readdirSync(scriptsDir).filter((name) => LEGACY_PATTERN.test(name));
  const all = [...new Set([...fromDir, ...LEGACY_EXPLICIT])];
  return all.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const scripts = discoverLegacyScripts();

console.log('== Budil legacy/reference verify chain ==');
console.log(`scripts: ${scripts.length}`);
console.log('note: failures here do not block v4.12.7 current release');

const results = { passed: 0, failed: [] };

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
    results.passed += 1;
  } else {
    results.failed.push({ script, code: result.status ?? 1 });
  }
}

console.log('\n== legacy verify summary ==');
console.log(`passed: ${results.passed}/${scripts.length}`);
if (results.failed.length) {
  console.log('failed (reference only):');
  for (const f of results.failed) console.log(`  - ${f.script} (exit ${f.code})`);
}
console.log('legacy chain finished (non-blocking).');

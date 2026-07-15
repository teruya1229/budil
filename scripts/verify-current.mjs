/**
 * Budil v4.12.13 current verify chain runner.
 * Runs v4.10.0–v4.10.42, v4.11.x, and v4.12.0–v4.12.13 feature verifies only.
 * Legacy v4.8/v4.9 verifies are excluded; see scripts/verify-legacy-reference.mjs.
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptsDir = join(root, 'scripts');
const EXPECTED_VERSION = 'v4.12.13';

const CURRENT_PATTERN = /^verify-v4(10|11|12)\d.*\.mjs$/;

function discoverCurrentScripts() {
  return readdirSync(scriptsDir)
    .filter((name) => CURRENT_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Formal current-verify environment prerequisites.
 * Missing prerequisites are "検証環境不足", not Budil本体の不具合.
 */
function checkVerifyPrerequisites() {
  const missing = [];

  const workerBat = join(root, '..', 'calendar-sync-worker', 'run-budil-calendar-export.bat');
  if (!existsSync(workerBat)) {
    missing.push(
      `親階層の calendar-sync-worker/run-budil-calendar-export.bat が見つかりません\n` +
        `  期待パス: ${workerBat}`
    );
  }

  const functionsPkg = join(root, 'hub', 'functions', 'package.json');
  if (!existsSync(functionsPkg)) {
    missing.push(`hub/functions/package.json が見つかりません\n  期待パス: ${functionsPkg}`);
  } else {
    try {
      const requireFromFunctions = createRequire(functionsPkg);
      requireFromFunctions.resolve('googleapis');
    } catch {
      missing.push(
        `hub/functions の依存関係（googleapis）が解決できません\n` +
          `  hub/functions で npm install してください（Budil root では npm install しないでください）`
      );
    }
  }

  if (missing.length === 0) return;

  console.error('== 現行verify 実行前提チェック失敗 ==');
  console.error('');
  console.error('これは Budil 本体の不具合ではありません。');
  console.error('検証環境不足です。正式な開発環境を整えてから再実行してください。');
  console.error('');
  console.error('【不足している前提】');
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  console.error('');
  console.error('【正式な現行verify環境】');
  console.error('- Budil 単独 clone ではなく、親階層に sibling の calendar-sync-worker がある開発環境が正式です');
  console.error('- 正式verifyには sibling の calendar-sync-worker（run-budil-calendar-export.bat）が必要です');
  console.error('- Functions 検証には hub/functions 側の依存関係（googleapis 等）が必要です');
  console.error('- Budil root で npm install してはいけません（依存は hub/functions 側で入れます）');
  console.error('');
  console.error('【再実行コマンド】');
  console.error('  node scripts/verify-current.mjs');
  console.error('');
  process.exit(1);
}

checkVerifyPrerequisites();

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

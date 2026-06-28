/**
 * Budil v4.8.24 daily flow and navigation verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['app.js', 'executive-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveBrain = load('js/executive-brain.js');
const css = load('css/style.css');

console.log('== v4.8.24 daily flow and navigation ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.8.24'), 'header version should be v4.8.24');
assert(indexHtml.includes('Budil v4.8.24'), 'sidebar version should be v4.8.24');
assert(indexHtml.includes('js/app.js?v=4.8.24'), 'app.js cache buster should be v4.8.24');

assert(indexHtml.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068'), 'nav should use daily tasks label');
assert(!indexHtml.includes('nav-label">\u4eca\u65e5\u3084\u308b\u3053\u3068'), 'nav should not use old daily tasks label');
assert(indexHtml.includes('daily-revenue-quick-form'), 'daily revenue quick form should exist');
assert(indexHtml.includes('daily-upcoming-schedule'), 'daily upcoming schedule block should exist');
assert(indexHtml.includes('daily-improvement-list'), 'daily improvement list block should exist');
assert(indexHtml.includes('card-external-check-unified'), 'site check unified card should exist');

assert(appJs.includes("DAILY_TASKS_UI_LABEL = '\u6bce\u65e5\u3084\u308b\u3053\u3068'"), 'app should define daily tasks UI label');
assert(appJs.includes('handleDailyRevenueQuickSubmit'), 'daily revenue submit handler should exist');
assert(appJs.includes('renderDailyUpcomingScheduleHtml'), 'upcoming schedule renderer should exist');
assert(appJs.includes('renderDailyImprovementSection'), 'daily improvement section should exist');
assert(appJs.includes('\u58f2\u4e0a\u3092\u767b\u9332\u3057\u307e\u3057\u305f\u3002\u58f2\u4e0a\u4e00\u89a7\u3067\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002'), 'revenue save notice should exist');
assert(appJs.includes('EMPTY_DAILY_TASKS_COPY'), 'empty daily tasks copy constant should exist');
assert(appJs.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty daily tasks copy should exist');
assert(appJs.includes('EMPTY_SCHEDULE_COPY'), 'empty schedule copy constant should exist');
assert(appJs.includes('\u76f4\u8fd1\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093'), 'empty schedule copy should exist');

assert(!appJs.match(/onboarding-workflow-list[\s\S]*?<\/ul>[\s\S]{0,200}\u53d7\u4ed8\u30fb\u4e88\u7d04/), 'onboarding workflow list should not use old reception label');
assert(!appJs.match(/onboarding-workflow-list[\s\S]*?<\/ul>[\s\S]{0,200}\u4f5c\u696d\u4e88\u5b9a\u3092\u4f5c\u6210/), 'onboarding workflow list should not use old work order create label');
assert(appJs.includes('\u4f5c\u696d\u5f8c\u306b\u58f2\u4e0a\u767b\u9332'), 'onboarding should mention post-work revenue registration');

assert(executiveBrain.includes("label: '\u30ab\u30ec\u30f3\u30c0\u30fc\u767b\u9332'"), 'executive quick link should use calendar registration');
assert(executiveBrain.includes("label: '\u6bce\u65e5\u3084\u308b\u3053\u3068'"), 'executive quick link should use daily tasks label');
assert(!executiveBrain.includes("label: '\u53d7\u4ed8\u30fb\u4e88\u5b9a'"), 'executive should not use old reception label');

assert(css.includes('daily-flow-strip'), 'daily flow strip styles should exist');

console.log('All v4.8.24 daily flow and navigation checks passed.');

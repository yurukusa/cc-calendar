#!/usr/bin/env node

// cc-calendar — GitHub-style activity calendar for Claude Code.
// Shows YOU vs AI activity day-by-day. Ghost Days = AI worked while you rested.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const C = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  cyan:      '\x1b[36m',
  yellow:    '\x1b[33m',
  magenta:   '\x1b[35m',
  green:     '\x1b[32m',
};

const BLOCK  = ['░', '▒', '▓', '█'];
const DOW    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function lvl(h) {
  if (h <= 0) return 0;
  if (h < 1)  return 1;
  if (h < 4)  return 2;
  return 3;
}

// Load byDate from cc-agent-load --json
async function loadByDate() {
  const paths = [
    [join(homedir(), 'bin', 'cc-agent-load'), ['--json']],
    ['node', [join(homedir(), 'projects', 'cc-loop', 'cc-agent-load', 'cli.mjs'), '--json']],
  ];
  for (const [cmd, args] of paths) {
    try {
      const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate && Object.keys(json.byDate).length > 0) return json;
    } catch {}
  }
  return null;
}

const result = await loadByDate();

if (!result) {
  console.error('Error: Could not load data from cc-agent-load.');
  process.exit(1);
}

const { byDate, mainHours, subagentHours } = result;
const dateKeys = Object.keys(byDate).sort();

if (dateKeys.length === 0) {
  console.log('No activity data found.');
  process.exit(0);
}

// Build week grid: Sun-based weeks, starting from Sunday before first activity
const firstActivity = new Date(dateKeys[0]);
const today = new Date();
today.setHours(23, 59, 59, 0);

const startSun = new Date(firstActivity);
startSun.setHours(0, 0, 0, 0);
startSun.setDate(startSun.getDate() - startSun.getDay()); // rewind to Sunday

const weeks = [];
const cur = new Date(startSun);
while (cur <= today) {
  const week = [];
  for (let d = 0; d < 7; d++) {
    week.push(cur.toLocaleDateString('en-CA'));
    cur.setDate(cur.getDate() + 1);
  }
  weeks.push(week);
}

// Display last 26 weeks
const displayWeeks = weeks.slice(-26);

// ── Month header ─────────────────────────────────────────────────────────────
// Each week = 2 chars. 5-char indent for "Mon  ".
function buildMonthHeader(dw) {
  const months = dw.map(w => new Date(w[0]).getMonth());
  let header = '     '; // 5-char indent
  let i = 0;
  while (i < months.length) {
    const m = months[i];
    let count = 1;
    while (i + count < months.length && months[i + count] === m) count++;
    const space = count * 2;
    const label = MONTHS[m];
    header += (label + ' '.repeat(Math.max(0, space - label.length))).substring(0, space);
    i += count;
  }
  return header;
}

// ── Render rows (Sun=0 … Sat=6) ──────────────────────────────────────────────
// Each cell = 2 chars: [YOU_char][AI_char]
// Ghost Day: YOU is dim░, AI is bold+yellow BLOCK
// Colors: YOU=cyan, AI=yellow

const rows = [];

for (let d = 0; d < 7; d++) {
  let youRow = '';
  let aiRow  = '';

  for (const week of displayWeeks) {
    const day = week[d];
    const { main = 0, sub = 0 } = byDate[day] || {};
    const isGhost = main === 0 && sub > 0;
    const isBoth  = main > 0 && sub > 0;

    const youChar = BLOCK[lvl(main)];
    const aiChar  = BLOCK[lvl(sub)];

    if (isGhost) {
      youRow += `${C.dim}${youChar}${C.reset}`;
      aiRow  += `${C.bold}${C.yellow}${aiChar}${C.reset}`;
    } else {
      youRow += `${C.cyan}${youChar}${C.reset}`;
      aiRow  += `${C.yellow}${aiChar}${C.reset}`;
    }
  }

  rows.push({ label: DOW[d], youRow, aiRow });
}

// ── Stats ────────────────────────────────────────────────────────────────────
let ghostDays = 0, youOnlyDays = 0, bothDays = 0, aiOnlyDays = 0;
for (const dk of dateKeys) {
  const { main = 0, sub = 0 } = byDate[dk];
  if (main > 0 && sub > 0) bothDays++;
  else if (main > 0)        youOnlyDays++;
  else if (sub > 0)         { ghostDays++; aiOnlyDays++; }
}
const totalActiveDays = dateKeys.length;

// ── Print ─────────────────────────────────────────────────────────────────────
console.log();
console.log(`  ${C.bold}${C.cyan}cc-calendar${C.reset}  ${C.dim}— AI草カレンダー${C.reset}`);
console.log(`  ${'═'.repeat(52)}`);
console.log();

const monthHeader = buildMonthHeader(displayWeeks);
console.log(C.dim + monthHeader + C.reset);

for (const { label, youRow, aiRow } of rows) {
  // Each row: "Mon  " (5 chars) + [YOU cells] + "  " + [AI cells]
  console.log(`${C.cyan}${label}${C.reset}  ${youRow}  ${C.yellow}${label}${C.reset}  ${aiRow}`);
}

console.log();
console.log(`  ${C.cyan}█${C.reset} You  ${C.yellow}█${C.reset} AI  ${C.bold}${C.yellow}█${C.reset} Ghost Day  ░▒▓█ = none→light→heavy`);
console.log();
console.log(`  ${C.bold}▸ Period:${C.reset}      ${dateKeys[0]} → ${dateKeys[dateKeys.length - 1]}`);
console.log(`  ${C.bold}▸ Active Days:${C.reset} ${totalActiveDays} total`);
console.log(`  ├─ Both active:    ${C.bold}${C.cyan}${bothDays}${C.reset} days`);
console.log(`  ├─ You only:       ${youOnlyDays} days`);
console.log(`  └─ Ghost Days:     ${C.bold}${C.yellow}${ghostDays}${C.reset} days ${C.dim}(AI worked while you rested)${C.reset}`);
if (mainHours !== undefined) {
  console.log();
  console.log(`  ${C.cyan}Your hours:${C.reset}  ${mainHours.toFixed(1)}h`);
  console.log(`  ${C.yellow}AI hours:${C.reset}    ${subagentHours.toFixed(1)}h`);
}
if (ghostDays > 0) {
  const ghostPct = Math.round((ghostDays / totalActiveDays) * 100);
  console.log();
  console.log(`  ${C.bold}${C.yellow}👻 ${ghostDays} Ghost Days — AI was ${ghostPct}% of your active days${C.reset}`);
}
console.log();

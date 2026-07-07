// Dev tool: generates src/levels.js with 20 verified-solvable levels.
// Run from the project root:  node tools/generate-levels.mjs
//
// Levels are generated with a seeded RNG (reproducible), then checked with the
// real solver from src/solver.js. For each level we try many candidates and
// keep the one whose dependency structure best fits the target difficulty:
// more "waves" (fixpoint iterations) and fewer initially-movable ships = deeper.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solveLevel } from '../src/solver.js';

const NAMES = [
  'First Light', 'Gentle Tide', 'Quiet Moorings', 'Morning Ferry', "Fisherman's Return",
  'Crowded Quay', 'The Narrows', 'Cargo Day', 'Buoy Garden', 'Slack Water',
  'Rush at the Docks', 'Tangled Lanes', 'Old Pier', 'Harvest Fleet', 'Crossing Paths',
  'Full Berth', 'Patient Water', 'The Long Haul', 'Evening Jam', 'Grand Harbor',
  // The Strait (21-40): patrolled waters
  'The Strait', 'First Watch', 'Patrol Waters', 'Between Rounds', 'Quick Slip',
  'Two Sentries', 'Changing of the Guard', 'Under Escort', 'Measured Steps', 'Double Watch',
  'Flanked', 'Coast Runner', 'Three Watchers', 'The Cordon', 'Ring of Steel',
  'Four Corners', 'No Hurry', 'The Gauntlet', 'Quiet Defiance', 'Strait of Hormuz',
];

// tier 0: tutorial-ish, tier 1: order starts to matter, tier 2: dense boards
const SPECS = [
  { w: 6, h: 6, ships: 4, obstacles: 0, tier: 0 },
  { w: 6, h: 6, ships: 5, obstacles: 0, tier: 0 },
  { w: 7, h: 7, ships: 6, obstacles: 0, tier: 0 },
  { w: 7, h: 7, ships: 8, obstacles: 0, tier: 1 },
  { w: 8, h: 8, ships: 10, obstacles: 0, tier: 1 },
  { w: 8, h: 8, ships: 11, obstacles: 1, tier: 1 },
  { w: 8, h: 8, ships: 12, obstacles: 2, tier: 1 },
  { w: 9, h: 9, ships: 14, obstacles: 2, tier: 1 },
  { w: 9, h: 9, ships: 15, obstacles: 3, tier: 1 },
  { w: 10, h: 10, ships: 16, obstacles: 3, tier: 1 },
  { w: 10, h: 10, ships: 18, obstacles: 4, tier: 2 },
  { w: 10, h: 10, ships: 20, obstacles: 4, tier: 2 },
  { w: 11, h: 11, ships: 22, obstacles: 5, tier: 2 },
  { w: 11, h: 11, ships: 24, obstacles: 5, tier: 2 },
  { w: 12, h: 12, ships: 26, obstacles: 6, tier: 2 },
  { w: 12, h: 12, ships: 28, obstacles: 6, tier: 2 },
  { w: 12, h: 12, ships: 30, obstacles: 7, tier: 2 },
  { w: 13, h: 13, ships: 32, obstacles: 8, tier: 2 },
  { w: 13, h: 13, ships: 35, obstacles: 8, tier: 2 },
  { w: 14, h: 14, ships: 40, obstacles: 10, tier: 2 },
  // --- The Strait (21-40): patrol warships sweep the marked edges ------------
  // guards: edge N/S = a warship patrolling the top/bottom row, E/W = a column.
  { w: 9, h: 9, ships: 10, obstacles: 0, tier: 1, guards: [{ edge: 'N', length: 3, speed: 1.3 }] },
  { w: 9, h: 9, ships: 12, obstacles: 1, tier: 1, guards: [{ edge: 'N', length: 3, speed: 1.5 }] },
  { w: 10, h: 10, ships: 14, obstacles: 1, tier: 1, guards: [{ edge: 'S', length: 3, speed: 1.5 }] },
  { w: 10, h: 10, ships: 15, obstacles: 2, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.4 }] },
  { w: 10, h: 10, ships: 16, obstacles: 2, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.9 }] },
  { w: 11, h: 11, ships: 18, obstacles: 2, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.5 }, { edge: 'S', length: 3, speed: 1.7 }] },
  { w: 11, h: 11, ships: 19, obstacles: 3, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.6 }, { edge: 'S', length: 3, speed: 1.4 }] },
  { w: 11, h: 11, ships: 20, obstacles: 3, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.6 }, { edge: 'S', length: 3, speed: 1.9 }] },
  { w: 12, h: 12, ships: 22, obstacles: 4, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.7 }, { edge: 'S', length: 4, speed: 1.5 }] },
  { w: 12, h: 12, ships: 24, obstacles: 4, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.9 }, { edge: 'S', length: 3, speed: 2.1 }] },
  { w: 12, h: 12, ships: 24, obstacles: 3, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.6 }, { edge: 'E', length: 3, speed: 1.8 }] },
  { w: 12, h: 12, ships: 25, obstacles: 4, tier: 2, guards: [{ edge: 'S', length: 4, speed: 1.7 }, { edge: 'W', length: 3, speed: 1.5 }] },
  { w: 12, h: 12, ships: 26, obstacles: 4, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.6 }, { edge: 'S', length: 3, speed: 1.8 }, { edge: 'E', length: 3, speed: 1.5 }] },
  { w: 13, h: 13, ships: 28, obstacles: 5, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.7 }, { edge: 'S', length: 3, speed: 1.5 }, { edge: 'W', length: 3, speed: 1.9 }] },
  { w: 13, h: 13, ships: 28, obstacles: 5, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.4 }, { edge: 'S', length: 3, speed: 1.5 }, { edge: 'E', length: 3, speed: 1.3 }, { edge: 'W', length: 3, speed: 1.6 }] },
  { w: 13, h: 13, ships: 30, obstacles: 6, tier: 2, guards: [{ edge: 'N', length: 3, speed: 1.7 }, { edge: 'S', length: 4, speed: 1.5 }, { edge: 'E', length: 3, speed: 1.8 }, { edge: 'W', length: 3, speed: 1.4 }] },
  { w: 13, h: 13, ships: 32, obstacles: 6, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.9 }, { edge: 'S', length: 3, speed: 2.0 }, { edge: 'E', length: 3, speed: 1.6 }, { edge: 'W', length: 3, speed: 1.8 }] },
  { w: 14, h: 14, ships: 34, obstacles: 7, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.7 }, { edge: 'S', length: 4, speed: 1.6 }, { edge: 'E', length: 3, speed: 1.9 }, { edge: 'W', length: 3, speed: 1.5 }] },
  { w: 14, h: 14, ships: 36, obstacles: 8, tier: 2, guards: [{ edge: 'N', length: 4, speed: 1.9 }, { edge: 'S', length: 3, speed: 2.1 }, { edge: 'E', length: 4, speed: 1.6 }, { edge: 'W', length: 3, speed: 1.8 }] },
  { w: 14, h: 14, ships: 40, obstacles: 8, tier: 2, guards: [{ edge: 'N', length: 4, speed: 2.0 }, { edge: 'S', length: 4, speed: 1.7 }, { edge: 'E', length: 3, speed: 1.9 }, { edge: 'W', length: 3, speed: 1.6 }] },
];

const LEN_WEIGHTS = [
  { 1: 1, 2: 4, 3: 2.5 },          // tutorial: no tankers
  { 1: 1.5, 2: 3, 3: 3, 4: 1 },
  { 1: 2, 2: 3, 3: 3, 4: 2 },
];

const OBSTACLE_TYPES = ['rock', 'rock', 'buoy', 'pier'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return Number(k);
  }
  return Number(entries[entries.length - 1][0]);
}

// Turn a spec's `guards` into concrete patrol definitions. Ranges are trimmed
// two cells short of any corner that another patrol also sweeps, so two
// warships never overlap where their lines meet.
function buildPatrols(spec, rng) {
  if (!spec.guards) return [];
  const has = (e) => spec.guards.some(g => g.edge === e);
  return spec.guards.map(g => {
    const horizontal = g.edge === 'N' || g.edge === 'S';
    const line = g.edge === 'N' ? 0 : g.edge === 'S' ? spec.h - 1 : g.edge === 'W' ? 0 : spec.w - 1;
    let a, b;
    if (horizontal) {
      a = has('W') ? 2 : 0;
      b = spec.w - 1 - (has('E') ? 2 : 0);
    } else {
      a = has('N') ? 2 : 0;
      b = spec.h - 1 - (has('S') ? 2 : 0);
    }
    const maxPos = b - g.length + 1;
    return {
      axis: horizontal ? 'h' : 'v', line, length: g.length, speed: g.speed,
      range: [a, b],
      startPos: a + Math.floor(rng() * (maxPos - a + 1)),
      startDir: rng() < 0.5 ? 1 : -1,
    };
  });
}

function generate(spec, rng) {
  const W = spec.w, H = spec.h;
  const occ = new Set();
  const obst = new Set();
  const obstacles = [];
  const patrols = buildPatrols(spec, rng);
  // The full patrol lines are off-limits to ships and obstacles.
  for (const p of patrols) {
    if (p.axis === 'h') for (let x = 0; x < W; x++) occ.add(p.line * W + x);
    else for (let y = 0; y < H; y++) occ.add(y * W + p.line);
  }
  let guard = 0;
  while (obstacles.length < spec.obstacles && guard++ < 300) {
    const x = (rng() * W) | 0, y = (rng() * H) | 0;
    const k = y * W + x;
    if (occ.has(k)) continue;
    occ.add(k);
    obst.add(k);
    obstacles.push({ x, y, type: OBSTACLE_TYPES[(rng() * OBSTACLE_TYPES.length) | 0] });
  }

  const ships = [];
  const weights = LEN_WEIGHTS[spec.tier];
  guard = 0;
  outer: while (ships.length < spec.ships && guard++ < 6000) {
    const length = pickWeighted(rng, weights);
    const direction = 'NESW'[(rng() * 4) | 0];
    const horizontal = direction === 'E' || direction === 'W';
    const x = (rng() * (horizontal ? W - length + 1 : W)) | 0;
    const y = (rng() * (horizontal ? H : H - length + 1)) | 0;

    const cells = [];
    for (let i = 0; i < length; i++) {
      const k = horizontal ? y * W + (x + i) : (y + i) * W + x;
      if (occ.has(k)) continue outer;
      cells.push(k);
    }
    // A lane containing a static obstacle would make the ship permanently stuck.
    const dx = direction === 'E' ? 1 : direction === 'W' ? -1 : 0;
    const dy = direction === 'S' ? 1 : direction === 'N' ? -1 : 0;
    let bx = direction === 'E' ? x + length - 1 : x;
    let by = direction === 'S' ? y + length - 1 : y;
    bx += dx; by += dy;
    while (bx >= 0 && bx < W && by >= 0 && by < H) {
      if (obst.has(by * W + bx)) continue outer;
      bx += dx; by += dy;
    }
    for (const k of cells) occ.add(k);
    ships.push({ x, y, direction, length });
  }
  if (ships.length < spec.ships) return null;
  const def = { gridWidth: W, gridHeight: H, obstacles, ships };
  if (patrols.length) def.patrols = patrols;
  return def;
}

const levels = [];
const stats = [];
for (let i = 0; i < SPECS.length; i++) {
  const spec = SPECS[i];
  const rng = mulberry32(0xB0A7 + i * 101);
  let best = null, bestScore = -Infinity, bestStats = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const def = generate(spec, rng);
    if (!def) continue;
    const r = solveLevel(def);
    if (!r.solvable) continue;
    // Tutorial levels: shallow (about 2 waves), plenty of obvious moves.
    // Later levels: maximize dependency depth, minimize obvious moves.
    const score = spec.tier === 0
      ? -Math.abs(r.waves - 2) * 10 + r.initialMovable
      : r.waves * 100 - r.initialMovable * 4;
    if (score > bestScore) { best = def; bestScore = score; bestStats = r; }
  }
  if (!best) throw new Error(`Level ${i + 1}: no solvable candidate found — loosen the spec`);
  levels.push({ name: NAMES[i], ...best });
  stats.push({
    level: i + 1, grid: `${spec.w}x${spec.h}`, ships: best.ships.length,
    obstacles: best.obstacles.length, patrols: (best.patrols || []).length,
    waves: bestStats.waves, openers: bestStats.initialMovable,
  });
}

console.table(stats);

const out = `// Auto-generated by tools/generate-levels.mjs — do not edit by hand.
// Every level is verified solvable by src/solver.js at generation time.
export const LEVELS = ${JSON.stringify(levels, null, 1)};
`;
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'levels.js');
writeFileSync(dest, out);
console.log(`Wrote ${levels.length} levels to ${dest}`);

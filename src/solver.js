// Solvability checker (dev tool, also run once at startup).
//
// Departures only ever free space — they never add blockers — so once a ship
// can leave it can always leave. Solvability therefore reduces to a fixpoint:
// repeatedly remove every ship with a clear lane; the level is solvable iff
// this empties the board. `waves` (fixpoint iterations) is a rough depth
// metric used by the level generator to shape difficulty.

import { DIRS, bowCell, shipCells } from './game.js';

export function validateLevel(def) {
  const errors = [];
  const W = def.gridWidth, H = def.gridHeight;
  const seen = new Map();
  (def.obstacles || []).forEach((o, i) => {
    if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) errors.push(`obstacle ${i} out of bounds`);
    else seen.set(o.y * W + o.x, `obstacle ${i}`);
  });
  def.ships.forEach((s, i) => {
    if (!DIRS[s.direction]) { errors.push(`ship ${i} has bad direction "${s.direction}"`); return; }
    for (const c of shipCells(s)) {
      if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) { errors.push(`ship ${i} out of bounds`); break; }
      const k = c.y * W + c.x;
      if (seen.has(k)) { errors.push(`ship ${i} overlaps ${seen.get(k)}`); break; }
      seen.set(k, `ship ${i}`);
    }
  });
  // Nothing static may sit on a patrol warship's line — the patrol sweeps it.
  // (Patrols are otherwise ignored by the solver: they always eventually move
  // aside, so they gate timing, never solvability.)
  (def.patrols || []).forEach((p, i) => {
    if (p.range[1] - p.range[0] + 1 <= p.length) errors.push(`patrol ${i} has no room to move`);
    for (const [k, what] of seen) {
      const x = k % W, y = Math.floor(k / W);
      if (p.axis === 'h' ? y === p.line : x === p.line) errors.push(`${what} sits on patrol ${i}'s line`);
    }
  });
  return errors;
}

export function solveLevel(def) {
  const errors = validateLevel(def);
  if (errors.length) {
    return { solvable: false, errors, order: [], waves: 0, initialMovable: 0, remaining: def.ships.length };
  }
  const W = def.gridWidth, H = def.gridHeight;
  const obstacles = new Set((def.obstacles || []).map(o => o.y * W + o.x));
  const occ = new Map();
  def.ships.forEach((s, i) => { for (const c of shipCells(s)) occ.set(c.y * W + c.x, i); });
  const alive = new Set(def.ships.map((_, i) => i));

  const clearLane = (i) => {
    const s = def.ships[i];
    const { dx, dy } = DIRS[s.direction];
    let { x, y } = bowCell(s);
    x += dx; y += dy;
    while (x >= 0 && x < W && y >= 0 && y < H) {
      const k = y * W + x;
      if (obstacles.has(k) || occ.has(k)) return false;
      x += dx; y += dy;
    }
    return true;
  };

  const order = [];
  let waves = 0, initialMovable = 0;
  for (;;) {
    const movable = [...alive].filter(clearLane);
    if (waves === 0) initialMovable = movable.length;
    if (movable.length === 0) break;
    waves++;
    for (const i of movable) {
      alive.delete(i);
      for (const c of shipCells(def.ships[i])) occ.delete(c.y * W + c.x);
      order.push(i);
    }
  }
  return { solvable: alive.size === 0, errors: [], order, waves, initialMovable, remaining: alive.size };
}

export function checkAllLevels(levels) {
  let ok = true;
  levels.forEach((lv, i) => {
    const r = solveLevel(lv);
    if (!r.solvable) {
      ok = false;
      const why = r.errors.length ? r.errors.join('; ') : `${r.remaining} ship(s) can never leave`;
      console.warn(`Harbor Jam: level ${i + 1} is UNSOLVABLE — ${why}`);
    }
  });
  return ok;
}

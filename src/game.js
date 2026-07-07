// Harbor Jam — core state and rules. Pure logic, no DOM, importable from Node.

export const DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

export const TYPE_BY_LENGTH = { 1: 'tug', 2: 'fishing', 3: 'cargo', 4: 'tanker' };

// A ship's (x, y) is its top-left-most occupied cell. E/W ships extend along +x,
// N/S ships along +y; `direction` says which end is the bow.
export function shipCells(ship) {
  const cells = [];
  const horizontal = ship.direction === 'E' || ship.direction === 'W';
  for (let i = 0; i < ship.length; i++) {
    cells.push(horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i });
  }
  return cells;
}

export function bowCell(ship) {
  if (ship.direction === 'E') return { x: ship.x + ship.length - 1, y: ship.y };
  if (ship.direction === 'S') return { x: ship.x, y: ship.y + ship.length - 1 };
  return { x: ship.x, y: ship.y }; // N and W: bow is the top-left-most cell
}

// Cells between the bow and the edge of the grid (exclusive of the ship itself).
export function laneCells(ship, gridWidth, gridHeight) {
  const { dx, dy } = DIRS[ship.direction];
  const bow = bowCell(ship);
  const cells = [];
  let x = bow.x + dx, y = bow.y + dy;
  while (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
    cells.push({ x, y });
    x += dx;
    y += dy;
  }
  return cells;
}

// Departure animation kinematics, shared between game logic and renderer so
// patrol-interception prediction matches what is actually drawn on screen.
export function departureTiles(laneLen, shipLen) { return laneLen + shipLen + 1.6; }
export function departureDuration(tiles) { return 520 + tiles * 90; }
// Time (ms) at which a departing ship has traveled `dist` tiles (ease-in: d = (t/dur)^2 * tiles).
export function departureTimeAt(dist, tiles) {
  const d = Math.max(0, Math.min(dist, tiles));
  return departureDuration(tiles) * Math.sqrt(d / tiles);
}

const PATROL_PAD = 0.35;    // safety margin (tiles) around a patrol's hull
const PATROL_SIM_STEP = 25; // ms resolution when sampling the crossing window

export class Game {
  loadLevel(def) {
    this.def = def;
    this.width = def.gridWidth;
    this.height = def.gridHeight;
    this.obstacles = (def.obstacles || []).map(o => ({ type: 'rock', ...o }));
    this.obstacleKeys = new Set(this.obstacles.map(o => this.key(o.x, o.y)));
    // Patrol warships: ambient guards that ping-pong along one grid line.
    // They are not part of the fleet — never tappable, never removed.
    this.patrols = (def.patrols || []).map((p, i) => ({
      id: i, axis: p.axis, line: p.line, length: p.length, speed: p.speed,
      min: p.range[0], max: p.range[1] - p.length + 1,
      pos: p.startPos ?? p.range[0], dir: p.startDir ?? 1,
      alertT: 0, // "not now" ring animation countdown
    }));
    this.ships = new Map();
    this.occ = new Map(); // cell key -> ship id
    def.ships.forEach((s, i) => {
      const ship = {
        id: i, x: s.x, y: s.y,
        direction: s.direction, length: s.length,
        type: TYPE_BY_LENGTH[s.length],
      };
      this.ships.set(i, ship);
      for (const c of shipCells(ship)) this.occ.set(this.key(c.x, c.y), i);
    });
    this.departed = []; // undo history, most recent last — unlimited depth
  }

  key(x, y) { return y * this.width + x; }

  shipAt(x, y) {
    const id = this.occ.get(this.key(x, y));
    return id === undefined ? null : this.ships.get(id);
  }

  updatePatrols(dt) {
    for (const p of this.patrols) {
      if (p.alertT > 0) p.alertT = Math.max(0, p.alertT - dt);
      let pos = p.pos + p.dir * p.speed * (dt / 1000);
      if (pos >= p.max) { pos = p.max - (pos - p.max); p.dir = -1; }
      else if (pos <= p.min) { pos = p.min + (p.min - pos); p.dir = 1; }
      p.pos = Math.min(p.max, Math.max(p.min, pos));
    }
  }

  // Patrol position tMs in the future (triangle wave — reversal at range ends).
  patrolPosAt(p, tMs) {
    const span = p.max - p.min;
    if (span <= 0) return p.min;
    const u0 = p.dir >= 0 ? p.pos - p.min : 2 * span - (p.pos - p.min);
    const u = (u0 + p.speed * tMs / 1000) % (2 * span);
    return p.min + (u <= span ? u : 2 * span - u);
  }

  patrolAtCell(x, y) {
    for (const p of this.patrols) {
      const along = p.axis === 'h' ? x : y;
      const line = p.axis === 'h' ? y : x;
      if (line === p.line && p.pos < along + 1 && p.pos + p.length > along) return p;
    }
    return null;
  }

  // Would a patrol occupy the ship's crossing cell while the departing ship
  // physically passes the patrol line? Uses the real departure kinematics.
  interceptingPatrol(ship, lane) {
    if (!this.patrols.length) return null;
    const { dx, dy } = DIRS[ship.direction];
    const bow = bowCell(ship);
    const tiles = departureTiles(lane.length, ship.length);
    for (const p of this.patrols) {
      const step = p.axis === 'h' ? dy : dx; // ship must cross the line perpendicular to it
      if (step === 0) continue;
      const bowLineCoord = p.axis === 'h' ? bow.y : bow.x;
      const crossCoord = p.axis === 'h' ? bow.x : bow.y;
      const dist = (p.line - bowLineCoord) * step;
      if (dist < 1 || dist > lane.length) continue; // patrol line is not ahead in this lane
      const tEnter = departureTimeAt(dist - 1.2, tiles);
      const tExit = departureTimeAt(dist + ship.length + 0.2, tiles);
      for (let t = tEnter; ; t += PATROL_SIM_STEP) {
        const clamped = Math.min(t, tExit);
        const pos = this.patrolPosAt(p, clamped);
        if (pos < crossCoord + 1 + PATROL_PAD && pos + p.length > crossCoord - PATROL_PAD) return p;
        if (clamped === tExit) break;
      }
    }
    return null;
  }

  // 'clear' | 'blocked' (ship/obstacle in lane) | 'patrol' (wait for the guard to pass)
  departStatus(ship) {
    const lane = laneCells(ship, this.width, this.height);
    for (const c of lane) {
      const k = this.key(c.x, c.y);
      if (this.obstacleKeys.has(k) || this.occ.has(k)) return { status: 'blocked', patrol: null };
    }
    const patrol = this.interceptingPatrol(ship, lane);
    return patrol ? { status: 'patrol', patrol } : { status: 'clear', patrol: null };
  }

  canDepart(ship) { return this.departStatus(ship).status === 'clear'; }

  tryDepart(id) {
    const ship = this.ships.get(id);
    if (!ship) return { departed: false, ship: null, status: 'none', patrol: null };
    const st = this.departStatus(ship);
    if (st.status !== 'clear') return { departed: false, ship, ...st };
    for (const c of shipCells(ship)) this.occ.delete(this.key(c.x, c.y));
    this.ships.delete(id);
    this.departed.push(ship);
    return { departed: true, ship, status: 'clear', patrol: null };
  }

  canUndo() { return this.departed.length > 0; }

  undo() {
    const ship = this.departed.pop();
    if (!ship) return null;
    this.ships.set(ship.id, ship);
    for (const c of shipCells(ship)) this.occ.set(this.key(c.x, c.y), ship.id);
    return ship;
  }

  restart() { this.loadLevel(this.def); }

  get remaining() { return this.ships.size; }
  isComplete() { return this.ships.size === 0; }
}

// Canvas rendering: water, harbor basin, obstacles, ships, and all animation.
// Everything is drawn as vector shapes — no image assets.

import { DIRS, bowCell, laneCells, shipCells, departureTiles, departureDuration } from './game.js';

const DIR_ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

export const THEMES = {
  dawn: {
    key: 'dawn', label: 'Dawn',
    waterTop: '#c3dde2', waterBottom: '#8db8c9',
    basin: 'rgba(43,84,105,0.10)', grid: 'rgba(255,255,255,0.13)',
    boundary: 'rgba(255,255,255,0.45)', shimmer: '#ffffff',
    laneClear: '96,170,132', laneBlocked: '210,120,110', laneWait: '224,166,88',
    warshipHull: '#93a0ab', warshipDeck: '#b4bec6', warshipDetail: '#66727e',
    hull: { tug: '#e0a377', fishing: '#8fb598', cargo: '#8ea2c6', tanker: '#b294b9' },
    hullStroke: 'rgba(52,68,88,0.4)', deck: '#f6efe3', cabin: '#fbf7ee',
    containers: ['#d59c9c', '#9cb6d5', '#d5c49c', '#a8c9b2'],
    wake: '255,255,255',
    rock: '#98a6a9', rockDark: '#7d8b8f', pier: '#cfa87c', pierDark: '#a9855e', buoy: '#dd8a79',
    gull: '90,110,125',
    lights: false,
  },
  dusk: {
    key: 'dusk', label: 'Dusk',
    waterTop: '#8a93bb', waterBottom: '#5f6d9a',
    basin: 'rgba(25,30,70,0.14)', grid: 'rgba(255,255,255,0.10)',
    boundary: 'rgba(255,235,210,0.35)', shimmer: '#ffe3c2',
    laneClear: '150,205,170', laneBlocked: '225,145,135', laneWait: '232,180,110',
    warshipHull: '#78849c', warshipDeck: '#98a3b6', warshipDetail: '#535e74',
    hull: { tug: '#c98f6e', fishing: '#7da389', cargo: '#7f93bd', tanker: '#a687b1' },
    hullStroke: 'rgba(35,40,70,0.5)', deck: '#e8e0d2', cabin: '#f2ecdf',
    containers: ['#c39090', '#90a8c3', '#c3b490', '#9bbba6'],
    wake: '255,240,220',
    rock: '#7f8a9c', rockDark: '#67728a', pier: '#b6935f', pierDark: '#8f7248', buoy: '#d08373',
    gull: '55,60,95',
    lights: true,
  },
  lantern: {
    key: 'lantern', label: 'Lantern Night',
    waterTop: '#313c5e', waterBottom: '#1f2941',
    basin: 'rgba(0,0,0,0.18)', grid: 'rgba(160,190,255,0.08)',
    boundary: 'rgba(255,214,140,0.30)', shimmer: '#a9c2f0',
    laneClear: '140,215,175', laneBlocked: '235,150,140', laneWait: '235,190,120',
    warshipHull: '#49536a', warshipDeck: '#5c6880', warshipDetail: '#333c52',
    hull: { tug: '#a06e50', fishing: '#5e8a70', cargo: '#5f76a5', tanker: '#8a6d99' },
    hullStroke: 'rgba(0,0,0,0.5)', deck: '#c9c2b2', cabin: '#d8d2c2',
    containers: ['#a87878', '#7890ab', '#ab9a78', '#83a68e'],
    wake: '170,200,255',
    rock: '#525f78', rockDark: '#414d63', pier: '#8a6f4b', pierDark: '#6b5539', buoy: '#b56f60',
    gull: '200,215,240',
    lights: true,
  },
};

function easeOutQuad(u) { return 1 - (1 - u) * (1 - u); }
function easeInOutQuad(u) { return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); }

// Blocked-tap nudge: quick push forward, gentle settle back. 0..1 of a
// fifth-of-a-tile offset over 360 ms.
function nudgeCurve(t) {
  if (t < 130) return easeOutQuad(t / 130);
  if (t < 360) return 1 - easeInOutQuad((t - 130) / 230);
  return 0;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = null;
    this.theme = THEMES.dawn;
    this.time = 0;
    this.tile = 40;
    this.ox = 0; this.oy = 0;
    this.cssW = 0; this.cssH = 0; this.dpr = 1;
    this.departures = [];  // { ship, t, dur, tiles, sx, sy, dir }
    this.nudges = new Map(); // ship id -> { t }
    this.gulls = [];
    this.hover = null;     // { ship, cells, clear }
    this.phases = new Map(); // ship id -> bobbing phase
    this.waterGrad = null;
  }

  setGame(game) {
    this.game = game;
    this.departures.length = 0;
    this.nudges.clear();
    this.gulls.length = 0;
    this.hover = null;
    this.phases.clear();
    for (const id of game.ships.keys()) this.phases.set(id, Math.random() * Math.PI * 2);
    this.layout();
  }

  setTheme(theme) {
    this.theme = theme;
    this.waterGrad = null;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.waterGrad = null;
    this.layout();
  }

  layout() {
    if (!this.game) return;
    const pad = 18;
    const t = Math.min((this.cssW - pad * 2) / this.game.width, (this.cssH - pad * 2) / this.game.height);
    this.tile = Math.max(12, Math.min(70, Math.floor(t)));
    this.ox = Math.round((this.cssW - this.tile * this.game.width) / 2);
    this.oy = Math.round((this.cssH - this.tile * this.game.height) / 2);
  }

  cellAt(px, py) {
    if (!this.game) return null;
    const x = Math.floor((px - this.ox) / this.tile);
    const y = Math.floor((py - this.oy) / this.tile);
    if (x < 0 || x >= this.game.width || y < 0 || y >= this.game.height) return null;
    return { x, y };
  }

  cellCenter(x, y) {
    return { x: this.ox + (x + 0.5) * this.tile, y: this.oy + (y + 0.5) * this.tile };
  }

  shipCenter(ship) {
    const horizontal = ship.direction === 'E' || ship.direction === 'W';
    return {
      x: this.ox + (ship.x + (horizontal ? ship.length : 1) / 2) * this.tile,
      y: this.oy + (ship.y + (horizontal ? 1 : ship.length) / 2) * this.tile,
    };
  }

  startDeparture(ship) {
    const lane = laneCells(ship, this.game.width, this.game.height).length;
    const tiles = departureTiles(lane, ship.length);
    const c = this.shipCenter(ship);
    this.departures.push({
      ship, t: 0, dur: departureDuration(tiles), tiles,
      sx: c.x, sy: c.y, dir: DIRS[ship.direction],
    });
    if (ship.length >= 3) this.spawnGulls(c.x, c.y);
  }

  cancelDeparture(shipId) {
    for (let i = this.departures.length - 1; i >= 0; i--) {
      if (this.departures[i].ship.id === shipId) this.departures.splice(i, 1);
    }
    if (!this.phases.has(shipId)) this.phases.set(shipId, Math.random() * Math.PI * 2);
  }

  startNudge(ship) { this.nudges.set(ship.id, { t: 0 }); }

  spawnGulls(x, y) {
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.gulls.push({
        x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 120, vy: -35 - Math.random() * 45,
        t: 0, life: 1500 + Math.random() * 700, flap: Math.random() * 6,
      });
    }
  }

  render(dt) {
    this.time += dt / 1000;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawWater(ctx);
    if (!this.game) return;
    this.drawBasin(ctx);
    this.drawHoverLane(ctx);
    this.drawObstacles(ctx);
    this.drawShips(ctx, dt);
    this.drawPatrols(ctx);
    this.drawDepartures(ctx, dt);
    this.drawGulls(ctx, dt);
  }

  drawWater(ctx) {
    if (!this.waterGrad) {
      this.waterGrad = ctx.createLinearGradient(0, 0, 0, this.cssH || 1);
      this.waterGrad.addColorStop(0, this.theme.waterTop);
      this.waterGrad.addColorStop(1, this.theme.waterBottom);
    }
    ctx.fillStyle = this.waterGrad;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    // drifting shimmer lines
    ctx.save();
    ctx.strokeStyle = this.theme.shimmer;
    ctx.lineWidth = 1.5;
    for (let band = 0; band < 2; band++) {
      ctx.globalAlpha = band ? 0.05 : 0.07;
      const spacing = band ? 46 : 30;
      const drift = (this.time * (band ? 9 : 14)) % spacing;
      for (let y = drift - spacing; y < this.cssH + spacing; y += spacing) {
        ctx.beginPath();
        for (let x = 0; x <= this.cssW; x += 14) {
          const yy = y + Math.sin(x / (70 + band * 40) + this.time * (0.7 + band * 0.4) + band * 2.1) * (2.5 + band * 1.5);
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawBasin(ctx) {
    const g = this.game, t = this.tile;
    ctx.save();
    ctx.fillStyle = this.theme.basin;
    ctx.beginPath();
    ctx.roundRect(this.ox - 6, this.oy - 6, g.width * t + 12, g.height * t + 12, 14);
    ctx.fill();
    ctx.strokeStyle = this.theme.boundary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < g.width; x++) {
      ctx.moveTo(this.ox + x * t, this.oy + 2);
      ctx.lineTo(this.ox + x * t, this.oy + g.height * t - 2);
    }
    for (let y = 1; y < g.height; y++) {
      ctx.moveTo(this.ox + 2, this.oy + y * t);
      ctx.lineTo(this.ox + g.width * t - 2, this.oy + y * t);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawHoverLane(ctx) {
    const h = this.hover;
    if (!h || !this.game.ships.has(h.ship.id)) return;
    const t = this.tile;
    const rgb = h.status === 'clear' ? this.theme.laneClear
      : h.status === 'patrol' ? this.theme.laneWait
        : this.theme.laneBlocked;
    ctx.save();
    ctx.fillStyle = `rgba(${rgb},0.16)`;
    for (const c of h.cells) ctx.fillRect(this.ox + c.x * t + 1, this.oy + c.y * t + 1, t - 2, t - 2);
    const bow = bowCell(h.ship);
    const { dx, dy } = DIRS[h.ship.direction];
    const from = this.cellCenter(bow.x, bow.y);
    const ex = dx === 0 ? from.x : this.ox + (dx > 0 ? this.game.width * t : 0);
    const ey = dy === 0 ? from.y : this.oy + (dy > 0 ? this.game.height * t : 0);
    ctx.strokeStyle = `rgba(${rgb},0.85)`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -this.time * 26;
    ctx.beginPath();
    ctx.moveTo(from.x + dx * t * 0.45, from.y + dy * t * 0.45);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); // chevron at the harbor mouth
    ctx.moveTo(ex - dx * 9 - dy * 6, ey - dy * 9 - dx * 6);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - dx * 9 + dy * 6, ey - dy * 9 + dx * 6);
    ctx.stroke();
    ctx.restore();
  }

  drawObstacles(ctx) {
    const t = this.tile;
    for (const o of this.game.obstacles) {
      const cx = this.ox + (o.x + 0.5) * t;
      const cy = this.oy + (o.y + 0.5) * t;
      const h = ((o.x * 73856093) ^ (o.y * 19349663)) >>> 0;
      if (o.type === 'buoy') this.drawBuoy(ctx, cx, cy, t, h);
      else if (o.type === 'pier') this.drawPier(ctx, cx, cy, t, h);
      else this.drawRock(ctx, cx, cy, t, h);
    }
  }

  drawRock(ctx, cx, cy, t, h) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = this.theme.rock;
    ctx.strokeStyle = this.theme.rockDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (h % 7) * 0.4;
      const r = t * 0.3 * (0.72 + (((h >> (i * 3)) & 7) / 7) * 0.35);
      const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.85;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-t * 0.07, -t * 0.1, t * 0.1, t * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBuoy(ctx, cx, cy, t, h) {
    const bob = Math.sin(this.time * 1.4 + h) * t * 0.03;
    const r = t * 0.19;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -bob * 0.4 + r * 0.4, r * 2 + Math.sin(this.time * 0.9 + h) * 2, r * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.theme.buoy;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-r, -r * 0.22, r * 2, r * 0.44);
    ctx.strokeStyle = 'rgba(60,50,50,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    if (this.theme.lights) {
      ctx.fillStyle = 'rgba(255,214,130,0.25)';
      ctx.beginPath(); ctx.arc(0, -r * 1.15, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd982';
      ctx.beginPath(); ctx.arc(0, -r * 1.15, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawPier(ctx, cx, cy, t, h) {
    const s = t * 0.88;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = this.theme.pier;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.14);
    ctx.fill();
    ctx.strokeStyle = this.theme.pierDark;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    const planks = 4;
    for (let i = 1; i < planks; i++) {
      const y = -s / 2 + (s / planks) * i;
      ctx.moveTo(-s / 2 + 3, y);
      ctx.lineTo(s / 2 - 3, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.pierDark;
    for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(px * (s / 2 - 4), py * (s / 2 - 4), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.theme.lights) {
      ctx.fillStyle = 'rgba(255,214,130,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd982';
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawShips(ctx, dt) {
    for (const [id, n] of this.nudges) {
      n.t += dt;
      if (n.t > 360) this.nudges.delete(id);
    }
    const t = this.tile;
    for (const ship of this.game.ships.values()) {
      const phase = this.phases.get(ship.id) ?? 0;
      const c = this.shipCenter(ship);
      let px = c.x, py = c.y;
      const n = this.nudges.get(ship.id);
      if (n) {
        const d = DIRS[ship.direction];
        const f = nudgeCurve(n.t) * t * 0.2;
        px += d.dx * f;
        py += d.dy * f;
      }
      const bobY = Math.sin(this.time * 1.25 + phase) * t * 0.03;
      const rot = Math.sin(this.time * 0.95 + phase * 1.7) * 0.022;
      // resting ripple ring
      const horizontal = ship.direction === 'E' || ship.direction === 'W';
      const halfL = (horizontal ? ship.length : 1) * t / 2;
      const halfW = (horizontal ? 1 : ship.length) * t / 2;
      const pulse = Math.sin(this.time * 0.8 + phase) * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, halfL + 3 + pulse, halfW + 3 + pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (this.hover && this.hover.ship.id === ship.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py, halfL + 2, halfW + 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.drawShip(ctx, ship, px, py + bobY, DIR_ANGLE[ship.direction] + rot, 1, phase);
    }
  }

  drawDepartures(ctx, dt) {
    const t = this.tile;
    for (let i = this.departures.length - 1; i >= 0; i--) {
      const d = this.departures[i];
      d.t += dt;
      const p = Math.min(1, d.t / d.dur);
      const dist = p * p * d.tiles * t; // ease-in: the ship gathers way
      const x = d.sx + d.dir.dx * dist;
      const y = d.sy + d.dir.dy * dist;
      const L = d.ship.length * t * 0.9;
      const sternX = x - d.dir.dx * L / 2;
      const sternY = y - d.dir.dy * L / 2;
      const startSternX = d.sx - d.dir.dx * L / 2;
      const startSternY = d.sy - d.dir.dy * L / 2;
      if (dist > 3) {
        ctx.save();
        ctx.strokeStyle = `rgba(${this.theme.wake},1)`;
        ctx.fillStyle = `rgba(${this.theme.wake},1)`;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.18 * (1 - p);
        ctx.lineWidth = t * 0.5;
        ctx.beginPath();
        ctx.moveTo(startSternX, startSternY);
        ctx.lineTo(sternX, sternY);
        ctx.stroke();
        ctx.globalAlpha = 0.4 * (1 - p);
        ctx.lineWidth = t * 0.14;
        ctx.stroke();
        // foam flecks along the trail
        ctx.globalAlpha = 0.35 * (1 - p);
        for (let k = 0; k < 5; k++) {
          const f = (k + 1) / 6;
          const fx = startSternX + (sternX - startSternX) * f + Math.sin(this.time * 4 + k * 2.1) * 3 * Math.abs(d.dir.dy);
          const fy = startSternY + (sternY - startSternY) * f + Math.sin(this.time * 4 + k * 2.1) * 3 * Math.abs(d.dir.dx);
          ctx.beginPath();
          ctx.arc(fx, fy, 1.5 + (k % 3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      this.drawShip(ctx, d.ship, x, y, DIR_ANGLE[d.ship.direction] + Math.sin(this.time * 5 + d.ship.id) * 0.012, 1, 0);
      if (p >= 1) this.departures.splice(i, 1);
    }
  }

  drawPatrols(ctx) {
    const g = this.game, t = this.tile, th = this.theme;
    for (const p of g.patrols) {
      // faint band marking the patrolled line
      ctx.fillStyle = `rgba(${th.laneWait},0.07)`;
      const bandLen = (p.max + p.length - p.min) * t;
      if (p.axis === 'h') ctx.fillRect(this.ox + p.min * t, this.oy + p.line * t, bandLen, t);
      else ctx.fillRect(this.ox + p.line * t, this.oy + p.min * t, t, bandLen);
      // the warship itself, at its continuous position
      const along = p.pos + p.length / 2;
      const cx = p.axis === 'h' ? this.ox + along * t : this.ox + (p.line + 0.5) * t;
      const cy = p.axis === 'h' ? this.oy + (p.line + 0.5) * t : this.oy + along * t;
      const bob = Math.sin(this.time * 1.1 + p.id * 2.4) * t * 0.02;
      const angle = p.axis === 'h'
        ? (p.dir >= 0 ? 0 : Math.PI)
        : (p.dir >= 0 ? Math.PI / 2 : -Math.PI / 2);
      this.drawWarship(ctx, p, cx, cy + bob, angle);
      // "not now" ring after a denied tap
      if (p.alertT > 0) {
        const f = 1 - p.alertT / 500;
        ctx.strokeStyle = `rgba(${th.laneWait},${(0.55 * (1 - f)).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, t * (0.5 + f * 1.1), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawWarship(ctx, p, cx, cy, angle) {
    const t = this.tile, th = this.theme;
    const L = p.length * t * 0.94, W = t * 0.6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // constant gentle wake — the patrol never stops moving
    ctx.strokeStyle = `rgba(${th.wake},0.22)`;
    ctx.lineCap = 'round';
    ctx.lineWidth = W * 0.3;
    ctx.beginPath();
    ctx.moveTo(-L / 2 - t * 0.7, 0);
    ctx.lineTo(-L / 2 + 2, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,40,60,0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, L / 2, W / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // hull: long taper to a sharp bow, squared stern
    ctx.beginPath();
    ctx.moveTo(-L / 2 + W * 0.1, -W / 2);
    ctx.lineTo(L / 2 - W * 1.2, -W / 2);
    ctx.quadraticCurveTo(L / 2 - W * 0.3, -W * 0.28, L / 2, 0);
    ctx.quadraticCurveTo(L / 2 - W * 0.3, W * 0.28, L / 2 - W * 1.2, W / 2);
    ctx.lineTo(-L / 2 + W * 0.1, W / 2);
    ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W * 0.3);
    ctx.lineTo(-L / 2, -W * 0.3);
    ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + W * 0.1, -W / 2);
    ctx.closePath();
    ctx.fillStyle = th.warshipHull;
    ctx.fill();
    ctx.strokeStyle = th.hullStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = th.warshipDeck;
    ctx.beginPath();
    ctx.roundRect(-L / 2 + W * 0.18, -W * 0.3, Math.max(4, L - W * 1.5), W * 0.6, W * 0.14);
    ctx.fill();
    // bow gun turret
    ctx.fillStyle = th.warshipDetail;
    ctx.beginPath();
    ctx.arc(L * 0.24, 0, W * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = th.warshipDetail;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L * 0.24, 0);
    ctx.lineTo(L * 0.24 + W * 0.42, 0);
    ctx.stroke();
    // bridge
    ctx.fillStyle = th.warshipDetail;
    ctx.beginPath();
    ctx.roundRect(-L * 0.12, -W * 0.22, W * 0.55, W * 0.44, 2);
    ctx.fill();
    ctx.fillStyle = th.warshipDeck;
    ctx.beginPath();
    ctx.roundRect(-L * 0.12 + 2, -W * 0.1, W * 0.55 - 4, W * 0.2, 1.5);
    ctx.fill();
    // sweeping radar line on the mast
    const ra = this.time * 2.2 + p.id;
    ctx.strokeStyle = `rgba(${th.laneWait},0.8)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.12 + W * 0.27, 0);
    ctx.lineTo(-L * 0.12 + W * 0.27 + Math.cos(ra) * W * 0.3, Math.sin(ra) * W * 0.3);
    ctx.stroke();
    // aft helipad
    ctx.strokeStyle = th.warshipDetail;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-L * 0.32, 0, W * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    if (th.lights) { // blinking masthead light in the evening themes
      const blink = Math.sin(this.time * 3 + p.id * 1.7) > 0 ? 0.9 : 0.15;
      ctx.fillStyle = `rgba(255,120,110,${blink})`;
      ctx.beginPath();
      ctx.arc(L * 0.4, 0, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGulls(ctx, dt) {
    for (let i = this.gulls.length - 1; i >= 0; i--) {
      const g = this.gulls[i];
      g.t += dt;
      if (g.t > g.life) { this.gulls.splice(i, 1); continue; }
      const gx = g.x + g.vx * g.t / 1000;
      const gy = g.y + g.vy * g.t / 1000;
      const alpha = 0.8 * (1 - g.t / g.life);
      const wing = Math.sin(g.t / 1000 * 15 + g.flap) * 4 + 1;
      ctx.strokeStyle = `rgba(${this.theme.gull},${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - 7, gy - wing);
      ctx.quadraticCurveTo(gx - 3, gy + 1, gx, gy);
      ctx.quadraticCurveTo(gx + 3, gy + 1, gx + 7, gy - wing);
      ctx.stroke();
    }
  }

  drawShip(ctx, ship, cx, cy, angle, alpha, phase) {
    const t = this.tile, th = this.theme;
    const L = ship.length * t * 0.9;
    const W = Math.min(t * 0.68, L * 0.62);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    // soft drop shadow for a hint of depth
    ctx.fillStyle = 'rgba(20,40,60,0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, L / 2, W / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    this.hullPath(ctx, L, W);
    ctx.fillStyle = th.hull[ship.type];
    ctx.fill();
    ctx.strokeStyle = th.hullStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // deck
    ctx.fillStyle = th.deck;
    ctx.beginPath();
    ctx.roundRect(-L / 2 + W * 0.2, -W * 0.3, Math.max(4, L - W * 0.95), W * 0.6, W * 0.16);
    ctx.fill();

    if (ship.type === 'tug') {
      ctx.fillStyle = th.cabin;
      ctx.strokeStyle = th.hullStroke;
      ctx.beginPath();
      ctx.arc(-L * 0.08, 0, W * 0.26, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = th.hull.tug;
      ctx.beginPath();
      ctx.arc(L * 0.16, 0, W * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (ship.type === 'fishing') {
      ctx.fillStyle = th.cabin;
      ctx.strokeStyle = th.hullStroke;
      ctx.beginPath();
      ctx.roundRect(-L / 2 + W * 0.3, -W * 0.22, W * 0.55, W * 0.44, 3);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = th.hullStroke;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(L * 0.05, 0);
      ctx.lineTo(L / 2 - W * 0.5, 0);
      ctx.stroke();
      ctx.fillStyle = th.pierDark;
      ctx.beginPath();
      ctx.arc(L * 0.05, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (ship.type === 'cargo') {
      const usableFrom = -L / 2 + W * 0.4;
      const usableTo = L / 2 - W * 0.95;
      const boxes = 3;
      const cw = Math.min(W * 0.52, (usableTo - usableFrom) / boxes - 3);
      for (let i = 0; i < boxes; i++) {
        const bx = usableFrom + ((usableTo - usableFrom) / boxes) * (i + 0.5);
        ctx.fillStyle = th.containers[(i + ship.id) % th.containers.length];
        ctx.beginPath();
        ctx.roundRect(bx - cw / 2, -W * 0.27, cw, W * 0.54, 2);
        ctx.fill();
      }
      ctx.fillStyle = th.cabin;
      ctx.strokeStyle = th.hullStroke;
      ctx.beginPath();
      ctx.roundRect(-L / 2 + W * 0.12, -W * 0.2, W * 0.24, W * 0.4, 2);
      ctx.fill(); ctx.stroke();
    } else { // tanker
      ctx.strokeStyle = th.hullStroke;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-L / 2 + W * 0.6, 0);
      ctx.lineTo(L / 2 - W, 0);
      ctx.stroke();
      ctx.fillStyle = th.cabin;
      for (let i = 0; i < 3; i++) {
        const dx = -L * 0.12 + i * L * 0.18;
        ctx.beginPath();
        ctx.arc(dx, 0, W * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = th.hullStroke;
      ctx.beginPath();
      ctx.roundRect(-L / 2 + W * 0.14, -W * 0.24, W * 0.4, W * 0.48, 2);
      ctx.fill(); ctx.stroke();
    }

    if (th.lights) { // warm cabin lights for evening themes
      ctx.fillStyle = 'rgba(255,214,130,0.22)';
      ctx.beginPath(); ctx.arc(-L * 0.28, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd982';
      ctx.beginPath(); ctx.arc(-L * 0.28, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      if (ship.length >= 3) {
        ctx.fillStyle = 'rgba(255,214,130,0.9)';
        ctx.beginPath(); ctx.arc(L * 0.3, 0, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  hullPath(ctx, L, W) {
    ctx.beginPath();
    ctx.moveTo(-L / 2 + W * 0.25, -W / 2);
    ctx.lineTo(L / 2 - W * 0.8, -W / 2);
    ctx.quadraticCurveTo(L / 2 - W * 0.1, -W * 0.33, L / 2, 0);
    ctx.quadraticCurveTo(L / 2 - W * 0.1, W * 0.33, L / 2 - W * 0.8, W / 2);
    ctx.lineTo(-L / 2 + W * 0.25, W / 2);
    ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W * 0.16);
    ctx.lineTo(-L / 2, -W * 0.16);
    ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + W * 0.25, -W / 2);
    ctx.closePath();
  }
}

# ⚓ Harbor Jam

**▶ Play it now: [swajithanand.github.io/Harbor-Jam](https://swajithanand.github.io/Harbor-Jam/)**

A relaxing, browser-based "jam / unblock" puzzle game. The harbor is packed with ships — tap any ship whose lane to open water is clear and it sails home. Untangle the whole harbor at your own pace.

**Zero pressure by design:** no timers, no move limits, no lives, no scores, no fail states. The only feedback for a wrong tap is a gentle bump and a soft horn. Undo is unlimited.

## Playing

- **Tap / click a ship** → it tries to sail straight ahead in the direction its bow faces. If every tile from its bow to the edge of the grid is clear, it departs. If not, it nudges, bumps, and settles back — nothing is lost.
- **Hover (desktop)** previews the exit lane: **green** = clear, **red** = blocked by ships/obstacles, **amber** = lane clear but a patrol warship would intercept — wait for it to pass.
- **Undo** (`U`) restores the last departed ship — unlimited depth, all the way back to level start. **Restart** (`R`) resets the level. `M` toggles sound, `Esc` opens level select.
- A level is complete when every fleet ship has departed.

### The two worlds

| Levels | Section | Twist |
|---|---|---|
| 1–20 | **Open Harbor** | Pure layout puzzles: ship lengths, facing directions, packing density |
| 21–40 | **The Strait** | Grey **patrol warships** sweep corner-to-corner along the board edges. Ships crossing a patrolled line must time their exit for an open window. Mistimed taps just get a polite "not now" — never a penalty |

Cosmetic progression: completed levels add boat silhouettes to your **My Fleet** collection, and two extra ambient themes unlock as you play — **Dusk** (7 harbors cleared) and **Lantern Night** (13).

## Running it

No build step, no dependencies. Serve the folder with any static server:

```bash
npx serve harbor-jam        # or: python -m http.server, etc.
```

Then open the served URL. (Opening `index.html` directly via `file://` won't work — browsers block ES-module imports from the filesystem.)

Works with mouse on desktop and touch on phones; the board scales to the viewport.

## Architecture

Vanilla JavaScript (ES modules) + HTML5 Canvas + CSS. No frameworks, no assets — every ship is drawn as vector shapes and every sound is synthesized with the Web Audio API.

```
index.html          shell: HUD, level select, completion overlay
styles.css          UI styling and the three theme variants
src/
  main.js           bootstrap, input handling, requestAnimationFrame loop
  game.js           pure game state & rules: grid, raycast, undo, patrols,
                    departure kinematics (shared with the renderer)
  levels.js         40 level definitions (AUTO-GENERATED — do not hand-edit)
  renderer.js       all canvas drawing: water, ships, warships, animations, themes
  audio.js          Web Audio synthesis: ambience, horns, chime, seagulls
  solver.js         solvability checker (dev tool, also runs once at page load)
  ui.js             menus, level select, HUD, localStorage persistence
tools/
  generate-levels.mjs   level generator (seeded, solver-verified)
```

### Core model (`game.js`)

- Grid of water tiles; ships are `{ id, x, y, direction: N|E|S|W, length: 1–4, type }`. `(x, y)` is the top-left-most occupied cell; length 1 = tug, 2 = fishing boat, 3 = cargo, 4 = tanker.
- **Departure rule:** raycast from the bow to the grid edge (`laneCells`); the lane must contain no ships and no static obstacles (rocks, buoys, piers).
- **Undo** is a simple stack of departed ships — departure removes from the board and pushes; undo pops and re-places. State is tiny, so no snapshots needed.
- **Patrols** (levels 21+) are ambient warships ping-ponging along one grid line (triangle wave, defined by `axis/line/length/speed/range/startPos/startDir`). They are not fleet ships: never tappable-away, never counted. `departStatus(ship)` returns `'clear' | 'blocked' | 'patrol'`.

### The interception prediction

A departing ship animates with ease-in acceleration (`d(t) = (t/dur)² · tiles`). `game.js` exports these kinematics (`departureTiles`, `departureDuration`, `departureTimeAt`) and **both** the rules engine and the renderer use them. When you tap a ship whose lane crosses a patrol line, the game computes the real time window during which the hull will physically occupy that line, samples the patrol's analytic future position through the window (plus a 0.35-tile safety pad, `PATROL_PAD`), and only allows departure if there's no overlap. Result: a green light never clips through a warship, and near-misses are real.

### Solvability (`solver.js`)

Departures only ever *free* space — they never add blockers — so a departable ship stays departable forever. Solvability therefore reduces to a fixpoint, not a graph search: repeatedly remove every ship with a clear lane; the level is solvable iff the board empties. The number of fixpoint iterations (**waves**) is the difficulty metric used by the generator. Patrols are ignored by the solver — they always sweep aside eventually, so they gate *timing*, never solvability.

The solver also runs once at page load and logs a `console.warn` for any unsolvable level.

### Level format

Levels are plain JSON, easy to author:

```json
{
  "name": "The Strait",
  "gridWidth": 9,
  "gridHeight": 9,
  "obstacles": [{ "x": 4, "y": 4, "type": "rock" }],
  "ships": [
    { "x": 2, "y": 3, "direction": "E", "length": 3 },
    { "x": 5, "y": 1, "direction": "S", "length": 2 }
  ],
  "patrols": [
    { "axis": "h", "line": 0, "length": 3, "speed": 1.3,
      "range": [0, 8], "startPos": 2, "startDir": 1 }
  ]
}
```

`range` is the inclusive span of cells the patrol may cover; `speed` is tiles/second. Nothing static may sit on a patrol's line (validated by the solver).

### Level generation

```bash
node tools/generate-levels.mjs   # rewrites src/levels.js
```

The generator is deterministic (seeded per level index), places obstacles then ships at the target density, rejects any ship whose lane contains a static obstacle (that would be permanently stuck), verifies each candidate with the real solver, and keeps the candidate with the best difficulty shape (more waves, fewer initially-movable ships). Tweak the `SPECS` table to rebalance or extend, then regenerate — existing levels keep their exact layouts as long as their spec entry and index don't change.

### Persistence

One `localStorage` key, `harborjam.v1`: `{ completed: bool[], theme, muted }`. Progress, theme unlocks, and mute survive refresh.

## Contributing / extending

See **[AGENTS.md](AGENTS.md)** — a guide written for future developers (human or AI) covering the invariants that must not break, how to add levels, mechanics, themes, and UI, and how to test changes.

---

Built with [Claude Code](https://claude.com/claude-code).

// Bootstrap: wires game state, renderer, audio, and UI together, and runs the
// requestAnimationFrame loop.

import { LEVELS } from './levels.js';
import { Game, laneCells } from './game.js';
import { Renderer, THEMES } from './renderer.js';
import { AudioEngine } from './audio.js';
import { UI, loadProgress, saveProgress, completedCount, themeUnlocked, THEME_UNLOCK } from './ui.js';
import { checkAllLevels, solveLevel } from './solver.js';

const canvas = document.getElementById('board');
const game = new Game();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
let progress = loadProgress();
let currentLevel = -1;
let completeTimer = null;

function cancelCompleteTimer() {
  if (completeTimer !== null) {
    clearTimeout(completeTimer);
    completeTimer = null;
  }
}

function applyTheme(key) {
  if (!themeUnlocked(progress, key)) key = 'dawn';
  document.body.className = `theme-${key}`;
  renderer.setTheme(THEMES[key]);
}

function refreshHUD() {
  if (currentLevel < 0) return;
  ui.updateHUD(currentLevel, LEVELS[currentLevel].name, game.remaining, game.canUndo());
}

function startLevel(i) {
  cancelCompleteTimer();
  currentLevel = i;
  game.loadLevel(LEVELS[i]);
  renderer.setGame(game);
  renderer.resize();
  ui.showGame();
  refreshHUD();
  if (game.patrols.length) {
    ui.showHint('Patrol boats guard the strait — time your exit for when the lane is open.');
  } else {
    ui.hideHint();
  }
}

function showLevels() {
  cancelCompleteTimer();
  ui.refreshLevelSelect(LEVELS, progress);
  ui.showLevelSelect();
}

function undo() {
  cancelCompleteTimer();
  const ship = game.undo();
  if (!ship) return;
  renderer.cancelDeparture(ship.id);
  ui.hideComplete();
  audio.plop();
  refreshHUD();
}

function restart() {
  cancelCompleteTimer();
  game.restart();
  renderer.setGame(game);
  ui.hideComplete();
  refreshHUD();
}

function toggleMute() {
  progress.muted = !progress.muted;
  saveProgress(progress);
  audio.setMuted(progress.muted);
  ui.setMuted(progress.muted);
}

function onLevelComplete() {
  const countBefore = completedCount(progress);
  progress.completed[currentLevel] = true;
  const countAfter = completedCount(progress);
  saveProgress(progress);
  let sub = `${LEVELS[currentLevel].ships.length} ships guided home.`;
  if (countAfter > countBefore) {
    for (const key of ['dusk', 'lantern']) {
      if (countAfter === THEME_UNLOCK[key]) sub += ` New theme unlocked: ${THEMES[key].label}!`;
    }
  }
  const hasNext = currentLevel + 1 < LEVELS.length;
  completeTimer = setTimeout(() => {
    completeTimer = null;
    ui.showComplete(sub, hasNext);
    audio.chime();
  }, 950);
}

const ui = new UI({
  onSelectLevel: startLevel,
  onShowLevels: showLevels,
  onUndo: undo,
  onRestart: restart,
  onMute: toggleMute,
  onNext: () => {
    if (currentLevel + 1 < LEVELS.length) startLevel(currentLevel + 1);
    else showLevels();
  },
  onTheme: (key) => {
    progress.theme = key;
    saveProgress(progress);
    applyTheme(key);
    ui.refreshLevelSelect(LEVELS, progress);
  },
});

// --- input -----------------------------------------------------------------

// Web Audio needs a user gesture before it can start.
document.addEventListener('pointerdown', () => audio.init());

function eventCell(e) {
  const rect = canvas.getBoundingClientRect();
  return renderer.cellAt(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('pointerdown', (e) => {
  const cell = eventCell(e);
  if (!cell) return;
  const ship = game.shipAt(cell.x, cell.y);
  if (!ship) {
    const patrol = game.patrolAtCell(cell.x, cell.y);
    if (patrol) { // the guard is not going anywhere
      patrol.alertT = 500;
      audio.denied();
    }
    return;
  }
  const res = game.tryDepart(ship.id);
  if (res.departed) {
    renderer.startDeparture(ship);
    renderer.hover = null;
    audio.horn(ship.length);
    refreshHUD();
    if (game.isComplete()) onLevelComplete();
  } else if (res.status === 'patrol') {
    renderer.startNudge(ship);
    res.patrol.alertT = 500;
    audio.denied();
  } else {
    renderer.startNudge(ship);
    audio.horn(ship.length, { blocked: true });
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return; // no exit-lane preview on touch
  const cell = eventCell(e);
  const ship = cell ? game.shipAt(cell.x, cell.y) : null;
  if (!ship) {
    renderer.hover = null;
    canvas.style.cursor = 'default';
    return;
  }
  canvas.style.cursor = 'pointer';
  renderer.hover = {
    ship,
    cells: laneCells(ship, game.width, game.height),
    status: game.departStatus(ship).status,
  };
});

canvas.addEventListener('pointerleave', () => { renderer.hover = null; });

window.addEventListener('keydown', (e) => {
  if (currentLevel < 0 || ui.levelSelectVisible()) return;
  const k = e.key.toLowerCase();
  if (k === 'u') undo();
  else if (k === 'r') restart();
  else if (k === 'm') toggleMute();
  else if (k === 'escape') showLevels();
});

// --- boot ------------------------------------------------------------------

new ResizeObserver(() => renderer.resize()).observe(document.getElementById('board-wrap'));
window.addEventListener('resize', () => renderer.resize());

audio.muted = progress.muted;
ui.setMuted(progress.muted);
applyTheme(progress.theme);
checkAllLevels(LEVELS); // dev safety net: warns in console if a level is unsolvable
ui.refreshLevelSelect(LEVELS, progress);
ui.showLevelSelect();
renderer.resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;
  if (currentLevel >= 0) {
    game.updatePatrols(dt);
    // patrols move, so a hovered lane's status can change while the mouse is still
    if (renderer.hover && game.ships.has(renderer.hover.ship.id)) {
      renderer.hover.status = game.departStatus(renderer.hover.ship).status;
    }
  }
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/testing hook (not used by the game itself).
window.__harborjam = {
  game, renderer, startLevel, solveLevel, LEVELS,
  get currentLevel() { return currentLevel; },
};

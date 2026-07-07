// Menus, level select, HUD, and localStorage persistence.

import { THEMES } from './renderer.js';

const STORAGE_KEY = 'harborjam.v1';

// Completed-level count required to unlock each ambient theme (cosmetic only).
export const THEME_UNLOCK = { dawn: 0, dusk: 7, lantern: 13 };

export function loadProgress() {
  const defaults = { completed: [], theme: 'dawn', muted: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const p = JSON.parse(raw);
    return { ...defaults, ...p, completed: Array.isArray(p.completed) ? p.completed : [] };
  } catch {
    return defaults;
  }
}

export function saveProgress(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode etc. */ }
}

export function completedCount(p) {
  return p.completed.filter(Boolean).length;
}

export function themeUnlocked(p, key) {
  return completedCount(p) >= (THEME_UNLOCK[key] ?? Infinity);
}

// Tiny boat silhouettes for the "My fleet" collection (cosmetic only).
function boatSvg(i) {
  const variant = i % 4;
  const tops = [
    '<rect x="10" y="3" width="4" height="4" rx="1"/>',
    '<rect x="7" y="3" width="4" height="4" rx="1"/><line x1="15" y1="7" x2="15" y2="1" stroke="currentColor" stroke-width="1.2"/>',
    '<rect x="6" y="3" width="3.5" height="4" rx="0.8"/><rect x="10.5" y="3" width="3.5" height="4" rx="0.8"/><rect x="15" y="3" width="3.5" height="4" rx="0.8"/>',
    '<circle cx="8" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/>',
  ];
  return `<svg width="26" height="14" viewBox="0 0 26 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 8 L21 8 Q24 8 25 6.5 L21 8 Q24.5 8.2 24 9.5 Q22.5 12.5 19 12.5 L6 12.5 Q3 12.5 2 8 Z"/>
    <path d="M2 8 L24 8 L25.5 6.8 Q25 9 24 10 Q22.5 12.5 19 12.5 L6 12.5 Q3 12.5 2 8 Z"/>
    ${tops[variant]}
  </svg>`;
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {};
    const ids = [
      'hud', 'level-label', 'ships-left', 'btn-undo', 'btn-restart', 'btn-mute', 'btn-levels',
      'level-select', 'level-grid', 'theme-row', 'fleet-row',
      'level-complete', 'complete-sub', 'btn-next', 'btn-complete-levels',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.el['btn-undo'].addEventListener('click', () => this.h.onUndo());
    this.el['btn-restart'].addEventListener('click', () => this.h.onRestart());
    this.el['btn-mute'].addEventListener('click', () => this.h.onMute());
    this.el['btn-levels'].addEventListener('click', () => this.h.onShowLevels());
    this.el['btn-complete-levels'].addEventListener('click', () => this.h.onShowLevels());
    this.el['btn-next'].addEventListener('click', () => this.h.onNext());
  }

  refreshLevelSelect(levels, progress) {
    const themeRow = this.el['theme-row'];
    themeRow.textContent = '';
    for (const key of Object.keys(THEMES)) {
      const unlocked = themeUnlocked(progress, key);
      const b = document.createElement('button');
      b.className = 'pill theme-chip'
        + (progress.theme === key ? ' active' : '')
        + (unlocked ? '' : ' locked');
      b.textContent = unlocked ? THEMES[key].label : `${THEMES[key].label} \u{1F512}`;
      if (!unlocked) b.title = `Clear ${THEME_UNLOCK[key]} harbors to unlock`;
      b.addEventListener('click', () => { if (unlocked) this.h.onTheme(key); });
      themeRow.appendChild(b);
    }

    const grid = this.el['level-grid'];
    grid.textContent = '';
    levels.forEach((lv, i) => {
      if (i === 0) grid.insertAdjacentHTML('beforeend', '<div class="level-section">Open Harbor</div>');
      if (i === 20) grid.insertAdjacentHTML('beforeend', '<div class="level-section">The Strait &mdash; patrolled waters</div>');
      const b = document.createElement('button');
      b.className = 'level-btn' + (progress.completed[i] ? ' done' : '');
      b.innerHTML = `${i + 1}${progress.completed[i] ? '<span class="tick">✓</span>' : ''}`;
      b.title = lv.name || `Level ${i + 1}`;
      b.addEventListener('click', () => this.h.onSelectLevel(i));
      grid.appendChild(b);
    });

    const fleet = this.el['fleet-row'];
    fleet.textContent = '';
    const n = completedCount(progress);
    if (!n) {
      fleet.innerHTML = '<span class="fleet-empty">Ships you guide home gather here.</span>';
    } else {
      let html = '';
      for (let i = 0; i < n; i++) html += boatSvg(i);
      fleet.innerHTML = html;
    }
  }

  showLevelSelect() {
    this.el['level-select'].classList.remove('hidden');
    this.el['level-complete'].classList.add('hidden');
    this.el['hud'].classList.add('hidden');
  }

  showGame() {
    this.el['level-select'].classList.add('hidden');
    this.el['level-complete'].classList.add('hidden');
    this.el['hud'].classList.remove('hidden');
  }

  levelSelectVisible() {
    return !this.el['level-select'].classList.contains('hidden');
  }

  showComplete(sub, hasNext) {
    this.el['complete-sub'].textContent = sub;
    this.el['btn-next'].style.display = hasNext ? '' : 'none';
    this.el['level-complete'].classList.remove('hidden');
  }

  hideComplete() {
    this.el['level-complete'].classList.add('hidden');
  }

  updateHUD(levelIndex, name, shipsLeft, canUndo) {
    this.el['level-label'].innerHTML = `Level ${levelIndex + 1}<span class="lvl-name"> · ${name}</span>`;
    this.el['ships-left'].textContent = `⚓ ${shipsLeft}`;
    this.el['btn-undo'].disabled = !canUndo;
  }

  setMuted(m) {
    this.el['btn-mute'].textContent = m ? '\u{1F507}' : '\u{1F50A}';
  }

  showHint(text, ms = 4500) {
    const el = document.getElementById('hint');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  hideHint() {
    clearTimeout(this._hintTimer);
    document.getElementById('hint').classList.add('hidden');
  }
}

// All sound is synthesized with the Web Audio API — no audio files.
// Ambience: filtered noise with slow swells. Horns: detuned oscillator stacks,
// pitch by ship size. Plus a soft undo plop, a level-complete chime, and
// distant seagulls at random intervals.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._keep = []; // hold long-lived nodes so they are not collected
  }

  // Must be called from a user gesture. Safe to call repeatedly.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this._startAmbience();
    this._scheduleGull();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  _startAmbience() {
    const ctx = this.ctx;
    const len = 4 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    const lfo = ctx.createOscillator();     // slow wave swells
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.026;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    const lfo2 = ctx.createOscillator();    // faster lapping ripple
    lfo2.frequency.value = 0.31;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 0.011;
    lfo2.connect(lfo2G); lfo2G.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start(); lfo2.start();
    this._keep.push(src, lp, g, lfo, lfoG, lfo2, lfo2G);
  }

  // Departure horn (deep for big ships) or a shorter, softer blocked "toot".
  horn(length, { blocked = false } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const base = { 1: 330, 2: 220, 3: 147, 4: 98 }[length] || 220;
    const dur = blocked ? 0.22 : 0.3 + length * 0.13;
    const peak = blocked ? 0.045 : 0.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
    g.gain.setValueAtTime(peak, t0 + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = base * 3.2;
    lp.connect(g); g.connect(this.master);
    const voices = [['triangle', 1, 0, 1], ['sawtooth', 1, 6, 0.5], ['triangle', 2.01, -5, 0.35]];
    for (const [type, mult, det, vol] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(base * mult, t0);
      if (blocked) o.frequency.exponentialRampToValueAtTime(base * mult * 0.93, t0 + dur);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = vol;
      o.connect(og); og.connect(lp);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    if (blocked) this._thud(t0);
  }

  // Soft hull-bump felt under the blocked toot.
  _thud(t0) {
    const ctx = this.ctx;
    const len = Math.floor(0.09 * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t0);
  }

  // Patrol warship's firm-but-gentle two-note "not now".
  denied() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    [[132, 0], [99, 0.17]].forEach(([f, delay]) => {
      const t = ctx.currentTime + delay;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.02);
      g.gain.setValueAtTime(0.06, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      lp.connect(g); g.connect(this.master);
      for (const [type, det, vol] of [['triangle', 0, 1], ['sawtooth', 5, 0.4]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = vol;
        o.connect(og); og.connect(lp);
        o.start(t); o.stop(t + 0.2);
      }
    });
  }

  plop() { // undo: a ship quietly slips back to its berth
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(320, t0);
    o.frequency.exponentialRampToValueAtTime(170, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.16);
  }

  chime() { // gentle level-complete arpeggio
    if (!this.ctx) return;
    const ctx = this.ctx;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.15;
      for (const [mult, vol] of [[1, 0.06], [2.76, 0.012]]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.3);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 1.4);
      }
    });
  }

  _gull() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1350, t0);
    o.frequency.exponentialRampToValueAtTime(950, t0 + 0.12);
    o.frequency.exponentialRampToValueAtTime(1250, t0 + 0.2);
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.016, t0 + 0.03);
    g.gain.linearRampToValueAtTime(0.004, t0 + 0.14);
    g.gain.linearRampToValueAtTime(0.014, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.34);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan);
      tail = pan;
    }
    tail.connect(this.master);
    o.connect(g);
    o.start(t0); o.stop(t0 + 0.4);
  }

  _scheduleGull() {
    setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running') this._gull();
      this._scheduleGull();
    }, 9000 + Math.random() * 15000);
  }
}

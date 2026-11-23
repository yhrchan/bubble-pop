// Tiny WebAudio synth, no audio files: bubbly pops that play a tune as you combo, chimes, a kitty "mew",
// a grumpy-cloud "boing", and a soft music-box loop.

import { storageGet, storageSet } from './util.js';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
// An original little tune: every pop in a combo plays the next note.
const TUNE = [2, 4, 5, 4, 2, 4, 7, 5, 4, 5, 7, 8, 7, 5, 4, 2, 0, 2, 4, 7, 9, 7, 8, 10, 9, 7, 5, 7, 4, 5, 2, 4];
// Music-box arpeggios: C, Am, F, G
const PROG = [
  [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 392.0, 329.63],
  [220.0, 261.63, 329.63, 440.0, 329.63, 261.63, 329.63, 261.63],
  [174.61, 220.0, 261.63, 349.23, 261.63, 220.0, 261.63, 220.0],
  [196.0, 246.94, 293.66, 392.0, 293.66, 246.94, 293.66, 246.94],
];
const KEY = 'bubble-pop-muted';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = storageGet(KEY) === '1';
    this.musicTimer = 0;
    this.bpm = 104;
    this.musicVol = 1;
    this.lastPop = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    storageSet(KEY, m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  get ready() { return !!this.ctx && !this.muted && this.ctx.state === 'running'; }

  bellAt(freq, t0, vol = 0.2, dur = 1.2) {
    const ctx = this.ctx;
    for (const [ratio, g] of [[1, 1], [2.76, 0.28], [5.4, 0.08]]) {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol * g, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / ratio ** 0.5);
      o.connect(gain);
      gain.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  bell(freq, when = 0, vol = 0.2, dur = 1.2) {
    if (!this.ready) return;
    this.bellAt(freq, this.ctx.currentTime + when, vol, dur);
  }

  sweep(type, f0, f1, dur, vol, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq, when = 0, type = 'bandpass') {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // combo >= 1: which note of the tune to play
  pop(combo, type) {
    if (!this.ready) return;
    const now = performance.now();
    const crowded = now - this.lastPop < 35; // Love Blast pops many at once: keep it pleasant
    this.lastPop = now;
    const f = PENTA[TUNE[(Math.max(1, combo) - 1) % TUNE.length]];
    if (!crowded) {
      this.sweep('sine', 380 + Math.random() * 120, 1300 + Math.random() * 300, 0.07, 0.2);
      this.noise(0.03, 0.08, 3000);
    }
    this.bell(f, 0, crowded ? 0.05 : 0.12, 0.7);
    if (type === 'heart' || type === 'bigheart') this.bell(f * 1.5, 0.07, 0.08, 0.8);
    else if (type === 'star') [0, 0.05, 0.1].forEach((w, k) => this.bell(PENTA[7 + k] * 1.0, w, 0.06, 0.5));
    else if (type === 'kitty') this.mew();
  }

  mew() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.03;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700, t0);
    o.frequency.exponentialRampToValueAtTime(1150, t0 + 0.07);
    o.frequency.exponentialRampToValueAtTime(760, t0 + 0.22);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.3);
  }

  cloud() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.45);
    lfo.frequency.value = 18;
    lg.gain.value = 25;
    lfo.connect(lg);
    lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 0.55);
    lfo.stop(t0 + 0.55);
    this.noise(0.4, 0.06, 1200, 0.05, 'lowpass');
  }

  rush() { [0, 2, 4, 5, 7, 8, 9, 10].forEach((n, k) => this.bell(PENTA[n], k * 0.045, 0.1, 0.8)); }
  slowmo() { [9, 7, 5, 4, 2].forEach((n, k) => this.bell(PENTA[n] / 2, k * 0.12, 0.09, 1.4)); }
  meterFull() { [4, 7, 9].forEach((n, k) => this.bell(PENTA[n], k * 0.08, 0.1, 0.9)); }

  blast() {
    if (!this.ready) return;
    [0, 2, 4, 5, 7, 9, 10, 8, 10].forEach((n, k) => this.bell(PENTA[n], k * 0.06, 0.13, 1.4));
    [261.63, 329.63, 392.0, 523.25].forEach((f) => this.bell(f, 0, 0.09, 2.2));
    this.noise(0.6, 0.08, 2500);
  }

  countdown(n) { this.bell(n > 0 ? 1046.5 : 1567.98, 0, n > 0 ? 0.12 : 0.16, n > 0 ? 0.4 : 0.9); }
  tick() { this.bell(2093, 0, 0.06, 0.2); }
  frenzy() { [5, 7, 8, 10].forEach((n, k) => this.bell(PENTA[n], k * 0.07, 0.11, 0.6)); }
  timeUp() { [10, 7, 5, 9].forEach((n, k) => this.bell(PENTA[n] / 2, k * 0.12, 0.12, 1.2)); }

  fanfare() {
    [0, 2, 4, 7].forEach((n, k) => this.bell(PENTA[n], k * 0.1, 0.12, 1.0));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.bell(f, 0.45, 0.08, 2.0));
  }

  shutter() {
    this.noise(0.05, 0.25, 4000, 0, 'highpass');
    this.noise(0.05, 0.2, 3000, 0.09, 'highpass');
  }

  // ---- music box loop --------------------------------------------------------------------
  startMusic(bpm = 104, vol = 1) {
    if (!this.ctx) return;
    this.bpm = bpm;
    this.musicVol = vol;
    if (this.musicTimer) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.12;
    this.musicTimer = setInterval(() => this.schedule(), 60);
  }

  setTempo(bpm) { this.bpm = bpm; }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.nextT < now - 0.5) this.nextT = now + 0.05; // after a stall, don't play a burst of catch-up notes
    const spb = 60 / this.bpm / 2;
    while (this.nextT < now + 0.25) {
      if (!this.muted && ctx.state === 'running') {
        const bar = Math.floor(this.step / 8) % 4, i = this.step % 8;
        this.bellAt(PROG[bar][i] * 2, this.nextT, 0.03 * this.musicVol, 0.9);
        if (i === 0) this.bellAt(PROG[bar][0], this.nextT, 0.045 * this.musicVol, 1.8);
      }
      this.nextT += spb;
      this.step++;
    }
  }
}

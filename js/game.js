// Round rules: spawning and difficulty, scoring and combos, power-ups, the Love Blast,
// and the flow ready → countdown → play → ending → results.

import { clamp, lerp, mulberry32 } from './util.js';
import { TYPES } from './bubbles.js';
import { SIDE_COLORS } from './sprites.js';

export const ROUND_MS = 60000;
const COMBO_MS = 1000;
const FRENZY_MS = 10000;
const RUSH_MS = 5000;
const SLOW_MS = 4000;
const COUNT_STEP_MS = 700;
const HEART_HOLD_MS = 250;
const WORDS = { 5: 'cute!', 10: 'sweet!', 15: 'yay!', 20: 'so good!', 25: 'slay!', 30: 'iconic!', 40: 'obsessed 💖', 50: 'legendary ✨' };
const MORE_WORDS = ['unreal!', 'queen! 👑', 'magic ✨', 'so cute!', 'pop star!', 'dreamy!', 'no way!'];

export const multFor = (combo) => (combo >= 30 ? 5 : combo >= 20 ? 4 : combo >= 10 ? 3 : combo >= 5 ? 2 : 1);

const TITLES = [
  [0, 'Bubble Rookie', '🫧'],
  [500, 'Pop Star', '⭐'],
  [1100, 'Heart Breaker', '💖'],
  [1900, 'Sparkle Queen', '👑'],
  [3000, 'Bubble Goddess', '✨'],
];
export function titleFor(score) {
  let t = TITLES[0];
  for (const row of TITLES) if (score >= row[0]) t = row;
  return `${t[1]} ${t[2]}`;
}

function newSide() {
  return {
    score: 0, combo: 0, lastPop: -1e9, maxCombo: 0, pops: 0, hearts: 0, stars: 0, kitties: 0, clouds: 0,
    meter: 0, meterFull: false, blasts: 0, rushUntil: 0, slowUntil: 0, rushAcc: 0, heartLatch: false,
  };
}

export class Game {
  // on: { stateChange(state), moment(weight, delayMs), roundEnd(summary), meterFull(side), hint(text) }
  constructor({ field, fx, sound, on = {} }) {
    this.field = field;
    this.fx = fx;
    this.sound = sound;
    this.on = on;
    this.state = 'idle';
    this.mode = 'solo';
    this.paused = false;
    this.gt = 0; // game clock in ms; stops while paused
    this.stateT = 0;
    this.elapsed = 0;
    this.sides = [newSide(), newSide()];
    this.blasts = [];
    this.spawnAcc = 0;
    this.ambientAcc = 0;
    this.ambientCombo = 0;
    this.rng = Math.random;
    this.frenzy = false;
    this.lastTick = -1;
    this.lastCount = -1;
    this.lastMeterHint = -1e9;
    this.W = 1;
    this.H = 1;
    this.hits = [];
  }

  get duo() { return this.mode === 'duo'; }
  get timed() { return this.mode !== 'chill'; }
  get remaining() { return Math.max(0, ROUND_MS - this.elapsed); }

  setState(s) {
    this.state = s;
    this.stateT = this.gt;
    if (this.on.stateChange) this.on.stateChange(s);
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.field.resize(W, H);
  }

  setMode(mode) {
    this.mode = mode;
    this.field.split = mode === 'duo';
  }

  sideX(side) {
    if (!this.duo || side < 0) return this.W / 2;
    return this.W * (side ? 0.75 : 0.25);
  }

  sideColor(side) { return this.duo ? SIDE_COLORS[Math.max(0, side)] : '#ff4f9a'; }

  // ---- flow ---------------------------------------------------------------------------------
  enterReady() {
    this.field.clear();
    this.fx.clear();
    this.blasts.length = 0;
    this.sides = [newSide(), newSide()];
    this.elapsed = 0;
    const { W, H } = this;
    if (this.duo) {
      for (const side of [0, 1]) {
        const b = this.field.spawn('start', W * (side ? 0.75 : 0.25), H * 0.55, { side, now: this.gt, sizeK: 0.85 });
        b.label = 'ready?';
        b.sub = side ? 'lilac 💜' : 'pink 💗';
      }
    } else {
      this.field.spawn('start', W / 2, H * 0.56, { now: this.gt, sizeK: Math.min(1.2, Math.max(1, 200 / (this.field.baseR * 2))) });
    }
    this.setState('ready');
  }

  // Play again from the results screen: straight to the countdown.
  restart() {
    this.field.clear();
    this.blasts.length = 0;
    this.sides = [newSide(), newSide()];
    this.elapsed = 0;
    this.startCountdown();
  }

  startCountdown() {
    this.lastCount = -1;
    this.setState('countdown');
  }

  beginPlay() {
    for (const b of this.field.list) {
      b.dead = true;
      this.fx.pop(b.x, b.y, b.r, b.type);
    }
    this.field.removeDead();
    this.sides = [newSide(), newSide()];
    this.elapsed = 0;
    this.spawnAcc = 0.6;
    this.frenzy = false;
    this.lastTick = -1;
    this.rng = mulberry32((Math.random() * 2 ** 31) | 0);
    this.fx.text('pop! 🫧', this.W / 2, this.H * 0.45, { style: 'word', size: this.wordSize(1.6), color: '#ff4f9a', life: 0.9, vy: -40 });
    this.setState('play');
    this.sound.startMusic(this.mode === 'chill' ? 76 : 104, this.mode === 'chill' ? 0.8 : 1);
  }

  finish() {
    if (this.state !== 'play' && this.state !== 'ending') return;
    for (const b of this.field.list) {
      b.dead = true;
      this.fx.pop(b.x, b.y, b.r, b.type);
    }
    this.field.removeDead();
    this.sound.stopMusic();
    this.setState('results');
    if (this.on.roundEnd) this.on.roundEnd(this.summary());
  }

  summary() {
    return { mode: this.mode, sides: this.sides.map((s) => ({ ...s })) };
  }

  // ---- difficulty ---------------------------------------------------------------------------
  difficulty() { return this.timed ? clamp(this.elapsed / ROUND_MS, 0, 1) : 0.1; }

  riseSpeed() {
    return this.H * (this.timed ? lerp(0.17, 0.3, this.difficulty()) : 0.13);
  }

  spawnRate() {
    const widthK = clamp(Math.sqrt(this.W / (this.H * 0.75)), 0.8, 1.5);
    let rate = (this.timed ? lerp(1.4, 3.2, this.difficulty()) : 1.5) * widthK;
    if (this.frenzy) rate *= 1.25;
    if (this.duo) rate *= 0.8; // per player
    return rate;
  }

  sizeK() { return this.timed ? lerp(1, 0.86, this.difficulty()) : 1; }

  pickType(rng, noClouds = false) {
    const d = this.difficulty();
    const anyRush = this.sides.some((s) => this.gt < s.rushUntil);
    const anySlow = this.sides.some((s) => this.gt < s.slowUntil);
    const w = [
      ['bubble', 0.44], ['heart', 0.22], ['bigheart', 0.035], ['kitty', 0.085], ['star', 0.06],
      ['rainbow', anyRush ? 0 : 0.025], ['moon', anySlow || !this.timed ? 0 : 0.025],
      ['cloud', noClouds || !this.timed || this.elapsed < 10000 ? 0 : lerp(0.08, 0.15, d)],
    ];
    let total = 0;
    for (const [, v] of w) total += v;
    let x = rng() * total;
    for (const [t, v] of w) {
      x -= v;
      if (x <= 0) return t;
    }
    return 'bubble';
  }

  spawnAt(side, u, type, opts = {}) {
    const sizeK = opts.sizeK || this.sizeK();
    const [l, r] = this.field.bounds(side);
    const rad = this.field.baseR * TYPES[type].rK * sizeK;
    const x = lerp(l + rad, r - rad, u);
    return this.field.spawn(type, x, this.H + rad * 1.3, {
      side, rise: (opts.rise || this.riseSpeed()) * (opts.riseJ || 1), sizeK, now: this.gt, ph: opts.ph,
    });
  }

  spawnTick(dt) {
    const rate = this.spawnRate();
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const rng = this.rng;
      const type = this.pickType(rng);
      const u = rng(), ph = rng() * Math.PI * 2, riseJ = 0.9 + rng() * 0.2;
      if (this.duo) for (const side of [0, 1]) this.spawnAt(side, u, type, { ph, riseJ });
      else this.spawnAt(-1, u, type, { ph, riseJ });
    }
    // Rainbow Rush: extra bubbles just for the player who popped the rainbow
    const sides = this.duo ? [0, 1] : [0];
    for (const side of sides) {
      const S = this.sides[side];
      if (this.gt >= S.rushUntil) continue;
      S.rushAcc += rate * dt;
      while (S.rushAcc >= 1) {
        S.rushAcc -= 1;
        this.spawnAt(this.duo ? side : -1, Math.random(), this.pickType(Math.random, true), { riseJ: 0.9 + Math.random() * 0.2 });
      }
    }
  }

  ambientTick(dt, rate = 0.55) {
    this.ambientAcc += rate * dt;
    while (this.ambientAcc >= 1) {
      this.ambientAcc -= 1;
      if (this.field.list.length > 14) continue;
      const types = ['bubble', 'bubble', 'heart', 'heart', 'kitty', 'star'];
      const type = types[(Math.random() * types.length) | 0];
      const side = this.duo ? (Math.random() < 0.5 ? 0 : 1) : -1;
      this.spawnAt(side, Math.random(), type, { rise: this.H * 0.11, sizeK: 1 });
    }
  }

  speedOf(side) {
    const S = this.sides[Math.max(0, side)];
    return this.gt < S.slowUntil ? 0.5 : 1;
  }

  // ---- per frame ------------------------------------------------------------------------------
  // input: { segments: [{ax, ay, bx, by, r, side}], tips: [{x, y, side}], hearts: [{since, x, y} | null, ...] }
  update(dt, now, input) {
    if (this.paused) return;
    this.gt += dt * 1000;
    const st = this.state;
    const since = this.gt - this.stateT;

    if (st === 'idle' || st === 'ready' || st === 'results' || st === 'countdown') {
      this.ambientTick(dt, st === 'results' || st === 'idle' ? 0.45 : 0.6);
    }
    if (st === 'countdown') {
      const n = 3 - Math.floor(since / COUNT_STEP_MS);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.sound.countdown(Math.max(0, n));
      }
      if (since >= COUNT_STEP_MS * 3) this.beginPlay();
    } else if (st === 'play') {
      this.elapsed += dt * 1000;
      this.spawnTick(dt);
      if (this.timed) {
        if (!this.frenzy && this.elapsed >= ROUND_MS - FRENZY_MS) {
          this.frenzy = true;
          this.fx.text('✨ final frenzy ✨', this.W / 2, this.H * 0.3, { style: 'word', size: this.wordSize(1.1), color: '#ff2e88', life: 1.6, vy: -20 });
          this.sound.frenzy();
          this.sound.setTempo(132);
        }
        const sec = Math.ceil(this.remaining / 1000);
        if (sec <= 5 && sec !== this.lastTick && sec > 0) {
          this.lastTick = sec;
          this.sound.tick();
        }
        if (this.elapsed >= ROUND_MS) {
          this.setState('ending');
          this.sound.stopMusic();
          this.sound.timeUp();
          this.fx.text("time's up! ⏰", this.W / 2, this.H * 0.42, { style: 'word', size: this.wordSize(1.3), color: '#9b5bd6', life: 1.6, vy: -10 });
        }
      }
    } else if (st === 'ending') {
      if (since >= 1600) this.finish();
    }

    this.field.update(dt, this.gt, input.tips, (side) => this.speedOf(side));

    // fingertips and pointers pop bubbles
    const hits = this.hits;
    for (const s of input.segments) {
      hits.length = 0;
      this.field.hitSegment(s.ax, s.ay, s.bx, s.by, s.r, s.side, this.gt, hits);
      for (const b of hits) this.popped(b, 'touch');
    }

    // heart hands → Love Blast
    for (let side = 0; side < (this.duo ? 2 : 1); side++) {
      const h = input.hearts[side];
      const S = this.sides[side];
      if (!h) { S.heartLatch = false; continue; }
      if (S.heartLatch || now - h.since < HEART_HOLD_MS) continue;
      S.heartLatch = true;
      if (!this.blast(side, h.x, h.y) && this.state === 'play' && now - this.lastMeterHint > 2500) {
        this.lastMeterHint = now;
        this.fx.text('fill the 💗 meter first', h.x, h.y - 40, { size: 20, color: '#ff4f9a', life: 1.2, vy: -30 });
      }
    }

    this.updateBlasts();
    this.field.removeDead();
  }

  wordSize(k = 1) { return clamp(Math.min(this.W, this.H) * 0.085, 26, 64) * k; }

  popped(b, via) {
    const fx = this.fx, snd = this.sound;
    if (b.type === 'start') {
      fx.pop(b.x, b.y, b.r, 'start');
      fx.flash('255,220,240', 0.35);
      snd.rush();
      if (!this.field.list.some((x) => x.type === 'start' && !x.dead) && this.state === 'ready') this.startCountdown();
      return;
    }
    fx.pop(b.x, b.y, b.r, b.type);
    if (this.state !== 'play') {
      // practice pops before and after a round: just for fun
      snd.pop(1 + (this.ambientCombo++ % 8), b.type === 'cloud' ? 'bubble' : b.type);
      return;
    }
    const side = this.duo ? Math.max(0, b.side) : 0;
    const S = this.sides[side];
    const col = this.sideColor(side);
    const cx = this.sideX(this.duo ? side : -1);

    if (b.type === 'cloud') {
      if (via === 'blast') return; // the Love Blast clears clouds for free
      S.score = Math.max(0, S.score - 20);
      S.combo = 0;
      S.clouds++;
      fx.text('-20', b.x, b.y - b.r * 0.4, { size: 26, color: '#7c7699' });
      fx.text('oops ☁️', cx, this.H * 0.36, { style: 'word', size: this.wordSize(0.8), color: '#7c7699', life: 0.9, vy: -20 });
      fx.shake(0.7);
      fx.flash('120,110,160', 0.18);
      snd.cloud();
      return;
    }

    S.combo = this.gt - S.lastPop <= COMBO_MS ? S.combo + 1 : 1;
    S.lastPop = this.gt;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    const rush = this.gt < S.rushUntil;
    const pts = TYPES[b.type].pts * multFor(S.combo) * (rush ? 2 : 1);
    S.score += pts;
    S.pops++;
    if (b.type === 'heart' || b.type === 'bigheart') S.hearts++;
    if (b.type === 'star') S.stars++;
    if (b.type === 'kitty') S.kitties++;
    fx.text(`+${pts}`, b.x, b.y - b.r * 0.3, { size: 20 + Math.min(16, pts / 8), color: col, life: 0.8 });
    snd.pop(S.combo, b.type);

    if (!S.meterFull) {
      const gain = b.type === 'bigheart' ? 0.12 : b.type === 'heart' ? 0.08 : b.type === 'kitty' ? 0.05 : 0.015;
      S.meter = Math.min(1, S.meter + gain + (S.combo >= 10 ? 0.01 : 0));
      if (S.meter >= 1) {
        S.meterFull = true;
        snd.meterFull();
        fx.text('love meter full! 🫶', cx, this.H * 0.24, { style: 'word', size: this.wordSize(0.7), color: '#ff2e88', life: 1.6, vy: -15 });
        if (this.on.meterFull) this.on.meterFull(side);
      }
    }

    if (b.type === 'rainbow') {
      S.rushUntil = this.gt + RUSH_MS;
      S.rushAcc = 0;
      fx.text('rainbow rush! 🌈', cx, this.H * 0.3, { style: 'word', size: this.wordSize(0.9), color: '#ff7a00', life: 1.5, vy: -20 });
      fx.flash('255,240,255', 0.3);
      snd.rush();
    } else if (b.type === 'moon') {
      S.slowUntil = this.gt + SLOW_MS;
      fx.text('dreamy slow-mo 🌙', cx, this.H * 0.3, { style: 'word', size: this.wordSize(0.85), color: '#7b61ff', life: 1.5, vy: -20 });
      snd.slowmo();
    } else if (b.type === 'bigheart') {
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.95;
        const sp = b.r * 7;
        this.field.spawn('heart', b.x, b.y, {
          side: b.side, rise: this.riseSpeed(), sizeK: 0.62 * this.sizeK(), now: this.gt,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, immune: 280,
        });
      }
    }

    const word = WORDS[S.combo] || (S.combo > 50 && S.combo % 10 === 0 ? MORE_WORDS[(Math.random() * MORE_WORDS.length) | 0] : null);
    if (word && via !== 'blast') {
      fx.text(word, cx, this.H * 0.36, { style: 'word', size: this.wordSize(S.combo >= 20 ? 1.15 : 1), color: col, life: 1.1, vy: -30 });
      if (S.combo >= 10 && this.on.moment) this.on.moment(S.combo, 120);
    }
  }

  // Returns false if the meter isn't full yet.
  blast(side, x, y) {
    const S = this.sides[side];
    if (this.state !== 'play' || !S.meterFull) return false;
    S.meter = 0;
    S.meterFull = false;
    S.blasts++;
    this.blasts.push({ x, y, t0: this.gt, side, r: 0 });
    const far = Math.hypot(this.W, this.H);
    this.fx.ring(x, y, 20, far * 0.9, 0.9, 'rgba(255, 95, 162, 0.9)', 16, true);
    this.fx.ring(x, y, 10, far * 0.7, 0.75, 'rgba(255, 255, 255, 0.95)', 9, true);
    this.fx.flash('255,170,215', 0.45);
    this.fx.confetti(x, y, 70, 950);
    this.fx.text('LOVE BLAST 💖', this.sideX(this.duo ? side : -1), this.H * 0.3, { style: 'word', size: this.wordSize(1.25), color: '#ff2e88', life: 1.6, vy: -20 });
    this.sound.blast();
    if (this.on.moment) this.on.moment(1000, 380);
    return true;
  }

  updateBlasts() {
    if (!this.blasts.length) return;
    const far = Math.hypot(this.W, this.H);
    for (const bl of this.blasts) {
      bl.r = ((this.gt - bl.t0) / 1000) * far * 1.4;
      for (const b of this.field.list) {
        if (b.dead || b.type === 'start') continue;
        if (this.duo && b.side !== bl.side) continue;
        if (Math.hypot(b.x - bl.x, b.y - bl.y) < bl.r + b.r) {
          b.dead = true;
          this.popped(b, 'blast');
        }
      }
    }
    this.blasts = this.blasts.filter((bl) => bl.r < far * 1.1);
  }

  // ---- drawing -------------------------------------------------------------------------------
  drawBack(ctx, W, H, now) {
    const sides = this.duo ? [0, 1] : [0];
    for (const side of sides) {
      const S = this.sides[side];
      const x0 = this.duo ? (side ? W / 2 : 0) : 0, w = this.duo ? W / 2 : W;
      if (this.gt < S.rushUntil) {
        const g = ctx.createLinearGradient(x0, 0, x0 + w, H);
        const h = (this.gt * 0.15) % 360;
        g.addColorStop(0, `hsla(${h}, 100%, 75%, 0.16)`);
        g.addColorStop(0.5, `hsla(${(h + 120) % 360}, 100%, 78%, 0.12)`);
        g.addColorStop(1, `hsla(${(h + 240) % 360}, 100%, 75%, 0.16)`);
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, w, H);
      }
      if (this.gt < S.slowUntil) {
        ctx.fillStyle = 'rgba(150, 130, 255, 0.13)';
        ctx.fillRect(x0, 0, w, H);
      }
    }
    if (this.frenzy && this.state === 'play') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255, 80, 160, 0)');
      g.addColorStop(1, `rgba(255, 80, 160, ${(0.18 + pulse * 0.17).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

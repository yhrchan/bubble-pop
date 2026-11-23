// Particles (droplets, mini hearts, sparkles, confetti, rain), floating words, rings, flashes and screen shake.

import { easeOutBack } from './util.js';
import { heartPath, FONT, PARTICLE_COLORS } from './sprites.js';

const MAX = 1100;
export const P = { DOT: 0, HEART: 1, SPARKLE: 2, CONFETTI: 3, DROP: 4 };
const CONFETTI = ['#ff6fae', '#ffd35a', '#8fd8ff', '#b99bff', '#7be0b0', '#ffa36b', '#ffffff'];
const rnd = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor(sprites, reducedMotion = false) {
    this.S = sprites;
    this.reduced = reducedMotion;
    this.k = reducedMotion ? 0.45 : 1;
    this.n = 0;
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.vr = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.col = new Uint8Array(MAX);
    this.texts = [];
    this.rings = [];
    this.flashA = 0;
    this.flashCol = '255,255,255';
    this.shakeA = 0;
    this.sx = 0;
    this.sy = 0;
  }

  clear() {
    this.n = 0;
    this.texts.length = 0;
    this.rings.length = 0;
  }

  add(kind, x, y, vx, vy, life, size, col = 0, grav = 0, drag = 1.2, vr = 0) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.col[i] = col;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.vr[i] = vr;
  }

  burst(kind, x, y, count, speed, { life = 0.8, size = 14, cols = [0], grav = 0, drag = 1.6, spin = 0, up = 0 } = {}) {
    const n = Math.max(1, Math.round(count * this.k));
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rnd(0.35, 1);
      this.add(kind, x, y, Math.cos(a) * s, Math.sin(a) * s - up, life * rnd(0.7, 1.15), size * rnd(0.7, 1.25),
        cols[(Math.random() * cols.length) | 0], grav, drag, spin ? rnd(-spin, spin) : 0);
    }
  }

  confetti(x, y, count, power = 600) {
    const n = Math.round(count * this.k);
    for (let j = 0; j < n; j++) {
      const a = -Math.PI / 2 + rnd(-1.3, 1.3);
      const s = power * rnd(0.3, 1);
      this.add(P.CONFETTI, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(1.2, 2.2), rnd(8, 14),
        (Math.random() * CONFETTI.length) | 0, 700, 2.2, rnd(-9, 9));
    }
  }

  // The burst when a bubble pops; each type gets its own flavour.
  pop(x, y, r, type) {
    this.ring(x, y, r * 0.8, r * 1.5, 0.28, 'rgba(255,255,255,0.9)', Math.max(2, r * 0.08));
    this.burst(P.DOT, x, y, 9, r * 5.5, { life: 0.45, size: r * 0.28, drag: 3.5 });
    switch (type) {
      case 'heart':
      case 'bigheart':
        this.burst(P.HEART, x, y, type === 'bigheart' ? 12 : 6, r * 5, { life: 0.9, size: r * 0.42, cols: [0, 1, 4, 5], drag: 2.4, up: 40, spin: 3 });
        break;
      case 'kitty':
        this.burst(P.HEART, x, y, 5, r * 4.5, { life: 0.9, size: r * 0.38, cols: [1, 2, 0], drag: 2.4, up: 40, spin: 3 });
        this.burst(P.SPARKLE, x, y, 5, r * 4, { life: 0.6, size: r * 0.4, cols: [0, 2] });
        break;
      case 'star':
        this.burst(P.SPARKLE, x, y, 12, r * 8, { life: 0.75, size: r * 0.55, cols: [1, 0], drag: 2.2, spin: 4 });
        break;
      case 'rainbow':
        this.confetti(x, y, 34, r * 12);
        this.burst(P.SPARKLE, x, y, 8, r * 6, { life: 0.8, size: r * 0.4, cols: [0, 1, 2, 3] });
        break;
      case 'moon':
        this.burst(P.SPARKLE, x, y, 10, r * 4, { life: 1.2, size: r * 0.35, cols: [3, 0, 1], drag: 1.5, spin: 2 });
        break;
      case 'cloud':
        this.burst(P.DROP, x, y + r * 0.3, 14, r * 2.5, { life: 0.9, size: r * 0.3, grav: 900, drag: 0.5, up: -60 });
        this.burst(P.DOT, x, y, 8, r * 3, { life: 0.6, size: r * 0.5, drag: 3 });
        break;
      case 'start':
        this.confetti(x, y, 40, r * 9);
        this.burst(P.HEART, x, y, 10, r * 5, { life: 1, size: r * 0.3, cols: [0, 1, 2, 4], drag: 2.2, spin: 3 });
        break;
      default:
        this.burst(P.SPARKLE, x, y, 3, r * 4, { life: 0.5, size: r * 0.35, cols: [0, 2, 3] });
    }
  }

  trail(x, y) {
    if (Math.random() > this.k) return;
    this.add(P.SPARKLE, x + rnd(-6, 6), y + rnd(-6, 6), rnd(-30, 30), rnd(-20, 50), rnd(0.35, 0.6), rnd(7, 13),
      (Math.random() * 4) | 0, 60, 2);
  }

  ring(x, y, r0, r1, life, col, w, heart = false) {
    this.rings.push({ x, y, r0, r1, t: 0, life, col, w, heart });
  }

  // style: 'pts' small score pops, 'word' big combo words, 'banner' screen-centre announcements
  text(str, x, y, { size = 24, color = '#ff4f9a', life = 0.9, vy = -60, style = 'pts' } = {}) {
    if (this.texts.length > 40) this.texts.shift();
    if (style === 'word') {
      // stack announcements that arrive together instead of drawing them on top of each other
      for (let k = 0; k < 4; k++) {
        const clash = this.texts.some((t) => t.style === 'word' && t.t < t.life * 0.75 && Math.abs(t.x - x) < 200 && Math.abs(t.y - y) < size * 0.95);
        if (!clash) break;
        y += size * 1.1;
      }
    }
    this.texts.push({ str, x, y, size, color, life, t: 0, vy, style });
  }

  flash(rgb = '255,255,255', a = 0.6) {
    this.flashCol = rgb;
    this.flashA = Math.max(this.flashA, a * (this.reduced ? 0.4 : 1));
  }

  shake(a) {
    if (!this.reduced) this.shakeA = Math.max(this.shakeA, a);
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          this.kind[i] = this.kind[j]; this.x[i] = this.x[j]; this.y[i] = this.y[j];
          this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.life[i] = this.life[j];
          this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.col[i] = this.col[j];
          this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.rot[i] = this.rot[j]; this.vr[i] = this.vr[j];
        }
        continue;
      }
      const f = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= f;
      this.vy[i] = this.vy[i] * f + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      i++;
    }
    for (const t of this.texts) {
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= Math.max(0, 1 - 2.5 * dt);
    }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.shakeA = Math.max(0, this.shakeA - dt * 2.5);
    const s = this.shakeA * this.shakeA * 14;
    this.sx = s ? (Math.random() * 2 - 1) * s : 0;
    this.sy = s ? (Math.random() * 2 - 1) * s : 0;
  }

  draw(ctx, dpr) {
    const S = this.S;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i], max = this.max[i];
      const a = Math.min(1, life / (max * 0.45));
      ctx.globalAlpha = a;
      const k = this.kind[i];
      const sz = this.size[i];
      const rot = this.rot[i];
      const x = (this.x[i] + this.sx) * dpr, y = (this.y[i] + this.sy) * dpr;
      if (k === P.DOT) {
        ctx.setTransform(dpr, 0, 0, dpr, x, y);
        ctx.drawImage(S.pDot, -sz / 2, -sz / 2, sz, sz);
        continue;
      }
      const c = Math.cos(rot) * dpr, s = Math.sin(rot) * dpr;
      if (k === P.CONFETTI) {
        const flutter = Math.cos(rot * 2.3);
        ctx.setTransform(c * flutter, s * flutter, -s, c, x, y);
        ctx.fillStyle = CONFETTI[this.col[i]];
        ctx.fillRect(-sz / 2, -sz * 0.3, sz, sz * 0.6);
        continue;
      }
      if (k === P.DROP) {
        ctx.setTransform(dpr, 0, 0, dpr, x, y);
        ctx.drawImage(S.pDrop, -sz / 2, -sz / 2, sz, sz);
        continue;
      }
      const img = k === P.HEART ? S.pHeart[this.col[i] % S.pHeart.length] : S.pSparkle[this.col[i] % S.pSparkle.length];
      ctx.setTransform(k === P.HEART ? dpr : c, k === P.HEART ? 0 : s, k === P.HEART ? 0 : -s, k === P.HEART ? dpr : c, x, y);
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, this.sx * dpr, this.sy * dpr);
    for (const r of this.rings) {
      const p = r.t / r.life;
      const e = 1 - (1 - p) * (1 - p);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = r.col;
      ctx.lineWidth = r.w * (1 - p * 0.5);
      ctx.beginPath();
      if (r.heart) heartPath(ctx, r.x, r.y, rad);
      else ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const p = t.t / t.life;
      const pop = t.t < 0.22 ? easeOutBack(t.t / 0.22) : 1;
      const a = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      const size = t.size * Math.max(0.01, pop);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `700 ${size.toFixed(1)}px ${FONT}`;
      ctx.lineWidth = size * (t.style === 'pts' ? 0.2 : 0.24);
      ctx.strokeStyle = 'rgba(255,255,255,0.96)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawFlash(ctx, W, H) {
    if (this.flashA <= 0.002) return;
    ctx.fillStyle = `rgba(${this.flashCol},${this.flashA.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export { PARTICLE_COLORS };

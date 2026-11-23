// The bubbles themselves: spawning, floating physics, gentle bumping, fingertip collisions and drawing.

import { clamp, lerp, easeOutBack } from './util.js';
import { PAD, FONT, drawKittyFace } from './sprites.js';

export const TYPES = {
  bubble: { pts: 10, rK: 1.0, speedK: 1.0 },
  heart: { pts: 20, rK: 0.92, speedK: 1.05 },
  bigheart: { pts: 20, rK: 1.45, speedK: 0.8 },
  kitty: { pts: 30, rK: 1.05, speedK: 1.1 },
  star: { pts: 50, rK: 0.72, speedK: 1.45 },
  rainbow: { pts: 30, rK: 1.0, speedK: 1.15 },
  moon: { pts: 20, rK: 1.0, speedK: 1.0 },
  cloud: { pts: -20, rK: 1.2, speedK: 0.8 },
  start: { pts: 0, rK: 2.0, speedK: 0 },
};

const rnd = (a, b) => a + Math.random() * (b - a);

// Distance from point (px, py) to segment (ax, ay)-(bx, by).
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

let nextId = 1;

export class Field {
  constructor(sprites) {
    this.S = sprites;
    this.list = [];
    this.W = 1;
    this.H = 1;
    this.baseR = 40;
    this.split = false; // duo mode: two halves
  }

  resize(W, H) {
    const sx = W / Math.max(1, this.W), sy = H / Math.max(1, this.H);
    for (const b of this.list) {
      b.x *= sx;
      b.y *= sy;
      if (b.homeX !== undefined) { b.homeX *= sx; b.homeY *= sy; }
    }
    this.W = W;
    this.H = H;
    this.baseR = clamp(Math.min(W, H) * 0.072, 26, 62);
  }

  bounds(side) {
    if (!this.split || side < 0) return [0, this.W];
    return side === 0 ? [0, this.W / 2] : [this.W / 2, this.W];
  }

  clear() { this.list.length = 0; }

  count(type) {
    let n = 0;
    for (const b of this.list) if (b.type === type) n++;
    return n;
  }

  spawn(type, x, y, { side = -1, rise = 120, sizeK = 1, now = 0, vx = 0, vy = null, immune = 0, ph = Math.random() * 6.28 } = {}) {
    const T = TYPES[type];
    const r = this.baseR * T.rK * sizeK;
    const b = {
      id: nextId++,
      type,
      x,
      y,
      r,
      side,
      rise: rise * T.speedK,
      vx,
      vy: vy === null ? -rise * T.speedK : vy,
      wf: rnd(1.4, 2.4),
      wa: r * rnd(0.35, 0.6),
      ph,
      born: now,
      immuneUntil: now + immune,
      zigDir: Math.random() < 0.5 ? -1 : 1,
      zigAt: now + rnd(300, 700),
      lookX: 0,
      lookY: 0,
      nervous: 0,
      blinkAt: now + rnd(1500, 4000),
      dead: false,
    };
    if (type === 'start') {
      b.homeX = x;
      b.homeY = y;
    }
    this.list.push(b);
    return b;
  }

  // tips: [{x, y, side}] fingertips and pointers, used for "nervous" wobble and kitty eyes.
  update(dt, now, tips, speedOf) {
    const list = this.list;
    for (const b of list) {
      if (b.dead) continue;
      if (b.type === 'start') {
        b.x = b.homeX + Math.sin(now * 0.0013 + b.ph) * 10;
        b.y = b.homeY + Math.sin(now * 0.0021 + b.ph) * 12;
      } else {
        const k = speedOf(b.side);
        if (b.type === 'star') {
          if (now > b.zigAt) {
            b.zigDir = -b.zigDir;
            b.zigAt = now + rnd(380, 700);
          }
          b.vx = lerp(b.vx, b.zigDir * b.r * 4, Math.min(1, dt * 5));
        } else {
          b.vx *= Math.max(0, 1 - dt * 1.2);
        }
        b.vy = lerp(b.vy, -b.rise, Math.min(1, dt * 1.6));
        const wob = Math.sin(now * 0.001 * b.wf * (1 + b.nervous * 1.6) + b.ph) * b.wa * (1 + b.nervous * 0.8);
        b.x += (b.vx + wob) * dt * k;
        b.y += b.vy * dt * k;
        if (b.y < -b.r * 1.8) b.dead = true; // floated away, no penalty
      }
      const [l, r] = this.bounds(b.side);
      const m = b.r * 0.75;
      if (b.x < l + m) { b.x = l + m; b.vx = Math.abs(b.vx); b.zigDir = 1; }
      if (b.x > r - m) { b.x = r - m; b.vx = -Math.abs(b.vx); b.zigDir = -1; }

      // nearest fingertip
      let best = Infinity, bx = 0, by = 0;
      for (const t of tips) {
        if (this.split && b.side >= 0 && t.side >= 0 && t.side !== b.side) continue;
        const dx = t.x - b.x, dy = t.y - b.y;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bx = dx; by = dy; }
      }
      const d = Math.sqrt(best);
      const near = d < b.r * 3.2 ? 1 - d / (b.r * 3.2) : 0;
      b.nervous = lerp(b.nervous, near, Math.min(1, dt * 6));
      if (d < b.r * 6 && d > 0) {
        b.lookX = lerp(b.lookX, bx / d, Math.min(1, dt * 8));
        b.lookY = lerp(b.lookY, by / d, Math.min(1, dt * 8));
      } else {
        b.lookX = lerp(b.lookX, 0, Math.min(1, dt * 3));
        b.lookY = lerp(b.lookY, 0, Math.min(1, dt * 3));
      }
      if (now > b.blinkAt + 140) b.blinkAt = now + rnd(1800, 4200);
    }

    // soft bumping so bubbles don't stack on top of each other
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.type === 'start') continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j];
        if (c.dead || c.type === 'start' || c.side !== a.side) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const min = (a.r + c.r) * 0.92;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.25;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        c.x += nx * push; c.y += ny * push;
        a.vx -= nx * push * 4; c.vx += nx * push * 4;
      }
    }
    if (list.some((b) => b.dead)) this.list = list.filter((b) => !b.dead);
  }

  // Returns the bubbles touched by a moving fingertip; the caller decides what popping means.
  hitSegment(ax, ay, bx, by, rad, side, now, out = []) {
    for (const b of this.list) {
      if (b.dead || now < b.immuneUntil) continue;
      if (this.split && side >= 0 && b.side >= 0 && b.side !== side) continue;
      const reach = b.r * (b.type === 'star' ? 1.25 : 1.0) + rad;
      if (b.x < Math.min(ax, bx) - reach || b.x > Math.max(ax, bx) + reach) continue;
      if (segDist(b.x, b.y, ax, ay, bx, by) <= reach) {
        b.dead = true;
        out.push(b);
      }
    }
    return out;
  }

  removeDead() {
    if (this.list.some((b) => b.dead)) this.list = this.list.filter((b) => !b.dead);
  }

  draw(ctx, dpr, now, ox = 0, oy = 0) {
    const S = this.S;
    for (const b of this.list) {
      if (b.dead) continue;
      const img = S[b.type];
      const age = (now - b.born) / 260;
      let sc = age < 1 ? Math.max(0.05, easeOutBack(clamp(age, 0, 1))) : 1;
      let sx = sc, sy = sc;
      if (b.type === 'heart' || b.type === 'bigheart') {
        const beat = Math.max(0, Math.sin(now * 0.008 + b.ph));
        sx *= 1 + beat * beat * 0.07;
        sy *= 1 + beat * beat * 0.07;
      } else if (b.type !== 'start' && b.type !== 'star' && b.type !== 'cloud') {
        const w = Math.sin(now * 0.004 * (1 + b.nervous) + b.ph) * (0.03 + b.nervous * 0.05);
        sx *= 1 + w;
        sy *= 1 - w;
      }
      const x = (b.x + ox) * dpr, y = (b.y + oy) * dpr;
      const half = b.r * PAD;
      let rot = 0;
      if (b.type === 'star') rot = Math.sin(now * 0.003 + b.ph) * 0.35;
      else if (b.type === 'cloud') rot = Math.sin(now * 0.002 + b.ph) * 0.06;
      if (rot) {
        const c = Math.cos(rot), s = Math.sin(rot);
        ctx.setTransform(c * dpr * sx, s * dpr * sx, -s * dpr * sy, c * dpr * sy, x, y);
      } else {
        ctx.setTransform(dpr * sx, 0, 0, dpr * sy, x, y);
      }
      ctx.drawImage(img, -half, -half, half * 2, half * 2);
      if (b.type === 'kitty') {
        drawKittyFace(ctx, 0, b.r * 0.05, b.r, b.lookX, b.lookY, now >= b.blinkAt && now < b.blinkAt + 140);
      } else if (b.type === 'start') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const fs = b.r * 0.34;
        ctx.font = `700 ${fs.toFixed(1)}px ${FONT}`;
        ctx.lineWidth = fs * 0.24;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.fillStyle = '#ff4f9a';
        const label = b.label || 'pop me!';
        ctx.strokeText(label, 0, -fs * 0.1);
        ctx.fillText(label, 0, -fs * 0.1);
        ctx.font = `600 ${(fs * 0.5).toFixed(1)}px ${FONT}`;
        ctx.lineWidth = fs * 0.14;
        ctx.strokeText(b.sub || 'to start ✨', 0, fs * 0.62);
        ctx.fillStyle = '#9b5bd6';
        ctx.fillText(b.sub || 'to start ✨', 0, fs * 0.62);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

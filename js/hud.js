// Score, timer ring, love meter, the 3-2-1 countdown and "hold" progress rings, drawn on the game canvas.

import { FONT, heartPath, SIDE_COLORS } from './sprites.js';
import { multFor, ROUND_MS } from './game.js';
import { easeOutBack, clamp } from './util.js';

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function label(ctx, text, x, y, size, fill, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size.toFixed(1)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function pill(ctx, text, x, y, size, bg, fg, align = 'left') {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + size * 1.2;
  const h = size * 1.6;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, y - h / 2, w, h, h / 2);
  else ctx.rect(x0, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y + size * 0.04);
  return w;
}

export class Hud {
  constructor() {
    this.meterRects = [null, null];
  }

  draw(ctx, game, W, H, now, { top = 0, touch = false } = {}) {
    const st = game.state;
    this.meterRects = [null, null];
    if (st === 'countdown') this.drawCountdown(ctx, game, W, H);
    if (st !== 'play' && st !== 'ending') return;
    const T = top + 12;
    const big = clamp(Math.min(W, H) * 0.08, 28, 46);
    const timerR = clamp(Math.min(W, H) * 0.07, 24, 34);

    if (game.timed) {
      const frac = game.remaining / ROUND_MS;
      this.drawTimer(ctx, W / 2, T + timerR + 2, timerR, frac, Math.ceil(game.remaining / 1000), game.frenzy, now);
    }

    if (!game.duo) {
      const S = game.sides[0];
      label(ctx, game.timed ? fmt(S.score) : `🫧 ${fmt(S.pops)}`, 18, T + big * 0.62, big, '#ff4f9a');
      this.drawBadges(ctx, game, S, 18, T + big * 1.5, 'left');
      const ms = clamp(Math.min(W, H) * 0.05, 20, 28);
      const mx = W - 18 - ms * 1.1, my = T + timerR + 2;
      this.drawMeter(ctx, mx, my, ms, S, now, touch, 'right', W - 12);
      this.meterRects[0] = { x: mx, y: my, r: ms * 1.6 };
      return;
    }

    // duo: pink on the left, lilac on the right
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 12]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2, T + timerR * 2 + 16);
    ctx.lineTo(W / 2, H - 16);
    ctx.stroke();
    ctx.restore();
    const ms = clamp(Math.min(W, H) * 0.045, 18, 26);
    for (const side of [0, 1]) {
      const S = game.sides[side];
      const left = side === 0;
      const x = left ? 18 : W - 18;
      label(ctx, fmt(S.score), x, T + big * 0.62, big, SIDE_COLORS[side], left ? 'left' : 'right');
      const my = T + big * 1.35 + ms;
      const mx = left ? 18 + ms * 1.1 : W - 18 - ms * 1.1;
      this.drawMeter(ctx, mx, my, ms, S, now, touch, left ? 'left' : 'right', left ? 12 : W - 12);
      this.meterRects[side] = { x: mx, y: my, r: ms * 1.6 };
      this.drawBadges(ctx, game, S, left ? mx + ms * 1.5 : mx - ms * 1.5, my, left ? 'left' : 'right');
    }
  }

  drawBadges(ctx, game, S, x, y, align) {
    const mult = multFor(S.combo);
    const live = game.gt - S.lastPop <= 1000;
    const items = [];
    if (mult >= 2 && live) items.push([`x${mult} combo`, 'rgba(255, 79, 154, 0.92)']);
    if (game.gt < S.rushUntil) items.push(['2x 🌈', 'rgba(255, 150, 60, 0.92)']);
    if (game.gt < S.slowUntil) items.push(['slow-mo 🌙', 'rgba(123, 97, 255, 0.92)']);
    let cx = x;
    for (const [t, bg] of items) {
      const w = pill(ctx, t, cx, y, 14, bg, '#fff', align);
      cx += (align === 'left' ? 1 : -1) * (w + 6);
    }
  }

  drawTimer(ctx, x, y, R, frac, secs, frenzy, now) {
    const pulse = frenzy ? 1 + 0.06 * Math.sin(now * 0.016) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = R * 0.2;
    ctx.strokeStyle = 'rgba(255, 95, 162, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.76, 0, Math.PI * 2);
    ctx.stroke();
    const col = frenzy ? '#ff2e88' : '#ff5fa2';
    if (frac > 0) {
      const a1 = -Math.PI / 2 + frac * Math.PI * 2;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.76, -Math.PI / 2, a1);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      heartPath(ctx, Math.cos(a1) * R * 0.76, Math.sin(a1) * R * 0.76, R * 0.22);
      ctx.fill();
      ctx.stroke();
    }
    ctx.font = `700 ${(R * 0.78).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = frenzy ? '#ff2e88' : '#d6347f';
    ctx.fillText(String(secs), 0, R * 0.04);
    ctx.restore();
  }

  drawMeter(ctx, x, y, s, S, now, touch, align, edgeX) {
    const p = S.meter, full = S.meterFull;
    const pulse = full ? 1 + 0.1 * Math.sin(now * 0.012) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    if (full) {
      ctx.shadowColor = 'rgba(255, 60, 150, 0.9)';
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    heartPath(ctx, 0, 0, s);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.beginPath();
    heartPath(ctx, 0, 0, s);
    ctx.clip();
    const top = s * 0.93 - p * s * 1.86;
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, '#ff9fd0');
    g.addColorStop(1, '#ff2e88');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-s * 1.3, s * 1.3);
    ctx.lineTo(-s * 1.3, top);
    for (let k = 0; k <= 8; k++) {
      const xx = -s * 1.3 + (k / 8) * s * 2.6;
      ctx.lineTo(xx, top + Math.sin(now * 0.006 + k) * s * 0.06 * (p < 1 ? 1 : 0));
    }
    ctx.lineTo(s * 1.3, s * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // pink rim + white outline so an empty meter still reads on a pale background
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, s * 0.13) + 3;
    ctx.strokeStyle = 'rgba(255, 79, 154, 0.55)';
    ctx.beginPath();
    heartPath(ctx, 0, 0, s);
    ctx.stroke();
    ctx.lineWidth = Math.max(2.5, s * 0.13);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
    if (full) {
      const text = touch ? 'tap me! 💗' : '🫶 heart hands!';
      const size = 13;
      ctx.font = `700 ${size}px ${FONT}`;
      const w = ctx.measureText(text).width;
      let lx = x;
      if (align === 'right') lx = Math.min(x, edgeX - w / 2);
      else lx = Math.max(x, edgeX + w / 2);
      label(ctx, text, lx, y + s * 1.35 + 8, size, '#ff2e88', 'center');
    }
  }

  drawCountdown(ctx, game, W, H) {
    const since = game.gt - game.stateT;
    const n = 3 - Math.floor(since / 700);
    if (n < 1) return;
    const t = (since % 700) / 700;
    const sc = easeOutBack(Math.min(1, t / 0.35));
    ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    const size = clamp(Math.min(W, H) * 0.32, 90, 260);
    label(ctx, String(n), W / 2, H * 0.45, size * Math.max(0.05, sc), ['#9b7bff', '#ff8a3d', '#ff4f9a'][n - 1] || '#ff4f9a', 'center');
    ctx.globalAlpha = 1;
    label(ctx, 'get ready ✨', W / 2, H * 0.45 + size * 0.6, clamp(size * 0.18, 18, 34), '#9b5bd6', 'center', 600);
  }

  // A ring that fills while a pose is held (✋ play again, ✌️ selfie, 🫶 heart hands).
  drawHold(ctx, x, y, p, emoji, R = 38) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,95,162,0.2)';
    ctx.beginPath();
    ctx.arc(x, y, R - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff4f9a';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, R - 5, -Math.PI / 2, -Math.PI / 2 + clamp(p, 0, 1) * Math.PI * 2);
    ctx.stroke();
    ctx.font = `${Math.round(R * 0.9)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(emoji, x, y + 2);
  }
}

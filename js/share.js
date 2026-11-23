// Photos and sharing: grabbing "best moment" frames during play, the 1080×1920 Stories card,
// and "beat my score" challenge links. Nothing is uploaded; images are only shared when you tap a button.

import { FONT, heartPath, sparklePath, SIDE_COLORS } from './sprites.js';
import { fmt } from './hud.js';

export const MAX_NAME = 16;

export function sanitizeName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

export function readChallenge() {
  try {
    const q = new URLSearchParams(window.location.search);
    const beat = parseInt(q.get('beat') || '', 10);
    if (!Number.isFinite(beat) || beat <= 0 || beat > 999999) return null;
    return { beat, from: sanitizeName(q.get('from')) };
  } catch {
    return null;
  }
}

export function challengeURL(score, name) {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('beat', String(Math.round(score)));
  const n = sanitizeName(name);
  if (n) u.searchParams.set('from', n);
  return u.toString();
}

export function siteLink() {
  return (location.host + location.pathname).replace(/\/index\.html$/, '/').replace(/\/$/, '');
}

// Same gradient as the CSS tint over the camera, so photos look like the screen.
export function paintTint(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255, 182, 220, 0.30)');
  g.addColorStop(0.5, 'rgba(226, 200, 255, 0.18)');
  g.addColorStop(1, 'rgba(255, 214, 190, 0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function paintSky(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffd6ec');
  g.addColorStop(0.55, '#e7dbff');
  g.addColorStop(1, '#ffe9d9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Screen composite: mirrored camera (or sky) + tint + the game canvas. Returns a new canvas.
export function captureScreen({ video, gameCanvas, showCamera, sky, maxSide = 1400 }) {
  const W = gameCanvas.clientWidth || gameCanvas.width, H = gameCanvas.clientHeight || gameCanvas.height;
  const k = Math.min(2, maxSide / Math.max(W, H));
  const out = document.createElement('canvas');
  out.width = Math.round(W * k);
  out.height = Math.round(H * k);
  const ctx = out.getContext('2d');
  const OW = out.width, OH = out.height;
  if (showCamera && video && video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(OW / vw, OH / vh);
    const dw = vw * s, dh = vh * s;
    ctx.save();
    ctx.translate(OW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (OW - dw) / 2, (OH - dh) / 2, dw, dh);
    ctx.restore();
    paintTint(ctx, OW, OH);
  } else if (sky) {
    ctx.drawImage(sky, 0, 0, OW, OH);
  } else {
    paintSky(ctx, OW, OH);
  }
  ctx.drawImage(gameCanvas, 0, 0, OW, OH);
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Draw `img` into a box with object-fit: cover.
export function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width, ih = img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function text(ctx, str, x, y, size, fill, { weight = 700, align = 'center', stroke = '#ffffff', sw = 0.2 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.lineWidth = size * sw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

// summary: { mode, sides }, extra: { title, best, beatName }
export function buildStoryCard({ photo, summary, title, sprites }) {
  const W = 1080, H = 1920;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  paintSky(ctx, W, H);

  // scattered decorations
  const deco = [[90, 120, 70, 'bubble'], [990, 260, 56, 'heart'], [70, 1380, 60, 'heart'], [1010, 1530, 74, 'bubble'],
    [150, 1830, 44, 'star'], [940, 1840, 50, 'kitty'], [880, 90, 40, 'star'], [40, 760, 34, 'bubble']];
  for (const [x, y, r, t] of deco) {
    const img = sprites[t];
    const s = r * 2 * 1.42;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y, r] of [[230, 70, 18], [800, 200, 14], [980, 980, 16], [100, 1060, 12], [560, 1880, 14]]) {
    ctx.beginPath();
    sparklePath(ctx, x, y, r);
    ctx.fill();
  }

  // title
  ctx.save();
  ctx.shadowColor = 'rgba(255, 60, 150, 0.35)';
  ctx.shadowBlur = 24;
  text(ctx, 'Bubble Pop 🫧', W / 2, 160, 104, '#ff4f9a', { stroke: '#ffffff', sw: 0.22 });
  ctx.restore();

  // photo, polaroid style
  const px = 110, py = 270, pw = 860, ph = 980;
  ctx.save();
  ctx.translate(W / 2, py + ph / 2);
  ctx.rotate(-0.025);
  ctx.translate(-W / 2, -(py + ph / 2));
  ctx.shadowColor = 'rgba(120, 60, 140, 0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, px - 22, py - 22, pw + 44, ph + 44, 48);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 32);
  ctx.clip();
  if (photo) drawCover(ctx, photo, px, py, pw, ph);
  else { ctx.fillStyle = '#f6e8ff'; ctx.fillRect(px, py, pw, ph); }
  ctx.restore();
  // heart stickers on the corners
  for (const [x, y, s, c] of [[px + 10, py + 6, 46, '#ff5fa2'], [px + pw - 14, py + ph - 10, 54, '#b48cff']]) {
    ctx.fillStyle = c;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    heartPath(ctx, x, y, s);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  const S = summary.sides;
  let y = 1385;
  if (summary.mode === 'duo') {
    const [a, b] = S;
    const head = a.score === b.score ? "It's a tie! 💞" : a.score > b.score ? 'Pink wins! 💗' : 'Lilac wins! 💜';
    text(ctx, head, W / 2, y, 76, '#ff4f9a');
    y += 150;
    text(ctx, fmt(a.score), W * 0.3, y, 110, SIDE_COLORS[0]);
    text(ctx, 'vs', W / 2, y, 50, '#9b5bd6', { weight: 600 });
    text(ctx, fmt(b.score), W * 0.7, y, 110, SIDE_COLORS[1]);
    y += 110;
    text(ctx, `💗 ${fmt(a.pops)} pops   ·   💜 ${fmt(b.pops)} pops`, W / 2, y, 40, '#7a4a8c', { weight: 600, stroke: null });
  } else if (summary.mode === 'chill') {
    text(ctx, 'Chill Bath 🛁', W / 2, y, 70, '#9b5bd6');
    y += 150;
    text(ctx, fmt(S[0].pops), W / 2, y, 150, '#ff4f9a');
    y += 110;
    text(ctx, `bubbles popped  ·  💖 ${fmt(S[0].hearts)} hearts`, W / 2, y, 42, '#7a4a8c', { weight: 600, stroke: null });
  } else {
    const s = S[0];
    // title pill
    ctx.font = `700 54px ${FONT}`;
    const tw = ctx.measureText(title).width + 90;
    ctx.fillStyle = '#ff5fa2';
    roundRect(ctx, W / 2 - tw / 2, y - 48, tw, 96, 48);
    ctx.fill();
    text(ctx, title, W / 2, y + 2, 54, '#ffffff', { stroke: null });
    y += 165;
    text(ctx, fmt(s.score), W / 2, y, 170, '#ff4f9a', { sw: 0.16 });
    y += 120;
    text(ctx, `🫧 ${fmt(s.pops)} pops  ·  💖 ${fmt(s.hearts)}  ·  🔥 x${s.maxCombo} combo`, W / 2, y, 42, '#7a4a8c', { weight: 600, stroke: null });
  }

  text(ctx, summary.mode === 'duo' ? 'Battle your bestie 💌' : 'Can you beat me? 💌', W / 2, 1795, 52, '#ff4f9a', { sw: 0.18 });
  text(ctx, siteLink(), W / 2, 1862, 36, '#9b5bd6', { weight: 600, stroke: null });
  return out;
}

export async function shareImage(canvas, filename = 'bubble-pop.png', title = 'Bubble Pop') {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create image');
  const file = new File([blob], filename, { type: 'image/png' });
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function shareLink(url, text) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.share) {
    try {
      await navigator.share({ title: 'Bubble Pop 🫧', text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

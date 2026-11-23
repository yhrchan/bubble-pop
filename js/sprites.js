// All artwork is drawn once at start-up into small canvases, then stamped with drawImage each frame.

export const FONT = 'Fredoka, ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const SPR_R = 120; // bubble radius inside a sprite, in sprite pixels
export const PAD = 1.42; // sprite canvas size = 2 * SPR_R * PAD

export const PINK = '#ff5fa2';
export const LILAC = '#9b7bff';
export const SIDE_COLORS = [PINK, LILAC];
export const PARTICLE_COLORS = ['#ff6fae', '#ffa3cf', '#c9a2ff', '#ffb38a', '#ff4f8b', '#ffffff', '#8fd8ff', '#ffe27a'];

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Unit heart centred on (x, y); s is roughly the half-width.
export function heartPath(ctx, x, y, s) {
  const Y = (v) => y + (v - 0.07) * s;
  ctx.moveTo(x, Y(-0.45));
  ctx.bezierCurveTo(x + 0.35 * s, Y(-1.0), x + 1.15 * s, Y(-0.75), x + 1.0 * s, Y(-0.1));
  ctx.bezierCurveTo(x + 0.9 * s, Y(0.35), x + 0.45 * s, Y(0.65), x, Y(1.0));
  ctx.bezierCurveTo(x - 0.45 * s, Y(0.65), x - 0.9 * s, Y(0.35), x - 1.0 * s, Y(-0.1));
  ctx.bezierCurveTo(x - 1.15 * s, Y(-0.75), x - 0.35 * s, Y(-1.0), x, Y(-0.45));
  ctx.closePath();
}

export function sparklePath(ctx, x, y, r, thin = 0.28) {
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * thin * 0.35, y - r * thin * 0.35, x + r, y);
  ctx.quadraticCurveTo(x + r * thin * 0.35, y + r * thin * 0.35, x, y + r);
  ctx.quadraticCurveTo(x - r * thin * 0.35, y + r * thin * 0.35, x - r, y);
  ctx.quadraticCurveTo(x - r * thin * 0.35, y - r * thin * 0.35, x, y - r);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function gloss(ctx, c, R, k = 1) {
  ctx.save();
  ctx.translate(c - R * 0.38, c - R * 0.42);
  ctx.rotate(-0.75);
  ctx.scale(1, 0.55);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.34);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
  g.addColorStop(0.55, `rgba(255,255,255,${0.55 * k})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, R * 0.34);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${0.75 * k})`;
  circle(ctx, c + R * 0.45, c + R * 0.42, R * 0.065);
  ctx.fill();
}

function filmGradient(ctx, c, R, a = 1) {
  const stops = [
    [255, 140, 200, 0.8], [255, 200, 150, 0.7], [255, 240, 150, 0.6], [150, 240, 210, 0.65],
    [140, 200, 255, 0.75], [200, 160, 255, 0.8], [255, 140, 200, 0.8],
  ];
  const g = ctx.createConicGradient
    ? ctx.createConicGradient(-0.9, c, c)
    : ctx.createLinearGradient(c - R, c - R, c + R, c + R);
  stops.forEach(([r, gg, b, al], i) => g.addColorStop(i / (stops.length - 1), `rgba(${r},${gg},${b},${al * a})`));
  return g;
}

function bubbleBody(ctx, c, R, { tint = '255,170,220', bodyA = 0.1, edgeA = 0.34, milk = 0 } = {}) {
  // soft outer glow so bubbles read on top of a busy camera picture
  ctx.save();
  ctx.shadowColor = 'rgba(255, 120, 200, 0.45)';
  ctx.shadowBlur = R * 0.18;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = R * 0.04;
  circle(ctx, c, c, R * 0.98);
  ctx.stroke();
  ctx.restore();

  const g = ctx.createRadialGradient(c - R * 0.25, c - R * 0.3, R * 0.05, c, c, R);
  g.addColorStop(0, `rgba(255,255,255,${bodyA * 0.6 + milk})`);
  g.addColorStop(0.62, `rgba(${tint},${bodyA + milk})`);
  g.addColorStop(0.9, `rgba(${tint},${edgeA})`);
  g.addColorStop(1, 'rgba(255,255,255,0.75)');
  ctx.fillStyle = g;
  circle(ctx, c, c, R);
  ctx.fill();

  ctx.lineWidth = R * 0.1;
  ctx.strokeStyle = filmGradient(ctx, c, R);
  circle(ctx, c, c, R * 0.94);
  ctx.stroke();

  ctx.lineWidth = R * 0.028;
  ctx.strokeStyle = 'rgba(110, 60, 140, 0.35)';
  circle(ctx, c, c, R * 0.995);
  ctx.stroke();

  ctx.lineWidth = R * 0.022;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  circle(ctx, c, c, R * 0.885);
  ctx.stroke();
}

function heartArt(ctx, c, R, top, bottom, outline = 'rgba(255,255,255,0.95)') {
  const s = R * 0.98;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 80, 160, 0.5)';
  ctx.shadowBlur = R * 0.2;
  const g = ctx.createLinearGradient(c, c - s, c, c + s);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  heartPath(ctx, c, c, s);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = R * 0.07;
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  heartPath(ctx, c, c, s);
  ctx.stroke();
  // glossy highlight on the left lobe
  ctx.save();
  ctx.translate(c - s * 0.48, c - s * 0.42);
  ctx.rotate(-0.6);
  ctx.scale(1, 0.55);
  const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.3);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  circle(ctx, 0, 0, s * 0.3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  sparklePath(ctx, c + s * 0.5, c - s * 0.42, s * 0.13);
  ctx.fill();
}

function drawBow(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.lineWidth = s * 0.12;
  ctx.strokeStyle = '#ff7fb8';
  ctx.fillStyle = '#fff2f8';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.55, 0, s * 0.55, s * 0.36, side * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, s * 0.1);
  ctx.lineTo(-s * 0.45, s * 0.85);
  ctx.moveTo(s * 0.15, s * 0.1);
  ctx.lineTo(s * 0.45, s * 0.85);
  ctx.stroke();
  ctx.fillStyle = '#ff8fc4';
  circle(ctx, 0, 0, s * 0.22);
  ctx.fill();
  ctx.restore();
}

function starPath(ctx, x, y, outer, inner, n = 5) {
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? inner : outer;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function cuteFace(ctx, x, y, s, { eye = '#5b3256', blush = 'rgba(255,120,170,0.55)', mood = 'smile' } = {}) {
  ctx.fillStyle = eye;
  ctx.strokeStyle = eye;
  ctx.lineCap = 'round';
  if (mood === 'grumpy') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * s * 0.32, y + s * 0.02, s * 0.075, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.5, y - s * 0.2);
      ctx.lineTo(x + side * s * 0.16, y - s * 0.08);
      ctx.stroke();
    }
    ctx.lineWidth = s * 0.065;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.42, s * 0.17, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
    return;
  }
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * s * 0.3, y, s * 0.075, s * 0.095, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) {
    circle(ctx, x + side * s * 0.3 + s * 0.025, y - s * 0.035, s * 0.028);
    ctx.fill();
  }
  ctx.fillStyle = blush;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * s * 0.5, y + s * 0.17, s * 0.12, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = s * 0.055;
  ctx.beginPath();
  ctx.arc(x, y + s * 0.08, s * 0.12, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function build(draw, R = SPR_R) {
  const size = Math.ceil(2 * R * PAD);
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d');
  draw(ctx, size / 2, R);
  return cv;
}

function buildParticle(size, draw) {
  const cv = makeCanvas(size);
  draw(cv.getContext('2d'), size / 2, size / 2);
  return cv;
}

export function makeSprites() {
  const S = {};

  S.bubble = build((ctx, c, R) => {
    bubbleBody(ctx, c, R);
    gloss(ctx, c, R);
  });

  S.heart = build((ctx, c, R) => heartArt(ctx, c, R, '#ffc2e0', '#ff4f9a'));

  S.bigheart = build((ctx, c, R) => {
    heartArt(ctx, c, R, '#ff9fd0', '#ff2e88');
    drawBow(ctx, c - R * 0.5, c - R * 0.72, R * 0.36);
  });

  S.kitty = build((ctx, c, R) => {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(c + side * R * 0.6, c - R * 0.66);
      ctx.rotate(side * 0.5);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-R * 0.34, R * 0.22);
      ctx.lineTo(0, -R * 0.4);
      ctx.lineTo(R * 0.34, R * 0.22);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 228, 244, 0.96)';
      ctx.fill();
      ctx.lineWidth = R * 0.06;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 0.17, R * 0.14);
      ctx.lineTo(0, -R * 0.2);
      ctx.lineTo(R * 0.17, R * 0.14);
      ctx.closePath();
      ctx.fillStyle = '#ffa6cf';
      ctx.fill();
      ctx.restore();
    }
    bubbleBody(ctx, c, R, { tint: '255,190,225', bodyA: 0.28, edgeA: 0.5, milk: 0.28 });
    gloss(ctx, c, R, 0.8);
    // whiskers
    ctx.strokeStyle = 'rgba(120, 70, 120, 0.45)';
    ctx.lineWidth = R * 0.025;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(c + side * R * 0.55, c + R * 0.12 + k * R * 0.07);
        ctx.lineTo(c + side * R * 0.85, c + R * 0.08 + k * R * 0.14);
        ctx.stroke();
      }
    }
  });

  S.star = build((ctx, c, R) => {
    const g = ctx.createLinearGradient(c, c - R, c, c + R);
    g.addColorStop(0, '#fff6b8');
    g.addColorStop(0.55, '#ffd35a');
    g.addColorStop(1, '#ffa94d');
    ctx.save();
    ctx.shadowColor = 'rgba(255, 200, 80, 0.8)';
    ctx.shadowBlur = R * 0.3;
    ctx.fillStyle = g;
    ctx.strokeStyle = g;
    ctx.lineJoin = 'round';
    ctx.lineWidth = R * 0.22;
    ctx.beginPath();
    starPath(ctx, c, c + R * 0.05, R * 0.86, R * 0.42);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    starPath(ctx, c, c + R * 0.05, R * 0.9, R * 0.46);
    ctx.stroke();
    gloss(ctx, c, R * 0.8, 0.8);
    cuteFace(ctx, c, c + R * 0.08, R * 0.62, { eye: '#7a4318', blush: 'rgba(255,120,120,0.5)' });
  });

  S.rainbow = build((ctx, c, R) => {
    bubbleBody(ctx, c, R, { tint: '255,240,250', bodyA: 0.12, edgeA: 0.4 });
    const cols = ['#ff9aa2', '#ffb870', '#fff07a', '#a8e6a1', '#9ad0ff', '#c8a2ff'];
    const lw = R * 0.075;
    ctx.lineCap = 'butt';
    cols.forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw + 1;
      ctx.beginPath();
      ctx.arc(c, c + R * 0.22, R * 0.62 - i * lw, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      const x = c + side * R * 0.43;
      for (const [dx, dy, r] of [[0, 0, 0.15], [side * -0.13, 0.04, 0.11], [side * 0.13, 0.05, 0.1]]) {
        circle(ctx, x + dx * R, c + R * 0.25 + dy * R, r * R);
        ctx.fill();
      }
    }
    gloss(ctx, c, R);
  });

  S.moon = build((ctx, c, R) => {
    bubbleBody(ctx, c, R, { tint: '170,150,255', bodyA: 0.22, edgeA: 0.48, milk: 0.06 });
    const t = makeCanvas(Math.ceil(R * 2));
    const tc = t.getContext('2d');
    const m = R;
    const g = tc.createLinearGradient(0, m - R * 0.5, 0, m + R * 0.5);
    g.addColorStop(0, '#fff8c8');
    g.addColorStop(1, '#ffd98a');
    tc.fillStyle = g;
    circle(tc, m - R * 0.06, m, R * 0.5);
    tc.fill();
    tc.globalCompositeOperation = 'destination-out';
    circle(tc, m + R * 0.2, m - R * 0.14, R * 0.44);
    tc.fill();
    tc.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.shadowColor = 'rgba(255, 230, 150, 0.8)';
    ctx.shadowBlur = R * 0.2;
    ctx.drawImage(t, c - m, c - m);
    ctx.restore();
    // sleepy eye + blush on the crescent
    ctx.strokeStyle = '#7b5a8c';
    ctx.lineWidth = R * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c - R * 0.33, c + R * 0.02, R * 0.07, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,180,0.55)';
    ctx.beginPath();
    ctx.ellipse(c - R * 0.3, c + R * 0.2, R * 0.08, R * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbe0';
    for (const [x, y, r] of [[0.42, -0.36, 0.11], [0.3, 0.38, 0.08], [0.55, 0.05, 0.06]]) {
      ctx.beginPath();
      sparklePath(ctx, c + x * R, c + y * R, r * R);
      ctx.fill();
    }
    gloss(ctx, c, R, 0.8);
  });

  S.cloud = build((ctx, c, R) => {
    const puffs = [[-0.45, 0.12, 0.42], [0, -0.2, 0.55], [0.48, 0.08, 0.45], [-0.05, 0.25, 0.45], [0.25, 0.3, 0.38]];
    // lightning bolt peeking out underneath
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = R * 0.04;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const bx = c + R * 0.12, by = c + R * 0.55;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - R * 0.2, by + R * 0.32);
    ctx.lineTo(bx - R * 0.04, by + R * 0.3);
    ctx.lineTo(bx - R * 0.16, by + R * 0.6);
    ctx.lineTo(bx + R * 0.16, by + R * 0.2);
    ctx.lineTo(bx, by + R * 0.22);
    ctx.lineTo(bx + R * 0.1, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of puffs) { circle(ctx, c + x * R, c + y * R, r * R + R * 0.05); ctx.fill(); }
    const g = ctx.createLinearGradient(c, c - R * 0.75, c, c + R * 0.7);
    g.addColorStop(0, '#d6d1ea');
    g.addColorStop(1, '#8f89ad');
    ctx.fillStyle = g;
    for (const [x, y, r] of puffs) { circle(ctx, c + x * R, c + y * R, r * R); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(c - R * 0.12, c - R * 0.45, R * 0.22, R * 0.1, -0.3, 0, Math.PI * 2);
    ctx.fill();
    cuteFace(ctx, c, c + R * 0.05, R * 0.6, { eye: '#3d3552', mood: 'grumpy' });
  });

  S.start = build((ctx, c, R) => {
    bubbleBody(ctx, c, R, { tint: '255,170,220', bodyA: 0.2, edgeA: 0.45, milk: 0.12 });
    gloss(ctx, c, R);
  });

  // ---- particles ---------------------------------------------------------------------
  S.pHeart = PARTICLE_COLORS.map((col) => buildParticle(48, (ctx, x, y) => {
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    heartPath(ctx, x, y, 19);
    ctx.fill();
    ctx.stroke();
  }));
  S.pSparkle = ['#ffffff', '#ffe27a', '#ffb3dc', '#d7c2ff'].map((col) => buildParticle(48, (ctx, x, y) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, 22);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    sparklePath(ctx, x, y, 20, 0.25);
    ctx.fill();
  }));
  S.pDot = buildParticle(32, (ctx, x, y) => {
    const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 14);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,220,245,0.8)');
    g.addColorStop(1, 'rgba(255,180,230,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, 14);
    ctx.fill();
  });
  S.pDrop = buildParticle(32, (ctx, x, y) => {
    ctx.fillStyle = '#8fb8ff';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.quadraticCurveTo(x + 9, y + 2, x, y + 11);
    ctx.quadraticCurveTo(x - 9, y + 2, x, y - 12);
    ctx.fill();
    ctx.stroke();
  });
  S.tip = buildParticle(96, (ctx, x, y) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,200,235,0.75)');
    g.addColorStop(0.6, 'rgba(255,120,200,0.25)');
    g.addColorStop(1, 'rgba(255,120,200,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, 46);
    ctx.fill();
  });
  S.skyCloud = buildParticle(256, (ctx, x, y) => {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [[-60, 10, 42], [-15, -12, 58], [45, 4, 46], [10, 22, 44], [80, 20, 30], [-95, 25, 26]]) {
      circle(ctx, x + dx, y + dy, r);
      ctx.fill();
    }
  });
  return S;
}

// Live details drawn on top of the kitty sprite: eyes that follow your finger, blinking, blush and an "ω" mouth.
export function drawKittyFace(ctx, x, y, r, lookX, lookY, blink) {
  const eye = '#4a2c4f';
  const ex = lookX * r * 0.07, ey = lookY * r * 0.06;
  ctx.fillStyle = eye;
  ctx.strokeStyle = eye;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const cx = x + side * r * 0.3 + ex, cy = y - r * 0.04 + ey;
    if (blink) {
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.08, cy);
      ctx.lineTo(cx + r * 0.08, cy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.085, r * 0.115, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + r * 0.03, cy - r * 0.045, r * 0.032, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eye;
    }
  }
  ctx.fillStyle = 'rgba(255,120,170,0.55)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * r * 0.5 + ex * 0.5, y + r * 0.17, r * 0.12, r * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = r * 0.045;
  ctx.strokeStyle = eye;
  ctx.beginPath();
  ctx.arc(x - r * 0.065 + ex * 0.5, y + r * 0.12, r * 0.065, Math.PI, 0, true);
  ctx.arc(x + r * 0.065 + ex * 0.5, y + r * 0.12, r * 0.065, Math.PI, 0, true);
  ctx.stroke();
}

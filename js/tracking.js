// Turns MediaPipe hand landmarks into what the game needs: fingertip positions on screen (mirrored, matched
// to the full-screen cover-cropped video), simple poses (open palm, peace sign) and two-hand "heart hands".

import { OneEuro, clamp } from './util.js';

const LOST_MS = 220;
const TIP_IDS = [4, 8, 12, 16, 20];

export class HandInput {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
    this.maxHands = 2;
    this.split = false; // duo: hands belong to the half of the screen their wrist is in
    this.W = 1;
    this.H = 1;
    this.map = { x0: 0, y0: 0, w: 1, h: 1, vw: 640, vh: 480, s: 1 };
    this.hearts = [null, null]; // per side: { since, x, y, debug }
    this.heartDebug = null;
  }

  // Same maths as CSS object-fit: cover, in CSS pixels.
  setView(W, H, vw, vh) {
    vw = vw || 640;
    vh = vh || 480;
    const s = Math.max(W / vw, H / vh);
    this.map = { x0: (W - vw * s) / 2, y0: (H - vh * s) / 2, w: vw * s, h: vh * s, vw, vh, s };
    this.W = W;
    this.H = H;
  }

  toScreen(nx, ny) {
    const m = this.map;
    return [m.x0 + (1 - nx) * m.w, m.y0 + ny * m.h]; // mirrored, like the video
  }

  reset() {
    this.tracks = [];
    this.hearts = [null, null];
  }

  newTrack() {
    const f = () => new OneEuro(1.8, 4.0);
    return {
      id: this.nextId++,
      lm: null,
      fresh: false,
      lastSeen: 0,
      pose: 'none',
      poseSince: 0,
      cand: 'none',
      candN: 0,
      side: 0,
      fx: TIP_IDS.map(f),
      fy: TIP_IDS.map(f),
      tips: TIP_IDS.map(() => ({ x: 0, y: 0 })),
      last: TIP_IDS.map(() => null), // tip positions when the game last consumed them
      palm: { x: 0, y: 0 },
      r: 16,
      info: null,
    };
  }

  update(result, now) {
    const hands = (result && result.landmarks) || [];
    const { vw, vh } = this.map;
    const used = new Set();
    for (const lm of hands) {
      let best = null, bestD = 0.35 * vh;
      for (const tr of this.tracks) {
        if (used.has(tr) || !tr.lm) continue;
        const d = Math.hypot((tr.lm[0].x - lm[0].x) * vw, (tr.lm[0].y - lm[0].y) * vh);
        if (d < bestD) { bestD = d; best = tr; }
      }
      if (!best) {
        if (this.tracks.length >= this.maxHands) continue;
        best = this.newTrack();
        this.tracks.push(best);
      }
      used.add(best);
      best.lm = lm;
      best.lastSeen = now;
    }
    this.tracks = this.tracks.filter((tr) => {
      tr.fresh = used.has(tr);
      return tr.fresh || now - tr.lastSeen <= LOST_MS;
    });
    for (const tr of this.tracks) if (tr.fresh) this.analyze(tr, now);

    // heart hands, per side (solo: any two hands)
    this.heartDebug = null;
    for (let side = 0; side < 2; side++) {
      const hs = this.tracks.filter((t) => t.fresh && (!this.split || t.side === side));
      let found = null;
      if (hs.length >= 2) {
        const [a, b] = hs;
        const d = (p, q) => Math.hypot((p.x - q.x) * vw, (p.y - q.y) * vh);
        const sz = (a.info.size + b.info.size) / 2;
        const thumbs = d(a.lm[4], b.lm[4]) / sz;
        const index = d(a.lm[8], b.lm[8]) / sz;
        const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        const top = mid(a.lm[8], b.lm[8]), bottom = mid(a.lm[4], b.lm[4]);
        const gap = d(top, bottom) / sz;
        this.heartDebug = { thumbs, index, gap };
        if (thumbs < 0.65 && index < 0.65 && gap > 0.4 && a.info.pinchD > 0.35 && b.info.pinchD > 0.35) {
          const [x, y] = this.toScreen((top.x + bottom.x) / 2, (top.y + bottom.y) / 2);
          found = { x, y };
        }
      }
      const prev = this.hearts[side];
      this.hearts[side] = found ? { since: prev ? prev.since : now, x: found.x, y: found.y } : null;
      if (!this.split) { this.hearts[1] = null; break; }
    }
  }

  analyze(tr, now) {
    const lm = tr.lm;
    const { vw, vh, s } = this.map;
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * vw, (lm[a].y - lm[b].y) * vh);
    const size = Math.max(d(0, 9), 1e-3);
    const ratio = (tip, pip) => d(tip, 0) / Math.max(d(pip, 0), 1e-3);
    const rI = ratio(8, 6), rM = ratio(12, 10), rR = ratio(16, 14), rP = ratio(20, 18);
    const pinchD = d(4, 8) / size;
    const vGap = d(8, 12) / size;
    const ext = (r) => r > 1.18;
    const curl = (r) => r < 1.0;

    let raw = 'other';
    if (ext(rI) && ext(rM) && ext(rR) && ext(rP) && pinchD > 0.5) raw = 'open';
    else if (ext(rI) && ext(rM) && curl(rR) && curl(rP) && vGap > 0.3) raw = 'peace';
    if (raw === tr.cand) tr.candN++;
    else { tr.cand = raw; tr.candN = 1; }
    if (tr.pose === 'none' || (raw !== tr.pose && tr.candN >= 3)) {
      tr.pose = raw;
      tr.poseSince = now;
    }

    const tSec = now / 1000;
    TIP_IDS.forEach((id, k) => {
      const nx = tr.fx[k].filter(lm[id].x, tSec);
      const ny = tr.fy[k].filter(lm[id].y, tSec);
      const [x, y] = this.toScreen(nx, ny);
      tr.tips[k].x = x;
      tr.tips[k].y = y;
    });
    const px = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
    const py = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
    [tr.palm.x, tr.palm.y] = this.toScreen(px, py);
    const sizePx = size * s;
    tr.r = clamp(sizePx * 0.11, 9, 30);
    tr.sizePx = sizePx;
    if (this.split) {
      const [wx] = this.toScreen(lm[0].x, lm[0].y);
      const mid = this.W / 2, hyst = this.W * 0.04;
      if (tr.side === 0 && wx > mid + hyst) tr.side = 1;
      else if (tr.side === 1 && wx < mid - hyst) tr.side = 0;
      else if (tr.info === null) tr.side = wx < mid ? 0 : 1;
    } else {
      tr.side = 0;
    }
    tr.info = { rI, rM, rR, rP, pinchD, vGap, size };
  }

  // Fingertip movements since the last call, as segments for swept collision tests.
  segments(out = []) {
    for (const tr of this.tracks) {
      if (!tr.info) continue;
      for (let k = 0; k < 5; k++) {
        const t = tr.tips[k];
        const l = tr.last[k];
        const ax = l ? l.x : t.x, ay = l ? l.y : t.y;
        // a huge jump means the tracker swapped hands or re-found one: don't sweep across the screen
        const jump = Math.hypot(t.x - ax, t.y - ay) > Math.max(this.W, this.H) * 0.35;
        out.push({ ax: jump ? t.x : ax, ay: jump ? t.y : ay, bx: t.x, by: t.y, r: tr.r, side: tr.side });
        tr.last[k] = { x: t.x, y: t.y };
      }
    }
    return out;
  }

  tipPoints(out = []) {
    for (const tr of this.tracks) {
      if (!tr.info) continue;
      for (const t of tr.tips) out.push({ x: t.x, y: t.y, side: tr.side });
    }
    return out;
  }

  // The longest-held instance of a pose (for "hold ✌️ for a selfie" etc.): { track, held } or null
  held(pose, now) {
    let best = null;
    for (const tr of this.tracks) {
      if (!tr.fresh || tr.pose !== pose) continue;
      const held = now - tr.poseSince;
      if (!best || held > best.held) best = { track: tr, held };
    }
    return best;
  }

  get count() { return this.tracks.filter((t) => t.fresh).length; }
}

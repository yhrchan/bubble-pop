// Touch and mouse: every finger on the screen pops bubbles (multi-touch), a mouse pops while the button is held.
// Movements are buffered as segments and handed to the game once per frame.

export class PointerInput {
  // onDown(x, y) may return true to consume a press (for example tapping the love meter).
  constructor(el, { onDown, sideOf } = {}) {
    this.el = el;
    this.onDown = onDown;
    this.sideOf = sideOf || (() => 0);
    this.active = new Map();
    this.pending = [];
    this.hover = null;
    this.used = false;

    const pos = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const rad = (e) => (e.pointerType === 'mouse' ? 12 : 20);

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.used = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const p = pos(e);
      if (this.onDown && this.onDown(p.x, p.y)) return;
      this.active.set(e.pointerId, p);
      this.push(p, p, rad(e));
    });
    el.addEventListener('pointermove', (e) => {
      const l = this.active.get(e.pointerId);
      if (!l) {
        if (e.pointerType === 'mouse') this.hover = pos(e);
        return;
      }
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      let prev = l;
      for (const ce of evs.length ? evs : [e]) {
        const p = pos(ce);
        this.push(prev, p, rad(e));
        prev = p;
      }
      this.active.set(e.pointerId, prev);
      if (e.pointerType === 'mouse') this.hover = prev;
    });
    const end = (e) => {
      this.active.delete(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hover = null;
    });
  }

  push(a, b, r) {
    if (this.pending.length > 400) this.pending.shift();
    this.pending.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r, side: this.sideOf(b.x) });
  }

  drain(out) {
    for (const s of this.pending) out.push(s);
    this.pending.length = 0;
    return out;
  }

  tipPoints(out) {
    for (const p of this.active.values()) out.push({ x: p.x, y: p.y, side: this.sideOf(p.x) });
    if (this.hover && !this.active.size) out.push({ x: this.hover.x, y: this.hover.y, side: this.sideOf(this.hover.x) });
    return out;
  }
}

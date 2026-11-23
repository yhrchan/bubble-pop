// Bubble Pop: wires the camera, hand tracking, touch input, game, sound, screens and sharing together.

import { HandTracker, startCamera, stopCamera, isInAppBrowser, CameraError } from './hands.js';
import { HandInput } from './tracking.js';
import { PointerInput } from './pointer.js';
import { makeSprites, FONT } from './sprites.js';
import { Field } from './bubbles.js';
import { Fx } from './fx.js';
import { Game, titleFor } from './game.js';
import { Hud, fmt, label } from './hud.js';
import { Sound } from './audio.js';
import {
  readChallenge, challengeURL, captureScreen, buildStoryCard, shareImage, shareLink, sanitizeName, drawCover, paintSky,
} from './share.js';
import { storageGet, storageSet, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BEST_KEY = 'bubble-pop-best';
const MODE_KEY = 'bubble-pop-mode';
const NAME_KEY = 'bubble-pop-name';
const BG_KEY = 'bubble-pop-bg';

const video = $('video');
const canvas = $('game');
const ctx = canvas.getContext('2d');
const sprites = makeSprites();
const field = new Field(sprites);
const fx = new Fx(sprites, REDUCED);
const sound = new Sound();
const hud = new Hud();
const hands = new HandInput();
let tracker = null;
let input = 'none'; // 'camera' | 'touch'
let mode = ['solo', 'duo', 'chill'].includes(storageGet(MODE_KEY)) ? storageGet(MODE_KEY) : 'solo';
let showCam = storageGet(BG_KEY) !== 'sky';
let W = 1, H = 1, dpr = 1, dprCap = 2, safeTop = 0;
const challenge = readChallenge();

// photos for the results card
let moment = null; // { canvas, weight }
let momentTimer = 0;
let selfiePhoto = null;
let selfie = null; // { t0, last }
let lastSummary = null;
let resultsAt = 0;

const game = new Game({
  field, fx, sound,
  on: {
    stateChange: onStateChange,
    moment: onMoment,
    roundEnd: onRoundEnd,
    meterFull: () => setHint(input === 'camera'
      ? '🫶 Make heart hands for a LOVE BLAST!'
      : '💗 Tap the full heart for a LOVE BLAST!', 3500),
  },
});

const pointer = new PointerInput(canvas, {
  sideOf: (x) => (game.duo ? (x < W / 2 ? 0 : 1) : 0),
  onDown: (x, y) => {
    sound.unlock();
    if (game.state !== 'play') return false;
    for (let side = 0; side < 2; side++) {
      const m = hud.meterRects[side];
      if (m && Math.hypot(x - m.x, y - m.y) <= m.r) {
        if (!game.blast(side, m.x, m.y + 60)) toast('Pop hearts to fill your love meter 💗');
        return true;
      }
    }
    return false;
  },
});

// ---- layout -----------------------------------------------------------------------------------
function layout() {
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  safeTop = $('safeTop').offsetHeight || 0;
  game.resize(W, H);
  hands.setView(W, H, video.videoWidth, video.videoHeight);
}
new ResizeObserver(() => layout()).observe(canvas);
layout();

// ---- small UI helpers ------------------------------------------------------------------------
const hintEl = $('hint');
let hintTimer = 0;
function setHint(text, ms = 0) {
  clearTimeout(hintTimer);
  if (!text) {
    hintEl.hidden = true;
    return;
  }
  if (hintEl.textContent !== text) hintEl.textContent = text;
  hintEl.hidden = false;
  if (ms) hintTimer = setTimeout(() => { hintEl.hidden = true; }, ms);
}

const toastEl = $('toast');
let toastTimer = 0;
function toast(text, ms = 2600) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

// ---- start screen ---------------------------------------------------------------------------
const startScreen = $('startScreen');
const pauseScreen = $('pauseScreen');
const resultsScreen = $('resultsScreen');
const startStatus = $('startStatus');
const btnCamera = $('btnCamera');
const btnTouch = $('btnTouch');
const MODE_DESC = {
  solo: '60 seconds. Pop as many as you can, chain combos and fill your love meter 💗',
  duo: 'Two players side by side, pink vs lilac. Same bubbles, who pops more? 👯',
  chill: 'No timer, no grumpy clouds. Just pop and relax 🛁',
};

function renderModes() {
  for (const chip of document.querySelectorAll('.chip')) {
    chip.setAttribute('aria-checked', String(chip.dataset.mode === mode));
  }
  $('modeDesc').textContent = MODE_DESC[mode];
}
for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    mode = chip.dataset.mode;
    storageSet(MODE_KEY, mode);
    renderModes();
  });
}
renderModes();

function renderBest() {
  const best = parseInt(storageGet(BEST_KEY) || '0', 10) || 0;
  const el = $('bestLine');
  el.hidden = !best;
  el.textContent = best ? `Your best: ${fmt(best)} 👑` : '';
}
renderBest();

if (challenge) {
  const el = $('challenge');
  el.textContent = `💌 ${challenge.from || 'A friend'} scored ${fmt(challenge.beat)}. Can you beat it?`;
  el.hidden = false;
  mode = 'solo';
  renderModes();
}
if (isInAppBrowser()) show($('inAppWarn'));

function setStatus(text, isError = false) {
  startStatus.textContent = text;
  startStatus.classList.toggle('error', isError);
}

function setInput(kind) {
  input = kind;
  document.body.classList.toggle('input-camera', kind === 'camera');
  document.body.classList.toggle('sky', !showCam);
  $('btnBg').hidden = kind !== 'camera';
  renderBg();
}

let starting = false;
async function playWithCamera() {
  if (starting) return;
  starting = true;
  sound.unlock();
  btnCamera.disabled = btnTouch.disabled = true;
  setStatus('Starting camera…');
  const trackerP = tracker ? Promise.resolve(tracker) : HandTracker.create(mode === 'duo' ? 4 : 2);
  trackerP.catch(() => {});
  try {
    if (!video.srcObject) await startCamera(video);
    setStatus('Loading hand tracking… (about 17 MB the first time)');
    tracker = await trackerP;
    setStatus('');
    setInput('camera');
    layout();
    begin();
  } catch (err) {
    console.warn(err);
    stopCamera(video);
    const reason = err instanceof CameraError ? err.message : 'Hand tracking could not load. Check your connection and try again.';
    setStatus(`${reason} You can still play with touch 👆`, true);
  } finally {
    starting = false;
    btnCamera.disabled = btnTouch.disabled = false;
  }
}

function playWithTouch() {
  sound.unlock();
  setStatus('');
  if (video.srcObject) stopCamera(video);
  setInput('touch');
  begin();
}

btnCamera.addEventListener('click', playWithCamera);
btnTouch.addEventListener('click', playWithTouch);

let noHandsSince = 0;
function begin() {
  hide(startScreen);
  hide(resultsScreen);
  hide(pauseScreen);
  game.setMode(mode);
  hands.maxHands = mode === 'duo' ? 4 : 2;
  hands.split = mode === 'duo';
  hands.reset();
  if (tracker) tracker.setNumHands(hands.maxHands);
  moment = null;
  selfiePhoto = null;
  noHandsSince = performance.now();
  game.enterReady();
  sound.startMusic(92, 0.7);
  if (mode === 'duo' && W < H * 1.05) toast('Bestie Battle works best on a laptop or with your phone sideways 📱', 4500);
}

function goMenu() {
  game.paused = false;
  game.setState('idle');
  field.clear();
  fx.clear();
  sound.stopMusic();
  hide(pauseScreen);
  hide(resultsScreen);
  setHint('');
  renderBest();
  show(startScreen);
}

// ---- game state → screens ----------------------------------------------------------------------
function onStateChange(s) {
  document.body.className = document.body.className.replace(/\bstate-\S+/g, '').trim();
  document.body.classList.add(`state-${s === 'idle' ? 'start' : s}`);
  $('btnPause').hidden = !(s === 'play' || s === 'countdown' || s === 'ready');
  const cam = input === 'camera';
  if (s === 'ready') {
    if (mode === 'duo') setHint(cam ? 'Each player pops their own bubble to start 💗💜' : 'Tap both bubbles to start 💗💜');
    else setHint(cam ? 'Pop the big bubble with a fingertip 👆' : 'Tap the bubble to start ✨');
  } else if (s === 'countdown') {
    setHint('');
  } else if (s === 'play') {
    setHint(cam
      ? 'Poke bubbles with any fingertip ✨ Avoid grumpy clouds ☁️'
      : 'Tap or swipe to pop ✨ Avoid grumpy clouds ☁️', 4500);
    if (mode !== 'chill') sound.setTempo(104);
  } else if (s === 'ending') {
    setHint('');
  }
}

function onMoment(weight, delay) {
  if (momentTimer || (moment && weight < moment.weight)) return;
  momentTimer = setTimeout(() => {
    momentTimer = 0;
    if (game.state !== 'play') return;
    moment = { canvas: snap(), weight };
  }, delay);
}

function snap() {
  return captureScreen({ video, gameCanvas: canvas, showCamera: input === 'camera' && showCam });
}

function onRoundEnd(summary) {
  lastSummary = summary;
  sound.fanfare();
  setTimeout(() => {
    if (!moment) moment = { canvas: snap(), weight: 0 };
    showResults(summary);
  }, 140);
}

function li(text) {
  const el = document.createElement('li');
  el.textContent = text;
  return el;
}

function showResults(summary) {
  resultsAt = performance.now();
  const S = summary.sides;
  const head = $('resHead'), score = $('resScore'), sub = $('resSub'), stats = $('resStats');
  stats.replaceChildren();
  let subText = '';
  const solo = summary.mode === 'solo';
  if (solo) {
    const s = S[0];
    const prev = parseInt(storageGet(BEST_KEY) || '0', 10) || 0;
    if (s.score > prev) storageSet(BEST_KEY, String(s.score));
    head.textContent = titleFor(s.score);
    score.textContent = fmt(s.score);
    subText = s.score > prev && prev > 0 ? '✨ New personal best! ✨' : s.score > prev ? '✨ Your first score! ✨' : `Your best: ${fmt(prev)}`;
    if (challenge) {
      const who = challenge.from || 'your friend';
      subText = s.score > challenge.beat
        ? `🎉 You beat ${who}'s ${fmt(challenge.beat)}!`
        : `${who} scored ${fmt(challenge.beat)}. So close! 💪`;
    }
    stats.append(li(`🫧 ${fmt(s.pops)} pops`), li(`💖 ${fmt(s.hearts)} hearts`), li(`🔥 x${s.maxCombo} combo`));
    if (s.stars) stats.append(li(`⭐ ${s.stars} star${s.stars > 1 ? 's' : ''}`));
    if (s.kitties) stats.append(li(`🐱 ${s.kitties} kitt${s.kitties > 1 ? 'ies' : 'y'}`));
    if (s.blasts) stats.append(li(`🫶 ${s.blasts} love blast${s.blasts > 1 ? 's' : ''}`));
    if (s.clouds) stats.append(li(`☁️ ${s.clouds} oops`));
  } else if (summary.mode === 'duo') {
    const [a, b] = S;
    head.textContent = a.score === b.score ? "It's a tie! 💞" : a.score > b.score ? 'Pink wins! 💗' : 'Lilac wins! 💜';
    score.textContent = `${fmt(a.score)} : ${fmt(b.score)}`;
    subText = 'pink vs lilac';
    stats.append(li(`💗 ${fmt(a.pops)} pops · x${a.maxCombo}`), li(`💜 ${fmt(b.pops)} pops · x${b.maxCombo}`));
  } else {
    const s = S[0];
    head.textContent = 'Chill Bath 🛁';
    score.textContent = fmt(s.pops);
    subText = 'bubbles popped, so relaxing';
    stats.append(li(`💖 ${fmt(s.hearts)} hearts`), li(`🐱 ${s.kitties} kitties`), li(`⭐ ${s.stars} stars`));
  }
  sub.textContent = subText;
  $('btnChallenge').hidden = !solo;
  $('nameField').hidden = !solo;
  $('nameInput').value = storageGet(NAME_KEY) || '';
  $('resGesture').hidden = input !== 'camera';
  renderPhoto();
  show(resultsScreen);
  setHint('');
}

function renderPhoto() {
  const c = $('resPhoto');
  const g = c.getContext('2d');
  const photo = selfiePhoto || (moment && moment.canvas);
  if (photo) {
    drawCover(g, photo, 0, 0, c.width, c.height);
  } else {
    paintSky(g, c.width, c.height);
    g.font = `120px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🫧', c.width / 2, c.height / 2);
  }
}

// ---- results buttons ---------------------------------------------------------------------------
$('btnAgain').addEventListener('click', playAgain);
$('btnMenuR').addEventListener('click', goMenu);

function playAgain() {
  hide(resultsScreen);
  resultsScreen.classList.remove('peek');
  selfie = null;
  document.body.classList.remove('selfie');
  moment = null;
  selfiePhoto = null;
  hands.reset();
  sound.startMusic(92, 0.7);
  game.restart();
}

$('btnStory').addEventListener('click', async () => {
  if (!lastSummary) return;
  try {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const s = lastSummary.sides[0];
    const card = buildStoryCard({
      photo: selfiePhoto || (moment && moment.canvas),
      summary: lastSummary,
      title: titleFor(s.score),
      sprites,
    });
    const res = await shareImage(card, 'bubble-pop-story.png', 'My Bubble Pop score');
    if (res === 'downloaded') toast('Saved! Post it to your story 📸');
  } catch (err) {
    console.error(err);
    toast('Sorry, the picture could not be made.');
  }
});

$('nameInput').addEventListener('change', (e) => storageSet(NAME_KEY, sanitizeName(e.target.value)));
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnChallenge').click(); });

$('btnChallenge').addEventListener('click', async () => {
  if (!lastSummary) return;
  const name = sanitizeName($('nameInput').value);
  storageSet(NAME_KEY, name);
  const score = lastSummary.sides[0].score;
  const url = challengeURL(score, name);
  const res = await shareLink(url, `I scored ${fmt(score)} in Bubble Pop 🫧 Can you beat me?`);
  if (res === 'copied') toast('Challenge link copied 💌 Send it to a friend!');
  else if (res === 'failed') toast('Could not copy the link.');
});

// ---- pause, toolbar, keyboard ----------------------------------------------------------------
function pause() {
  if (!['play', 'countdown', 'ready'].includes(game.state) || game.paused) return;
  game.paused = true;
  sound.stopMusic();
  show(pauseScreen);
  $('btnEnd').hidden = game.state !== 'play';
}
function resume() {
  if (!game.paused) return;
  hide(pauseScreen);
  game.paused = false;
  sound.startMusic(game.state !== 'play' ? 92 : mode === 'chill' ? 76 : game.frenzy ? 132 : 104, game.state !== 'play' ? 0.7 : mode === 'chill' ? 0.8 : 1);
}
$('btnPause').addEventListener('click', pause);
$('btnResume').addEventListener('click', resume);
$('btnRestart').addEventListener('click', () => {
  hide(pauseScreen);
  game.paused = false;
  sound.startMusic(92, 0.7);
  game.restart();
});
$('btnEnd').addEventListener('click', () => {
  hide(pauseScreen);
  game.paused = false;
  game.finish();
});
$('btnMenuP').addEventListener('click', goMenu);

const btnMute = $('btnMute');
function renderMute() {
  btnMute.textContent = sound.muted ? '🔇' : '🔊';
  btnMute.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
  btnMute.setAttribute('aria-pressed', String(sound.muted));
}
renderMute();
btnMute.addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  renderMute();
});

const btnBg = $('btnBg');
function renderBg() {
  btnBg.textContent = showCam ? '🪞' : '☁️';
  btnBg.setAttribute('aria-label', showCam ? 'Hide camera picture' : 'Show camera picture');
}
btnBg.addEventListener('click', () => {
  showCam = !showCam;
  storageSet(BG_KEY, showCam ? 'cam' : 'sky');
  document.body.classList.toggle('sky', !showCam);
  renderBg();
  toast(showCam ? 'Camera picture on 🪞' : 'Dreamy sky on ☁️ (hands still tracked)');
});

$('btnHelp').addEventListener('click', () => {
  const d = $('helpDialog');
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === ' ' || e.key === 'p' || e.key === 'Escape') {
    if (game.paused) resume();
    else if (game.state === 'play') pause();
    else return;
    e.preventDefault();
  } else if (e.key === 'Enter' && game.state === 'ready') {
    for (const b of field.list) if (b.type === 'start') { b.dead = true; game.popped(b, 'key'); }
    field.removeDead();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'play' || game.state === 'countdown') pause();
    sound.stopMusic();
    cancelAnimationFrame(raf);
    raf = 0;
  } else if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (!game.paused && ['ready', 'countdown', 'play'].includes(game.state)) sound.startMusic(game.state === 'play' ? 104 : 92);
  }
});

// ---- gestures outside of play: ✌️ selfie and ✋ play again on the results screen --------------
const SELFIE_HOLD = 900, AGAIN_HOLD = 1000, SELFIE_COUNT = 800;
let holdUI = null;
let holdDoneAt = 0;

function handleHolds(now) {
  holdUI = null;
  if (input !== 'camera' || game.state !== 'results' || selfie || resultsScreen.hidden) {
    resultsScreen.classList.remove('peek');
    return;
  }
  if (now - resultsAt < 1200) return;
  // only poses started after the results appeared (or after the last selfie) count
  const fresh = (h) => h && h.track.poseSince > Math.max(resultsAt, holdDoneAt);
  const peace = hands.held('peace', now);
  const open = hands.held('open', now);
  if (fresh(peace) && peace.held > 150) {
    holdUI = { x: peace.track.palm.x, y: peace.track.palm.y - 90, p: (peace.held - 150) / SELFIE_HOLD, emoji: '✌️' };
    if (peace.held >= SELFIE_HOLD + 150) startSelfie(now);
  } else if (fresh(open) && open.held > 150) {
    holdUI = { x: open.track.palm.x, y: open.track.palm.y - 90, p: (open.held - 150) / AGAIN_HOLD, emoji: '✋' };
    if (open.held >= AGAIN_HOLD + 150) {
      holdUI = null;
      playAgain();
      return;
    }
  }
  resultsScreen.classList.toggle('peek', !!holdUI);
}

function startSelfie(now) {
  selfie = { t0: now, last: -1 };
  document.body.classList.add('selfie');
  resultsScreen.classList.remove('peek');
}

function updateSelfie(now) {
  if (!selfie) return false;
  const el = now - selfie.t0;
  const n = 3 - Math.floor(el / SELFIE_COUNT);
  if (n !== selfie.last && n > 0) {
    selfie.last = n;
    sound.countdown(n);
  }
  if (el >= SELFIE_COUNT * 3) {
    return true; // take the picture after this frame is drawn
  }
  const t = (el % SELFIE_COUNT) / SELFIE_COUNT;
  ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  label(ctx, String(n), W / 2, H * 0.42, clamp(Math.min(W, H) * 0.3, 90, 240), '#ff4f9a', 'center');
  ctx.globalAlpha = 1;
  label(ctx, 'say cheese! 🧀', W / 2, H * 0.42 + clamp(Math.min(W, H) * 0.2, 60, 150), 28, '#9b5bd6', 'center', 600);
  return false;
}

function finishSelfie() {
  // redraw the frame without the countdown, then capture it
  render(performance.now(), true);
  selfiePhoto = snap();
  selfie = null;
  holdDoneAt = performance.now();
  sound.shutter();
  fx.flash('255,255,255', 0.9);
  document.body.classList.remove('selfie');
  renderPhoto();
  toast('Selfie added to your story card 📸');
}

// ---- main loop --------------------------------------------------------------------------------
const debugEl = $('debug');
if (DEBUG) debugEl.hidden = false;
let raf = 0;
let last = performance.now();
let lastDetect = 0;
let detMs = 0;
let fps = 60;
let slowFrames = 0;
const segs = [];
const tips = [];
const NO_HEARTS = [null, null];

function frame(now) {
  const dtMs = now - last;
  const dt = Math.min(0.05, Math.max(0, dtMs) / 1000);
  last = now;
  fps += (1000 / Math.max(1, dtMs) - fps) * 0.05;

  const cam = input === 'camera' && tracker;
  if (cam && now - lastDetect >= 30) {
    const t0 = performance.now();
    let res = null;
    try {
      res = tracker.detect(video, now);
    } catch (err) {
      console.error(err);
    }
    if (res) {
      lastDetect = now;
      detMs = performance.now() - t0;
      hands.setView(W, H, video.videoWidth, video.videoHeight);
      hands.update(res, now);
    }
  }

  segs.length = 0;
  tips.length = 0;
  if (cam && !selfie) hands.segments(segs);
  pointer.drain(segs);
  if (cam) hands.tipPoints(tips);
  pointer.tipPoints(tips);

  if (!game.paused) {
    game.update(dt, now, { segments: game.state === 'idle' ? [] : segs, tips, hearts: cam ? hands.hearts : NO_HEARTS });
    fx.update(dt);
    for (const s of segs) {
      if (Math.hypot(s.bx - s.ax, s.by - s.ay) > 10 && Math.random() < 0.35) fx.trail(s.bx, s.by);
    }
  }

  if (cam) {
    if (hands.count) noHandsSince = now;
    else if (game.state === 'ready' && now - noHandsSince > 2500) {
      setHint('Show your hands to the camera 👋 (step back a little)');
    }
  }

  handleHolds(now);
  const takePhoto = render(now, false);
  if (takePhoto) finishSelfie();

  if (fps < 30 && dprCap > 1) {
    if (++slowFrames > 180) {
      dprCap = dprCap > 1.5 ? 1.5 : 1;
      slowFrames = 0;
      fps = 45;
      layout();
    }
  } else {
    slowFrames = 0;
  }

  if (DEBUG) renderDebug();
  raf = requestAnimationFrame(frame);
}

const skyClouds = [0.12, 0.3, 0.55, 0.78, 0.9].map((y, i) => ({ y, speed: 8 + i * 5, off: i * 397, k: 0.8 + (i % 3) * 0.25 }));

function render(now, clean) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (input !== 'camera' || !showCam) {
    const size = clamp(Math.min(W, H) * 0.5, 140, 360);
    ctx.globalAlpha = 0.85;
    for (const c of skyClouds) {
      const s = size * c.k;
      const x = (((now / 1000) * c.speed + c.off) % (W + s)) - s / 2;
      ctx.drawImage(sprites.skyCloud, x - s / 2, c.y * H - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  game.drawBack(ctx, W, H, now);
  field.draw(ctx, dpr, game.gt, fx.sx, fx.sy);
  fx.draw(ctx, dpr);
  if (!clean) {
    drawFingertips();
    hud.draw(ctx, game, W, H, now, { top: safeTop, touch: input !== 'camera' });
    if (holdUI) hud.drawHold(ctx, holdUI.x, Math.max(50, holdUI.y), holdUI.p, holdUI.emoji);
    drawHeartHold(now);
  } else {
    hud.draw(ctx, game, W, H, now, { top: safeTop, touch: input !== 'camera' });
  }
  const shot = clean ? false : updateSelfie(now);
  fx.drawFlash(ctx, W, H);
  return shot;
}

function drawFingertips() {
  if (input !== 'camera') return;
  for (const tr of hands.tracks) {
    if (!tr.info) continue;
    tr.tips.forEach((t, k) => {
      const s = tr.r * (k === 1 ? 4 : 3.2);
      ctx.globalAlpha = tr.fresh ? 0.95 : 0.4;
      ctx.drawImage(sprites.tip, t.x - s / 2, t.y - s / 2, s, s);
    });
  }
  ctx.globalAlpha = 1;
}

function drawHeartHold(now) {
  if (input !== 'camera' || game.state !== 'play') return;
  for (let side = 0; side < 2; side++) {
    const h = hands.hearts[side];
    if (!h || !game.sides[side].meterFull) continue;
    const p = (now - h.since) / 250;
    if (p < 1) hud.drawHold(ctx, h.x, h.y, p, '🫶', 34);
  }
}

function renderDebug() {
  const lines = [
    `fps ${fps.toFixed(0)}  dpr ${dpr}  ${W.toFixed(0)}x${H.toFixed(0)}  bubbles ${field.list.length}  particles ${fx.n}`,
    `state ${game.state}  input ${input}${tracker ? `  detect ${detMs.toFixed(1)}ms (${tracker.delegate})` : ''}  video ${video.videoWidth}x${video.videoHeight}`,
  ];
  for (const tr of hands.tracks) {
    const i = tr.info;
    if (!i) continue;
    lines.push(`hand#${tr.id} side${tr.side} ${tr.pose.padEnd(5)} r${tr.r.toFixed(0)} pinch ${i.pinchD.toFixed(2)} v ${i.vGap.toFixed(2)} rI ${i.rI.toFixed(2)} rM ${i.rM.toFixed(2)} rR ${i.rR.toFixed(2)} rP ${i.rP.toFixed(2)}`);
  }
  const h = hands.heartDebug;
  if (h) lines.push(`heart thumbs ${h.thumbs.toFixed(2)} index ${h.index.toFixed(2)} gap ${h.gap.toFixed(2)}${hands.hearts[0] ? '  ♥' : ''}`);
  debugEl.textContent = lines.join('\n');
}

raf = requestAnimationFrame(frame);

window.__bubblePop = {
  game, field, fx, hands, sound, hud,
  get input() { return input; },
  get tracker() { return tracker; },
  get moment() { return moment; },
  get selfiePhoto() { return selfiePhoto; },
};

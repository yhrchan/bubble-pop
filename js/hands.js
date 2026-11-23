// Camera + MediaPipe hand landmarker. Everything runs locally in the browser.

const MP_VERSION = '0.10.21';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = new URL('../models/hand_landmarker.task', import.meta.url).href;

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat|LinkedInApp/i.test(ua);
}

export async function startCamera(video) {
  if (!window.isSecureContext) {
    throw new CameraError('insecure', 'The camera only works on an https:// link.');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new CameraError('unsupported', isInAppBrowser()
      ? 'This in-app browser blocks the camera. Open the link in Safari or Chrome.'
      : 'This browser does not support camera access.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', 'Camera permission was blocked. You can allow it in your browser settings.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('missing', 'No camera was found on this device.');
    }
    if (name === 'NotReadableError') {
      throw new CameraError('busy', 'The camera is being used by another app.');
    }
    throw new CameraError('other', 'Could not start the camera.');
  }
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await video.play().catch(() => {});
  if (!video.videoWidth) {
    await new Promise((resolve) => {
      const done = () => { video.removeEventListener('loadeddata', done); resolve(); };
      video.addEventListener('loadeddata', done);
      setTimeout(done, 4000);
    });
  }
  return stream;
}

export function stopCamera(video) {
  const s = video.srcObject;
  if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

export class HandTracker {
  static async create(numHands = 2) {
    const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const t = new HandTracker();
    t.numHands = numHands;
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: t.numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    let landmarker;
    let delegate = 'GPU';
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('GPU delegate unavailable, falling back to CPU', err);
      delegate = 'CPU';
      landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
    t.landmarker = landmarker;
    t.delegate = delegate;
    t.fallbackToCpu = () => HandLandmarker.createFromOptions(fileset, options('CPU'));
    return t;
  }

  constructor() {
    this.numHands = 2;
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.errors = 0;
    this.switching = false;
  }

  // 2 hands for solo, 4 for Bestie Battle.
  async setNumHands(n) {
    if (this.numHands === n || !this.landmarker) return;
    this.numHands = n;
    try {
      await this.landmarker.setOptions({ numHands: n });
    } catch (err) {
      console.warn('Could not change the number of hands', err);
    }
  }

  // Returns a fresh result, or null if there's no new video frame yet.
  detect(video, nowMs) {
    if (!this.landmarker || this.switching || video.readyState < 2 || !video.videoWidth) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    try {
      const res = this.landmarker.detectForVideo(video, ts);
      this.errors = 0;
      return res;
    } catch (err) {
      // Some mobile GPUs fail at run time rather than at start-up: switch to CPU once.
      if (++this.errors >= 3 && this.delegate === 'GPU' && this.fallbackToCpu) {
        console.warn('Hand tracking failed on GPU, switching to CPU', err);
        this.switching = true;
        this.fallbackToCpu()
          .then((lm) => {
            try { this.landmarker.close(); } catch { /* ignore */ }
            this.landmarker = lm;
            this.delegate = 'CPU';
            this.errors = 0;
          })
          .catch((e) => console.error('CPU fallback failed', e))
          .finally(() => { this.switching = false; });
      }
      return null;
    }
  }
}

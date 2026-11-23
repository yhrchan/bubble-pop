# Bubble Pop 🫧

A cute camera game. Bubbles, hearts and kitties float up over your mirrored webcam picture, and you pop them with your fingertips. Hand tracking runs in your browser.

**Play:** https://yhrchan.github.io/bubble-pop/

## How to play

| | |
|---|---|
| 👆 **Poke** | Any fingertip pops bubbles. Swipe through several in a row for combos: ×2 at 5 pops, up to ×5 at 30. |
| 💖 **Hearts** | Fill your love meter. A big heart with a bow bursts into 3 mini hearts. |
| 🫶 **Heart hands** | When the meter is full, touch your thumbs together and your index fingers together. **Love Blast** pops everything. |
| 🌈 **Rainbow** | Rainbow Rush: double points and extra bubbles for 5 seconds. |
| 🌙 **Moon** | Dreamy slow-mo for 4 seconds. |
| ⭐ **Star** | Fast, zigzags, worth the most. |
| ☁️ **Grumpy cloud** | Costs 20 points and breaks your combo. Leave it alone. |
| ✌️ **Peace sign** | On the results screen, takes a selfie for your Stories card. |
| ✋ **Open hand** | On the results screen, hold it up to play again. |

**Modes:**
- 💖 **Solo:** 60 seconds, with a final frenzy in the last 10.
- 👯 **Bestie Battle:** two players side by side, pink against lilac, with identical bubbles on each side.
- 🛁 **Chill:** endless, with no clouds.

**No camera?** Tap or swipe to pop. Multi-touch works, and you tap the full heart for a Love Blast.

**Sharing:**
- 📸 makes a 1080×1920 Stories card with your best moment (or your ✌️ selfie) and your score.
- 💌 copies a challenge link such as `?beat=1400&from=Mia`, so your friend sees your score when they open it.

## Privacy

Hand tracking uses [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) and runs entirely on your device. Video and photos never leave your device unless you choose to share a picture. There's no server, no analytics and no cookies. Your best score and name are saved only in your browser.

## Run locally

Browsers only allow the camera on `https://` or `localhost`:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Add `?debug=1` to show fps, detection time and the measurements behind each gesture. These help when tuning the thresholds in `js/tracking.js`.

## How it works

No build step and no dependencies to install.

| File | What it does |
|---|---|
| `js/hands.js` | Camera and MediaPipe. Up to 2 hands, or 4 in Bestie Battle. Uses the GPU, with a CPU fallback. |
| `js/tracking.js` | Turns landmarks into mirrored screen-space fingertips (One Euro filtered), the open-palm and peace poses, and two-hand heart hands. |
| `js/bubbles.js` | Bubble physics: rising, wobbling and bumping. Popping uses swept fingertip collision, so fast swipes don't skip bubbles between camera frames. |
| `js/game.js` | Rounds, difficulty ramp, scoring, combos, power-ups and the Love Blast. |
| `js/sprites.js`, `js/fx.js`, `js/hud.js` | All artwork drawn in code, plus particles and the HUD. There are no image files. |
| `js/audio.js` | A small WebAudio synth. Each pop in a combo plays the next note of a tune. |
| `js/share.js` | The Stories card and challenge links. |

The MediaPipe library loads from jsDelivr. The model (`models/hand_landmarker.task`, Apache 2.0, from Google) is served from this repo. The Fredoka font comes from Google Fonts.

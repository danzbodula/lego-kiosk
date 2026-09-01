# DPT Kiosk — LEGO Minifigure Hair Selector

Touchscreen front end for the Diversified Printing Techniques trade-show booth.
A visitor picks a hairstyle on the iPad; the Rainbow Robotics RB5-850E builds it.

**Front end only.** All robot communication sits behind `window.DPTKiosk`
(see [Integration surface](#integration-surface)). There is no build step, no
npm, no framework — vanilla HTML, CSS and hand-written ES5, served as static
files.

---

## Target device

| | |
|---|---|
| Device | iPad mini 1st gen (2012), **portrait** |
| Screen | 1024 × 768 physical, **1× DPR** (non-Retina) |
| Viewport | **768 × 1004** CSS px in standalone mode (768 × 1024 in-browser) |
| OS | iOS 9.3.5 → **Safari 9** |
| RAM | 512 MB |

Everything is built to those constraints. Before changing anything, read
[Safari 9 landmines](#safari-9-landmines).

---

## Running it

### During development

Safari on iOS 9 will not reliably load a `file://` page with subresources, so
serve it over the local network:

**Windows (the booth laptop):** double-click **`serve.bat`**, or:

```
cd C:\Users\Engineering4\dpt-kiosk
py serve.py
```

**macOS / Linux:**

```bash
cd /path/to/rainbow_lego_builder
python3 serve.py
```

`serve.py` is `http.server` with two fixes that matter here:

- **No-cache headers on every response.** Safari 9 caches HTML/CSS/JS hard and
  gives you no reload button at all in Home Screen (standalone) mode, so it
  will serve you an hour-old build and look exactly like a failed deploy.
- **Binds `0.0.0.0` explicitly.** The default picks IPv6 (`::`) on Windows,
  which the iPad cannot reach over IPv4 — the server appears to run fine and
  the tablet simply never connects.

Leave the window open; closing it stops the server. If a page ever looks stale,
check there is exactly **one** listener — Windows lets two processes bind the
same port and requests then land on whichever wins the race:

```
netstat -ano | findstr LISTENING | findstr :8000
```

Then open `http://<your-laptop-ip>:8000` on the iPad (`ipconfig getifaddr en0`
on macOS, `hostname -I` on Linux). Both devices must be on the same network.

### At the booth

The finished app must run with **no laptop present**. Copy the whole folder to
the iPad and serve it locally, or host it on a small always-on device at the
booth. Nothing loads from a CDN, no web fonts are fetched, and there are no
external requests of any kind, so once the files are on the device it is fully
offline.

> **The iPad's 14-year-old battery should be assumed dead — run the demo
> plugged in.**

### Home Screen install (chrome-free fullscreen)

1. Open the app in Safari on the iPad.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the new Home Screen icon, *not* from Safari.

Launched this way it runs without Safari's toolbars, which is what makes the
viewport 768 × 1004 instead of 768 × 1024. `apple-mobile-web-app-capable` and
`apple-mobile-web-app-status-bar-style` in `index.html` are what enable this.

### Guided Access (locking the booth iPad into the app)

1. **Settings → General → Accessibility → Guided Access** → turn **on**.
2. Set **Passcode Settings → Set Guided Access Passcode** (pick something the
   booth staff know and visitors won't guess).
3. Launch the kiosk from the Home Screen icon.
4. **Triple-click the Home button** to start Guided Access, then tap **Start**.

The iPad is now locked into the app — Home, app switching and notifications are
disabled. Triple-click Home and enter the passcode to exit.

---

## Configuration

Everything tunable lives at the top of `js/config.js`:

| Key | Default | What it does |
|---|---|---|
| `IDLE_TIMEOUT` | `45000` | ms of no touch before the attract loop takes over |
| `AUTO_RESET` | `30000` | ms on the completion screen before the booth resets itself |
| `SIMULATE_BUILD` | `true` | run a fake 18-second build; set `false` once the arm drives `setProgress()` |
| `REDUCED_MOTION` | `false` | escape hatch — swaps every transition for a flat 150 ms opacity fade |
| `LAYOUT` | `'A'` | `'A'` = 2×4 grid (ship this). `'B'` = hero turntable + swipeable chips |
| `SPIN_SPEED` | `170` | ms each turntable frame is held (16 frames ≈ 2.7 s a revolution) |
| `SPIN_FADE` | `130` | ms of cross-fade between turntable frames |
| `SPIN_SPEED_ATTRACT` | `280` | slower frame hold for the idle loop |
| `RENDER_FRAMES` | `16` | frames in the rendered 360 set |
| `ART_SOURCE` | `'render'` | where hair art comes from: `'render'`, `'photo'` or `'placeholder'` |
| `DEBUG` | `false` | build the on-device debug panel and FPS meter |

### Where the turntable runs

| Screen | Rotating? |
|---|---|
| Screen 1 grid — **the selected card** | yes, in its own 88 px tile |
| Screen 1 — the other seven cards | no, static thumbnails |
| Build screen | no (the progress ring and arm bob instead) |
| Completion screen | yes, the finished figure |
| Attract loop | yes, the selected style |

Only ever **two layers cycle at once**. The card's rotation pauses whenever
screen 1 is not visible — during a build, and while the attract loop is up — so
nothing spins behind a hidden screen. Verified on device with the debug panel's
FPS meter and in `test.html`.

Under `REDUCED_MOTION` nothing spins at all; the cards stay on their static
thumbnails.

### URL overrides

The booth iPad has no keyboard and no way to edit a file, so the flags worth
flipping while standing in front of it can be set from the address bar. The
values in `js/config.js` stay the shipping defaults.

| Query | Effect |
|---|---|
| `?debug=1` | debug panel + FPS meter (then triple-tap the logo) |
| `?layout=B` | hero turntable instead of the 2×4 grid |
| `?art=photo` / `?art=render` / `?art=placeholder` | swap the hair art |
| `?motion=reduced` | flat 150 ms fades |
| `?sim=0` | stop the fake build, drive it from the arm |

Combine with `&` — e.g. `?debug=1&layout=B`.

### Comparing layout A and B on the device

Set `LAYOUT: 'B'` in `js/config.js` and reload. Layout A is the default and the
one to ship: all eight styles are visible at once, no paging. Layout B shows a
large hero turntable with a horizontally swipeable row of circular chips — more
dramatic, less scannable.

---

## Hair styles and assets

### Adding, removing or renaming a style

Edit **`data/hair.js` only**. Nothing in `index.html`, the CSS, or the other JS
names an individual style.

```js
var HAIR_STYLES = [
  { id: 'brown', name: 'BROWN', color: '#7A4A2C',
    angles: ['front', 'front45', 'side', 'back'] },
  // ...
];
```

| Field | Meaning |
|---|---|
| `id` | folder name under `assets/hair/<id>/`, and the placeholder filename |
| `name` | the label on the card. Keep it short — it has 226 px at 17 px/600 |
| `color` | swatch colour, used by the generated placeholder |
| `angles` | frame order for the turntable |
| `element` | LEGO element ID (part + colour) — the number on the packing list |
| `design` | LEGO/BrickLink design ID (the mould, in any colour) |
| `part` | BrickLink part name |
| `thumb` | optional; set `false` to use `front.png` instead of `thumb.png` |

### Physical parts

The manifest carries the real part identity so the UI and the robot share one
source of truth. The hardware layer can resolve a selection with
`App.styleById(styleId).element`.

| Style | Element | Design | Part |
|---|---|---|---|
| BROWN | `6438262` | `103748pb01` | Hair Swept Left with Side Part, **molded cochlear implant** |
| BLONDE | `6093519` | `87991` | Hair Tousled with Side Part |
| AUBURN | `6123038` | `21268` | Hair Short Swept Back with Sideburns and Widow's Peak |
| GINGER | `6310817` | `36037` | Hair Female Mid-Length Combed Behind Ear |
| LONG | `4506003` | `59363` | Hair Female Mid-Length with Braid Around Sides |
| BLACK | `4653226` | `99930` | Hair Short Combed Sideways Part Left |
| CURLY | `6409770` | `2646` | Mini Doll Hair Short with Curls and Pompadour |
| CAP | `6032178` | `11303` | Headgear Cap - Short Curved Bill |

Two things to know:

- **CURLY is a Friends mini-doll mould**, not a standard minifigure part. It fits
  the minifigure head fine, but order it by element ID — it won't show up when
  browsing minifigure hair.
- **AUBURN and GINGER are unconfirmed.** They are the two orange mid-length
  pieces and may be swapped. Check the bags against the design IDs above.

Adding a ninth style works with no other edits. **Note:** the grid is sized for
eight (4 rows × 108 px). A ninth adds a fifth row and will overflow the 1004 px
column — at that point either reduce the card height in
`css/components.css` (`.card-slot`, `.card`) or switch to layout B, which
scrolls horizontally and takes any number.

### Art sources

Three complete sets ship, and `ART_SOURCE` in `js/config.js` switches between
them with no other edit:

| Value | Folder | What it is |
|---|---|---|
| `'render'` *(default)* | `assets/hair-render/` | rendered from the real LDraw part geometry |
| `'photo'` | `assets/hair/` | the segmented photography |
| `'placeholder'` | `assets/placeholder/` | flat colour swatches |

**The render set is a true 360.** Each style folder holds 16 frames at
480 px (`f00.png`…`f15.png`, 22.5° apart) plus the same 16 at card scale
(`t00.png`…`t15.png`), so the turntable rotates all the way round and loops
seamlessly rather than rocking through four angles and snapping back.
`thumb.png` is a copy of `t00.png` and is what a card shows when not selected.

Frame count lives in `RENDER_FRAMES` (`js/config.js`). Change it only if you
re-run the render script with a different count.

Rendering is done by a small software rasteriser (in the scratch tooling, not
shipped) that reads the LDraw part geometry directly:

- lighting is computed in **linear space** and converted to sRGB at the end
- **hemisphere ambient** — cool sky above, warm bounce below
- **baked per-vertex ambient occlusion** via a BVH, which is what puts real
  shading into the grooves of a moulded hair piece
- Blinn-Phong specular plus a Fresnel rim, so ABS reads as plastic not clay
- 3× supersampled, then written as a **palette PNG** — ~4.5× smaller with no
  visible banding, which cuts both transfer and A5 decode time

That lands at ~30 KB a frame, 780 KB a style, 6 MB for all eight.

**Photography falls back to a rock.** With only four angles a set can rock
`front → front45 → side → back → front45` and reverse; it cannot loop. That is
the main reason the renders look smoother.

Two known gaps in the render set:

- The **cochlear implant on BROWN renders in the hair colour.** The LDraw mould
  (`103748`) is single-colour; the real part has a moulded light bluish grey
  implant. Photography captures it, the render does not.
- Renders read slightly flatter than photographs. Compare both on the device —
  that is exactly what `ART_SOURCE` is for.

Any asset that fails to load still falls back to its colour swatch, so a typo
in the manifest shows as a plain colour rather than an empty card.

### Replacing the hair photography

Drop files here:

```
assets/hair/<id>/front.png
assets/hair/<id>/front45.png
assets/hair/<id>/side.png
assets/hair/<id>/back.png
assets/hair/<id>/thumb.png     (optional, see below)
```

> **Full shooting protocol: [PHOTOGRAPHY.md](PHOTOGRAPHY.md)** — rig, camera
> lock, angle map, registration, and how to verify on the device.

**Export specs — designed against these exact numbers:**

| | |
|---|---|
| Format | **PNG with transparency** (no JPEG, no HEIC — Safari 9 cannot read HEIC) |
| Frame size | **640 × 640 px**, square |
| Thumbnail | **176 × 176 px** as `thumb.png` |
| Scale rationale | Largest on-screen use is the 320 px hero/attract stage, and the grid thumb is 88 px. This is a **1× screen, so 2× is the ceiling — do not ship 3×.** |
| Subject | centred, consistent padding, filling ~88% of the frame |
| Consistency | identical scale, lighting, camera distance and angle across **all** styles |

**The four angles must share one scale and one centre.** The turntable
cross-fades them in place, so if the camera moved between shots the figure will
visibly jump as it "rotates". Shoot all four from a fixed camera on a
turntable, or normalise scale and position in post.

Shooting notes that will save re-work:

- Plain, evenly lit background with clear contrast against the hair. Near-black
  hair against a dark surface is the hardest case to cut out.
- Avoid a glossy surface — reflections and specular streaks make masking hard.
- Keep the subject away from dark background objects; anything dark and
  touching the silhouette tends to get absorbed into it.
- Include a real **back** view where the head is visible. A shot taken from
  below, where the head hides behind the torso, cannot be used.

If you supply only three usable angles for a style, point two entries at the
same file in `data/hair.js` — the turntable simply holds that frame longer.

### Logo and icons

| File | Size | Notes |
|---|---|---|
| `assets/logo/dpt-logo.png` | 320 × 88 | full lockup, 2× of its 160 × 44 display size |
| `assets/logo/dpt-badge.svg` | vector | square badge — used on build, completion, error and attract |
| `assets/logo/apple-touch-icon.png` | 152 × 152 | Home Screen icon — the badge, flattened onto brand maroon |
| `assets/logo/launch-768x1004.png` | 768 × 1004 | standalone launch image |

**One mark, two lockups.** The horizontal lockup is rebuilt around the same
white-reticle badge, so screen 1 and every other screen carry an identical
mark. The lockup leads screen 1 only. On any
screen that already has a big central element — the 420 px progress ring, the
spinning minifigure — a 160 × 44 lockup reads as an afterthought, so those
screens lead with the square badge at 80 px (104 px on the attract loop).

**Why the badge's reticle is white.** The master artwork draws it in pure black
on maroon. At 44–80 px that goes muddy and loses the crosshair entirely; white
holds the mark's shape at every size and sits far more naturally next to iOS
chrome. The badge is redrawn as vector rather than scaled from the raster
master, so it stays crisp at any size.

**The robot.** `js/screens.js` carries the booth's **Rainbow Robotics cobot**
as inline SVG (`ARM_SVG`), drawn from a photograph of the actual cell: light
grey tubular links with dark joint shrouds, outlined so the light body still
reads against the `#FAFAFA` ground. The end effector is the cell's **SCHUNK
Co-act EGP-C 40** — navy shell, off-white body, black jaws, sampled from a
photograph of the real gripper. Redraw `ARM_SVG` if the cell changes tooling.

**The build screen IS the mark.** There is no separate progress ring and no
header logo on that screen — one 480 px badge fills the middle, and the
reticle's own circle is the progress bar, drawn with `stroke-dashoffset` in
white against the maroon. The robot sits inside the crosshairs, which run
behind it on purpose: the thing being built is literally in the cross hairs.
`ARM_LIGHT` in `js/screens.js` is the arm re-coloured for the maroon ground.

All logo files are generated from the supplied master artwork. The brand maroon
sampled from it is **`#7E001B`** — the original brief estimated `#7B1F2E`, and
the palette has been corrected to the real value throughout.

---

## Integration surface

All robot logic sits behind one global. Every method logs to the console, and
`SIMULATE_BUILD` provides a full fake timeline, so the whole flow is demoable
with no arm attached.

```js
window.DPTKiosk = {
  // you call these:
  setProgress: function (percent, stageLabel) {},  // drives the build screen
  buildComplete: function () {},                   // advances to completion
  buildError: function (message) {},               // shows a recoverable error
  reset: function () {},                           // returns to screen 1

  // the UI calls these; you override them:
  onSelectionChange: function (styleId) {},
  onContinue: function (styleId) {},
  onBuildStart: function (styleId) {},
  onReset: function () {}
};
```

### Overriding the hooks

Load your own script **after** `js/app.js` in `index.html` and assign over the
stubs:

```html
<script src="js/app.js"></script>
<script src="js/robot.js"></script>
```

```js
// js/robot.js
DPTKiosk.onBuildStart = function (styleId) {
  myRobotLink.send({ cmd: 'build', hair: styleId });
};

DPTKiosk.onReset = function () {
  myRobotLink.send({ cmd: 'abort' });
};

// drive the build screen from the arm
myRobotLink.on('progress', function (pct, label) {
  DPTKiosk.setProgress(pct, label);      // label is optional
});
myRobotLink.on('done',  function () { DPTKiosk.buildComplete(); });
myRobotLink.on('fault', function (m) { DPTKiosk.buildError(m); });
```

Set `SIMULATE_BUILD: false` once you are driving `setProgress()` yourself,
otherwise the simulation will fight your updates.

`setProgress(percent, stageLabel)` takes `0–100`. If `stageLabel` is omitted
the screen picks one of *Preparing components → Installing hair → Finalizing
build* from the percentage.

`onContinue` fires **before** the UI navigates, so an override can see the tap
without having to re-implement navigation.

---

## On-device debugging

Safari 9 fails **silently** on unsupported syntax — one ES6 token anywhere kills
that whole file with no visible error — and Web Inspector cannot be attached to
an iOS 9 device from a modern Mac. So the app reports its own failures.

1. **Global error overlay.** The first script in `index.html`. Any uncaught
   error paints a burgundy banner across the top with the message, file and
   line. It is always on, in production too.

2. **Debug panel.** Add **`?debug=1`** to the URL — e.g.
   `http://192.168.137.1:8000/index.html?debug=1` — then **triple-tap the DPT
   logo on screen 1** to toggle the panel. (Setting `DEBUG: true` in
   `js/config.js` does the same thing permanently.) It reports the user agent, `innerWidth`/`innerHeight`,
   device pixel ratio, and a PASS/FAIL row for `CSS.supports`, flexbox,
   `transform3d`, CSS custom properties, `requestAnimationFrame`, `classList`,
   `Promise` and touch events. This tells you in five seconds whether a blank
   screen is a syntax problem or a CSS problem.

3. **FPS meter.** Live in the debug panel, via a `requestAnimationFrame`
   counter.

4. **Asset load reporting.** Any image that fails to load is logged into the
   panel by filename.

With `DEBUG: false` none of the panel is built and nothing is measured.

### `test.html` — motion smoke test

Open `test.html` on the device. It exercises **every** animation, easing curve
and screen transition in isolation, each with its own avg/worst FPS readout, so
you can find which specific effect the A5 cannot hold without stepping through
the whole app flow. A row turns burgundy when its measured minimum drops below
its target (60 fps for selection and transitions, 30 fps for the attract loop).

**RUN ALL** walks every test in sequence.

If something can't hold frame rate, `REDUCED_MOTION: true` swaps the whole
motion system for flat 150 ms opacity fades.

---

## Safari 9 landmines

**Anything marked here is a deliberate workaround. Please don't "clean it up".**
Code comments flag these in place.

Not available on this device, and not used anywhere:

| Feature | Why not | Used instead |
|---|---|---|
| CSS Grid | Safari 10.1+ | `inline-block` and flexbox |
| flexbox `gap` | Safari 14.1+ | margins |
| `object-fit` | Safari 10+ | `background-image` + `background-size: contain` on a `<div>` |
| `position: sticky` | Safari 13+ | absolute positioning |
| `backdrop-filter` | tanks the frame rate | flat translucent backgrounds |
| CSS `filter` | present but catastrophically slow on an A5 | never animated |
| `will-change` | doesn't exist | `translateZ(0)`, added and removed by JS |
| CSS custom properties | unreliable on 9.3 | literal hex everywhere; palette is a comment block in `css/tokens.css` |
| ES6 (arrow fns, `class`, template literals, `let`/`const`, destructuring, `Promise`, `fetch`) | Safari 9 is ES5 | hand-written ES5 |

### Performance rules the code follows

1. **Only `transform` and `opacity` are animated.** Anything that looks like a
   colour, border or shadow fade is a duplicate element stacked on top whose
   *opacity* is animated — see `.card-wash`, `.card-ring`, `.btn-press`.
   The single exception is SVG `stroke-dashoffset` on the progress ring and the
   completion tick, which is cheap here and is the standard way to draw them.
2. `translate3d(x, y, 0)` rather than `translate`, to force GPU compositing.
3. **Promotion is temporary.** `translateZ(0)` is added via the `.is-animating`
   class only while a transform is running and removed when it ends
   (`Anim.promote` / `Anim.unpromoteAfter`). Eight permanently-promoted cards
   would thrash texture memory on 512 MB. This is why cards live inside a
   `.card-slot` wrapper — the slot takes the promotion so the card's own
   `transform` stays free for the scale.
4. Every transition and keyframe carries a `-webkit-` prefix alongside the
   standard property.
5. Only the current screen's assets plus the selected style's four angles are
   held warm. `Anim.Turntable.setStyle()` replaces its image array wholesale so
   the previous style's textures can be collected.

### Touch behaviour

- **300 ms tap delay is killed** by `js/fastclick.js`. That file is *not* the
  FastClick library — it is a smaller dependency-free equivalent that binds
  taps directly on `touchend`. FastClick's synthesise-and-swallow-the-ghost-click
  machinery only earns its keep on pages with native controls; this kiosk has
  none, and binding directly also gives the press/release hooks the card
  animation needs.
- Text selection, tap highlight, touch callout and rubber-band scrolling are all
  disabled. `Tap.lockScrolling()` `preventDefault`s `touchmove` at the document
  level, since no screen scrolls.
- Because of that, the layout-B chip row is dragged by JS translating its track
  rather than by native scrolling.
- Minimum touch target is 60 × 60; cards are 326 × 108.

---

## File map

```
index.html            markup + the global error overlay (first script on the page)
test.html             motion smoke test with per-effect FPS
css/
  reset.css           minimal reset, kiosk touch hygiene, border-box
  tokens.css          palette + easing set (as comments), screen container
  components.css      logo, stepper, headline, card, buttons, helper
  screens.css         per-screen layout + the vertical budgets
  animations.css      every transition and keyframe, incl. REDUCED_MOTION
js/
  config.js           every tunable
  assets.js           the only place a style+angle becomes a URL
  fastclick.js        tap shim (see above)
  debug.js            feature probe, FPS meter, asset-failure log
  anim.js             class helpers, layer promotion, entrance, screen push, turntable
  screens.js          screen builders (1A, 1B, 2, 3)
  app.js              state machine, idle/attract, simulated build, DPTKiosk
data/
  hair.js             THE manifest — the only file you edit to change styles
assets/
  hair/<id>/          photography (front, front45, side, back, thumb)
  placeholder/        flat colour swatches, one per style per angle
  logo/dpt-logo.png   312 × 88 transparent
_preview/             screenshots from the build — not used by the app, delete freely
```

---

## Layout budget

Screen 1, portrait, nothing scrolls:

```
top padding      28
logo             44
gap              24
stepper          56
gap              28
headline        140
gap              24
hair grid       480      4 rows x 108 + 3 x 16 gutter
spacer          >=16     flexes
button           76
gap              14
helper           20
bottom padding   28
                ----
                 978 fixed
```

Two notes on this, because it differs slightly from the original spec table:

- The spec's column totals **980** against a **1004** viewport, and it lists the
  grid as **482** where 4 × 108 + 3 × 16 = **480**. Every stated value is
  reproduced exactly; the leftover lives in `.s1-spacer`, a single flexible gap
  above CONTINUE.
- That spacer also absorbs the difference between **1004** (Home Screen,
  standalone) and **1024** (in-browser), so the layout is correct either way
  with no scrolling.

Cards are 326 × 108 — 768 − 48 px margins each side = 672, minus a 20 px column
gutter, split in two. Verified in-browser: `document.documentElement.scrollHeight`
is exactly 1004 on all three screens.

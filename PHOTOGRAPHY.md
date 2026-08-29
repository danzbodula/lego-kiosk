# Turntable Capture Protocol

How to shoot the eight hair pieces so four stills cross-fade into a convincing
rotation on the booth iPad.

**The one idea:** the four angles are colour separations. The turntable
cross-fades them *in place*, so anything that changes between frames other than
the piece's own rotation shows up as a flicker, a slide, or a pop. Registration
is the whole job.

---

## 1. Build a rig that cannot drift

Handheld is what broke the first set. Camera, lights and background must not
move once you start — not between angles, and not between styles.

- **Turntable.** A lazy susan or a paper plate on a pencil. Tape a printed
  protractor underneath and mark stops every 45°. Rotate the *plate*, never the
  camera.
- **Put the figure on the rotation axis.** Mark the centre with a dot. Off-axis,
  the figure *orbits* instead of spinning and the cross-fade reads as the head
  sliding sideways.
- **Background: white, matte, seamless.** Curve paper up behind so there is no
  horizon line. Matte, not gloss — a glossy surface throws a specular band whose
  brightness matched the black hair pieces exactly.
- **Light: two diffused sources**, ~45° either side, slightly above, equal
  power. Printer paper over a desk lamp is enough. One hard source blows
  speculars across glossy ABS and those are unmaskable.
- **Kill the room lights and block the window.** Daylight drifts over a session;
  if it is in the shot, white balance drifts between styles.
- **One head, eight hair pieces.** Use the same head and torso throughout and
  swap only the hair. The head lands identically in every frame of every style —
  free registration. It is also a cylinder, so its width is identical from every
  angle, which makes it your scale reference in post.

## 2. Lock the camera

| Setting | Value |
|---|---|
| Focus / exposure | locked (press-and-hold for AE/AF Lock) |
| White balance | locked |
| Live Photo, Portrait, HDR | off |
| Lens | 1× or 2× — never ultra-wide (barrel distortion) |
| Format | **JPEG, not HEIC** — Safari 9 cannot read HEIC at all |
| Subject fills | 60–70% of frame height (~2000 px on subject) |

Portrait mode's fake depth destroys exactly the fine edges you need to mask.

In the first set the figure was ~14% of frame width, leaving ~700 px of real
subject to fill a 563 px export. Fill the frame and the downsample becomes a
clean 3× reduction.

## 3. Shoot the rotation

Work one style at a time, all angles in a single unbroken take, then swap the
piece without touching anything else. No review-and-adjust between angles.

| Stop | File |
|---|---|
| 0° | `front.png` |
| 45° | `front45.png` |
| 90° | `side.png` |
| 180° | `back.png` |
| 135, 225, 270, 315° | spare — shoot anyway |

- **Camera level with the hair**, or very slightly above. Shooting up from desk
  height hides the head behind the torso — two back frames failed this way.
- A true **back** view shows the crown with the head still visible.
- The animation steps `front → front45 → side → back`, so 90°→180° is twice the
  size of the other steps and reads as a small pop. Shoot all eight stops and
  the animation can be widened to use them — a small code change, no re-shoot.

## 4. Cut out, then register

- Remove the background (Photoshop, Affinity, Photopea, remove.bg, or
  *Copy Subject* in Apple Photos). White matte makes this trivial.
- **Use ONE crop box per style**, anchored on the head, applied identically to
  all four frames. Never let a tool re-fit the crop per frame — that is what
  turns a rotation into a slide.
- Better still, one crop box across all eight styles, so the grid reads as a
  single set.

## 5. Export

| File | Size | Format |
|---|---|---|
| `front.png` `front45.png` `side.png` `back.png` | 640 × 640 | PNG + alpha |
| `thumb.png` | 176 × 176 | PNG + alpha (from front) |

- Subject fills ~88% of the frame. sRGB.
- **This is a 1× screen — 2× is the ceiling. Never ship 3×.**
- Target **≤ 250 KB per frame** (≤ 1.0 MB per style). Run through `pngquant` or
  TinyPNG; moulded plastic quantises well and typically drops 60–70%.
- File under `assets/hair/<id>/` using the ids in `data/hair.js`:
  `brown, blonde, auburn, ginger, long, black, curly, cap`.
- Set `ART_SOURCE: 'photo'` in `js/config.js`. That is the only code change.

## 6. Verify on the iPad

The kiosk is smooth today because it draws flat SVG rectangles. Real photographs
are four 640 px textures per style. Measure, don't assume.

- Open `test.html` on the device — watch the **Turntable cross-fade** row. It
  turns burgundy if worst-case FPS drops below 60.
- Set `DEBUG: true`, triple-tap the logo: live FPS meter, plus any failed asset
  logged by filename (how you catch one typo among 40 files).
- Tap through all eight styles. Each selection preloads four frames; a stall
  means the files are too heavy.

If it drops frames, in order: quantise harder → 512 × 512 → raise `SPIN_SPEED`
→ `REDUCED_MOTION: true` as a last resort.

---

## Known gaps in the current set

- **GINGER** and **CURLY** only ever yielded three usable angles, so `side`
  doubles as a second frame in each. Both need a complete set.
- Two back views (`IMG_2574`, `IMG_2581`) were shot from below and are
  unusable — the head sits behind the torso.
- The black pieces were shot on a dark glossy desk, the worst case for masking.

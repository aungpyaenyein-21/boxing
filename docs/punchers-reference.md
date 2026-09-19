# Punchers motion reference (video frame analysis)

> Source: `Screen Recording 0008-09-11 at 9.43.44.mov` (160s, 2880×1800, 60fps), Rounds 3–5, knockdown ×3, KO ×1.
> Method: ffmpeg → 30fps frame sheets, cropped to the ring. Frames counted at 30fps (1 frame = 33ms).

## 1. ထိုးချက် (punch)

| အဆင့် | ကြာချိန် (30fps frame) | မြင်ရတာ |
|---|---|---|
| Windup | 2–3 frame (~0.08s) | ပခုံး နောက်ဆုတ်၊ ခါး ပြောင်းပြန် လှည့်၊ guard လက် မျက်နှာနား ကျန် |
| Extension | 4–6 frame (0.13–0.20s) | လက်မောင်း ဆန့်ထွက်၊ **ကိုယ်တစ်ခုလုံး ရှေ့ယိမ်း**၊ ခေါင်းပါ ရှေ့ရောက်၊ နောက်ခြေ ဖနောင့် ကြွ |
| Hold at full reach | 2–4 frame (~0.1s) | Glove က target ရောက်ပြီး ခဏ ရပ် (overshoot နည်းနည်း ရှိ — physics ကြောင့်) |
| Retract | ~6 frame (0.2s) | လက် guard ဆီ ပြန်၊ ကိုယ် မတ်ပြန် |
| **စုစုပေါင်း** | **~15 frame ≈ 0.5s** | ငါတို့ table (jab 0.45 / hook 0.62) နဲ့ အကြမ်းဖျင်း ကိုက် |

အဓိက ကွာခြားချက် (ငါတို့ mocap နဲ့ ယှဉ်ရင်):
- **လက်မောင်းတစ်ခုတည်း မဟုတ်ဘူး** — ခါး၊ ပခုံး၊ ခေါင်း၊ ခြေထောက် အကုန် ထိုးချက်ထဲ ပါ (ကိုယ်ခန္ဓာ ရှေ့ 20–30cm ယိမ်း)
- Target ရောက်အောင် လက် ဆန့်တယ် — အကွာအဝေးအလိုက် ဆန့်တဲ့ အတိုင်းအတာ ပြောင်း (physics-driven, canned မဟုတ်)
- Punch မရောက်ရင် (whiff) ကိုယ်က ရှေ့ ပိုယိမ်းပြီး ပြန်ထူဖို့ ပိုကြာ

## 2. ခံရချက် (hit reaction)

| အဆင့် | ကြာချိန် | မြင်ရတာ |
|---|---|---|
| Head snap | 2–3 frame | ခေါင်းက punch ဦးတည်ရာ အတိုင်း ချက်ချင်း လန် (ခေါင်းသီးသန့်) |
| Torso follow | +3–5 frame | ကိုယ်က ခေါင်း နောက် **နောက်ကျပြီး** လိုက်ယိမ်း (spring/lag) |
| Recovery | ~10 frame (0.33s) | Guard ပုံစံ ပြန်ရောက်၊ ခေါင်း အရင်၊ ကိုယ် နောက် |
| ဆက်တိုက် ခံရရင် | — | ယိမ်းချက် **စုပေါင်း**၊ ဒူးကွေး၊ ကိုယ် ရှေ့ကုန်း → knockdown |

## 3. Knockdown / KO

- ဒူး အရင် ပျော့ → ကိုယ် ရှေ့ကို ခေါက်ကျ → လက်တွေ တွဲလောင်း (motor အားလုံး ပိတ်ထားတဲ့ ragdoll)
- လဲကျချိန် ~12 frame (0.4s) real-time၊ ဒါပေမယ့် **KO မှာ slow-mo** ဝင် (frame ဆက်တိုက် အတူတူ)
- Knockdown ဖြစ်တာနဲ့ stats overlay (TOTAL / LANDED / POWER / ACCURACY) ချက်ချင်း ပေါ်

## 4. Camera / ပတ်ဝန်းကျင်

- ဘေးတိုက် view၊ နည်းနည်း အပေါ်က၊ boxer က screen အမြင့်ရဲ့ ~60% — ငါတို့ထက် ပိုနီး
- Camera က အလယ်ကို လိုက်၊ zoom သိသိသာသာ မပြောင်း
- Glove ကြီး + headgear — silhouette ထင်ရှား

## 5. Design implication — ဒါ ragdoll physics ဖြစ်ကြောင်း သက်သေ

1. လက် ဆန့်တဲ့ အတိုင်းအတာက အကွာအဝေးအလိုက် ပြောင်းတယ် → animation clip မဟုတ်
2. ခံရချက်က ခေါင်း → ကိုယ် **lag** နဲ့ လိုက်တယ် → joint spring
3. Knockdown = motor ပိတ် → ပျော့ခွေ
4. ကိုယ်တစ်ခုလုံး ယိမ်း → ခါး/ပခုံး ကို force နဲ့ ဆွဲထားတာ

## 6. ငါတို့ ပြန်ဒီဇိုင်းအတွက် ပထမ ကိန်းများ (starting values)

- Punch total ≈ 0.5s (windup 0.08 / extend 0.17 / hold 0.1 / retract 0.2)
- Torso lean-in ≈ 20–30cm, head follows
- Hit: head impulse strong, torso spring stiffness လျော့ (lag 0.1–0.15s), damping ~0.3s ပြန်ထူ
- Camera distance: boxer ≈ 60% of frame height
- KO: slow-mo 0.3× (knockdown/KO ပဲ)

---

# Boxing technique notes (2026-09-11)

Sources: FightCamp "Six basic boxing punches", ExpertBoxing "How to throw a jab".

## Numbering (orthodox): odd = left, even = right
1 jab · 2 cross · 3 lead hook · 4 rear hook · 5 lead uppercut · 6 rear uppercut

## Jab (1)
- NO hip/body rotation, NO weight shift (rotating makes it a "left cross"). Speed over power; relaxed, snapping, not pushing.
- Front shoulder lifts (protects chin, adds reach); elbow goes straight forward (no chicken wing); fist turns over palm-down; tighten only at impact.
- Head stays BEHIND the shoulder (no reaching forward). Rear hand stays at the face.
- Power variants: step jab (front foot steps inches), slight upper-body lean, hip drop.
- Retract straight back.

## Cross (2): rear-foot pivot + hip/shoulder rotation toward the front; shoulder is the power source; return to stance.
## Lead hook (3): weight onto the lead leg, elbow 90°, pivot lead foot, elbow ends almost in front of the face.
## Rear hook (4): rear-foot pivot, hips rotate, elbow 90°.
## Uppercuts (5/6): knees bend (squat), drive up keeping the elbow bent; rear uppercut adds rear-foot pivot + hip rotation.

## Applied in ragdoll.js (M2)
- jab: hip yaw 0, lunge 7cm (step jab), lean ×0.4. cross / hooks: hip yaw ±25° procedural (clip yaw stripped — Mixamo clips are not co-oriented), lunge 15cm.
- Legs + hips follow the mocap target directly (pivots, knee bend visible); upper body is physics.
- Uppercuts: not yet (no clips downloaded).

---

# Punchers stance & idle movement (records/stand.mov, 2026-09-11)

17s of the training-mode boxer standing in front of the bag, no punches. 60fps, tracked the headgear (red) and waistband (cyan) per frame.

## Stance (single frame)
- Orthodox, bladed ~45° to the target; feet wide (≈1.2 shoulder widths), lead foot forward, **rear heel raised**, knees bent ~20–30°.
- Slight forward lean, chin tucked behind the lead shoulder.
- Both gloves at chin/cheek height, **elbows tucked in front of the torso**; lead glove a little forward, rear glove touching the chin.

## Idle movement (measured)
- Vertical bob: **period ≈ 0.44 s (≈2.3 Hz)**, waist ±5 cm, head ±6 cm (head bobs a bit more than the hips → knees + spine both flex).
- Lateral head sway ±5 cm (weight shifting foot to foot).
- Feet never still: small shuffles, lead foot lifts/replants, weight transfers; rear heel pumps.
- Occasional deeper crouch phase (waist −10 cm for ~1.5 s) then back up — the rhythm is not a clean sine, it drifts.
- Gloves stay at the chin throughout but drift a few cm with the bounce.

## Targets for ragdoll.js idle
- Bob period 0.44 s, amplitude ~±5 cm at the hips, ±6 cm at the head.
- Continuous foot shuffle (needs a bouncing fight-idle clip, not a static idle).
- Guard tighter: elbows in, gloves at the chin.

---

# Punchers right cross / jab on the bag (records/right cross jab.mov, 2026-09-11)

60s training mode, ~15 punches, 30fps frame sheets around 5 of them.

## Right cross
- Extension: **2–3 frames (≈0.08 s)** from guard to full lock-out — explosive, not a push.
- Held at full extension **5–7 frames (≈0.2 s)**, then retract ≈6 frames.
- Torso rotates ≈**50°** toward the target (chest ends up facing the bag), rear leg straightens, rear heel fully up, front knee bends; whole body travels **20–30 cm** forward.
- Head follows the shoulder forward (still behind it, chin down). **Lead glove stays glued to the chin** throughout.
- Elbow locks straight; fist palm-down.

## Jab (in Punchers)
- Same explosive snap; also a real forward step (bigger than a textbook "basic jab") — closer to a step jab.

## Applied to ragdoll.js (P)
- punchFmax 400→900 (K 1400, D 70): extension ≈0.08 s. hookMul 1.3, cross ×1.15, jab ×0.85.
- lunge 0.22 (jab 0.12), hipYaw 40°, through 0.2 (locks the elbow), armRelax 0.35.

---

# Punchers high guard (records/guard.mov, 2026-09-11)

29s, guard key held several times (~1–2s each), 20fps sheets at t≈3s and t≈9.5s.

- **Both gloves pressed together directly in front of the face**, covering it (nose height, ~6cm apart), ~15cm in front.
- Forearms vertical and parallel, **elbows tucked against the body**, shoulders raised, head tucked down behind the gloves.
- Slight extra crouch (knees), stance a touch more square; the bounce/weight shift continues while guarding.
- Transition relaxed → high guard ≈ 0.15 s; drops back just as fast on release.
- (Ropes/legs unchanged — this is purely upper body.)

## Applied to ragdoll.js
- Procedural: guard spring targets move to face-center (x +0.17, y +0.02, z ±0.06), blockK 700 / blockD 22, blockCrouch 3cm, neck stiffness ×2 while guarding. Center Block clip no longer used.
- Gloves physically in front of the face → incoming punches hit the gloves first (physics block) on top of the sim's ×0.18 damage rule.

---

# Punchers left jab (records/left cross jab.mov, 2026-09-11)

47s, ~10 jabs, 30fps sheets at t≈2.6 / 13.1 / 24.7. Boxer alone (no bag), "LEFT PUNCH POWER" HUD.

- Small coil first: lead shoulder rises, head dips behind it (~3 frames).
- **Extension 2 frames (≈0.07 s)** chin → full lock-out at shoulder height, fist palm down.
- Held **~4 frames (≈0.13 s)**, then **retract 2–3 frames (≈0.1 s)** — faster back than the cross.
- Body: slight forward lean / step (~10 cm), **no hip rotation**, legs mostly still (weight shifts to the front, rear heel up).
- Lead shoulder stays high covering the chin; **rear glove glued to the chin** the whole time.
- Total ≈ 0.4 s, then straight back into the bounce.

## Applied
- sim jab: live 0.14, recovery 0.14 (was 0.16/0.21).
- driveGuard now also runs during punch recovery for the punching hand with a strong spring (retractK 900 / D 30) so the glove snaps back to the chin.

---

# Punchers right hook (records/right hook.mov, 2026-09-11)

51s, ~20 hooks, 30fps sheets at t≈1.2 / 6.2 / 20.2 — all three consistent.

- **Windup ≈0.2 s**: right glove drops back and out wide, torso turns away (loads), stance opens; lead arm drifts forward as a counterbalance.
- **Swing ≈0.13 s (4 frames)**: wide horizontal arc at shoulder height, arm nearly straight (haymaker-ish), blurred glove.
- **Overshoot / follow-through ≈0.25 s**: the arm keeps going past the target — ends high across the body (glove above/left of the head), torso rotated ~90° from the loaded position, rear foot pivoted, weight on the front leg.
- Return to guard ≈0.25 s. **Total ≈0.8 s** — the slowest punch, big commitment.

## Applied
- sim hook: windup 0.20 / live 0.13 / recovery 0.45.
- drivePunch: windup pulls the glove back+out (hookWind 0.35), live arcs in (hookArc 0.45), first 40% of recovery drives the glove past the target to the other side and up (hookFollow 0.5), then the snap-back spring returns it. hookYaw 50°.

---

# Punchers left (lead) hook (records/left hook.mov, 2026-09-11)

33s, ~8 hooks, 30fps sheets at t≈5.2 / 6.7 / 19.7 — consistent. Distinctly different from the rear hook.

- Small load only (~3 frames): lead shoulder drops, body squares — **no big pull-back**.
- **Swing ≈3 frames (0.1 s)** horizontally at shoulder height, **elbow bent ~90°** (FightCamp), body pivots ~60° to the right, weight onto the front leg.
- Small overshoot: the glove ends just in front of the right shoulder, then **returns to guard in ≈0.15 s**.
- Rear glove stays glued to the chin throughout. Total ≈ **0.5 s** (rear hook ≈ 0.8 s).

## Applied
- New sim punch `leadhook` (#3): windup 0.12 / live 0.12 / recovery 0.28, dmg 11, stamina 12. Space+← = leadhook, Space+→ = hook (rear).
- drivePunch: lead hook uses 60% wind-back, 70% arc, half follow-through (25% of recovery), hip yaw 40°; still the mirrored Hook Punch clip as motor target.

## Hook shape fix (records/left hook bug.mov, 2026-09-11)
User's recording of our game: the lead hook looked like a straight punch — the glove force pulled the arm to full extension and the sideways arc is invisible from the side camera.
Fix: hooks now drive the glove along a **circle of radius 0.46 m around the real shoulder joint** (upper-arm body + joint anchor), sweeping −20° → 115° (side → past the front); the elbow motor keeps ≥0.8 stiffness during hooks so the arm stays bent (~90°). Measured shoulder→glove during a hook 0.32 m vs 0.60 straight.

---

# Uppercuts (#5 lead, #6 rear) — 2026-09-19

Source clips: `models/left uppercut.fbx` (f16–40) and `models/right uppercut.fbx` (f8–38). Both takes are **body** uppercuts: the fist dips to the waist (lead y≈0.87, rear y≈0.65) and drives forward at belly height, torso folding ~45°.

## Applied
- sim: `leadupper` 0.10/0.11/0.22 s, 12.5 head dmg, stamina 12 · `upper` 0.14/0.13/0.30 s, 15 head dmg, stamina 15. Keys: **Shift+←** / **Shift+→**. The CPU throws them too.
- The clip supplies the knee bend (hips follow the clip's dip, ≈10–14 cm), the hand drop and the bent arm. `drivePunch` then steers the fist: slide **under** the chin (`upperUnder` 0.28 m below, first `upperSplit` of the drive), then **straight up through it** (`upperThrough` 0.22 m above) and keep rising for the first 30 % of the recovery.
- Torso and hip tilt from the clip are slerped 80 % back to upright (`upperUpright`) — a chin uppercut drives up, it does not fold forward. Measured torso pitch 13° lead / 20° rear.
- Shoulder loosens once the fist starts up (`upperRelax` 0.3) so the force can lift it to the chin; the elbow motor stays stiff → elbow ≈ 65–90° at contact.
- Reach is a bent arm only (`upperReach` 0.38 m ahead of the shoulder) + hip turn (`upperYaw` 45° rear, 27° lead). The **feet** close the distance: the step-in is `gap − upperRange` (0.32), clamped to 0.10–0.40 m and latched when the punch starts; it is finished by 60 % of windup+live (`upperStepT`) and stays planted until the recovery — step, plant, drive up. In a duel (gap 0.6) the step is ≈0.20 m; at the solo ball's 0.80 m it is the full 0.40 m.
- The rise is keyed to the fist being **under** the target (`upperNear` 0.22 m horizontally, latched) rather than to a timer — on a timer the rear fist was already above chin height when it arrived and hit the ball downward from the front. The follow-through is damped so the arm doesn't shoot out straight overhead.
- Result: both uppercuts land from 0.55 to 0.85 m at full and low stamina and send the ball upward (≈3–5 m/s). Duel, passive opponent: 12.1 / 14.4 to the head, 3 of 3 each.
- Harnesses: `dev/trace_upper.js` (path/shape), `dev/sweep_upper.js` (hit/miss across distances and stamina).

---

# Impact pack (fx.js) — 2026-09-19

What makes a landed punch feel like one; nothing here touches the physics. Power = sim damage (≈4 jab … 16 rear hook), blocked hits count half.
- **Hit-stop**: the whole frame loop (sim + physics) holds for `0.02 + 0.085·k` s — ≈35 ms for a jab, ≈105 ms for a rear hook. Input stays queued through the freeze.
- **Camera shake**: decaying jolt (τ 70 ms, up to 7 cm), added right before the render and removed right after, so OrbitControls and the follow-cam never see it.
- **No visual flash.** A burst sprite at the glove and an emissive blink on the victim were both tried; the user wanted neither.
- **Sound**: synthesized with WebAudio, no assets — noise crack through a lowpass + a sine thud dropping to 42 Hz on a hit (duller when blocked), a quiet band-passed whoosh when a punch is thrown. The AudioContext is created on the first key press (browser gesture rule).
- Knobs (URL-tunable, 0 = off): `fxStop`, `fxShake`, `fxVol`. Solo ball hits use 0.8 × the punch's table damage.

---

# Knockdown (R4) — 2026-09-19

Sim (unchanged logic): hp ≤ 0 → `down`; first knockdown rises after `COUNT_SECONDS` (now 6 s) with 38 hp / 60 stamina; the second is a KO.
- **Fall is procedural**, not mocap: Mixamo's *Knocked Out* stumbles forward into the opponent and spins, so the kinematic hips instead slide 0.55 m straight back (decelerating), drop ≈0.77 m (accelerating) and tip over onto the clip's lying pose, re-oriented so the head always points away from the opponent — 1.1 s (`koFallT`, `koBack`). Only the legs come from the clip (scrubbed so they are lying when the hips arrive).
- **Upper body is a limp ragdoll** thrown by the knockout punch: arm motors at `koRelax` 0.05; spine + neck start limp (head snaps back) and firm up to `koSpine` 0.35 as he lands so he lies straight. While down the spine target is taken relative to the CLIP's own hips (ours are re-oriented — using them twisted the torso 80° sideways). A real floor collider catches the body.
- **Get-up**: *Getting Up* f72–190 played over `koGetupT` 2.8 s, ending exactly when the sim flips to idle. Its hips track is read straight from the clip (not the mixer), turned to lie the way he fell, and cross-blended with the lying pose over 0.4 s; the 8° of leftover yaw, the sideways drift and 3 cm of height error are blended out while he rises. Motors ramp back to full with the rise. He ends ≈0.1 m from where he was hit; `sim.x` is moved there.
- **Slow-motion only on a knockdown**: ×0.25 for 0.9 real seconds, eased back over 0.4 s; the knockout punch gets a 180 ms hit-stop, a bigger jolt and a deeper sound; the body landing gets a floor thud.
- Count overlay in sim time (up at 8, out at 10 → "K.O."), **R** = rematch. The CPU backs off to a neutral corner while the player is down; nobody can hit or be hit while down; punches at a downed opponent aim where his head would be if he stood.
- Harness: `dev/knockdown.js` (`run('A'|'B', { stopAt, final })`).

---

# R5 — match, HUD, opponent AI, gloves (2026-09-19)

- **Match** lives in the sim (`makeMatch` / `stepMatch`): 3 × 90 s rounds, 3 s rest (+24 hp, full stamina, back to the corners), decision on damage dealt, three-knockdown rule. The ragdoll layer calls `stepMatch(…, hitTest = null)` — hits still come from physics contacts — and teleports the whole ragdoll on a corner reset. After the final bell the sim keeps time passing so the fall and the count can finish.
- **Damage balance**: `DAMAGE_SCALE` 0.5 (hp lost = table damage × 0.5). At 1.0 a fight was over in ≈11 clean hits / 20 s; now a bot-vs-AI match runs the full three rounds. `hitImpulse` and the fx power are divided by the scale, so the physical reaction is unchanged.
- **AI** (`sim/ai.js`, pure, rng injected): reads each punch once → guards after a reaction delay (shorter for the follow-ups of a real combination, < 0.75 s apart), counters into the recovery (×1.5), throws combinations from a table (uppercut combos only when close), steps in to 0.82 m and out again, backs off to breathe below 28 stamina, goes to a neutral corner on a knockdown. Levels `?ai=1|2|3` (react 0.34 / 0.24 / 0.16 s, block 30 / 55 / 78 %). Test: L3 beats L1 30–0 over 30 seeded matches; L2 throws all six punches. A spamming bot gets shut down (its tired punches are slow enough to block) — stamina management is the way in.
- **HUD**: plain HTML bars — hp, stamina, knockdown dots, round and clock; what is left of a bar hugs the clock. Debug text only with `?debug` (or in solo).
- **Gloves**: a lathed mitten on each hand bone (narrow wrist → widest over the knuckles → rounded front, flattened front-to-back), thumb = a capsule lying along the side (−x left hand / +x right), long cuff in a darker shade with a thin white trim; red corner / blue corner. Finger bones are scaled to nothing so the open mocap hand disappears inside — no fist pose to get wrong. (First try — a sphere with a bump and a white cylinder — read as a balloon on a stick, thumb on the wrong side.)
- **Character**: `?char=<file in models/>` (e.g. `Ch45_nonPBR`). Works mechanically — same hit timing — but Ch45 is a dark-clothed character and reads as a silhouette under the current lights; Y Bot stays the default. Textured characters are not tinted.
- Harness: `dev/bot_match.js` (scripted player vs the AI through a whole match, fast-forward).

---

# Physical guard — 2026-09-19

User: "holding the guard means you can never be hit — but when the guarding hands have been moved, the punch should land, like real boxing."
- **What the glove meets decides** (`resolveHit(att, def, target, block)`): it dies on the opponent's glove / forearm → `full` block (×0.18 chip, defender pays 7 stamina); it touched the guard and still reached the head / body within `guardWindow` 0.1 s → `partial` (×0.5, half the stamina cost, still staggers); it reached the head untouched → a clean hit **even with the guard up**. Headless default (no physics): straights `full`, hooks / uppercuts `partial`.
- **A firm guard soaks the punch up**: on guard contact the punching forearm loses `guardBrake × strength` of its velocity, the glove drive drops to `1 − guardStop × strength`, and the punching arm's motors go slack by the same factor (clip-led punches push with their motors).
- **The guard can be shaken open**: every punch it takes adds `guardShockGain × power/16` of shock (decays over `guardShockT` 0.35 s, costs up to `guardShockMax` 80 % of the hold); tired arms hold less (`guardTired` 45 % at 0 stamina). `strength` scales both the guard springs and the braking.
- **Guard pose**: gloves side by side at cheek / chin level, 13 cm in front of the face, nearly touching (`guardFwd / guardY / guardWide`) — that is where punches arrive; arm motors relaxed to 0.3 while guarding so the springs place the gloves and the elbows hang in. (The old eye-level pose let straights in underneath; Mixamo's *Center Block* pose left the chin open — cross blocked 0 %.)
- Measured on a fresh guard (n = 16): jab blocked 81 %, cross 100 %, rear uppercut 88 %, lead hook 0 % blocked / 63 % halved, rear hook 75 % clean. cross-cross-cross: 1st blocked 6/6, 2nd and 3rd get through 6/6 and 5/6. Guard at 15 stamina: nothing fully blocked. A punch that gets through staggers the defender, so the follow-ups land clean.
- AI: finishes with a hook / uppercut when the opponent's guard is up. Harness: `dev/guard_test.js` (`singles()`, `combo([...])`), `R.hitLog`.

# Gloves v3 — after the user's reference picture
Fat padded pillow (lathe: near-straight sides, broad domed top), flattened front-to-back; a big thumb lobe (scaled sphere) bulging from the side, leaning in at its tip; wide wrist strap in the same red a shade darker with a darker band; no white trim.

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

# Boxing

A browser boxing game built on an **active ragdoll**: every punch is a physical arm driven by joint motors,
so where the glove actually lands decides what happens. No build step, no install — open it and fight.

**▶ Play:** https://aungpyaenyein-21.github.io/boxing/

## Controls

| Key | Action |
|---|---|
| `A` / `D` | step back / forward |
| `S` | guard (hold) |
| `←` | jab |
| `→` | cross |
| `Space` + `←` / `→` | lead hook / rear hook |
| `Shift` + `←` / `→` | lead uppercut / rear uppercut |
| `C` | camera: cinematic → side → over-the-shoulder |
| `R` | rematch |

Three rounds of 90 seconds, decision on damage, three knockdowns is a KO.

## What makes it play differently

- **The guard is physical.** A punch is blocked only if it actually dies on the gloves or forearms. A punch that
  reaches the head is a hit — guard up or not. Every blocked punch shakes the guard loose for a moment, and tired
  arms hold less, so combinations open it up. Straights are easy to block; hooks come round it, uppercuts under it.
- **Stamina is the fight.** Punches cost stamina, tired punches are slower, and a tired guard leaks.
- **The opponent boxes.** It reads your punches and blocks what it can react to, counters while your arm is still
  out (×1.5 damage), throws combinations, presses you instead of running, and steps off to breathe when it is empty.
- **Knockdowns are real ragdolls** — the only moment the game goes to slow motion — followed by a count and,
  if you're lucky, a get-up.

## Options

Add these to the URL:

| | |
|---|---|
| `?ai=1` … `?ai=3` | opponent level (default 2) |
| `?cam=side` / `?cam=follow` | start with another camera |
| `?solo` | no opponent — a target ball to practise on (`↑`/`↓` height, `[` `]` distance) |
| `?fxVol=0` | mute |
| `?debug` | live state readout |

## Run it locally

Any static file server works. The bundled one turns caching off, which helps while editing:

```bash
python3 server.py        # → http://localhost:8788
```

Sim tests (pure combat logic, no browser):

```bash
node sim/test.js
```

## How it's put together

| | |
|---|---|
| `index.html`, `ragdoll.js` | the game: rendering, the ragdoll, motors, punches, guard, knockdowns, camera |
| `sim/` | pure combat rules — punch table, stamina, damage, rounds, and the opponent AI. No three.js, fully testable |
| `fx.js` | hit-stop, camera shake, synthesized sound (no audio files) |
| `ring.js` | the ring, built from primitives |
| `dev/` | headless measurement harnesses used while tuning (punch contact, guard, footwork, AI pressure) |
| `docs/punchers-reference.md` | design notes and every measurement behind the tuning |

Each boxer is a kinematic pelvis with six dynamic bodies (torso, head, arms). Hand-rolled PD motors make them
chase a hidden Mixamo-animated skeleton, so the animation sets the *shape* of a movement and physics decides
what *happens*. Legs follow the animation directly.

Built with [three.js](https://threejs.org) and [Rapier](https://rapier.rs), loaded from a CDN.

## Credits

- Character and animations: [Mixamo](https://www.mixamo.com) (Adobe). These are covered by Adobe's Mixamo terms,
  not by this repository's license.
- [three.js](https://github.com/mrdoob/three.js) — MIT · [Rapier](https://github.com/dimforge/rapier) — Apache-2.0

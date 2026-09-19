// Opponent brain — pure, like the rest of sim/: it only reads the two sim boxers and returns the same input object a
// keyboard would. No three.js, no physics; the rng is injected so matches can be replayed in tests.
//
// What makes it harder than Punchers' bag-with-arms: it reads your punches and blocks the slow ones, punishes your
// recovery (the sim pays ×1.5 for that), throws combinations instead of single shots, steps in and out of range,
// and backs off to breathe instead of punching itself empty. Giving ground is a CHOICE, not a reflex: it never
// walks backwards from someone already in range and coming forward, and never with the ropes behind it.

import { PUNCH, C } from './constants.js?v=2'
import { punchPhase } from './combat.js?v=2'

export const AI_LEVELS = {
  1: { react: 0.34, block: 0.30, counter: 0.25, combo: 0.30, aggression: 0.40, inOut: 0.2, press: 0.35 },
  2: { react: 0.24, block: 0.55, counter: 0.50, combo: 0.60, aggression: 0.62, inOut: 0.5, press: 0.75 },
  3: { react: 0.16, block: 0.78, counter: 0.80, combo: 0.85, aggression: 0.80, inOut: 0.7, press: 0.95 },
}
const HAND = { jab: 'L', leadhook: 'L', leadupper: 'L', cross: 'R', hook: 'R', upper: 'R' }
// openers first; [punches, needs the opponent this close]
const COMBOS = [
  [['jab'], 9], [['jab', 'cross'], 9], [['jab', 'jab', 'cross'], 9], [['jab', 'cross', 'leadhook'], 9], [['cross', 'leadhook'], 9],
  [['jab', 'hook'], 9], [['leadhook', 'cross'], 9], [['leadupper', 'cross'], 0.72], [['jab', 'upper'], 0.72], [['leadupper', 'upper', 'leadhook'], 0.72],
]
const ROUND = { leadhook: true, hook: true, leadupper: true, upper: true }
const IDLE = { move: 0, guard: false, lean: false, punch: null, hand: 'L' }
const REST_IN = 18, REST_OUT = 55   // gas out this low before stepping off; back to work this high

export function makeAI(level = 2, rng = Math.random, range = 0.82) {
  return { ...AI_LEVELS[level] ?? AI_LEVELS[2], level, rng, range, t: 0, plan: [], cool: 0.6, gap: 0, guardFrom: 9e9, guardTo: 0, seen: -1, recent: [], resting: false, backOff: 0, counterAt: 9e9, counterUntil: 0 }
}

export function stepAI(ai, me, opp, dt) {
  ai.t += dt; ai.cool -= dt; ai.backOff -= dt
  const toward = Math.sign(opp.x - me.x) || 1, gap = Math.abs(opp.x - me.x), inp = { ...IDLE }
  if (opp.state === 'down') { ai.plan.length = 0; inp.move = gap < 1.7 ? -toward : 0; return inp }   // neutral corner
  if (me.state !== 'idle') return inp

  // --- reading the opponent: one decision per punch he throws ---
  if (opp.stats.thrown !== ai.seen) {
    ai.seen = opp.stats.thrown
    if (opp.state === 'punch') {
      ai.recent = ai.recent.filter(t => ai.t - t < 0.75); ai.recent.push(ai.t)   // only a real combination (next punch within 0.75 s) is 'expected'
      const p = PUNCH[opp.punch], f = opp.punchT || 1, total = (p.windup + p.live + p.recovery) * f
      // a second / third punch of a combination is expected, so the guard is already coming up for it
      const anticipate = ai.recent.length >= 2 ? ai.react * 0.55 : ai.react
      if (gap < ai.range + 0.35 && ai.rng() < ai.block) { ai.guardFrom = ai.t + anticipate; ai.guardTo = ai.t + (p.windup + p.live) * f + 0.12; ai.plan.length = 0 }
      if (ai.rng() < ai.counter) ai.counterAt = ai.t + (p.windup + p.live) * f + 0.03; else ai.counterAt = 9e9   // his arm is still out: ×1.5
      ai.counterUntil = ai.t + total
    }
  }
  if (ai.t >= ai.guardFrom && ai.t < ai.guardTo) { inp.guard = true; return inp }
  if (ai.t >= ai.counterAt && ai.t < ai.counterUntil && gap < ai.range + 0.1 && me.stamina > 25) {
    ai.counterAt = 9e9; ai.plan = [ai.rng() < 0.5 ? 'cross' : 'leadhook']; ai.cool = 0
  }

  // --- is he walking me down, and have I anywhere to go? ---
  const pressing = opp.vx !== 0 && Math.sign(opp.vx) === -toward
  const cornered = Math.abs(me.x) > C.RING_HALF - 0.55
  // a pressure fighter refuses to walk backwards from someone in range; a cautious one still gives ground.
  // The ropes stop everyone.
  const canGiveGround = !cornered && !(pressing && gap < ai.range + 0.15 && ai.press > 0.5)
  if (pressing && gap < ai.range + 0.1 && ai.cool > 0 && ai.rng() < ai.press * dt * 6) ai.cool = 0   // he is coming in: meet him, don't wait

  // --- stamina: step off and breathe rather than punch on empty ---
  if (me.stamina < REST_IN) ai.resting = true
  if (me.stamina > REST_OUT) ai.resting = false
  if (ai.resting && !ai.plan.length) {
    if (canGiveGround) { inp.move = gap < 1.35 ? -toward : 0; inp.guard = gap < 1.0 && opp.state === 'punch'; return inp }
    if (ai.rng() > ai.press * dt * 2.2) { inp.guard = true; return inp }   // pinned and tired: cover up…
    ai.plan = [ai.rng() < 0.5 ? 'jab' : 'leadhook']                        // …but fire back now and then to make room
  }

  // --- a combination in progress: next punch as soon as the arm is back ---
  if (ai.plan.length) {
    if (gap > ai.range + 0.08) { inp.move = toward; return inp }            // close the distance first
    const punch = ai.plan[0]
    if (me.stamina < PUNCH[punch].stamina + 4) { ai.plan.length = 0; return inp }
    ai.plan.shift(); inp.punch = punch; inp.hand = HAND[punch]
    if (!ai.plan.length) {
      // tired hands come back slower — otherwise it throws through the whole round on an empty tank and its own
      // guard never firms up (guard strength follows stamina)
      ai.cool = (1.2 - 1.0 * ai.aggression) * (0.7 + 0.6 * ai.rng()) * (1 - 0.55 * ai.press) * (1 + 1.6 * (1 - me.stamina / 100))
      if (canGiveGround && ai.rng() < ai.inOut * (1 - ai.press)) ai.backOff = 0.25 + 0.3 * ai.rng()
    }
    return inp
  }

  // --- footwork: in to punching range, out after a combination (only when giving ground is a choice) ---
  if (ai.backOff > 0 && canGiveGround) { inp.move = gap < ai.range + 0.45 ? -toward : 0; return inp }
  ai.backOff = 0
  if (ai.cool > 0) { inp.move = gap > ai.range + 0.3 ? toward : gap < ai.range - 0.12 && canGiveGround ? -toward : 0; return inp }

  // --- start something ---
  // a raised guard stops straights but not what comes round or under it: finish with a hook / uppercut then
  const opens = c => ROUND[c[c.length - 1]]
  // a pressure fighter who keeps swinging for the fences runs on empty (measured: stamina stuck at 5-16, so its own
  // guard never firmed up either). Tired, it works behind cheap punches instead of stepping off.
  const budget = me.stamina < 35 ? 8 : me.stamina < 60 ? 13 : 99
  const pool = COMBOS.filter(([c, need]) => gap <= Math.max(need, ai.range + 0.1) && c.every(p => PUNCH[p].stamina <= budget) &&
    (c.length === 1 || ai.rng() < ai.combo) && (!opp.guard || opens(c) || ai.rng() > ai.combo))
  const pick = pool.length ? pool[Math.floor(ai.rng() * pool.length)][0] : ['jab']
  ai.plan = pick.slice()
  return inp
}

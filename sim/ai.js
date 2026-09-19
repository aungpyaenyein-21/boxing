// Opponent brain — pure, like the rest of sim/: it only reads the two sim boxers and returns the same input object a
// keyboard would. No three.js, no physics; the rng is injected so matches can be replayed in tests.
//
// What makes it harder than Punchers' bag-with-arms: it reads your punches and blocks the slow ones, punishes your
// recovery (the sim pays ×1.5 for that), throws combinations instead of single shots, steps in and out of range,
// and backs off to breathe instead of punching itself empty.

import { PUNCH } from './constants.js?v=2'
import { punchPhase } from './combat.js?v=2'

export const AI_LEVELS = {
  1: { react: 0.34, block: 0.30, counter: 0.25, combo: 0.30, aggression: 0.40, inOut: 0.2 },
  2: { react: 0.24, block: 0.55, counter: 0.50, combo: 0.60, aggression: 0.62, inOut: 0.5 },
  3: { react: 0.16, block: 0.78, counter: 0.80, combo: 0.85, aggression: 0.80, inOut: 0.7 },
}
const HAND = { jab: 'L', leadhook: 'L', leadupper: 'L', cross: 'R', hook: 'R', upper: 'R' }
// openers first; [punches, needs the opponent this close]
const COMBOS = [
  [['jab'], 9], [['jab', 'cross'], 9], [['jab', 'jab', 'cross'], 9], [['jab', 'cross', 'leadhook'], 9], [['cross', 'leadhook'], 9],
  [['jab', 'hook'], 9], [['leadhook', 'cross'], 9], [['leadupper', 'cross'], 0.72], [['jab', 'upper'], 0.72], [['leadupper', 'upper', 'leadhook'], 0.72],
]
const IDLE = { move: 0, guard: false, lean: false, punch: null, hand: 'L' }

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

  // --- stamina: step out and breathe rather than punch on empty ---
  if (me.stamina < 28) ai.resting = true
  if (me.stamina > 62) ai.resting = false
  if (ai.resting && !ai.plan.length) { inp.move = gap < 1.35 ? -toward : 0; inp.guard = gap < 1.0 && opp.state === 'punch'; return inp }

  // --- a combination in progress: next punch as soon as the arm is back ---
  if (ai.plan.length) {
    if (gap > ai.range + 0.08) { inp.move = toward; return inp }            // close the distance first
    const punch = ai.plan[0]
    if (me.stamina < PUNCH[punch].stamina + 4) { ai.plan.length = 0; return inp }
    ai.plan.shift(); inp.punch = punch; inp.hand = HAND[punch]
    if (!ai.plan.length) { ai.cool = (1.2 - 1.0 * ai.aggression) * (0.7 + 0.6 * ai.rng()); if (ai.rng() < ai.inOut) ai.backOff = 0.25 + 0.3 * ai.rng() }
    return inp
  }

  // --- footwork: in to punching range, out after a combination ---
  if (ai.backOff > 0) { inp.move = gap < ai.range + 0.45 ? -toward : 0; return inp }
  if (ai.cool > 0) { inp.move = gap > ai.range + 0.3 ? toward : gap < ai.range - 0.12 ? -toward : 0; return inp }

  // --- start something ---
  const pool = COMBOS.filter(([c, need]) => gap <= Math.max(need, ai.range + 0.1) && (c.length === 1 || ai.rng() < ai.combo))
  const pick = pool.length ? pool[Math.floor(ai.rng() * pool.length)][0] : ['jab']
  ai.plan = pick.slice()
  return inp
}

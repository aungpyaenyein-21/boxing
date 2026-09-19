// headless: a player who walks forward and throws now and then — how much ground does the AI give up?
//   node dev/ai_pressure.mjs
import { C } from '../sim/constants.js'
import { makeBoxer, stepBoxer, punchPhase, resolveHit } from '../sim/combat.js'
import { makeAI, stepAI } from '../sim/ai.js'

const dt = 1 / 60
const lcg = s => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296

export function run(level = 2, seed = 7, seconds = 60, style = 'walk-in') {
  const a = makeBoxer(-1, 1), b = makeBoxer(1, -1)          // a = player, b = AI
  const ai = makeAI(level, lcg(seed)), rnd = lcg(seed + 99)
  let next = 0.6, retreatFrames = 0, closeFrames = 0, frames = 0, gapSum = 0, maxGap = 0, bWall = 0
  for (let t = 0; t < seconds; t += dt) {
    const gap = b.x - a.x
    const inA = { move: 0, guard: false, lean: false, punch: null, hand: 'L' }
    if (a.state === 'idle') {
      if (gap > 0.8) inA.move = 1                            // always walking him down
      else if (t > next) { next = t + 0.5 + rnd() * 0.7; const p = ['jab', 'cross', 'leadhook', 'hook'][Math.floor(rnd() * 4)]; inA.punch = p; inA.hand = p === 'cross' || p === 'hook' ? 'R' : 'L' }
    }
    const inB = stepAI(ai, b, a, dt)
    stepBoxer(a, inA, dt); stepBoxer(b, inB, dt)
    if (b.x - a.x < C.MIN_GAP) { const c = (a.x + b.x) / 2; a.x = c - C.MIN_GAP / 2; b.x = c + C.MIN_GAP / 2 }
    for (const [att, def] of [[a, b], [b, a]])
      if (att.state === 'punch' && !att.hitApplied && punchPhase(att) !== 'windup' && def.state !== 'down' && Math.abs(att.x - def.x) <= 0.9) resolveHit(att, def, 'head')
    frames++; gapSum += gap; maxGap = Math.max(maxGap, gap)
    if (inB.move === 1) retreatFrames++                      // b's retreat is +x (away from a on his left)
    if (gap < 0.95) closeFrames++
    if (b.x > C.RING_HALF - 0.25) bWall++
    if (a.hp <= 0 || b.hp <= 0) break
  }
  return {
    level, retreatPct: Math.round(100 * retreatFrames / frames), inRangePct: Math.round(100 * closeFrames / frames),
    avgGap: +(gapSum / frames).toFixed(2), maxGap: +maxGap.toFixed(2), atRingEdgePct: Math.round(100 * bWall / frames),
    thrownA: a.stats.thrown, landedA: a.stats.landed, thrownB: b.stats.thrown, landedB: b.stats.landed,
    hpA: Math.round(a.hp), hpB: Math.round(b.hp),
  }
}
if (import.meta.url === `file://${process.argv[1]}`)
  for (const lv of [1, 2, 3]) console.log(run(lv))

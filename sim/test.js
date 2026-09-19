// Run: node sim/test.js — fails loudly if the combat math breaks.
import assert from 'node:assert'
import { PUNCH, C } from './constants.js'
import { makeBoxer, makeMatch, stepMatch, stepBoxer, tryPunch, punchPhase, resolveHit } from './combat.js'
import { makeAI, stepAI } from './ai.js'

const dt = 1 / 60
const idle = { move: 0, guard: false, lean: false, punch: null }

// --- punch phases & stamina cost
{
  const b = makeBoxer(0)
  assert(tryPunch(b, 'jab'))
  assert.equal(b.stamina, 94)
  assert.equal(b.stats.thrown, 1)
  b.stateTime = 0.03; assert.equal(punchPhase(b), 'windup')
  b.stateTime = 0.10; assert.equal(punchPhase(b), 'live')
  b.stateTime = 0.30; assert.equal(punchPhase(b), 'recovery')
  assert(!tryPunch(b, 'hook'), 'cannot punch mid-punch')
}

// --- no stamina, no punch
{
  const b = makeBoxer(0)
  b.stamina = 5
  assert(!tryPunch(b, 'jab'))
}

// --- fatigue stretches punch timing
{
  const fresh = makeBoxer(0), tired = makeBoxer(0)
  tired.stamina = 40
  tryPunch(fresh, 'jab'); tryPunch(tired, 'jab')
  assert.equal(fresh.punchT, 1)
  assert(Math.abs(tired.punchT - 1.6) < 1e-9)
  fresh.stateTime = tired.stateTime = PUNCH.jab.windup * 1.2   // past the fresh windup, inside the tired one
  assert.equal(punchPhase(fresh), 'live')
  assert.equal(punchPhase(tired), 'windup')   // same moment, tired arm still winding up
}

// --- clean head hit: damage scales with attacker stamina
{
  const att = makeBoxer(0), def = makeBoxer(1)
  tryPunch(att, 'jab'); att.stateTime = 0.08
  const r = resolveHit(att, def)
  const expected = C.DAMAGE_SCALE * PUNCH.jab.dmgHead * (0.75 + 94 / 400)
  assert(Math.abs(r.dmg - expected) < 1e-9, `dmg ${r.dmg} != ${expected}`)
  assert.equal(def.state, 'hit')
  assert.equal(att.stats.landed, 1)
  assert.equal(att.stats.hardest, r.dmg)
  assert(att.hitApplied)
}

// --- guard blocks: x0.18, defender pays 7 stamina, no stagger
{
  const att = makeBoxer(0), def = makeBoxer(1)
  def.guard = true
  tryPunch(att, 'jab'); att.stateTime = 0.08
  const r = resolveHit(att, def)
  assert(r.blocked)
  assert.equal(def.state, 'idle')
  assert.equal(def.stamina, 93)
  assert.equal(def.stats.blocked, 1)
  assert.equal(att.stats.landed, 0)
  assert(r.dmg < C.DAMAGE_SCALE * PUNCH.jab.dmgHead * 0.18 * 1.01)
}

// --- lean dodges head punches entirely
{
  const att = makeBoxer(0), def = makeBoxer(1)
  def.lean = 1
  tryPunch(att, 'jab'); att.stateTime = 0.08
  const r = resolveHit(att, def)
  assert(r.missed)
  assert.equal(def.hp, 100)
  assert(att.hitApplied, 'a dodged punch is still spent')
}

// --- counter: defender in recovery takes x1.5
{
  const att = makeBoxer(0), def = makeBoxer(1)
  tryPunch(def, 'hook'); def.stateTime = PUNCH.hook.windup + PUNCH.hook.live + 0.01
  tryPunch(att, 'jab'); att.stateTime = 0.08
  const r = resolveHit(att, def)
  assert(r.counter)
  assert(Math.abs(r.dmg - C.DAMAGE_SCALE * PUNCH.jab.dmgHead * (0.75 + 94 / 400) * 1.5) < 1e-9)
}

// --- momentum: stepping forward adds damage
{
  const att = makeBoxer(0), def = makeBoxer(1)
  att.vx = C.MOVE_SPEED
  tryPunch(att, 'jab'); att.stateTime = 0.08
  const r = resolveHit(att, def)
  assert(Math.abs(r.dmg - C.DAMAGE_SCALE * PUNCH.jab.dmgHead * (0.75 + 94 / 400) * (1 + C.MOVE_SPEED * C.MOMENTUM_K)) < 1e-9)
}

// --- body hits use body damage even through lean
{
  const att = makeBoxer(0), def = makeBoxer(1)
  def.lean = 1
  tryPunch(att, 'hook'); att.stateTime = 0.20
  const r = resolveHit(att, def, 'body')
  assert(!r.missed)
  assert(Math.abs(r.dmg - C.DAMAGE_SCALE * PUNCH.hook.dmgBody * (0.75 + 85 / 400)) < 1e-9)
}

// --- uppercuts are ordinary table punches: thrown with either hand, land for their table damage
{
  for (const [type, hand] of [['leadupper', 'L'], ['upper', 'R']]) {
    const att = makeBoxer(0), def = makeBoxer(0.6)
    stepBoxer(att, { ...idle, punch: type, hand }, dt)
    assert.equal(att.punch, type); assert.equal(att.punchHand, hand)
    att.stateTime = PUNCH[type].windup + 0.01
    const r = resolveHit(att, def, 'head')
    assert(!r.missed && Math.abs(r.dmg - C.DAMAGE_SCALE * PUNCH[type].dmgHead * (0.75 + att.stamina / 400)) < 1e-9, `${type} dmg ${r.dmg}`)
  }
}

// --- knockdown, count, rise with 38hp
{
  const att = makeBoxer(0), def = makeBoxer(1)
  def.hp = 1
  tryPunch(att, 'jab'); att.stateTime = 0.08
  resolveHit(att, def)
  assert.equal(def.state, 'down')
  assert.equal(def.knockdowns, 1)
  for (let t = 0; t < C.COUNT_SECONDS + 0.1; t += dt) stepBoxer(def, idle, dt)
  assert.equal(def.state, 'idle')
  assert.equal(def.hp, C.RISE_HP)
  assert(Math.abs(def.stamina - C.RISE_STAMINA) < 1)  // idle regen ticks a little after rising
}

// --- second knockdown = KO, match over
{
  const m = makeMatch()
  const [a, b] = m.boxers
  b.knockdowns = C.MAX_KNOCKDOWNS - 1
  b.hp = 1
  const spam = { ...idle, move: 1, punch: 'jab' }
  let guard = 0
  while (m.phase !== 'over' && guard++ < 10000) stepMatch(m, spam, idle, dt)
  assert.equal(m.phase, 'over')
  assert(m.byKO)
  assert.equal(m.winner, 0)
}

// --- full match: two jab spammers, must end with a result and sane numbers
{
  const m = makeMatch()
  const inA = { move: 1, guard: false, lean: false, punch: 'jab' }
  const inB = { move: -1, guard: false, lean: false, punch: 'jab' }
  let steps = 0
  const maxSteps = (C.ROUNDS * (C.ROUND_SECONDS + C.REST_SECONDS) + 60) / dt
  while (m.phase !== 'over' && steps++ < maxSteps) stepMatch(m, inA, inB, dt)
  assert.equal(m.phase, 'over')
  for (const x of m.boxers) {
    assert(Number.isFinite(x.hp) && Number.isFinite(x.stamina))
    assert(x.stats.thrown > 0)
    assert(x.stamina >= 0 && x.stamina <= 100)
  }
  console.log('  match result:', m.byKO ? 'KO' : 'decision',
    '| winner:', m.winner,
    '| rounds:', m.round,
    '| A dealt', m.boxers[0].stats.dealt.toFixed(1),
    'B dealt', m.boxers[1].stats.dealt.toFixed(1))
}

// --- opponent AI: it must actually box (block, counter, combine, breathe) and "harder" must be harder
{
  const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296   // replayable matches
  const fight = (lvA, lvB, seed) => {
    const m = makeMatch(), [a, b] = m.boxers, aiA = makeAI(lvA, lcg(seed)), aiB = makeAI(lvB, lcg(seed + 7))
    let steps = 0, lowStamina = 0
    const types = new Set()
    while (m.phase !== 'over' && steps++ < 400000) {
      const inA = stepAI(aiA, a, b, dt), inB = stepAI(aiB, b, a, dt)
      if (inB.punch) types.add(inB.punch)
      stepMatch(m, inA, inB, dt)
      if (m.phase === 'fighting' && b.stamina < 5) lowStamina++
    }
    assert.equal(m.phase, 'over', 'AI match must finish')
    return { m, a, b, types, lowStamina, steps }
  }
  const r = fight(2, 2, 1)
  assert(r.b.stats.blocked > 0, 'AI never blocked')
  assert(r.types.size >= 4, `AI only threw ${[...r.types]}`)
  assert(r.lowStamina / r.steps < 0.05, 'AI punches itself empty')
  assert(r.b.stats.thrown > 30 && r.b.stats.landed > 5, `AI too passive: ${r.b.stats.thrown} thrown / ${r.b.stats.landed} landed`)
  let wins3 = 0, wins1 = 0
  for (let s = 1; s <= 30; s++) { const w = fight(3, 1, s * 13).m.winner; if (w === 0) wins3++; else if (w === 1) wins1++ }
  assert(wins3 > wins1 * 2, `level 3 should dominate level 1: ${wins3} vs ${wins1}`)
  console.log(`  AI: L2 vs L2 → ${r.m.byKO ? 'KO' : 'decision'} in round ${r.m.round}, B threw ${r.b.stats.thrown} (${[...r.types].join(' ')}), blocked ${r.b.stats.blocked}; L3 beat L1 ${wins3}–${wins1} of 30`)
}

console.log('all sim tests passed')

// Pure simulation — no three.js imports allowed here (design doc §5).
// The 3D layer only reads state and draws; it never decides outcomes.

import { PUNCH, C } from './constants.js?v=2'

export function makeBoxer(x) {
  return {
    x, vx: 0,
    hp: 100, stamina: 100,
    state: 'idle',        // idle | punch | hit | down
    stateTime: 0,
    punch: null,          // 'jab' | 'cross' | 'leadhook' | 'hook'
    punchHand: 'L',       // which glove this punch uses (visual + hit test)
    punchT: 1,            // current punch duration multiplier (fatigue)
    hitApplied: false,
    guard: false, lean: 0,
    knockdowns: 0,
    stats: { thrown: 0, landed: 0, power: 0, blocked: 0, hardest: 0, dealt: 0 },
  }
}

export function punchPhase(b) {
  if (b.state !== 'punch') return null
  const p = PUNCH[b.punch], f = b.punchT || 1
  if (b.stateTime < p.windup * f) return 'windup'
  if (b.stateTime < (p.windup + p.live) * f) return 'live'
  return 'recovery'
}

export function tryPunch(b, type) {
  if (b.state !== 'idle' || b.guard) return false
  if (b.stamina < PUNCH[type].stamina) return false  // empty tank: the arm just won't go (doc §1)
  b.state = 'punch'; b.stateTime = 0
  b.punch = type; b.hitApplied = false
  b.punchT = 1 + (1 - b.stamina / 100) * C.FATIGUE_SLOW   // slower when tired
  b.stamina -= PUNCH[type].stamina
  b.stats.thrown++
  return true
}

// att's punch (in live phase) reaches def. Returns what happened.
export function resolveHit(att, def, target = 'head') {
  att.hitApplied = true
  if (target === 'head' && def.lean > 0.5) return { missed: true }
  const p = PUNCH[att.punch]
  let dmg = target === 'head' ? p.dmgHead : p.dmgBody
  dmg *= C.DAMAGE_SCALE * (0.75 + att.stamina / 400)
  const fwd = att.vx * Math.sign(def.x - att.x)
  if (fwd > 0) dmg *= 1 + fwd * C.MOMENTUM_K
  const counter = def.state === 'punch' && punchPhase(def) === 'recovery'
  if (counter) dmg *= C.COUNTER
  const blocked = def.guard && def.state === 'idle'
  if (blocked) {
    dmg *= C.GUARD_FACTOR
    def.stamina = Math.max(0, def.stamina - C.GUARD_STAMINA)
    def.stats.blocked++
  } else {
    att.stats.landed++
    if (att.punch !== 'jab') att.stats.power++
    def.state = 'hit'; def.stateTime = 0; def.punch = null
    // view layer picks the matching hit clip from these
    def.lastHitTarget = target
    def.lastHitPunch = att.punch
    def.lastHitPower = att.stamina
  }
  def.hp -= dmg
  att.stats.dealt += dmg
  att.stats.hardest = Math.max(att.stats.hardest, dmg)
  if (def.hp <= 0 && !blocked) {
    def.state = 'down'; def.stateTime = 0
    def.knockdowns++
  }
  return { dmg, blocked, counter, target }
}

// input: { move: -1|0|1, guard: bool, lean: bool, punch: 'jab'|'hook'|null }
export function stepBoxer(b, input, dt) {
  b.stateTime += dt
  b.guard = b.state === 'idle' && !!input.guard
  b.lean = b.state === 'idle' && input.lean ? 1 : 0
  b.vx = 0
  if (b.state === 'idle') {
    if (!b.guard && input.move) {
      b.vx = input.move * C.MOVE_SPEED
      b.x = Math.max(-C.RING_HALF, Math.min(C.RING_HALF, b.x + b.vx * dt))
    }
    if (input.punch && tryPunch(b, input.punch)) b.punchHand = input.hand === 'R' ? 'R' : 'L'
    if (b.state === 'idle') b.stamina = Math.min(100, b.stamina + C.STAMINA_REGEN * dt)
  } else if (b.state === 'punch') {
    const p = PUNCH[b.punch]
    if (b.stateTime >= (p.windup + p.live + p.recovery) * (b.punchT || 1)) { b.state = 'idle'; b.punch = null }
  } else if (b.state === 'hit') {
    if (b.stateTime >= C.HIT_TIME) b.state = 'idle'
  } else if (b.state === 'down') {
    if (b.knockdowns < C.MAX_KNOCKDOWNS && b.stateTime >= C.COUNT_SECONDS) {
      b.state = 'idle'; b.hp = C.RISE_HP; b.stamina = C.RISE_STAMINA
    }
  }
}

export function makeMatch() {
  return {
    round: 1, phase: 'fighting',   // fighting | rest | over
    clock: C.ROUND_SECONDS,
    boxers: [makeBoxer(-1), makeBoxer(1)],
    winner: null, byKO: false,
  }
}

// default hit test: 1D range check (tests / headless). The 3D layer passes a
// glove-bone sphere test instead (doc §7) and gains body hits for free.
function rangeHit(att, def) {
  return Math.abs(att.x - def.x) <= PUNCH[att.punch].reach ? 'head' : null
}

const NO_INPUT = { move: 0, guard: false, lean: false, punch: null }
// hitTest: (att, def) → 'head' | 'body' | null. Pass null when the view resolves hits itself (physics contacts call resolveHit).
export function stepMatch(m, inputA, inputB, dt, hitTest = rangeHit) {
  const [a, b] = m.boxers
  if (m.phase === 'over') { stepBoxer(a, NO_INPUT, dt); stepBoxer(b, NO_INPUT, dt); return }   // no more scoring, but time still passes: the view has a fall and a count to finish
  m.clock -= dt
  if (m.phase === 'rest') {
    if (m.clock <= 0) { m.round++; m.phase = 'fighting'; m.clock = C.ROUND_SECONDS }
    return
  }
  stepBoxer(a, inputA, dt)
  stepBoxer(b, inputB, dt)
  if (b.x - a.x < C.MIN_GAP) {  // a starts left, b right; keep them apart
    const c = (a.x + b.x) / 2
    a.x = c - C.MIN_GAP / 2; b.x = c + C.MIN_GAP / 2
  }
  // ponytail: 1D range check, head-only. Phase 2 replaces this with the glove-bone
  // sphere test (doc §7) which adds body hits; resolveHit itself stays unchanged.
  for (const [att, def] of [[a, b], [b, a]]) {
    // contact can land through recovery too — measured glove peaks arrive after the
    // table's live window; hitApplied still caps it at one hit per punch
    if (hitTest && att.state === 'punch' && !att.hitApplied && punchPhase(att) !== 'windup' &&
        def.state !== 'down') {
      const target = hitTest(att, def)
      if (target) resolveHit(att, def, target)
    }
    if (def.state === 'down' && def.knockdowns >= C.MAX_KNOCKDOWNS) {
      m.phase = 'over'; m.byKO = true
      m.winner = att === a ? 0 : 1
      return
    }
  }
  if (m.clock <= 0) {
    if (m.round >= C.ROUNDS) {
      m.phase = 'over'
      const d = a.stats.dealt - b.stats.dealt
      m.winner = d === 0 ? null : d > 0 ? 0 : 1   // null = draw
    } else {
      m.phase = 'rest'; m.clock = C.REST_SECONDS
      for (const x of m.boxers) {
        x.hp = Math.min(100, x.hp + C.REST_HP)
        x.stamina = 100
        x.state = 'idle'; x.stateTime = 0; x.punch = null
      }
      a.x = -1; b.x = 1
    }
  }
}

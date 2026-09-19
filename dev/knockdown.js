// knock a boxer down and trace the fall / count / get-up.   (await import('/dev/knockdown.js')).run('B' | 'A', { stopAt })
//   stopAt (sim seconds since the knockdown) leaves the world paused there for a screenshot
import * as THREE from 'three'
import { C } from '/sim/constants.js?v=2'
export function run(who = 'B', { stopAt = null, final = false } = {}) {
  const R = window.__rag, A = R.A, B = R.B, dt = 1 / 60, V = who === 'B' ? B : A, H = who === 'B' ? A : B
  const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k })), ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k }))
  const step = () => { window.__forceB = who === 'B' ? { move: 0, guard: false, lean: false, punch: null } : window.__nextB || { move: 0, guard: false, lean: false, punch: null }; window.__nextB = null; window.__frame(dt) }
  for (const bx of [A, B]) Object.assign(bx.sim, { hp: 100, stamina: 100, state: 'idle', knockdowns: 0, punch: null }); A.down = B.down = false
  A.sim.x = -0.35; B.sim.x = 0.35; for (let i = 0; i < 150; i++) step()
  if (R.match) Object.assign(R.match, { clock: 90, phase: 'fighting', round: 1, winner: null, byKO: false })
  V.sim.hp = 2; if (final) V.sim.knockdowns = C.MAX_KNOCKDOWNS - 1
  if (who === 'B') kd('ArrowRight'); else window.__nextB = { move: 0, guard: false, lean: false, punch: 'cross', hand: 'R' }
  const rows = []; let nan = false, up = null, minHeadY = 9, maxPartV = 0
  for (let i = 0; i < 60 * 14; i++) {
    step(); if (i === 2) ku('ArrowRight')
    const h = V.hips.translation(), hd = V.b.head.translation(), t = V.b.torso.translation()
    if (![h.x, hd.x, t.x].every(isFinite)) nan = true
    if (V.sim.state === 'down') {
      minHeadY = Math.min(minHeadY, hd.y)
      for (const p of V.parts) { const v = p.body.linvel(); maxPartV = Math.max(maxPartV, Math.hypot(v.x, v.y, v.z)) }
      const s = V.sim.stateTime
      if (Math.floor(s * 2) !== Math.floor((s - dt) * 2) || s < dt * 1.5) rows.push(`t${s.toFixed(2)} hips(back ${(-(h.x - V.sim.x) * V.facing).toFixed(2)}, y ${h.y.toFixed(2)}, z ${h.z.toFixed(2)}) head(back ${(-(hd.x - V.sim.x) * V.facing).toFixed(2)}, y ${hd.y.toFixed(2)}) torsoY ${t.y.toFixed(2)} stun ${V.stun.toFixed(2)} ${V.cur} "${document.getElementById('big').textContent.replace(/\n/g, '|')}"`)
      if (stopAt != null && s >= stopAt) return { stoppedAt: +s.toFixed(2), rows: rows.slice(-3) }
      if (final && s > 9) break
    } else if (rows.length) { up = `UP: state=${V.sim.state} hp=${V.sim.hp} moved ${((V.sim.x - (who === 'B' ? 0.35 : -0.35)) * -V.facing).toFixed(2)} m back, hipsY ${h.y.toFixed(2)} z ${h.z.toFixed(2)} headY ${hd.y.toFixed(2)}`; break }
  }
  return { nan, psiDeg: Math.round(V.kd.psi * 57.3), dropY: +V.kd.dropY.toFixed(2), minHeadY: +minHeadY.toFixed(2), maxPartV: +maxPartV.toFixed(1), rows, up }
}

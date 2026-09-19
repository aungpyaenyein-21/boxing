// do the uppercuts land across ball distances and stamina levels?  (await import('/dev/sweep_upper.js')).run()
import * as THREE from 'three'
export function run(dists = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85], staminas = [100, 45]) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  const ku = a => window.dispatchEvent(new KeyboardEvent('keyup', { key: a, code: a }))
  const out = {}
  for (const st of staminas) for (const [name, arrow] of [['lead', 'ArrowLeft'], ['rear', 'ArrowRight']]) {
    const row = []
    for (const d of dists) {
      R.ballHome.x = A.sim.x + d
      for (let i = 0; i < 150; i++) { A.sim.stamina = st + 12; window.__frame(dt) }
      const h0 = R.ballHits; let best = 0, up = 0
      window.dispatchEvent(new KeyboardEvent('keydown', { key: arrow, code: arrow, shiftKey: true }))
      for (let i = 0; i < 60; i++) { window.__frame(dt); if (i === 2) ku(arrow); const v = R.ball.linvel(), s = Math.hypot(v.x, v.y, v.z); if (s > best) { best = s; up = v.y } }
      row.push(`${d}:${R.ballHits > h0 ? 'HIT' : 'miss'} ${best.toFixed(1)}${up > 0.5 ? '↑' : ''}`)
    }
    out[`${name} st${st}`] = row.join('  ')
  }
  R.ballHome.x = A.sim.x + 0.8
  return out
}

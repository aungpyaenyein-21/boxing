// duel mode, passive opponent: does a punch reach B's head, and if not, where does the glove pass it?
//   (await import('/dev/duel_punch.js')).run('hook', 6)        names: jab cross leadhook hook leadupper upper
import * as THREE from 'three'
const KEYS = { jab: ['ArrowLeft', 0], cross: ['ArrowRight', 0], leadhook: ['ArrowLeft', 1], hook: ['ArrowRight', 1], leadupper: ['ArrowLeft', 2], upper: ['ArrowRight', 2] }
export function run(name = 'hook', n = 6, verbose = false) {
  const R = window.__rag, A = R.A, B = R.B, dt = 1 / 60
  const [arrow, mod] = KEYS[name], hand = arrow === 'ArrowLeft' ? 'L' : 'R'
  const kd = (k, sh) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, shiftKey: !!sh }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const step = () => { window.__forceB = { move: 0, guard: false, lean: false, punch: null }; window.__frame(dt) }
  const q = r => new THREE.Quaternion(r.x, r.y, r.z, r.w), v3 = t => new THREE.Vector3(t.x, t.y, t.z)
  const fore = hand === 'R' ? A.b.foreR : A.b.foreL
  const glove = () => { const p = A.parts.find(x => x.body === fore); return new THREE.Vector3().copy(p.gloveLocal).applyQuaternion(q(fore.rotation())).add(v3(fore.translation())) }
  if (B.sim.x - A.sim.x > 0.65) { kd('d'); for (let i = 0; i < 150; i++) step(); ku('d') }
  const out = []
  for (let k = 0; k < n; k++) {
        if (R.match) Object.assign(R.match, { clock: 90, phase: 'fighting' })   // the bell must not ring mid-measurement
    A.sim.stamina = 100; A.sim.hp = 100; B.sim.hp = 100; for (let i = 0; i < 100; i++) step()
    const hp0 = B.sim.hp; let best = 9, at = null; const rows = []
    if (mod === 1) kd(' '); kd(arrow, mod === 2)
    for (let i = 0; i < 50; i++) {
      step(); if (i === 2) { ku(arrow); ku(' ') }
      if (A.sim.state !== 'punch') continue
      const g = glove(), h = v3(B.b.head.translation()), d = g.distanceTo(h), ph = R.punchPhase(A.sim)
      if (ph !== 'windup' && d < best) { best = d; at = `f${i}${ph[0]} fwd${(g.x - h.x).toFixed(2)} up${(g.y - h.y).toFixed(2)} side${(g.z - h.z).toFixed(2)}` }
      if (verbose) rows.push(`${i}${ph[0]} g(${(g.x - A.sim.x).toFixed(2)},${g.y.toFixed(2)},${g.z.toFixed(2)}) head(${(h.x - A.sim.x).toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}) d${d.toFixed(2)}`)
    }
    const r = { dmg: +(hp0 - B.sim.hp).toFixed(1), minDist: +best.toFixed(2), at }
    if (verbose) r.rows = rows
    out.push(r)
  }
  return out
}

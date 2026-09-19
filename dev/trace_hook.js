// per-frame trace of the rear hook around the shoulder: await (await import('/dev/trace_hook.js')).run()
import * as THREE from 'three'
export function run(from = 6, n = 26, brief = false) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const glove = () => { const f = A.b.foreR, p = A.parts.find(x => x.body === f), t = f.translation(), r = f.rotation(); return new THREE.Vector3().copy(p.gloveLocal).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z)) }
  const sh = () => { const u = A.b.upperR, um = A.motors.find(m => m.body === u), t = u.translation(), r = u.rotation(); return new THREE.Vector3(um.pivot.x, um.pivot.y, um.pivot.z).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z)) }
  const pitch = () => { const r = A.b.torso.rotation(); const u = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, u.y))) }
  for (let i = 0; i < 150; i++) window.__frame(dt)
  let prev = glove(); const rows = []; const h0 = R.ballHits; let ballMax = 0, hitRow = null, peak = 0, maxPitch = 0, rAtHit = null
  kd(' '); window.__frame(dt); kd('ArrowRight')
  for (let i = 0; i < 60; i++) {
    window.__frame(dt); if (i === 2) { ku('ArrowRight'); ku(' ') }
    const g = glove(), s = sh(), b = R.ball.translation(), bv = R.ball.linvel(); const v = g.distanceTo(prev) / dt; prev = g
    ballMax = Math.max(ballMax, Math.hypot(bv.x, bv.y, bv.z)); peak = Math.max(peak, v); if (A.sim.state === 'punch') maxPitch = Math.max(maxPitch, pitch())
    const ag = Math.atan2(g.x - s.x, g.z - s.z) * 180 / Math.PI, at = Math.atan2(b.x - s.x, b.z - s.z) * 180 / Math.PI
    const row = `${i}${A.sim.state === 'punch' ? R.punchPhase(A.sim)[0] : '-'} v${v.toFixed(0)} g(${(g.x - A.sim.x).toFixed(2)},${g.y.toFixed(2)},${g.z.toFixed(2)}) r${Math.hypot(g.x - s.x, g.z - s.z).toFixed(2)} ag${ag.toFixed(0)} at${at.toFixed(0)} dist${Math.hypot(b.x - s.x, b.z - s.z).toFixed(2)}`
    if (!hitRow && R.ballHits > h0) hitRow = row
    if (i >= from && i < n) rows.push(row + (R.ballHits > h0 ? ' HIT' : ''))
  }
  const sum = { ballMax: +ballMax.toFixed(1), peak: +peak.toFixed(1), pitch: +maxPitch.toFixed(0), hit: hitRow }
  return brief ? sum : { ...sum, rows }
}

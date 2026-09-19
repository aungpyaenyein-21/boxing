// shape of the rear hook, not just whether it lands: elbow angle, how far the glove strays to the side, radius.
//   await (await import('/dev/hook_shape.js')).run()
import * as THREE from 'three'
export function run(verbose = false) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const q = r => new THREE.Quaternion(r.x, r.y, r.z, r.w), v3 = t => new THREE.Vector3(t.x, t.y, t.z)
  const pivot = body => { const m = A.motors.find(x => x.body === body); return v3(m.pivot).applyQuaternion(q(body.rotation())).add(v3(body.translation())) }
  const glove = () => { const f = A.b.foreR, p = A.parts.find(x => x.body === f); return new THREE.Vector3().copy(p.gloveLocal).applyQuaternion(q(f.rotation())).add(v3(f.translation())) }
  const pitch = () => { const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q(A.b.torso.rotation())); return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, u.y))) }
  for (let i = 0; i < 150; i++) window.__frame(dt)
  let prev = glove(); const rows = []; const h0 = R.ballHits
  let minElbow = 999, maxElbow = 0, maxSide = 0, maxBack = 0, ballMax = 0, peak = 0, maxPitch = 0, hit = null, rSweep = []
  kd(' '); window.__frame(dt); kd('ArrowRight')
  for (let i = 0; i < 60; i++) {
    window.__frame(dt); if (i === 2) { ku('ArrowRight'); ku(' ') }
    const g = glove(), s = pivot(A.b.upperR), e = pivot(A.b.foreR), b = R.ball.translation(), bv = R.ball.linvel()
    const v = g.distanceTo(prev) / dt; prev = g
    const elbow = THREE.MathUtils.radToDeg(s.clone().sub(e).angleTo(g.clone().sub(e)))   // 180 = straight arm
    const side = g.z - s.z, fwd = g.x - s.x, r = Math.hypot(fwd, side)
    ballMax = Math.max(ballMax, Math.hypot(bv.x, bv.y, bv.z)); peak = Math.max(peak, v)
    if (A.sim.state === 'punch') {
      maxPitch = Math.max(maxPitch, pitch())
      const ph = R.punchPhase(A.sim)
      if (ph !== 'recovery' || !hit) { minElbow = Math.min(minElbow, elbow); maxElbow = Math.max(maxElbow, elbow); maxSide = Math.max(maxSide, side); maxBack = Math.min(maxBack, fwd) }
      if (ph === 'live') rSweep.push(r)
      const row = `${i}${ph[0]} v${v.toFixed(0)} elbow${elbow.toFixed(0)} side${side.toFixed(2)} fwd${fwd.toFixed(2)} r${r.toFixed(2)} y${g.y.toFixed(2)} dist${Math.hypot(b.x - s.x, b.z - s.z).toFixed(2)}`
      if (!hit && R.ballHits > h0) hit = row
      if (verbose) rows.push(row + (R.ballHits > h0 ? ' HIT' : ''))
    }
  }
  const out = { elbow: [Math.round(minElbow), Math.round(maxElbow)], maxSideOut: +maxSide.toFixed(2), maxBehind: +maxBack.toFixed(2), rLive: [+Math.min(...rSweep).toFixed(2), +Math.max(...rSweep).toFixed(2)], peak: +peak.toFixed(1), ball: +ballMax.toFixed(1), pitch: Math.round(maxPitch), hit }
  if (verbose) out.rows = rows
  return out
}

// per-frame trace of an uppercut: does the fist dip, slide under, and rise THROUGH the target with a bent arm and an upright torso?
//   (await import('/dev/trace_upper.js')).run('L' | 'R', verbose)
import * as THREE from 'three'
export function run(hand = 'L', verbose = false) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  const arrow = hand === 'L' ? 'ArrowLeft' : 'ArrowRight'
  const kd = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: arrow, code: arrow, shiftKey: true }))
  const ku = () => window.dispatchEvent(new KeyboardEvent('keyup', { key: arrow, code: arrow }))
  const q = r => new THREE.Quaternion(r.x, r.y, r.z, r.w), v3 = t => new THREE.Vector3(t.x, t.y, t.z)
  const fore = hand === 'R' ? A.b.foreR : A.b.foreL, upperArm = hand === 'R' ? A.b.upperR : A.b.upperL
  const glove = () => { const p = A.parts.find(x => x.body === fore); return new THREE.Vector3().copy(p.gloveLocal).applyQuaternion(q(fore.rotation())).add(v3(fore.translation())) }
  const pivot = body => { const m = A.motors.find(x => x.body === body); return v3(m.pivot).applyQuaternion(q(body.rotation())).add(v3(body.translation())) }
  const pitch = () => { const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q(A.b.torso.rotation())); return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, u.y))) }
  for (let i = 0; i < 150; i++) { A.sim.stamina = 100; window.__frame(dt) }
  let prev = glove(); const rows = []; const h0 = R.ballHits
  let minY = 9, maxY = 0, maxVy = 0, maxPitch = 0, elbowMin = 999, elbowMax = 0, hipsMin = 9, ballBest = 0, ballDir = null, hit = null, nan = false
  kd()
  for (let i = 0; i < 45; i++) {
    window.__frame(dt); if (i === 2) ku()
    const g = glove(), vel = g.clone().sub(prev).divideScalar(dt); prev = g
    if (!isFinite(g.x)) nan = true
    const s = pivot(upperArm), e = pivot(fore), elbow = THREE.MathUtils.radToDeg(s.clone().sub(e).angleTo(g.clone().sub(e)))
    const bv = R.ball.linvel(), bs = Math.hypot(bv.x, bv.y, bv.z); if (bs > ballBest) { ballBest = bs; ballDir = [+bv.x.toFixed(1), +bv.y.toFixed(1), +bv.z.toFixed(1)] }
    if (A.sim.state !== 'punch') continue
    const ph = R.punchPhase(A.sim)
    minY = Math.min(minY, g.y); maxY = Math.max(maxY, g.y); maxVy = Math.max(maxVy, vel.y); maxPitch = Math.max(maxPitch, pitch()); hipsMin = Math.min(hipsMin, A.hips.translation().y)
    if (ph !== 'recovery') { elbowMin = Math.min(elbowMin, elbow); elbowMax = Math.max(elbowMax, elbow) }
    const row = `${i}${ph[0]} g(${(g.x - A.sim.x).toFixed(2)},${g.y.toFixed(2)},${g.z.toFixed(2)}) v${vel.length().toFixed(0)} vy${vel.y.toFixed(1)} elbow${elbow.toFixed(0)} pitch${pitch().toFixed(0)}`
    if (!hit && R.ballHits > h0) hit = row
    if (verbose) rows.push(row + (R.ballHits > h0 ? ' HIT' : ''))
  }
  const out = { hit, gloveY: [+minY.toFixed(2), +maxY.toFixed(2)], maxVy: +maxVy.toFixed(1), elbow: [Math.round(elbowMin), Math.round(elbowMax)], pitch: Math.round(maxPitch), hipsDip: +(A.hips.translation().y - hipsMin).toFixed(2), ball: +ballBest.toFixed(1), ballDir_fwd_up_side: ballDir, nan }
  if (verbose) out.rows = rows
  return out
}

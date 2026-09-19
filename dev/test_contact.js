// how squarely does each punch land on the solo ball?  await (await import('/dev/test_contact.js')).run()
import * as THREE from 'three'
const ALL = [['jab', 'ArrowLeft', 0], ['cross', 'ArrowRight', 0], ['leadhook', 'ArrowLeft', 1], ['hook', 'ArrowRight', 1]]
export async function run(names) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const glove = h => { const f = h === 'R' ? A.b.foreR : A.b.foreL, p = A.parts.find(x => x.body === f), t = f.translation(), r = f.rotation(); return new THREE.Vector3().copy(p.gloveLocal).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z)) }
  const pitch = () => { const r = A.b.torso.rotation(); const u = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, u.y))) }
  const out = {}
  for (const [name, arrow, space] of ALL.filter(p => !names || names.includes(p[0]))) {
    for (let i = 0; i < 150; i++) window.__frame(dt)
    const hand = arrow === 'ArrowLeft' ? 'L' : 'R', h0 = R.ballHits
    let prev = glove(hand), c = null, ballMax = 0, maxV = 0, maxPitch = 0, nan = false
    if (space) kd(' '); window.__frame(dt); kd(arrow)
    for (let i = 0; i < 70; i++) {
      window.__frame(dt); if (i === 2) { ku(arrow); ku(' ') }
      const g = glove(hand), b = R.ball.translation(), bv = R.ball.linvel(), gv = g.clone().sub(prev).divideScalar(dt); prev = g
      if (!isFinite(g.x)) nan = true
      maxV = Math.max(maxV, gv.length()); if (A.sim.state === 'punch') maxPitch = Math.max(maxPitch, pitch())
      if (!c && R.ballHits > h0) c = { frame: i, speed: +gv.length().toFixed(1), side: +(g.z - b.z).toFixed(2), up: +(g.y - b.y).toFixed(2) }
      ballMax = Math.max(ballMax, Math.hypot(bv.x, bv.y, bv.z))
    }
    out[name] = { ball: +ballMax.toFixed(1), contact: c, peakV: +maxV.toFixed(1), pitch: +maxPitch.toFixed(0), nan }
  }
  return out
}

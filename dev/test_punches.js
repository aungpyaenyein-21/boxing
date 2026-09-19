// headless punch harness: await (await import('/dev/test_punches.js')).run()  — needs ?solo and window.__rag
import * as THREE from 'three'
export async function run(list = [['jab','ArrowLeft',0],['cross','ArrowRight',0],['leadhook','ArrowLeft',1],['hook','ArrowRight',1]]) {
  const R = window.__rag, A = R.A, dt = 1 / 60
  let hips; A.tgt.traverse(o => { if (/Hips$/.test(o.name)) hips = o })
  const lh = A.tgt.getObjectByName(hips.name.replace('Hips', 'LeftHand'))
  const glovePos = hand => { const fore = hand === 'R' ? A.b.foreR : A.b.foreL; const part = A.parts.find(p => p.body === fore); const t = fore.translation(), r = fore.rotation(); return new THREE.Vector3().copy(part.gloveLocal).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z)) }
  const shoulder = hand => { const up = hand === 'R' ? A.b.upperR : A.b.upperL; const t = up.translation(); return new THREE.Vector3(t.x, t.y, t.z) }
  const torsoPitch = () => { const r = A.b.torso.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q); return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, up.y))) }
  const headAng = () => { const r = A.b.head.rotation(), t = A.b.torso.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).multiply(new THREE.Quaternion(t.x, t.y, t.z, t.w).invert()); return THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(q.w)))) }
  const kd = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const res = {}
  const wp = new THREE.Vector3(), hp = new THREE.Vector3()
  { let prev = glovePos('L'), mx = 0; for (let i = 0; i < 60; i++) { window.__frame(dt); const g = glovePos('L'); mx = Math.max(mx, g.distanceTo(prev) / dt); prev = g } res.idleMaxV = +mx.toFixed(2) }
  for (const [name, arrow, space] of list) {
    for (let i = 0; i < 90; i++) window.__frame(dt)
    const hits0 = R.ballHits; const hand = arrow === 'ArrowLeft' ? 'L' : 'R'
    let prev = glovePos(hand), prevV = null, maxV = 0, flips = 0, maxAcc = 0, minSG = 9, maxSG = 0, maxPitch = 0, maxHead = 0, minZ = 9, maxZ = -9, punch = null, rows = [], nan = false, afterPitch = 0
    if (space) kd(' '); window.__frame(dt); kd(arrow)
    for (let i = 0; i < 80; i++) {
      window.__frame(dt)
      if (i === 2) { ku(arrow); ku(' ') }
      if (A.sim.state === 'punch') punch = A.sim.punch
      const g = glovePos(hand); if (!isFinite(g.x)) nan = true; const v = g.clone().sub(prev).divideScalar(dt); const sp = v.length(); maxV = Math.max(maxV, sp)
      if (prevV) { const acc = v.clone().sub(prevV).divideScalar(dt).length(); maxAcc = Math.max(maxAcc, acc); if (prevV.length() > 0.5 && sp > 0.5 && prevV.dot(v) < 0) flips++ }
      prevV = v; prev = g
      if (A.sim.state === 'punch') {
        const s = shoulder(hand); const d = g.distanceTo(s); minSG = Math.min(minSG, d); maxSG = Math.max(maxSG, d); maxPitch = Math.max(maxPitch, torsoPitch()); maxHead = Math.max(maxHead, headAng()); minZ = Math.min(minZ, g.z - s.z); maxZ = Math.max(maxZ, g.z - s.z)
        if (i % 3 === 0) { lh.getWorldPosition(wp); hips.getWorldPosition(hp); if (hand === 'L') rows.push(`t${(wp.x - hp.x).toFixed(2)},${(wp.z - hp.z).toFixed(2)}/p${(g.x - A.sim.x).toFixed(2)},${g.z.toFixed(2)}`); else rows.push(`p${(g.x - A.sim.x).toFixed(2)},${g.z.toFixed(2)}`) }
      } else afterPitch = Math.max(afterPitch, torsoPitch())
    }
    res[name] = { punch, hit: R.ballHits - hits0, nan, maxV: +maxV.toFixed(1), maxAcc: +maxAcc.toFixed(0), flips, SG: [+minSG.toFixed(2), +maxSG.toFixed(2)], maxPitch: +maxPitch.toFixed(0), afterPitch: +afterPitch.toFixed(0), maxHead: +maxHead.toFixed(0), zRange: [+minZ.toFixed(2), +maxZ.toFixed(2)], rows: rows.join(' ') }
  }
  return res
}

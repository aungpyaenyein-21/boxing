// does the planted foot stay on the ground while walking?   (await import('/dev/walk_test.js')).run('d')
import * as THREE from 'three'
export function run(key = 'd', frames = 120) {
  const R = window.__rag, A = R.A, B = R.B, dt = 1 / 60
  const step = () => { window.__forceB = { move: 0, guard: false, lean: false, punch: null }; window.__frame(dt) }
  const foot = s => { const b = A.model.getObjectByName('mixamorig' + s + 'Foot'); const w = new THREE.Vector3(); b.getWorldPosition(w); return w }
  if (R.match) Object.assign(R.match, { clock: 90, phase: 'fighting' })
  A.sim.x = key === 'd' ? -2.2 : 1.0; B.sim.x = 2.6; A.sim.stamina = 100
  for (let i = 0; i < 120; i++) step()
  const x0 = A.sim.x
  let prev = { Left: foot('Left'), Right: foot('Right') }, slide = 0, planted = 0, lowest = 9, rows = []
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase() }))
  for (let i = 0; i < frames; i++) {
    step()
    const f = { Left: foot('Left'), Right: foot('Right') }
    // the lower foot is the planted one: in a matched walk it should not move horizontally
    const low = f.Left.y < f.Right.y ? 'Left' : 'Right'
    lowest = Math.min(lowest, f[low].y)
    if (i > 5) { slide += Math.abs(f[low].x - prev[low].x); planted++ }
    prev = f
    if (i % 20 === 0) rows.push(`i${i} ${A.cur} ts${A.actions[A.cur]?.timeScale.toFixed(2)} x${A.sim.x.toFixed(2)} stepX${A.stepX.toFixed(3)} lowFoot=${low} y${f[low].y.toFixed(2)}`)
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code: 'Key' + key.toUpperCase() }))
  const travel = Math.abs(A.sim.x - x0)
  for (let i = 0; i < 40; i++) step()
  return { travelledM: +travel.toFixed(2), plantedSlideM: +slide.toFixed(2), slidePerMetre: +(slide / travel).toFixed(2), lowestFootY: +lowest.toFixed(2), afterStop: A.cur, rows }
}

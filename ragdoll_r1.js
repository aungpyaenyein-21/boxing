// R1: active upper-body ragdoll on Y Bot (Rapier). PD motors hold the Mixamo guard pose; hips pinned.
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from 'rapier'

await RAPIER.init()
const ui = document.getElementById('ui')

// ---------- scene ----------
const W = () => innerWidth || 800, H = () => innerHeight || 450   // hidden pane reports 0×0
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(W(), H())
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a22)
const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100)
camera.position.set(0.4, 1.5, 3.6)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.1, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x334, 1.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 5, 3); scene.add(sun)
scene.add(new THREE.GridHelper(6, 12, 0x445, 0x334))
addEventListener('resize', () => {
  camera.aspect = W() / H(); camera.updateProjectionMatrix()
  renderer.setSize(W(), H())
})

// ---------- model ----------
const model = await new FBXLoader().loadAsync('models/Y Bot.fbx')
model.scale.setScalar(0.01)
model.rotation.y = Math.PI / 2   // face +x like the game
scene.add(model)
model.updateMatrixWorld(true)
let prefix = 'mixamorig'
model.traverse(o => { const m = o.name.match(/^(mixamorig\d*)Hips$/); if (m) prefix = m[1] })
const bone = n => model.getObjectByName(prefix + n)
const wpos = b => b.getWorldPosition(new THREE.Vector3())

// pose: first frame of the fight idle = the guard. Motors will hold this pose.
{
  const clip = (await new FBXLoader().loadAsync('models/Idle.fbx')).animations[0]
  clip.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  const mixer = new THREE.AnimationMixer(model)
  mixer.clipAction(clip).play()
  mixer.update(0)
  model.updateMatrixWorld(true)
}

// ---------- physics ----------
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
const DT = 1 / 240
world.timestep = DT
const P = { damping: 2.0, angDamping: 4.0 }   // R0 knobs
const parts = []   // { body, bone, offset }

function segmentBody(name, boneA, boneB, radius, opts = {}) {
  const a = wpos(boneA), b = wpos(boneB)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const len = a.distanceTo(b)
  const rb = world.createRigidBody((opts.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
    .setTranslation(mid.x, mid.y, mid.z)
    .setLinearDamping(P.damping).setAngularDamping(P.angDamping))
  // capsule is along local Y; rotate it onto the segment direction
  const dir = b.clone().sub(a).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const half = Math.max(0.01, len / 2 - radius)
  world.createCollider(RAPIER.ColliderDesc.capsule(half, radius)
    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    .setDensity(opts.density || 900), rb)   // kg/m³ — human-ish masses keep the solver honest
  if (opts.glove) {   // a ball on the far end (the hand)
    const g = b.clone().sub(mid)
    world.createCollider(RAPIER.ColliderDesc.ball(opts.glove).setTranslation(g.x, g.y, g.z), rb)
  }
  // offset: bone world matrix expressed in body frame (body frame = translation only at setup)
  const offset = new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z).multiply(boneA.matrixWorld)
  parts.push({ name, body: rb, bone: boneA, offset })
  return rb
}

// pinned hips
const hipsPos = wpos(bone('Hips'))
const hips = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hipsPos.x, hipsPos.y, hipsPos.z))

const torso = segmentBody('torso', bone('Spine1'), bone('Neck'), 0.13, { density: 1400 })
const head = segmentBody('head', bone('Head'), bone('HeadTop_End'), 0.10, { density: 1000 })
const upperL = segmentBody('upperL', bone('LeftArm'), bone('LeftForeArm'), 0.05)
const foreL = segmentBody('foreL', bone('LeftForeArm'), bone('LeftHand'), 0.045, { glove: 0.07 })
const upperR = segmentBody('upperR', bone('RightArm'), bone('RightForeArm'), 0.05)
const foreR = segmentBody('foreR', bone('RightForeArm'), bone('RightHand'), 0.045, { glove: 0.07 })

const motors = []   // { body, parent, k, c } — PD torque toward the setup pose (identity relative rotation)
function ball(bodyA, bodyB, at, k, c) {
  const ta = bodyA.translation(), tb = bodyB.translation()
  const j = RAPIER.JointData.spherical(
    { x: at.x - ta.x, y: at.y - ta.y, z: at.z - ta.z },
    { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z })
  const joint = world.createImpulseJoint(j, bodyA, bodyB, true)
  joint.setContactsEnabled(false)
  const pi = bodyB.principalInertia()
  const I = (pi.x + pi.y + pi.z) / 3
  motors.push({ body: bodyB, parent: bodyA, f: k, zeta: c, I, gain: 1,
    pivot: { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z },   // joint anchor in body frame
    load: [bodyB] })   // bodies whose weight this joint carries (filled below)
  return joint
}
// motor knobs per joint: [natural frequency Hz, damping ratio]. Torque is scaled by the
// body's inertia so these numbers mean the same thing for a head and for a torso.
const M = { spine: [6, 1], neck: [4, 1], shoulder: [5, 1], elbow: [5, 1] }
const P1 = { kMul: 1.5, cMul: 1, gc: 1 }   // sweep 2026-09-11: 1.5 → recovers in 0.28s (Punchers ≈ 0.33s), sag 2cm
ball(hips, torso, wpos(bone('Spine1')), ...M.spine)
ball(torso, head, wpos(bone('Neck')), ...M.neck)
ball(torso, upperL, wpos(bone('LeftArm')), ...M.shoulder)
ball(upperL, foreL, wpos(bone('LeftForeArm')), ...M.elbow)
ball(torso, upperR, wpos(bone('RightArm')), ...M.shoulder)
ball(upperR, foreR, wpos(bone('RightForeArm')), ...M.elbow)
const ARM = {
  L: { fore: foreL, motors: [motors[2], motors[3]], glove: foreL.collider(1) },
  R: { fore: foreR, motors: [motors[4], motors[5]], glove: foreR.collider(1) },
}

// each joint carries everything downstream of it
for (const m of motors) {
  const kids = motors.filter(o => o.parent === m.body)
  const stack = [...kids]
  while (stack.length) { const o = stack.pop(); m.load.push(o.body); stack.push(...motors.filter(x => x.parent === o.body)) }
}

// PD motor: torque = k * angleError * axis - c * relativeAngularVelocity  (+ gravity compensation)
const pv = new THREE.Vector3(), cv = new THREE.Vector3(), gcv = new THREE.Vector3()
const qp = new THREE.Quaternion(), qb = new THREE.Quaternion(), qe = new THREE.Quaternion()
const axis = new THREE.Vector3()
function applyMotors(dt) {
  for (const m of motors) {
    const rp = m.parent.rotation(), rb = m.body.rotation()
    qp.set(rp.x, rp.y, rp.z, rp.w); qb.set(rb.x, rb.y, rb.z, rb.w)
    qe.copy(qp).multiply(qb.clone().invert())          // desired (= parent) * inverse(current)
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w)   // shortest path
    const angle = 2 * Math.acos(Math.min(1, qe.w))
    const sn = Math.sqrt(Math.max(0, 1 - qe.w * qe.w))
    if (sn > 1e-6) axis.set(qe.x / sn, qe.y / sn, qe.z / sn); else axis.set(0, 0, 0)
    const wb = m.body.angvel(), wp = m.parent.angvel()
    const w0 = 2 * Math.PI * m.f * P1.kMul * m.gain
    const k = m.I * w0 * w0
    // damping impulse must never exceed the velocity it damps (c·dt < I), or it flips sign and grows
    const c = Math.min(m.I * 2 * m.zeta * P1.cMul * w0, 0.5 * m.I / dt)
    const t = {
      x: (k * angle * axis.x - c * (wb.x - wp.x)) * dt,
      y: (k * angle * axis.y - c * (wb.y - wp.y)) * dt,
      z: (k * angle * axis.z - c * (wb.z - wp.z)) * dt,
    }
    m.body.applyTorqueImpulse(t, true)
    if (m.parent.bodyType() === RAPIER.RigidBodyType.Dynamic)
      m.parent.applyTorqueImpulse({ x: -t.x, y: -t.y, z: -t.z }, true)   // reaction torque
    // gravity compensation: cancel the weight torque of everything hanging from this joint
    const tb = m.body.translation()
    pv.set(m.pivot.x, m.pivot.y, m.pivot.z).applyQuaternion(qb).add(tb)
    gcv.set(0, 0, 0)
    for (const b of m.load) {
      const c = b.translation()
      cv.set(c.x - pv.x, c.y - pv.y, c.z - pv.z)
      gcv.x -= cv.z * b.mass() * 9.81   // (com - pivot) × (0, m g, 0) = (-rz·mg, 0, rx·mg)
      gcv.z += cv.x * b.mass() * 9.81
    }
    m.body.applyTorqueImpulse({ x: gcv.x * P1.gc * dt, y: 0, z: gcv.z * P1.gc * dt }, true)
  }
}

// ---------- target (stands in for the opponent's head until R3) ----------
// sweep 2026-09-11: lead jab 400N → contact 0.13s; rear hand needs ~600N → contact 0.18s (Punchers ≈0.17s)
const P2 = { force: 400, rearMul: 1.5, hookMul: 1.2, windup: 0.08, extend: 0.17, total: 0.5, armGain: 0.1, lean: 1.5, hookCurve: 0.3, targetDist: 0.7 }
const target = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
  new THREE.MeshPhongMaterial({ color: 0xcc4444 }))
scene.add(target)
function placeTarget() { target.position.set(P2.targetDist, 1.5, 0) }
placeTarget()

// ---------- punch: lower the arm's motor, shove the glove at the target, motor pulls it back ----------
let punch = null   // { hand, type, t, minDist, contactT }
const stats = { thrown: 0, hits: 0, lastContactT: null, lastMinDist: null }
function throwPunch(hand, type = 'jab') {
  if (punch) return
  punch = { hand, type, t: 0, minDist: 9, contactT: null, hit: false }
  stats.thrown++
}
const dirv = new THREE.Vector3(), gp = new THREE.Vector3(), side = new THREE.Vector3()
function stepPunch(dt) {
  if (!punch) return
  const arm = ARM[punch.hand]
  punch.t += dt
  const extending = punch.t >= P2.windup && punch.t < P2.windup + P2.extend
  const active = punch.t < P2.windup + P2.extend
  for (const m of arm.motors) m.gain = active ? P2.armGain : 1
  const g = arm.glove.translation()
  gp.set(g.x, g.y, g.z)
  dirv.copy(target.position).sub(gp)
  const d = dirv.length()
  if (d < punch.minDist) punch.minDist = d
  if (!punch.hit && d < 0.11 + 0.07) { punch.hit = true; punch.contactT = punch.t; stats.hits++; target.material.color.set(0xffee66) }
  if (punch.t > P2.windup + P2.extend + 0.15) target.material.color.set(0xcc4444)
  if (extending) {
    dirv.normalize()
    if (punch.type === 'hook') {   // hooks come around: push sideways first, then in
      const prog = (punch.t - P2.windup) / P2.extend
      side.set(0, 0, punch.hand === 'L' ? 1 : -1).multiplyScalar(P2.hookCurve * (1 - prog))
      dirv.add(side).normalize()
    }
    const F = P2.force * (punch.hand === 'R' ? P2.rearMul : 1) * (punch.type === 'hook' ? P2.hookMul : 1) * dt
    arm.fore.applyImpulseAtPoint({ x: dirv.x * F, y: dirv.y * F, z: dirv.z * F }, g, true)
    // the body follows the punch: lean in (and twist for hooks)
    torso.applyImpulse({ x: dirv.x * F * P2.lean, y: 0, z: dirv.z * F * P2.lean }, true)
    if (punch.type === 'hook') torso.applyTorqueImpulse({ x: 0, y: (punch.hand === 'L' ? -1 : 1) * F * 0.15, z: 0 }, true)
  }
  if (punch.t >= P2.total) {
    stats.lastContactT = punch.contactT; stats.lastMinDist = +punch.minDist.toFixed(3)
    punch = null
  }
}

// ---------- debug shapes ----------
const dbg = new THREE.Group(); scene.add(dbg)
const dbgMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, wireframe: true })
world.forEachCollider(c => {
  const s = c.shape
  let geo
  if (s.type === RAPIER.ShapeType.Capsule) geo = new THREE.CapsuleGeometry(s.radius, s.halfHeight * 2, 4, 8)
  else if (s.type === RAPIER.ShapeType.Ball) geo = new THREE.SphereGeometry(s.radius, 8, 6)
  else return
  const m = new THREE.Mesh(geo, dbgMat); m.userData.c = c; dbg.add(m)
})

// ---------- bone follow ----------
const bm = new THREE.Matrix4(), pm = new THREE.Matrix4(), lm = new THREE.Matrix4()
const tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3()
function syncBones() {
  for (const p of parts) {
    const t = p.body.translation(), r = p.body.rotation()
    bm.compose(new THREE.Vector3(t.x, t.y, t.z), tq.set(r.x, r.y, r.z, r.w), ts.set(1, 1, 1))
    bm.multiply(p.offset)                        // bone world matrix
    p.bone.parent.updateWorldMatrix(true, false)
    pm.copy(p.bone.parent.matrixWorld).invert()
    lm.multiplyMatrices(pm, bm).decompose(tv, tq, ts)
    p.bone.position.copy(tv); p.bone.quaternion.copy(tq)
  }
  model.updateMatrixWorld(true)
  for (const m of dbg.children) {
    const t = m.userData.c.translation(), r = m.userData.c.rotation()
    m.position.set(t.x, t.y, t.z); m.quaternion.set(r.x, r.y, r.z, r.w)
  }
}

// ---------- controls ----------
function impulse(body, v) { body.applyImpulse({ x: v[0], y: v[1], z: v[2] }, true) }
const keys = {}
addEventListener('keydown', e => {
  if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
  keys[e.key] = true
  if (e.key === 'p') impulse(head, [-30, 0, 10])     // take a punch to the head
  if (e.key === 'b') impulse(torso, [-60, 0, 0])     // body shot
  if (e.key === 'ArrowLeft') throwPunch('L', keys[' '] ? 'hook' : 'jab')
  if (e.key === 'ArrowRight') throwPunch('R', keys[' '] ? 'hook' : 'jab')
  if (e.key === 'd') dbg.visible = !dbg.visible
})
addEventListener('keyup', e => { keys[e.key] = false })
window.__rag = { world, parts, head, torso, foreL, foreR, impulse, RAPIER, camera, controls, P1, M, P2, throwPunch, stats, target, placeTarget, ARM }   // debug hook

// slider panel
const panel = document.createElement('div')
panel.style.cssText = 'position:fixed;right:10px;top:10px;z-index:2;background:#0008;padding:8px 12px;border-radius:6px'
const SLIDERS = [
  [P1, 'kMul', 'pose stiffness ×', 0.2, 3, 0.05], [P1, 'cMul', 'pose damping ×', 0.2, 3, 0.05],
  [P2, 'force', 'punch force N', 50, 800, 10], [P2, 'extend', 'punch extend s', 0.08, 0.35, 0.01],
  [P2, 'armGain', 'arm stiffness while punching', 0.05, 1, 0.05], [P2, 'lean', 'body lean-in', 0, 1, 0.05],
  [P2, 'hookCurve', 'hook curve', 0, 1.5, 0.05], [P2, 'targetDist', 'target distance m', 0.5, 1.3, 0.05],
]
for (const [obj, key, label, min, max, step] of SLIDERS) {
  const row = document.createElement('label')
  row.style.display = 'block'
  row.innerHTML = `${label} <span>${obj[key]}</span><br><input type="range" min="${min}" max="${max}" step="${step}" value="${obj[key]}">`
  row.querySelector('input').oninput = e => { obj[key] = +e.target.value; row.querySelector('span').textContent = obj[key]; if (key === 'targetDist') placeTarget() }
  panel.appendChild(row)
}
document.body.appendChild(panel)

// ---------- loop ----------
let acc = 0, steps = 0
const clock = new THREE.Clock()
function frame(dt) {
  acc += dt
  while (acc >= DT) { applyMotors(DT); stepPunch(DT); world.step(); acc -= DT; steps++ }   // fixed 240Hz
  syncBones()
  const h = head.translation(), f = foreL.translation()
  ui.textContent = `R2 active ragdoll  steps:${steps}   thrown:${stats.thrown} hits:${stats.hits}\n` +
    `last punch: contact ${stats.lastContactT == null ? '—' : stats.lastContactT.toFixed(2) + 's'}  closest ${stats.lastMinDist ?? '—'}m\n` +
    `head  ${h.x.toFixed(2)} ${h.y.toFixed(2)} ${h.z.toFixed(2)}   handL ${f.x.toFixed(2)} ${f.y.toFixed(2)} ${f.z.toFixed(2)}\n` +
    `←/→ jab   Space+←/→ hook   P: take head punch   B: body shot   D: colliders   drag: orbit`
  renderer.render(scene, camera)
}
window.__frame = frame
function tick() { requestAnimationFrame(tick); frame(Math.min(clock.getDelta(), 0.05)) }
tick()

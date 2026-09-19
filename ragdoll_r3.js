// R2+R3: two active-ragdoll boxers (Rapier). Punches drive the glove to the opponent's head,
// contacts feed the sim (damage/stun), stun loosens the motors. Hips pinned (kinematic).
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from 'rapier'
import { PUNCH, C } from './sim/constants.js?v=2'
import { makeBoxer as makeSim, stepBoxer, punchPhase, resolveHit } from './sim/combat.js?v=2'

await RAPIER.init()
const ui = document.getElementById('ui')
const W = () => innerWidth || 800, H = () => innerHeight || 450

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(W(), H()); renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a22)
const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100)
camera.position.set(0, 1.4, 3.8)
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.1, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x334, 1.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 5, 3); scene.add(sun)
scene.add(new THREE.GridHelper(6, 12, 0x445, 0x334))
addEventListener('resize', () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) })

// ---------- source model, posed in the guard ----------
const loader = new FBXLoader()
const src = await loader.loadAsync('models/Y Bot.fbx')
let prefix = 'mixamorig'
src.traverse(o => { const m = o.name.match(/^(mixamorig\d*)Hips$/); if (m) prefix = m[1] })
{
  const clip = (await loader.loadAsync('models/Idle.fbx')).animations[0]
  clip.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  const mixer = new THREE.AnimationMixer(src); mixer.clipAction(clip).play(); mixer.update(0)
  src.updateMatrixWorld(true)
}

// ---------- physics ----------
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
const DT = 1 / 240; world.timestep = DT
const events = new RAPIER.EventQueue(true)
const colMap = new Map()   // collider handle -> { boxer, part, hand }
const M = { spine: [6, 1], neck: [4, 1], shoulder: [5, 1], elbow: [5, 1] }   // [Hz, damping ratio]
const P = {
  kMul: 1.5, cMul: 1, gc: 1,           // motors (R1 sweep)
  punchK: 900, punchD: 60, punchFmax: 400, leanMul: 0.5, hookMul: 1.5,   // R2
  armRelax: 0.15, stunRelax: 0.25, hitImpulse: 4,                          // R3
}
const boxers = []

function buildBoxer(x, facing, tint) {
  const model = SkeletonUtils.clone(src)
  model.scale.setScalar(0.01); model.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2
  model.position.x = x
  model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (tint) o.material.color = new THREE.Color(tint) } })
  scene.add(model); model.updateMatrixWorld(true)
  const bone = n => model.getObjectByName(prefix + n)
  const wpos = b => b.getWorldPosition(new THREE.Vector3())
  const bx = { model, facing, parts: [], motors: [], b: {}, sim: makeSim(x), stun: 1, arm: { L: 1, R: 1 }, idx: boxers.length }
  const group = (1 << bx.idx) << 16 | (0xffff & ~(1 << bx.idx))   // collide only with the other boxer

  function seg(name, boneA, boneB, radius, opts = {}) {
    const a = wpos(boneA), b = wpos(boneB)
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b)
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(mid.x, mid.y, mid.z)
      .setLinearDamping(2).setAngularDamping(4))
    const dir = b.clone().sub(a).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const cap = world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2 - radius), radius)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setDensity(opts.density || 900)
      .setCollisionGroups(group).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), rb)
    colMap.set(cap.handle, { boxer: bx, part: opts.part || name })
    const p = { name, body: rb, bone: boneA,
      offset: new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z).multiply(boneA.matrixWorld) }
    if (opts.glove) {
      const g = b.clone().sub(mid); p.gloveLocal = g
      const gc = world.createCollider(RAPIER.ColliderDesc.ball(opts.glove).setTranslation(g.x, g.y, g.z)
        .setCollisionGroups(group).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), rb)
      colMap.set(gc.handle, { boxer: bx, part: 'glove', hand: opts.hand })
    }
    bx.parts.push(p); bx.b[name] = rb
    return rb
  }
  const hp = wpos(bone('Hips'))
  bx.hipsLocal = hp.x - x
  bx.hipsY = hp.y
  bx.hips = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hp.x, hp.y, hp.z))
  seg('torso', bone('Spine1'), bone('Neck'), 0.13, { density: 1400 })
  seg('head', bone('Head'), bone('HeadTop_End'), 0.10, { density: 1000 })
  seg('upperL', bone('LeftArm'), bone('LeftForeArm'), 0.05, { part: 'arm' })
  seg('foreL', bone('LeftForeArm'), bone('LeftHand'), 0.045, { glove: 0.07, hand: 'L', part: 'arm' })
  seg('upperR', bone('RightArm'), bone('RightForeArm'), 0.05, { part: 'arm' })
  seg('foreR', bone('RightForeArm'), bone('RightHand'), 0.045, { glove: 0.07, hand: 'R', part: 'arm' })

  function ball(bodyA, bodyB, at, [f, zeta], arm) {
    const ta = bodyA.translation(), tb = bodyB.translation()
    const j = world.createImpulseJoint(RAPIER.JointData.spherical(
      { x: at.x - ta.x, y: at.y - ta.y, z: at.z - ta.z }, { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z }), bodyA, bodyB, true)
    j.setContactsEnabled(false)
    const pi = bodyB.principalInertia()
    bx.motors.push({ body: bodyB, parent: bodyA, f, zeta, I: (pi.x + pi.y + pi.z) / 3, arm,
      pivot: { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z }, load: [bodyB] })
  }
  const b = bx.b
  ball(bx.hips, b.torso, wpos(bone('Spine1')), M.spine)
  ball(b.torso, b.head, wpos(bone('Neck')), M.neck)
  ball(b.torso, b.upperL, wpos(bone('LeftArm')), M.shoulder, 'L')
  ball(b.upperL, b.foreL, wpos(bone('LeftForeArm')), M.elbow, 'L')
  ball(b.torso, b.upperR, wpos(bone('RightArm')), M.shoulder, 'R')
  ball(b.upperR, b.foreR, wpos(bone('RightForeArm')), M.elbow, 'R')
  for (const m of bx.motors) {
    const stack = bx.motors.filter(o => o.parent === m.body)
    while (stack.length) { const o = stack.pop(); m.load.push(o.body); stack.push(...bx.motors.filter(x => x.parent === o.body)) }
  }
  boxers.push(bx)
  return bx
}
const A = buildBoxer(-0.9, 1, null)
const B = buildBoxer(0.9, -1, 0xff7777)

// ---------- motors (R1) ----------
const qp = new THREE.Quaternion(), qb = new THREE.Quaternion(), qe = new THREE.Quaternion()
const axis = new THREE.Vector3(), pv = new THREE.Vector3(), cv = new THREE.Vector3(), gcv = new THREE.Vector3()
function applyMotors(bx, dt) {
  for (const m of bx.motors) {
    const rp = m.parent.rotation(), rb = m.body.rotation()
    qp.set(rp.x, rp.y, rp.z, rp.w); qb.set(rb.x, rb.y, rb.z, rb.w)
    qe.copy(qp).multiply(qb.clone().invert())
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w)
    const angle = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(0, 1 - qe.w * qe.w))
    if (sn > 1e-6) axis.set(qe.x / sn, qe.y / sn, qe.z / sn); else axis.set(0, 0, 0)
    const wb = m.body.angvel(), wp = m.parent.angvel()
    const relax = bx.stun * (m.arm ? bx.arm[m.arm] : 1)
    const w0 = 2 * Math.PI * m.f * P.kMul * Math.sqrt(relax)
    const k = m.I * w0 * w0
    const c = Math.min(m.I * 2 * m.zeta * P.cMul * w0, 0.5 * m.I / dt)
    const t = { x: (k * angle * axis.x - c * (wb.x - wp.x)) * dt, y: (k * angle * axis.y - c * (wb.y - wp.y)) * dt, z: (k * angle * axis.z - c * (wb.z - wp.z)) * dt }
    m.body.applyTorqueImpulse(t, true)
    if (m.parent.bodyType() === RAPIER.RigidBodyType.Dynamic) m.parent.applyTorqueImpulse({ x: -t.x, y: -t.y, z: -t.z }, true)
    const tb = m.body.translation()
    pv.set(m.pivot.x, m.pivot.y, m.pivot.z).applyQuaternion(qb).add(tb)
    gcv.set(0, 0, 0)
    for (const b of m.load) { const c = b.translation(); cv.set(c.x - pv.x, c.y - pv.y, c.z - pv.z); gcv.x -= cv.z * b.mass() * 9.81; gcv.z += cv.x * b.mass() * 9.81 }
    m.body.applyTorqueImpulse({ x: gcv.x * P.gc * relax * dt, y: 0, z: gcv.z * P.gc * relax * dt }, true)
  }
}

// ---------- punch drive (R2) ----------
const gv = new THREE.Vector3(), tv = new THREE.Vector3(), fv = new THREE.Vector3()
function drivePunch(bx, opp, dt) {
  const s = bx.sim, ph = punchPhase(s)
  const hand = s.punchHand
  bx.arm.L = bx.arm.R = 1
  if (s.state !== 'punch') return
  bx.arm[hand] = ph === 'recovery' ? 1 : P.armRelax          // let the arm go during windup/live
  if (ph !== 'live') return
  const fore = hand === 'R' ? bx.b.foreR : bx.b.foreL
  const part = bx.parts.find(p => p.body === fore)
  const t = fore.translation(), r = fore.rotation()
  gv.copy(part.gloveLocal).applyQuaternion(qb.set(r.x, r.y, r.z, r.w)).add(tv.set(t.x, t.y, t.z))
  const h = opp.b.head.translation()
  tv.set(h.x, h.y, h.z)
  const p = PUNCH[s.punch], f = s.punchT
  const prog = (s.stateTime - p.windup * f) / (p.live * f)
  if (s.punch === 'hook') tv.z += (hand === 'L' ? 1 : -1) * bx.facing * 0.3 * (1 - prog)   // arc in from the side
  const vel = fore.linvel()
  fv.subVectors(tv, gv).multiplyScalar(P.punchK).sub(cv.set(vel.x, vel.y, vel.z).multiplyScalar(P.punchD))
  const fmax = P.punchFmax * (s.punch === 'hook' ? P.hookMul : 1)
  if (fv.length() > fmax) fv.setLength(fmax)
  fore.applyImpulse({ x: fv.x * dt, y: fv.y * dt, z: fv.z * dt }, true)
  bx.b.torso.applyImpulse({ x: fv.x * P.leanMul * dt, y: 0, z: fv.z * P.leanMul * dt }, true)   // lean in
}

// ---------- contact → hit (R3) ----------
let lastHit = ''
function onContact(h1, h2) {
  const a = colMap.get(h1), b = colMap.get(h2)
  if (!a || !b || a.boxer === b.boxer) return
  for (const [g, t] of [[a, b], [b, a]]) {
    if (g.part !== 'glove' || (t.part !== 'head' && t.part !== 'torso')) continue
    const s = g.boxer.sim
    if (s.state !== 'punch' || s.hitApplied || punchPhase(s) === 'windup' || g.hand !== s.punchHand) continue
    const target = t.part === 'head' ? 'head' : 'body'
    const r = resolveHit(s, t.boxer.sim, target)
    if (r.missed) continue
    const J = r.dmg * P.hitImpulse * (r.blocked ? 0.3 : 1)
    const body = target === 'head' ? t.boxer.b.head : t.boxer.b.torso
    body.applyImpulse({ x: g.boxer.facing * J, y: J * 0.15, z: 0 }, true)
    lastHit = `${g.boxer.idx === 0 ? 'A' : 'B'} ${s.punch}${s.punchHand} → ${target} ${r.dmg.toFixed(1)}${r.blocked ? ' (blocked)' : ''}${r.counter ? ' COUNTER' : ''}`
  }
}

// ---------- bone follow ----------
const bm = new THREE.Matrix4(), pm = new THREE.Matrix4(), lm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tvv = new THREE.Vector3()
function syncBones(bx) {
  bx.model.position.x = bx.sim.x
  for (const p of bx.parts) {
    const t = p.body.translation(), r = p.body.rotation()
    bm.compose(tvv.set(t.x, t.y, t.z), tq.set(r.x, r.y, r.z, r.w), ts.set(1, 1, 1)).multiply(p.offset)
    p.bone.parent.updateWorldMatrix(true, false)
    pm.copy(p.bone.parent.matrixWorld).invert()
    lm.multiplyMatrices(pm, bm).decompose(tvv, tq, ts)
    p.bone.position.copy(tvv); p.bone.quaternion.copy(tq)
  }
  bx.model.updateMatrixWorld(true)
}

// ---------- input ----------
const keys = {}; let queued = null
addEventListener('keydown', e => {
  if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
  if (e.repeat) return
  keys[e.key.toLowerCase()] = true
  if (e.key === 'ArrowLeft') queued = { punch: keys[' '] ? 'hook' : 'jab', hand: 'L' }
  if (e.key === 'ArrowRight') queued = { punch: keys[' '] ? 'hook' : 'jab', hand: 'R' }
})
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false })
let cpuTimer = 0
function cpuInput(dt) {   // dummy: jab when in range every 1.6s
  cpuTimer += dt
  const inRange = Math.abs(A.sim.x - B.sim.x) < 1.2
  if (cpuTimer > 1.6 && inRange && B.sim.state === 'idle') { cpuTimer = 0; return { move: 0, guard: false, lean: false, punch: 'jab', hand: Math.random() < 0.5 ? 'L' : 'R' } }
  return { move: 0, guard: false, lean: false, punch: null }
}

// ---------- loop ----------
let acc = 0
const clock = new THREE.Clock()
function frame(dt) {
  const inA = { move: (keys.d ? 1 : 0) - (keys.a ? 1 : 0), guard: !!keys.s, lean: !!keys.w, punch: queued && queued.punch, hand: queued && queued.hand }
  stepBoxer(A.sim, inA, dt); stepBoxer(B.sim, cpuInput(dt), dt); queued = null
  if (B.sim.x - A.sim.x < C.MIN_GAP) { const c = (A.sim.x + B.sim.x) / 2; A.sim.x = c - C.MIN_GAP / 2; B.sim.x = c + C.MIN_GAP / 2 }
  for (const bx of boxers) {
    bx.stun = bx.sim.state === 'hit' ? P.stunRelax : bx.sim.state === 'down' ? 0.02 : 1
    bx.hips.setNextKinematicTranslation({ x: bx.sim.x + bx.hipsLocal, y: bx.hipsY, z: 0 })
  }
  acc += dt
  while (acc >= DT) {
    applyMotors(A, DT); applyMotors(B, DT)
    drivePunch(A, B, DT); drivePunch(B, A, DT)
    world.step(events); acc -= DT
    events.drainCollisionEvents((h1, h2, started) => { if (started) onContact(h1, h2) })
  }
  syncBones(A); syncBones(B)
  const mid = (A.sim.x + B.sim.x) / 2
  controls.target.x += (mid - controls.target.x) * Math.min(1, dt * 3); controls.update()
  const st = s => `${s.state}${s.state === 'punch' ? ':' + punchPhase(s) : ''}`
  ui.textContent = `R3 two boxers   A hp ${A.sim.hp.toFixed(0)} st ${A.sim.stamina.toFixed(0)} ${st(A.sim)}   |   B hp ${B.sim.hp.toFixed(0)} ${st(B.sim)}\n` +
    `last hit: ${lastHit}\nA/D move  S guard  W lean  ←/→ jab  Space+←/→ hook   (B jabs back on its own)`
  renderer.render(scene, camera)
}
window.__frame = frame
window.__rag = { world, A, B, P, M, camera, controls, RAPIER, punchPhase }
function tick() { requestAnimationFrame(tick); frame(Math.min(clock.getDelta(), 0.05)) }
tick()

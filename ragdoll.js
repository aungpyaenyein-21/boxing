// M1: two active-ragdoll boxers (Rapier). Motors chase a hidden Mixamo-animated skeleton
// (idle loop, punch clips on punch) so the FORM is mocap; a glove force during the live phase
// makes the punch actually reach the opponent; contacts feed the sim (damage/stun).
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from 'rapier'
import { PUNCH, C } from './sim/constants.js?v=2'
import { makeBoxer as makeSim, stepBoxer, punchPhase, resolveHit } from './sim/combat.js?v=2'
import { createFx } from './fx.js?v=6'

await RAPIER.init()
const ui = document.getElementById('ui')
const W = () => innerWidth || 800, H = () => innerHeight || 450

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(W(), H()); renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf2f2f5)   // light mode
const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100)
// ¾ view from slightly above (Punchers-like): a horizontal hook is invisible from dead side-on
camera.position.set(1.9, 1.9, 3.0)
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.1, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 1.0))
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 5, 3); scene.add(sun)
scene.add(new THREE.GridHelper(6, 12, 0x9a9aa8, 0xc8c8d2))
addEventListener('resize', () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) })

// ---------- source model, posed in the guard ----------
const loader = new FBXLoader()
const src = await loader.loadAsync('models/Y Bot.fbx')
let prefix = 'mixamorig'
src.traverse(o => { const m = o.name.match(/^(mixamorig\d*)Hips$/); if (m) prefix = m[1] })
const CLIP_FILES = { idle: 'Idle', block: 'Center Block', jab: 'left jab', cross: 'Cross Punch', hookR: 'Hook Punch', hookL: 'left hook', upperL: 'left uppercut', upperR: 'right uppercut' }
const clips = {}
for (const [n, f] of Object.entries(CLIP_FILES)) {
  const c = (await loader.loadAsync('models/' + f + '.fbx')).animations[0]
  c.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  clips[n] = c
}
// keep only the strike span of the long clips (hand-extension peaks measured earlier)
clips.cross = THREE.AnimationUtils.subclip(clips.cross, 'cross', 18, 51, 30)
clips.hookR = THREE.AnimationUtils.subclip(clips.hookR, 'hookR', 18, 52, 30)   // 'right hook.fbx' (clip-led) was tried 2026-09-19 and reverted: user prefers this procedural-arc hook
// new Mixamo 'left jab' / 'left hook' (2026-09-13): strike spans measured on the target skeleton
clips.jab = THREE.AnimationUtils.subclip(clips.jab, 'jab', 4, 22, 30)      // extension peaks f10–12
clips.hookL = THREE.AnimationUtils.subclip(clips.hookL, 'hookL', 6, 30, 30) // load f8–12, swing across f14–18, settle f30
// uppercuts (2026-09-19): both takes are BODY uppercuts — the fist dips to the waist, then drives forward at belly height.
// The clip supplies the knee bend, the dip and the bent arm; drivePunch lifts the fist up through the chin.
clips.upperL = THREE.AnimationUtils.subclip(clips.upperL, 'upperL', 16, 40, 30)   // hand drops f16–24, drives f24–28, back by f40
clips.upperR = THREE.AnimationUtils.subclip(clips.upperR, 'upperR', 8, 38, 30)    // hand drops f10–16, drives f16–22, back by f38
// the two clips are different takes and stand differently (jab: feet 7cm narrower front-to-back, 15cm wider sideways).
// give the jab the hook's legs so the stance and footwork read as the same fighter.
const LEG_BONES = ['UpLeg', 'Leg', 'Foot', 'ToeBase']
function copyLegs(dst, src) {
  const scale = dst.duration / src.duration   // same motion, stretched onto the destination's timeline
  for (const st of src.tracks) {
    if (!LEG_BONES.some(b => st.name.includes(b))) continue
    const times = Float32Array.from(st.times, t => t * scale)
    const track = new st.constructor(st.name, times, st.values.slice())
    const i = dst.tracks.findIndex(t => t.name === st.name)
    if (i >= 0) dst.tracks[i] = track; else dst.tracks.push(track)
  }
  dst.resetDuration()
}
copyLegs(clips.jab, clips.hookL)
{ // pose the source in the guard (idle frame 0): physics bodies are built from this pose
  const mixer = new THREE.AnimationMixer(src); mixer.clipAction(clips.idle).play(); mixer.update(0)
  src.updateMatrixWorld(true)
}

// ---------- physics ----------
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
const DT = 1 / 480; world.timestep = DT   // 480Hz: lets the spine take real damping (c·dt < 0.5·I clamp) so the torso settles without rebounding
const events = new RAPIER.EventQueue(true)
const colMap = new Map()   // collider handle -> { boxer, part, hand }
const M = { spine: [6, 1], neck: [10, 1.3], shoulder: [5, 1], elbow: [5, 1] }   // [Hz, damping ratio] — neck stiff: the head must ride the torso, not whip
const P = {
  kMul: 1.5, cMul: 1, gc: 1,           // motors (R1 sweep)
  punchK: 1900, punchD: 110, punchFmax: 1350, leanMul: 0.35, hookMul: 1.7, // R2 — Punchers cross: extension ≈0.08s, arm locks out; hooks need more force to follow the arc
  easeLive: 0.6, easeRetract: 0.15, armLerp: 0.04,
  clipLed: { jab: true, leadhook: true, leadupper: true, upper: true }, armRelaxClip: 0.8, clipForce: 0.7, limbMode: 2, limbReact: 0.3, limbIeff: 1,   // these punches follow the Mixamo clip; force only guarantees contact                           // smoothness: target travels on an ease curve, arm stiffness blends
  armRelax: 0.35, stunRelax: 0.25, hitImpulse: 4.5,                           // R3
  lunge: 0.16, lungeJab: 0.12,                                             // hips step in during a punch (m) — Punchers cross ≈ 20–30cm (less here: the kinematic hips drag the torso)
  through: 0.26, throughClipHook: 0.3, clipDamp: 0, clipRate: 1.25, hookArc: 0.45,
  upperUnder: 0.28, upperThrough: 0.22, upperBack: 0.04, upperSplit: 0.45, upperYaw: 45, upperRange: 0.32, lungeUpperMin: 0.1, lungeUpperMax: 0.4, upperNear: 0.22, upperStepT: 0.6, upperMul: 1.3, upperUpright: 0.8, upperFollow: 0.3, upperReach: 0.38, upperRelax: 0.3,   // uppercut: under the chin by upperSplit of the drive, then straight up through it
  fxStop: 1, fxShake: 1, fxVol: 0.5,   // impact pack (fx.js): hit-stop / camera shake / sound — 0 turns one off
  kY: 2.5, dY: 40, aimSide: 0, aimLead: 1.5, holdDist: 0.1, easeCross: 0.9, hookLead: 45, hookPast: 50, hookHold: 60, hookD: 30, hookGate: 0.65, hookRmin: 0.32, hookRmax: 0.5,                 // straight-punch aim offset to the glove's own side; brake only within holdDist of the target; rear-hook sweep ease + max arc radius                                             // punch-through depth (straightens the elbow), hook side offset
  hookWind: 0.35, hookFollow: 0.5, hookYaw: 50,                            // hook: glove pulled back+out on windup, swings past the target, torso rotates more
  hookR: 0.46, hookRrear: 0.58, hookElbow: 0.8, hookSweep: [-20, 120],     // hook = glove on an arc around the shoulder; lead hook tight (elbow ~90°), rear hook wider (arm nearly straight, Punchers)
  hipsRot: 1, followLegs: 1,                                               // M2 debug toggles
  hipYaw: 22, neckBoost: 4,                                                // hip rotation on power punches; neck stiffness ×boost while punching (keeps the head behind the shoulder)
  // idle feel, measured from Punchers (records/stand.mov): bob 0.44s, hips ±5cm, head ±6cm, guard at the chin
  idleSpeed: 0.84, bobGain: 1.3, crouch: 0.05, guardK: 450, guardD: 18,
  // high guard (S), from Punchers records/guard.mov: gloves pressed together in front of the face,
  // elbows in, head tucked, slight crouch, reached in ~0.15s
  blockK: 700, blockD: 22, blockCrouch: 0.03,
  retractK: 650, retractD: 40,   // punch recovery: glove snaps back to the chin (Punchers jab retract ≈0.1s)
  unwindRelax: 1, unwindExtra: 0.3, unwindRate: 5, maxLean: 18, unwindDamp: 2.5,   // after a punch: spine STIFFER so the torso rides the hips back instead of lagging (a lagging torso reads as a shove), slow hips return
}
for (const [k, v] of new URLSearchParams(location.search)) if (k in P && typeof P[k] === 'number') P[k] = +v   // ?kMul=2&limbMode=1 … tuning from the URL
const fx = createFx(THREE, camera, P)
const boxers = []

function buildBoxer(x, facing, tint) {
  const model = SkeletonUtils.clone(src)
  model.scale.setScalar(0.01); model.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2
  model.position.x = x
  model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (tint) o.material.color = new THREE.Color(tint) } })
  scene.add(model); model.updateMatrixWorld(true)
  const bone = n => model.getObjectByName(prefix + n)
  const wpos = b => b.getWorldPosition(new THREE.Vector3())
  // hidden target skeleton: what the motors try to look like
  const tgt = SkeletonUtils.clone(src)
  tgt.scale.setScalar(0.01); tgt.rotation.y = model.rotation.y; tgt.updateMatrixWorld(true)
  const mixer = new THREE.AnimationMixer(tgt)
  const actions = {}
  for (const n of Object.keys(clips)) {
    actions[n] = mixer.clipAction(clips[n])
    if (n !== 'idle' && n !== 'block') { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true }
  }
  actions.idle.timeScale = P.idleSpeed
  actions.idle.play(); mixer.update(0); tgt.updateMatrixWorld(true)
  const tbone = n => tgt.getObjectByName(prefix + n)
  const FOLLOW = ['Hips', 'Spine', 'Spine2', 'Neck', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
  const follow = FOLLOW.map(n => ({ b: bone(n), t: tbone(n) })).filter(f => f.b && f.t)
  const hipsRestY = bone('Hips').position.y
  const hipsQ0 = bone('Hips').getWorldQuaternion(new THREE.Quaternion())
  const bx = { model, facing, parts: [], motors: [], b: {}, sim: makeSim(x), stun: 1, arm: { L: 1, R: 1 }, idx: boxers.length,
    tgt, mixer, actions, cur: 'idle', mirror: false, lungeX: 0, follow, hipsRestY, hipsQ0, hipsDelta: new THREE.Quaternion() }
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
    const p = { name, body: rb, bone: boneA, tbone: tgt.getObjectByName(boneA.name),
      q0: boneA.getWorldQuaternion(new THREE.Quaternion()),   // bone world rotation at setup (body rotation = identity then)
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
  // Rapier never refreshes a position-based kinematic body's world centre of mass: it stays where the body was CREATED.
  // Every hip turn then pivoted about that stale point and gave the spine joint a spurious velocity ω × (offset), growing as
  // the boxer walked away from its corner (the rear hook landed at f15 near the start position, late or not at all 2 m away).
  // The tiny non-colliding ball gives the body mass properties; the substep loop recomputes them (= refreshes the COM).
  world.createCollider(RAPIER.ColliderDesc.ball(0.05).setDensity(1).setCollisionGroups(0).setSensor(true), bx.hips)
  seg('torso', bone('Spine1'), bone('Neck'), 0.13, { density: 1400 })
  seg('head', bone('Head'), bone('HeadTop_End'), 0.10, { density: 1000 })
  seg('upperL', bone('LeftArm'), bone('LeftForeArm'), 0.05, { part: 'arm' })
  seg('foreL', bone('LeftForeArm'), bone('LeftHand'), 0.045, { glove: 0.07, hand: 'L', part: 'arm' })
  seg('upperR', bone('RightArm'), bone('RightForeArm'), 0.05, { part: 'arm' })
  seg('foreR', bone('RightForeArm'), bone('RightHand'), 0.045, { glove: 0.07, hand: 'R', part: 'arm' })
  for (const p of bx.parts) p.partner = bx.parts.find(o => o.name === p.name.replace(/L$/, '?').replace(/R$/, 'L').replace('?', 'R')) || p

  function ball(bodyA, bodyB, at, [f, zeta], arm, elbow = false) {
    const ta = bodyA.translation(), tb = bodyB.translation()
    const j = world.createImpulseJoint(RAPIER.JointData.spherical(
      { x: at.x - ta.x, y: at.y - ta.y, z: at.z - ta.z }, { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z }), bodyA, bodyB, true)
    j.setContactsEnabled(false)
    const pi = bodyB.principalInertia()
    const pa = bodyA.bodyType() === RAPIER.RigidBodyType.Dynamic ? bodyA.principalInertia() : null
    bx.motors.push({ body: bodyB, parent: bodyA, f, zeta, I: (pi.x + pi.y + pi.z) / 3, parentI: pa ? (pa.x + pa.y + pa.z) / 3 : Infinity, arm, elbow,
      part: bx.parts.find(p => p.body === bodyB), pparent: bx.parts.find(p => p.body === bodyA) || null,
      pivot: { x: at.x - tb.x, y: at.y - tb.y, z: at.z - tb.z }, load: [bodyB] })
  }
  const b = bx.b
  ball(bx.hips, b.torso, wpos(bone('Spine1')), M.spine)
  ball(b.torso, b.head, wpos(bone('Neck')), M.neck)
  ball(b.torso, b.upperL, wpos(bone('LeftArm')), M.shoulder, 'L')
  ball(b.upperL, b.foreL, wpos(bone('LeftForeArm')), M.elbow, 'L', true)
  ball(b.torso, b.upperR, wpos(bone('RightArm')), M.shoulder, 'R')
  ball(b.upperR, b.foreR, wpos(bone('RightForeArm')), M.elbow, 'R', true)
  for (const m of bx.motors) {
    const stack = bx.motors.filter(o => o.parent === m.body)
    while (stack.length) { const o = stack.pop(); m.load.push(o.body); stack.push(...bx.motors.filter(x => x.parent === o.body)) }
    // arm motors: the gain must move the whole limb below the joint, not just the one segment —
    // a shoulder tuned to the upper arm alone is ~1/8 as stiff once the forearm+glove hang off it (couldn't follow a hook clip)
    if (m.arm) {
      const tb = m.body.translation(), rb = m.body.rotation()
      const piv = new THREE.Vector3(m.pivot.x, m.pivot.y, m.pivot.z).applyQuaternion(new THREE.Quaternion(rb.x, rb.y, rb.z, rb.w)).add(new THREE.Vector3(tb.x, tb.y, tb.z))
      m.Ieff = m.load.reduce((sum, b) => { const pi = b.principalInertia(), c = b.translation(); return sum + (pi.x + pi.y + pi.z) / 3 + b.mass() * piv.distanceToSquared(new THREE.Vector3(c.x, c.y, c.z)) }, 0)
    }
  }
  boxers.push(bx)
  return bx
}
const SOLO = new URLSearchParams(location.search).has('solo')   // ?solo → one boxer + a target ball
const A = buildBoxer(-0.9, 1, null)
const B = SOLO ? null : buildBoxer(0.9, -1, 0xff7777)
if (B) B.actions.idle.time = clips.idle.duration * 0.37   // don't bob in unison with A

// solo target: a ball on a spring at head height, 0.95m in front of A
let ball = null, ballMesh = null, ballHits = 0
const ballHome = new THREE.Vector3(A.sim.x + 0.8, 1.5, 0)   // hook range (the duel gap is 0.6); [ ] to move it
if (SOLO) {
  ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(ballHome.x, ballHome.y, ballHome.z).setLinearDamping(3).setAngularDamping(3))
  const bc = world.createCollider(RAPIER.ColliderDesc.ball(0.12).setDensity(300).setCollisionGroups((1 << 15) << 16 | 0xffff)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), ball)
  colMap.set(bc.handle, { boxer: { idx: 99, sim: null }, part: 'ball' })
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshPhongMaterial({ color: 0xff4444 }))
  scene.add(ballMesh)
  addEventListener('keydown', e => {   // move the ball: ↑/↓ height, [ ] distance
    if (e.key === 'ArrowUp') ballHome.y += 0.05
    if (e.key === 'ArrowDown') ballHome.y -= 0.05
    if (e.key === '[') ballHome.x -= 0.05
    if (e.key === ']') ballHome.x += 0.05
  })
}
const targetHead = bx => ball ? ball.translation() : (bx === A ? B : A).b.head.translation()

const UPPER = { leadupper: true, upper: true }, QID = new THREE.Quaternion()
// ---------- motors (R1) ----------
const qp = new THREE.Quaternion(), qb = new THREE.Quaternion(), qe = new THREE.Quaternion(), qd = new THREE.Quaternion(), qpd = new THREE.Quaternion(), qi = new THREE.Quaternion()
const fwd = new THREE.Vector3(), yawQ = new THREE.Quaternion(), Y_AXIS = new THREE.Vector3(0, 1, 0)
const axis = new THREE.Vector3(), pv = new THREE.Vector3(), cv = new THREE.Vector3(), gcv = new THREE.Vector3(), dw = new THREE.Vector3()
function applyMotors(bx, dt) {
  for (const m of bx.motors) {
    const rp = m.parent.rotation(), rb = m.body.rotation()
    qp.set(rp.x, rp.y, rp.z, rp.w); qb.set(rb.x, rb.y, rb.z, rb.w)
    // desired body rotation from the target skeleton: R_des = R_boneTarget * inv(R_bone0)
    // (mirrored: read the opposite limb and reflect the delta across the boxer's sagittal plane z=0)
    const src = bx.mirror ? m.part.partner : m.part
    src.tbone.getWorldQuaternion(qd).multiply(qi.copy(src.q0).invert())
    if (bx.mirror) qd.set(-qd.x, -qd.y, qd.z, qd.w)
    if (m.pparent) {
      const ps = bx.mirror ? m.pparent.partner : m.pparent
      ps.tbone.getWorldQuaternion(qpd).multiply(qi.copy(ps.q0).invert())
      if (bx.mirror) qpd.set(-qpd.x, -qpd.y, qpd.z, qpd.w)
      qd.premultiply(qpd.invert())
    } else {   // parent is the kinematic hips: use exactly the rotation we gave them
      qd.premultiply(qpd.copy(bx.hipsDelta).invert())
      // uppercut: the mocap takes are body shots that fold the torso ~45° forward; a chin uppercut drives UP, so keep most of it upright
      if (UPPER[bx.sim.punch] && bx.sim.state === 'punch') qd.slerp(QID, P.upperUpright)
    }
    // (else parent is the kinematic hips, rotation identity: desired is absolute)
    qe.copy(qp).multiply(qd).multiply(qb.clone().invert())
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w)
    const angle = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(0, 1 - qe.w * qe.w))
    if (sn > 1e-6) axis.set(qe.x / sn, qe.y / sn, qe.z / sn); else axis.set(0, 0, 0)
    const wb = m.body.angvel(), wp = m.parent.angvel()
    let relax = bx.stun * (m.arm ? (m.elbow && bx.hooking ? Math.max(bx.arm[m.arm], P.hookElbow) : bx.arm[m.arm]) : 1)
    if (m.part.name === 'head' && (bx.sim.state === 'punch' || bx.sim.guard || bx.sincePunch < 0.3)) relax *= P.neckBoost
    if (m.part.name === 'torso' && ((bx.sim.state === 'punch' && punchPhase(bx.sim) === 'recovery') || (bx.sim.state === 'idle' && bx.sincePunch < 0.25))) relax *= P.unwindRelax
    const w0 = 2 * Math.PI * m.f * P.kMul * Math.sqrt(relax)
    // limb gains (whole-arm inertia) only while that arm throws a clip-led punch: the cross / rear hook keep
    // the weak-arm + force behaviour they were tuned with (a stiff arm faithfully reproduces the Cross clip's huge windup)
    const limb = !!(m.Ieff && P.limbMode && bx.sim.state === 'punch' && bx.sim.punchHand === m.arm && P.clipLed[bx.sim.punch])
    const Ig = limb ? m.Ieff * P.limbIeff : m.I
    const k = Ig * w0 * w0
    const unwinding = m.part.name === 'torso' && ((bx.sim.state === 'punch' && punchPhase(bx.sim) === 'recovery') || (bx.sim.state === 'idle' && bx.sincePunch < 0.4))
    const c = Math.min(Ig * 2 * m.zeta * P.cMul * w0 * (unwinding ? P.unwindDamp : 1), 0.5 * Ig / dt)
    const t = { x: (k * angle * axis.x - c * (wb.x - wp.x)) * dt, y: (k * angle * axis.y - c * (wb.y - wp.y)) * dt, z: (k * angle * axis.z - c * (wb.z - wp.z)) * dt }
    // reaction on the parent: full stiffness, but only as much damping as the parent can take per step
    // (a limb's damping reacted 1:1 on the torso flips the torso's velocity → explosion)
    const cr = Math.min(c, 0.25 * m.parentI / dt)
    const tr = { x: -(k * angle * axis.x - cr * (wb.x - wp.x)) * dt, y: -(k * angle * axis.y - cr * (wb.y - wp.y)) * dt, z: -(k * angle * axis.z - cr * (wb.z - wp.z)) * dt }
    const tb = m.body.translation()
    pv.set(m.pivot.x, m.pivot.y, m.pivot.z).applyQuaternion(qb).add(tb)
    if (limb) {
      // limb motor: hand the angular impulse to the whole limb as one rigid rotation about the pivot
      // (Δω on every segment + the matching Δv = Δω × r). Dumping it all on one segment as a torque
      // either under-damps the limb (clamped to the segment's tiny inertia) or blows up.
      dw.set(t.x, t.y, t.z).divideScalar(Ig)
      for (const b of m.load) {
        const pi = b.principalInertia(), ci = b.translation()
        cv.set(ci.x - pv.x, ci.y - pv.y, ci.z - pv.z).cross(dw).negate()   // Δv = Δω × r
        b.applyTorqueImpulse({ x: dw.x * (pi.x + pi.y + pi.z) / 3, y: dw.y * (pi.x + pi.y + pi.z) / 3, z: dw.z * (pi.x + pi.y + pi.z) / 3 }, true)
        if (P.limbMode === 2) b.applyImpulse({ x: cv.x * b.mass(), y: cv.y * b.mass(), z: cv.z * b.mass() }, true)
      }
    } else m.body.applyTorqueImpulse(t, true)
    const rm = limb ? P.limbReact : 1
    if (m.parent.bodyType() === RAPIER.RigidBodyType.Dynamic) m.parent.applyTorqueImpulse({ x: tr.x * rm, y: tr.y * rm, z: tr.z * rm }, true)
    gcv.set(0, 0, 0)
    for (const b of m.load) { const c = b.translation(); cv.set(c.x - pv.x, c.y - pv.y, c.z - pv.z); gcv.x -= cv.z * b.mass() * 9.81; gcv.z += cv.x * b.mass() * 9.81 }
    m.body.applyTorqueImpulse({ x: gcv.x * P.gc * relax * dt, y: 0, z: gcv.z * P.gc * relax * dt }, true)
  }
}

// ---------- target animation (M1): sim state → clip on the hidden skeleton ----------
const TOTAL = t => PUNCH[t].windup + PUNCH[t].live + PUNCH[t].recovery
function playTarget(bx, name, timeScale = 1, fade = 0.06, force = false) {
  if (bx.cur === name && !force) return
  const from = bx.actions[bx.cur], to = bx.actions[name]
  to.reset(); to.timeScale = timeScale; to.fadeIn(fade).play(); from.fadeOut(fade)
  bx.cur = name
}
function syncTarget(bx, dt) {
  const s = bx.sim
  if (s.state === 'punch') { bx.sincePunch = 0; bx.lastHand = s.punchHand } else bx.sincePunch = (bx.sincePunch ?? 9) + dt
  if (s.state === 'punch') {
    let name = s.punch === 'hook' ? 'hook' + s.punchHand : s.punch === 'leadhook' ? 'hookL' : s.punch === 'leadupper' ? 'upperL' : s.punch === 'upper' ? 'upperR' : s.punch   // jab / cross / hookL / hookR / upperL / upperR
    const mirror = false                     // hookL is now the real Hook.fbx (mirroring kept as an option)
    if (bx.cur !== name || bx.mirror !== mirror) {
      bx.mirror = mirror
      // uppercuts are inside shots thrown with a bent arm, so the FEET close the distance: step in by however far the
      // target is beyond uppercut range (latched here — a target knocked away mid-punch must not drag the hips after it)
      fx.whoosh(PUNCH[s.punch].dmgHead)
      const gap = bx.facing * (targetHead(bx).x - bx.sim.x)
      bx.lungeAmt = s.punch === 'jab' ? P.lungeJab : UPPER[s.punch] ? Math.min(P.lungeUpperMax, Math.max(P.lungeUpperMin, gap - P.upperRange)) : P.lunge
      playTarget(bx, name, clips[name].duration / (TOTAL(s.punch) * s.punchT) * (P.clipLed[s.punch] ? P.clipRate : 1), 0.06, true)
    }
  } else {
    bx.mirror = false
    playTarget(bx, 'idle', 1, 0.25)   // slow fade back: a snap to the idle pose after a punch reads as a stagger
  }
  bx.mixer.update(dt); bx.tgt.updateMatrixWorld(true)
  // lunge: hips step in during windup+live, back during recovery
  let want = 0
  if (s.state === 'punch') {
    const p = PUNCH[s.punch], f = s.punchT, t = s.stateTime
    // uppercut: step, plant, THEN drive up — the step is done early (upperStepT of windup+live), not still sliding in at contact
    const tEnd = (p.windup + p.live) * f, tl = tEnd * (UPPER[s.punch] ? P.upperStepT : 1), tr = p.recovery * f   // planted from tl until the recovery starts
    const amount = bx.lungeAmt ?? P.lunge   // step jab: inches, not a lunge; uppercut: as far as the target needs
    // ease in fast, ease back out over the whole recovery + a bit: an abrupt un-wind reads as a stagger
    want = amount * (t < tl ? smooth(Math.min(1, t / tl)) : t < tEnd ? 1 : 1 - smooth(Math.min(1, (t - tEnd) / (tr + P.unwindExtra))))
  }
  bx.lungeX += (want - bx.lungeX) * Math.min(1, dt * (want > bx.lungeX ? 20 : P.unwindRate))
}

// ---------- guard: gloves at the chin (Punchers stance) ----------
const chin = new THREE.Vector3()
function driveGuard(bx, dt) {
  const s = bx.sim
  let recovering = (s.state === 'punch' && punchPhase(s) === 'recovery') || (s.state === 'idle' && bx.sincePunch < 0.2)
  if (s.state === 'punch' && (s.punch === 'hook' || s.punch === 'leadhook' || UPPER[s.punch])) {   // hooks / uppercuts follow through first, then snap back
    const p = PUNCH[s.punch], f = s.punchT
    if ((s.stateTime - (p.windup + p.live) * f) / (p.recovery * f) < (s.punch === 'leadhook' ? 0.25 : UPPER[s.punch] ? P.upperFollow : 0.4)) recovering = false
  }
  if (!recovering) bx.retractStart = null
  const h = bx.b.head.translation()
  const block = s.guard && !recovering
  const punching = s.state === 'punch' || bx.sincePunch < 0.2
  for (const hand of ['L', 'R']) {
    const isPunchHand = punching && hand === bx.lastHand
    if (isPunchHand && !recovering) continue          // the punching glove is driven by drivePunch until recovery
    const retract = isPunchHand && recovering          // then it snaps back to the chin
    // the other glove keeps its guard spring through the whole punch (Punchers: glued to the chin)
    const fore = hand === 'R' ? bx.b.foreR : bx.b.foreL
    const part = bx.parts.find(p => p.body === fore)
    const t = fore.translation(), r = fore.rotation()
    gv.copy(part.gloveLocal).applyQuaternion(qb.set(r.x, r.y, r.z, r.w)).add(tv.set(t.x, t.y, t.z))
    const side = handSide(bx, hand)   // NOT sign(gv.z): a glove that crossed the centre line must still come back to its own side
    if (block) {
      // high guard: both gloves side by side right in front of the face
      chin.set(h.x + bx.facing * 0.17, h.y + 0.02, side * 0.06)
    } else {
      // relaxed guard: lead glove a little forward of the chin, rear glove touching it
      const lead = hand === 'L'
      chin.set(h.x + bx.facing * (lead ? 0.18 : 0.10), h.y - 0.08, side * 0.10)
    }
    if (retract) {
      if (!bx.retractStart) { bx.retractStart = gv.clone(); bx.retractT = 0 }
      bx.retractT += dt
      const e = smooth(Math.min(1, bx.retractT / P.easeRetract))
      chin.lerpVectors(bx.retractStart, chin, e)
      chin.z += side * 0.10 * Math.sin(e * Math.PI)   // bulge out to the glove's own side on the way back: never brush the other glove
    }
    const vel = fore.linvel()
    const k = block ? P.blockK : retract ? P.retractK : P.guardK, d = block ? P.blockD : retract ? P.retractD : P.guardD
    fv.subVectors(chin, gv).multiplyScalar(k).sub(cv.set(vel.x, vel.y, vel.z).multiplyScalar(d))
    fore.applyImpulse({ x: fv.x * dt, y: fv.y * dt, z: fv.z * dt }, true)
  }
}

const smooth = t => t * t * (3 - 2 * t)   // smoothstep
// which side of the boxer a hand lives on: facing +x → right hand at +z, facing -x → right hand at -z
const handSide = (bx, hand) => (hand === 'R' ? 1 : -1) * bx.facing

// ---------- punch drive (R2) ----------
const gv = new THREE.Vector3(), tv = new THREE.Vector3(), fv = new THREE.Vector3(), up = new THREE.Vector3(), sv = new THREE.Vector3()
function drivePunch(bx, opp, dt) {
  const s = bx.sim, ph = punchPhase(s)
  const hand = s.punchHand
  if (s.state !== 'punch') {
    bx.hooking = false
    bx.arm.L += (1 - bx.arm.L) * Math.min(1, dt / P.armLerp); bx.arm.R += (1 - bx.arm.R) * Math.min(1, dt / P.armLerp)
    bx.liveStart = null; bx.hookEnd = null; bx.upperK = 0
    return
  }
  const lead = s.punch === 'leadhook', hook = s.punch === 'hook' || lead
  bx.hooking = lead ? 'lead' : hook ? 'rear' : UPPER[s.punch] ? 'upper' : false   // truthy → elbow motor stays stiff (arm keeps its bend)
  const p = PUNCH[s.punch], f = s.punchT
  const recProg = ph === 'recovery' ? (s.stateTime - (p.windup + p.live) * f) / (p.recovery * f) : 0
  const upper = !!UPPER[s.punch]
  const follow = ph === 'recovery' && (hook ? recProg < (lead ? 0.25 : 0.4) : upper && recProg < P.upperFollow)   // hook keeps swinging past the target (lead: less); uppercut keeps rising
  const clipLed = !!P.clipLed[s.punch]
  // clip-led: arm mostly follows the mocap. Uppercuts: the clip shapes the dip, but its drive is a belly-high body shot —
  // once the fist starts up, loosen the shoulder so the force can carry it to the chin (the elbow is held bent separately)
  const wantRelax = (ph === 'recovery' && !follow) ? 1 : clipLed ? (upper && ph !== 'windup' ? P.upperRelax : P.armRelaxClip) : P.armRelax
  bx.arm[hand] += (wantRelax - bx.arm[hand]) * Math.min(1, dt / P.armLerp)
  const lateWindup = ph === 'windup' && s.stateTime > p.windup * f * 0.7   // start driving before the table says 'live' so momentum carries over
  // clip-led hook: the clip carries its own load-up and follow-through, force only in the live phase
  if (ph !== 'live' && !lateWindup && !(hook && ph === 'windup' && !clipLed) && !(follow && (!clipLed || upper))) return
  const fore = hand === 'R' ? bx.b.foreR : bx.b.foreL
  const part = bx.parts.find(p => p.body === fore)
  const t = fore.translation(), r = fore.rotation()
  gv.copy(part.gloveLocal).applyQuaternion(qb.set(r.x, r.y, r.z, r.w)).add(tv.set(t.x, t.y, t.z))
  const h = targetHead(bx)
  const side = handSide(bx, hand)
  if (hook && ph === 'windup' && !lateWindup && !clipLed) {
    // load up: glove back and out wide (Punchers winds the hook ~0.2s)
    const sh = bx.b.torso.translation()
    tv.set(sh.x - bx.facing * (lead ? 0.05 : 0.15), sh.y + 0.15, side * P.hookWind * (lead ? 0.6 : 1))   // lead hook: small, tight load
  } else if (follow && !clipLed && !hook) {
    // overshoot: swing across to the other side and up, like a real hook that missed
    tv.set(h.x + bx.facing * 0.1, h.y + (lead ? 0.08 : 0.25), -side * P.hookFollow * (lead ? 0.5 : 1))   // lead: just past the far shoulder
  } else if (upper) {
    // uppercut: slide in UNDER the chin first, then drive straight up through it. The clip keeps the elbow bent and
    // bends the knees; this only steers the fist (a straight line from the dip to the chin would be a rising cross).
    const prog = Math.max(0, (s.stateTime - p.windup * f * 0.7) / (p.live * f))
    const e = smooth(Math.min(1, prog / P.easeLive))
    if (!bx.liveStart) bx.liveStart = gv.clone()
    const upperArm = hand === 'R' ? bx.b.upperR : bx.b.upperL, uam = bx.motors.find(m => m.body === upperArm)
    const ut = upperArm.translation(), ur = upperArm.rotation()
    sv.set(uam.pivot.x, uam.pivot.y, uam.pivot.z).applyQuaternion(qb.set(ur.x, ur.y, ur.z, ur.w)).add(cv.set(ut.x, ut.y, ut.z))   // shoulder joint
    // an uppercut is an inside shot thrown with a bent arm: it rises at ITS range (shoulder + upperReach); a target
    // beyond that gets a whiff in front of the chin, not an arm that straightens out to reach it
    const want = h.x - bx.facing * P.upperBack, lim = sv.x + bx.facing * P.upperReach
    // steer against the sideways error like the cross does: the rear fist otherwise rises along its own hip line and passes beside the chin
    const ux = bx.facing > 0 ? Math.min(want, lim) : Math.max(want, lim), uz = h.z + side * 0.04 - P.aimLead * (gv.z - h.z)
    // the rise is keyed to WHERE the fist is, not to a timer: it goes up once it is under the target (latched, so a
    // target knocked away doesn't drop it again). On a timer the rear fist was already above chin height when it
    // arrived and hit the target downward from the front. Late fallback so a whiff still rises.
    const hd = Math.hypot(gv.x - ux, gv.z - (h.z + side * 0.04))
    bx.upperK = Math.max(bx.upperK || 0, 1 - hd / P.upperNear, (e - 0.7) / 0.3)
    const rise = smooth(Math.min(1, Math.max(0, bx.upperK)))
    tv.set(ux, h.y - P.upperUnder, uz).lerpVectors(bx.liveStart, tv, Math.min(1, e / P.upperSplit))
    tv.y += (P.upperUnder + P.upperThrough) * rise
    bx.holding = false
  } else if (hook && !clipLed) {
    // hook: the glove sweeps on a circle around the shoulder (radius < arm length → elbow stays bent),
    // from out to the side, through the front, past it. The torso yaw carries it the rest of the way.
    // arc centre = the actual shoulder joint (upper-arm body + its joint anchor), so hookR is the true shoulder→glove distance
    const upper = hand === 'R' ? bx.b.upperR : bx.b.upperL
    const um = bx.motors.find(m => m.body === upper)
    const ut = upper.translation(), ur = upper.rotation()
    sv.set(um.pivot.x, um.pivot.y, um.pivot.z).applyQuaternion(qb.set(ur.x, ur.y, ur.z, ur.w)).add(cv.set(ut.x, ut.y, ut.z))
    // carrot on a circle: the target sits only hookLead° ahead of where the glove IS on the arc, so the pull stays
    // tangential. (A target that ran ahead on a timer got >90° in front — the straight line to it cut through the
    // inside of the circle, the elbow folded to r≈0.17 and the glove reached the ball slow and from behind.)
    const D = Math.PI / 180
    let ag = Math.atan2(bx.facing * (gv.x - sv.x), side * (gv.z - sv.z))     // glove's angle now (0 = out to the side, 90° = straight ahead)
    if (ag < -Math.PI / 2) ag += 2 * Math.PI                                 // unwrap: past 180° is still "further round", not back at the start
    const at = Math.atan2(bx.facing * (h.x - sv.x), side * (h.z - sv.z))     // target's angle
    const dist = Math.hypot(h.x - sv.x, h.z - sv.z)
    // kinetic chain: hips → torso → arm. The glove stays loaded behind the target's bearing until the hip rotation is
    // well under way (hookGate), then whips through. Gated on the BODY, not on reach: a target that is too far away
    // gets a natural whiff instead of an arm that waits, stuck out to the side, for a range that never comes.
    const env = bx.yawAmp ? Math.min(1, bx.lungeX / bx.yawAmp) : 1
    if (bx.hookEnd == null && env >= P.hookGate) bx.hookEnd = Math.min(at + P.hookPast * D, 165 * D)   // latched: a target knocked away must not drag the arm round after it
    const end = bx.hookEnd ?? at - P.hookHold * D
    const a = Math.min(end, Math.max(P.hookSweep[0] * D, ag) + P.hookLead * D)
    // radius = a BENT arm (elbow ≈ 100–120°, like the mocap hook). Closer targets tighten it; farther ones are reached
    // by the body, never by straightening the arm — a straight-arm swing is a slap, not a hook.
    const R = Math.min(P.hookRmax, Math.max(P.hookRmin, dist))
    tv.set(sv.x + bx.facing * R * Math.sin(a), h.y, sv.z + side * R * Math.cos(a))
    if (!bx.liveStart) bx.liveStart = gv.clone()
    bx.holding = ag >= end - 5 * D
  } else {
    // aim through the head. The glove starts out on its own shoulder line and lags the target, so steer against
    // the sideways error (aimLead) — otherwise a rear-hand punch runs parallel to the centre line and only grazes.
    // (clip-led punches keep their old aim: the clip already carries the glove to the centre line)
    tv.set(h.x + bx.facing * (clipLed && hook ? P.throughClipHook : P.through), h.y, clipLed ? h.z + side * 0.12 : h.z + side * P.aimSide - P.aimLead * (gv.z - h.z))
    const prog = Math.max(0, (s.stateTime - p.windup * f * 0.7) / (p.live * f))
    // ease the target out from the glove's start point so the force ramps instead of slamming
    if (!bx.liveStart) bx.liveStart = gv.clone()
    const e = smooth(Math.min(1, prog / (clipLed ? P.easeLive : P.easeCross)))
    const left = gv.distanceTo(tv)   // distance still to go to the final target
    const ty = tv.y
    tv.lerpVectors(bx.liveStart, tv, e)
    tv.y = ty   // height is NOT eased: the glove must be on the target's level before it gets there, not rise into it from below
    bx.holding = e >= 1 && left < P.holdDist   // brake only once the glove is nearly there — braking early made it arrive slow
  }
  const vel = fore.linvel()
  // extra damping once the arm is out: no bounce at full extension. The rear hook's sweep gets its own, lighter damping —
  // with punchD the glove's top speed is K·lead/D ≈ 7 m/s no matter how hard it is pulled
  const sweeping = hook && !clipLed && !follow && !(ph === 'windup' && !lateWindup)
  // (uppercut follow-through is damped: undamped, the fist overshot and the arm shot out straight overhead)
  const damp = clipLed ? (upper && follow ? P.punchD : P.clipDamp) : sweeping && !bx.holding ? P.hookD : P.punchD * (bx.holding && ph === 'live' ? 1.8 : 1)
  fv.subVectors(tv, gv).multiplyScalar(P.punchK).sub(cv.set(vel.x, vel.y, vel.z).multiplyScalar(damp))
  fv.y += (tv.y - gv.y) * P.punchK * (P.kY - 1) - vel.y * P.dY   // stiffer + damped in height: punches sagged to chest level against the arm's own pose
  const fmax = P.punchFmax * (hook ? P.hookMul : upper ? P.upperMul : s.punch === 'cross' ? 1.15 : 0.85) * (clipLed ? P.clipForce : 1)
  if (fv.length() > fmax) fv.setLength(fmax)
  fore.applyImpulse({ x: fv.x * dt, y: fv.y * dt, z: fv.z * dt }, true)
  const lean = s.punch === 'jab' || upper ? P.leanMul * 0.4 : P.leanMul   // jab: head stays behind the shoulder; uppercut drives UP, the torso must not fold forward
  // lean in, but never fold: once the torso pitches past maxLean the body stops following the arm
  const tr = bx.b.torso.rotation()
  up.set(0, 1, 0).applyQuaternion(qb.set(tr.x, tr.y, tr.z, tr.w))
  const pitch = Math.acos(Math.min(1, up.y)) * 180 / Math.PI
  if (pitch < P.maxLean) bx.b.torso.applyImpulse({ x: fv.x * lean * dt, y: 0, z: fv.z * lean * dt }, true)
}

// ---------- contact → hit (R3) ----------
let lastHit = ''
function onContact(h1, h2) {
  const a = colMap.get(h1), b = colMap.get(h2)
  if (!a || !b || a.boxer === b.boxer) return
  for (const [g, t] of [[a, b], [b, a]]) {
    if (g.part === 'glove' && t.part === 'ball') {
      const s = g.boxer.sim
      if (s.state === 'punch' && !s.hitApplied && punchPhase(s) !== 'windup' && g.hand === s.punchHand) {
        s.hitApplied = true; ballHits++; s.stats.landed++
        fx.hit(PUNCH[s.punch].dmgHead * 0.8)
        lastHit = `${s.punch}${s.punchHand} hit the ball (${ballHits})`
      }
      continue
    }
    if (g.part !== 'glove' || (t.part !== 'head' && t.part !== 'torso')) continue
    const s = g.boxer.sim
    if (s.state !== 'punch' || s.hitApplied || punchPhase(s) === 'windup' || g.hand !== s.punchHand) continue
    const target = t.part === 'head' ? 'head' : 'body'
    const r = resolveHit(s, t.boxer.sim, target)
    if (r.missed) continue
    const J = r.dmg * P.hitImpulse * (r.blocked ? 0.3 : 1)
    const body = target === 'head' ? t.boxer.b.head : t.boxer.b.torso
    body.applyImpulse({ x: g.boxer.facing * J, y: J * 0.15, z: 0 }, true)
    fx.hit(r.dmg / (r.blocked ? C.GUARD_FACTOR : 1), r.blocked)
    lastHit = `${g.boxer.idx === 0 ? 'A' : 'B'} ${s.punch}${s.punchHand} → ${target} ${r.dmg.toFixed(1)}${r.blocked ? ' (blocked)' : ''}${r.counter ? ' COUNTER' : ''}`
  }
}

// ---------- bone follow ----------
const bm = new THREE.Matrix4(), pm = new THREE.Matrix4(), lm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tvv = new THREE.Vector3()
function syncBones(bx) {
  bx.model.position.x = bx.sim.x + bx.facing * bx.lungeX
  for (const f of bx.follow) {
    if (!P.followLegs) break
    if (f.b.name.endsWith('Hips')) {
      f.b.position.y = bx.hipsRestY + bx.bobY * 100   // bounce (gained) only; x/z stay with the sim
      bx.model.getWorldQuaternion(qi).invert()
      f.b.quaternion.copy(qi).multiply(bx.hipsDelta).multiply(bx.hipsQ0)   // world = hipsDelta * q0
    } else f.b.quaternion.copy(f.t.quaternion)
  }
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
  fx.unlock()   // browsers only let audio start from a user gesture
  if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
  if (e.repeat) return
  keys[e.key.toLowerCase()] = true
  if (e.key === 'ArrowLeft') queued = { punch: e.shiftKey ? 'leadupper' : keys[' '] ? 'leadhook' : 'jab', hand: 'L' }   // 5 / 3 / 1
  if (e.key === 'ArrowRight') queued = { punch: e.shiftKey ? 'upper' : keys[' '] ? 'hook' : 'cross', hand: 'R' }      // 6 / 4 / 2
})
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false })
let cpuTimer = 0
function cpuInput(dt) {   // dummy: jab when in range every 1.6s
  if (window.__forceB) { const f = window.__forceB; window.__forceB = null; return f }   // debug hook
  cpuTimer += dt
  const inRange = Math.abs(A.sim.x - B.sim.x) < 1.2
  if (cpuTimer > 1.6 && inRange && B.sim.state === 'idle') {
    cpuTimer = 0
    // hand must match the punch: jab = lead (L), cross = rear (R), hooks either side
    const picks = [['jab', 'L'], ['jab', 'L'], ['cross', 'R'], ['leadhook', 'L'], ['hook', 'R'], ['leadupper', 'L'], ['upper', 'R']]
    const pick = picks[Math.floor(Math.random() * picks.length)]
    return { move: 0, guard: false, lean: false, punch: pick[0], hand: pick[1] }
  }
  return { move: 0, guard: false, lean: false, punch: null }
}

// ---------- loop ----------
let acc = 0
const clock = new THREE.Clock()
const draw = () => { fx.apply(); renderer.render(scene, camera); fx.restore() }
function frame(dt) {
  if (fx.step(dt)) { draw(); return }   // hit-stop: the world holds still for a few frames, only the effects move
  const inA = { move: (keys.d ? 1 : 0) - (keys.a ? 1 : 0), guard: !!keys.s, lean: !!keys.w, punch: queued && queued.punch, hand: queued && queued.hand }
  stepBoxer(A.sim, inA, dt); if (B) stepBoxer(B.sim, cpuInput(dt), dt); queued = null
  if (B && B.sim.x - A.sim.x < C.MIN_GAP) { const c = (A.sim.x + B.sim.x) / 2; A.sim.x = c - C.MIN_GAP / 2; B.sim.x = c + C.MIN_GAP / 2 }
  for (const bx of boxers) {
    syncTarget(bx, dt)
    bx.stun = bx.sim.state === 'hit' ? P.stunRelax : bx.sim.state === 'down' ? 0.02 : 1
    const th = bx.follow[0].t   // target Hips
    bx.crouchT = (bx.crouchT || 0) + dt
    const crouch = P.crouch * Math.max(0, Math.sin(bx.crouchT * 0.9 + bx.idx * 2) - 0.6) / 0.4   // occasional deeper dip
    bx.bobY = (th.position.y - bx.hipsRestY) * 0.01 * P.bobGain - crouch - (bx.sim.guard ? P.blockCrouch : 0)
    const bob = bx.bobY
    const hx = bx.sim.x + bx.hipsLocal + bx.facing * bx.lungeX, hy = bx.hipsY + bob
    bx.hips.setNextKinematicTranslation({ x: hx, y: hy, z: 0 })
    // the hips are kinematic (infinite mass): when they accelerate, give every body the same Δv so the
    // upper body translates WITH the hips instead of lagging behind (a lagging torso reads as a shove)
    const vx = bx.prevHx === undefined ? 0 : (hx - bx.prevHx) / dt, vy = bx.prevHy === undefined ? 0 : (hy - bx.prevHy) / dt
    const dvx = vx - (bx.prevVx || 0), dvy = vy - (bx.prevVy || 0)
    if (Math.abs(dvx) + Math.abs(dvy) > 1e-4) for (const p of bx.parts) p.body.applyImpulse({ x: p.body.mass() * dvx, y: p.body.mass() * dvy, z: 0 }, true)
    bx.prevHx = hx; bx.prevHy = hy; bx.prevVx = vx; bx.prevVy = vy
    // hip tilt from the clip, but NOT its yaw: Mixamo clips face different directions, so the
    // yaw is meaningless. Rear-hand punches / lead hook get a procedural hip rotation instead.
    th.getWorldQuaternion(qd).multiply(qi.copy(bx.hipsQ0).invert())
    fwd.set(0, 0, 1).applyQuaternion(qd)
    yawQ.setFromAxisAngle(Y_AXIS, Math.atan2(fwd.x, fwd.z)); qd.premultiply(yawQ.invert())
    if (UPPER[bx.sim.punch] && bx.sim.state === 'punch') qd.slerp(QID, P.upperUpright)   // same for the hip tilt
    const s = bx.sim
    if (s.state === 'punch' && s.punch !== 'jab') {   // a basic jab has no hip rotation (expertboxing)
      bx.yawDir = s.punch === 'cross' || s.punchHand === 'R' ? 1 : -1
      bx.yawAmt = s.punch === 'hook' ? P.hookYaw : s.punch === 'leadhook' ? P.hookYaw * 0.8 : UPPER[s.punch] ? P.upperYaw * (s.punch === 'upper' ? 1 : 0.6) : P.hipYaw
      bx.yawAmp = bx.lungeAmt ?? P.lunge   // the hip turn rides the same envelope as this punch's own step
    } else if (s.state === 'punch') bx.yawDir = 0
    // hip rotation follows the same eased envelope as the lunge — and keeps easing after the sim
    // has already gone back to idle. Cutting it at the state change snapped the hips ~12° (read as a stagger).
    const env = bx.yawAmp ? Math.min(1, bx.lungeX / bx.yawAmp) : 0
    if (bx.yawDir) qd.premultiply(yawQ.setFromAxisAngle(Y_AXIS, bx.yawDir * env * bx.yawAmt * Math.PI / 180))
    if (!P.hipsRot) qd.identity()
    bx.hipsDelta.copy(qd)
    bx.hips.setNextKinematicRotation({ x: qd.x, y: qd.y, z: qd.z, w: qd.w })
  }
  acc += dt
  while (acc >= DT) {
    applyMotors(A, DT); if (B) applyMotors(B, DT)
    drivePunch(A, B, DT); if (B) drivePunch(B, A, DT)
    driveGuard(A, DT); if (B) driveGuard(B, DT)
    if (ball) {   // spring the ball back home
      const t = ball.translation(), v = ball.linvel()
      ball.applyImpulse({ x: ((ballHome.x - t.x) * 60 - v.x * 4) * DT, y: ((ballHome.y - t.y) * 60 - v.y * 4 + ball.mass() * 9.81) * DT, z: ((ballHome.z - t.z) * 60 - v.z * 4) * DT }, true)
    }
    for (const bx of boxers) bx.hips.recomputeMassPropertiesFromColliders()   // keep the kinematic hips' COM under the hips (see buildBoxer)
    world.step(events); acc -= DT
    events.drainCollisionEvents((h1, h2, started) => { if (started) onContact(h1, h2) })
  }
  syncBones(A); if (B) syncBones(B)
  if (ball) { const t = ball.translation(); ballMesh.position.set(t.x, t.y, t.z) }
  const mid = B ? (A.sim.x + B.sim.x) / 2 : A.sim.x + 0.5
  const dx = (mid - controls.target.x) * Math.min(1, dt * 3)
  controls.target.x += dx; camera.position.x += dx; controls.update()
  const st = s => `${s.state}${s.state === 'punch' ? ':' + punchPhase(s) : ''}`
  ui.textContent = (B
    ? `M2 legs+hips mocap   A hp ${A.sim.hp.toFixed(0)} st ${A.sim.stamina.toFixed(0)} ${st(A.sim)}   |   B hp ${B.sim.hp.toFixed(0)} ${st(B.sim)}\n`
    : `SOLO — target ball   st ${A.sim.stamina.toFixed(0)} ${st(A.sim)}   thrown ${A.sim.stats.thrown}  hit ${ballHits}\n`) +
    `last hit: ${lastHit}\nA/D move  S guard  ← jab(1)  → cross(2)  Space+← lead hook(3)  Space+→ rear hook(4)  Shift+← lead uppercut(5)  Shift+→ rear uppercut(6)` +
    (B ? `   (B punches back on its own)` : `   ↑/↓ ball height  [ ] ball distance (${(ballHome.x - A.sim.x).toFixed(2)} m)`)
  draw()
}
window.__frame = frame
window.__rag = { world, A, B, P, M, camera, controls, RAPIER, punchPhase, get ball() { return ball }, get ballHits() { return ballHits }, ballHome, clips, fx }
window.__loadClip = async f => {   // debug: load+retarget any fbx clip for scrubbing
  const c = (await loader.loadAsync('models/' + f + '.fbx')).animations[0]
  c.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  return c
}
function tick() { requestAnimationFrame(tick); const d = Math.min(clock.getDelta(), 0.05); if (!window.__pause) frame(d) }   // __pause: step with __frame() for deterministic screenshots
tick()

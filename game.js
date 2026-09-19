import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { PUNCH, C } from './sim/constants.js?v=2'
import { makeMatch, stepMatch, punchPhase } from './sim/combat.js?v=2'

const TOTAL = t => PUNCH[t].windup + PUNCH[t].live + PUNCH[t].recovery
const msg = document.getElementById('msg')

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x14141c)
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 1.7, 4.3)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

scene.add(new THREE.HemisphereLight(0xffffff, 0x334, 1.1))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.set(2, 6, 3)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
scene.add(sun)

// ring: floor + posts + ropes, nothing more
{
  const ring = new THREE.Group()
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 0.1, 7.4),
    new THREE.MeshPhongMaterial({ color: 0x2c5f8a }))
  floor.position.y = -0.05
  floor.receiveShadow = true
  ring.add(floor)
  const postMat = new THREE.MeshPhongMaterial({ color: 0xaa3333 })
  const ropeMat = new THREE.MeshPhongMaterial({ color: 0xdddddd })
  for (const px of [-3.5, 3.5]) for (const pz of [-3.5, 3.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3), postMat)
    post.position.set(px, 0.65, pz)
    ring.add(post)
  }
  for (const y of [0.5, 0.8, 1.1]) {
    for (const z of [-3.5, 3.5]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(7, 0.03, 0.03), ropeMat)
      r.position.set(0, y, z); ring.add(r)
    }
    for (const x of [-3.5, 3.5]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 7), ropeMat)
      r.position.set(x, y, 0); ring.add(r)
    }
  }
  scene.add(ring)
}

// ---------- assets ----------
const loader = new FBXLoader()
const CLIP_FILES = {
  idle: 'Idle', jabL: 'Lead Jab', jabR: 'Cross Punch', hookL: 'Hook', hookR: 'Hook Punch',
  block: 'Center Block', headHit: 'Head Hit', bodyHit: 'Hit To Body', down: 'Knocked Out',
  walkFwd: 'Short Step Forward', walkBack: 'Walking Backwards',
  headHitMed: 'medium jab Hit', headHitLight: 'light jab Hit',
}
const names = Object.keys(CLIP_FILES)
const [charFbx, ...clipFbx] = await Promise.all([
  loader.loadAsync('models/Y Bot.fbx'),
  ...names.map(n => loader.loadAsync('models/' + CLIP_FILES[n] + '.fbx')),
])

let prefix = 'mixamorig'
charFbx.traverse(o => { const m = o.name.match(/^(mixamorig\d*)Hips$/); if (m) prefix = m[1] })
const clips = {}
names.forEach((n, i) => {
  const c = clipFbx[i].animations[0]
  c.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  clips[n] = c
})
// long punch clips: keep only the span around the measured hand-extension peak
// (jabR peak t=1.15/2.0s, hookR t=1.15/2.17s, hookL t=0.9/2.27s) so timeScale stays sane
clips.jabR = THREE.AnimationUtils.subclip(clips.jabR, 'jabR', 18, 51, 30)
clips.hookR = THREE.AnimationUtils.subclip(clips.hookR, 'hookR', 18, 52, 30)
clips.hookL = THREE.AnimationUtils.subclip(clips.hookL, 'hookL', 12, 45, 30)
// walk and punch clips must not translate the root — the sim owns position.
// Keep only the vertical part of the hips track. (hit/down clips keep theirs:
// stagger and fall read better with real displacement)
for (const n of ['walkFwd', 'walkBack', 'jabL', 'jabR', 'hookL', 'hookR']) {
  const t = clips[n].tracks.find(t => t.name === prefix + 'Hips.position')
  if (t) for (let i = 3; i < t.values.length; i += 3) {
    t.values[i] = t.values[0]
    t.values[i + 2] = t.values[2]
  }
}

function makeView(x, ry, tint) {
  const obj = SkeletonUtils.clone(charFbx)
  obj.scale.setScalar(0.01)
  obj.position.x = x
  obj.rotation.y = ry
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true
      o.material = o.material.clone()
      if (tint) o.material.color = new THREE.Color(tint)
    }
  })
  scene.add(obj)
  const bones = {}
  obj.traverse(o => {
    if (o.name === prefix + 'LeftHand') bones.handL = o
    if (o.name === prefix + 'RightHand') bones.handR = o
    if (o.name === prefix + 'Head') bones.head = o
    if (o.name === prefix + 'Spine1') bones.chest = o
    if (o.name === prefix + 'Spine2') bones.spine = o
  })
  const mixer = new THREE.AnimationMixer(obj)
  const actions = {}
  for (const n of names) {
    actions[n] = mixer.clipAction(clips[n])
    if (!['idle', 'block', 'walkFwd', 'walkBack'].includes(n)) {
      actions[n].setLoop(THREE.LoopOnce)
      actions[n].clampWhenFinished = true
    }
  }
  actions.idle.play()
  return { obj, mixer, actions, bones, cur: 'idle', prevState: 'idle', prevGuard: false }
}

const viewA = makeView(-1, Math.PI / 2, null)
const viewB = makeView(1, -Math.PI / 2, 0xff7777)

// ---------- animation sync (sim leads, animation follows — doc §8) ----------
function play(view, name, timeScale = 1, fade = 0.08) {
  if (view.cur === name) return
  const from = view.actions[view.cur], to = view.actions[name]
  to.reset()
  to.timeScale = timeScale
  to.fadeIn(fade).play()
  from.fadeOut(fade)
  view.cur = name
}

function syncAnim(view, boxer, fwdSign) {
  const s = boxer.state
  if (s === 'idle') {
    const want = boxer.guard ? 'block'
      : boxer.vx * fwdSign > 0.01 ? 'walkFwd'
      : boxer.vx * fwdSign < -0.01 ? 'walkBack'
      : 'idle'
    if (view.cur !== want) play(view, want)
    view.prevState = s
    return
  }
  if (s === view.prevState) return
  if (s === 'punch') {
    // clip = punch type + hand; fatigue stretches sim time and the animation
    // follows through punchT, so tired punches simply look slow
    const name = (boxer.punch === 'jab' ? 'jab' : 'hook') + boxer.punchHand
    play(view, name, clips[name].duration / (TOTAL(boxer.punch) * boxer.punchT))
  }
  else if (s === 'hit') {
    const name = boxer.lastHitTarget === 'body' ? 'bodyHit'
      : boxer.lastHitPunch === 'jab' ? (boxer.lastHitPower > 50 ? 'headHitMed' : 'headHitLight')
      : 'headHit'
    play(view, name, 2.5)
  }
  else if (s === 'down') play(view, 'down', 1, 0.05)
  view.prevState = s
  view.prevGuard = boxer.guard
}

// ---------- hit detection: glove bone vs head/chest spheres (doc §7) ----------
const gv = new THREE.Vector3(), hv = new THREE.Vector3(), bv = new THREE.Vector3()
function hitTest3D(att, def) {
  const av = att === match.boxers[0] ? viewA : viewB
  const dv = att === match.boxers[0] ? viewB : viewA
  dv.bones.head.getWorldPosition(hv)
  dv.bones.chest.getWorldPosition(bv)
  const midY = (hv.y + bv.y) / 2
  const radius = att.punch === 'hook' ? C.HIT_RADIUS_HOOK : C.HIT_RADIUS
  for (const hand of [att.punchHand === 'R' ? av.bones.handR : av.bones.handL]) {
    hand.getWorldPosition(gv)
    if (Math.min(gv.distanceTo(hv), gv.distanceTo(bv)) < radius) {
      // jabs target the face by definition (lean dodges them); hooks land where the glove is
      return att.punch === 'jab' ? 'head' : (gv.y > midY ? 'head' : 'body')
    }
  }
  return null
}

// ---------- input ----------
const keys = {}
let queued = null
addEventListener('keydown', e => {
  if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
  if (e.repeat) return
  const k = e.key.toLowerCase()
  keys[k] = true
  if (e.key === 'ArrowLeft') queued = { punch: keys[' '] ? 'hook' : 'jab', hand: 'L' }
  if (e.key === 'ArrowRight') queued = { punch: keys[' '] ? 'hook' : 'jab', hand: 'R' }
  if (k === 'r' && match.phase === 'over') restart()
})
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false })

let match = makeMatch()
window.__match = match  // ponytail: debug hook, strip before ship
function restart() {
  match = makeMatch()
  window.__match = match
  for (const v of [viewA, viewB]) { v.prevState = 'idle'; v.prevGuard = false; play(v, 'idle') }
}

// ---------- HUD at 10Hz (doc §10) ----------
const $ = s => document.querySelector(s)
const bars = {
  hpA: $('#hudA .hp div'), stA: $('#hudA .st div'),
  hpB: $('#hudB .hp div'), stB: $('#hudB .st div'),
}
setInterval(() => {
  const [a, b] = match.boxers
  bars.hpA.style.width = Math.max(0, a.hp) + '%'
  bars.stA.style.width = Math.max(0, a.stamina) + '%'
  bars.hpB.style.width = Math.max(0, b.hp) + '%'
  bars.stB.style.width = Math.max(0, b.stamina) + '%'
  $('#round').textContent = 'ROUND ' + match.round + '/' + C.ROUNDS
  $('#clock').textContent = match.phase === 'fighting' ? Math.ceil(match.clock) : ''
  if (match.phase === 'over') {
    msg.textContent = match.byKO
      ? (match.winner === 0 ? 'KO — YOU WIN!' : 'KO — CPU WINS')
      : match.winner === null ? 'DRAW' : (match.winner === 0 ? 'YOU WIN (decision)' : 'CPU WINS (decision)')
  } else if (match.phase === 'rest') {
    msg.textContent = 'REST'
  } else {
    const downed = match.boxers.find(x => x.state === 'down')
    msg.textContent = downed ? Math.ceil(C.COUNT_SECONDS - downed.stateTime) + '…' : ''
  }
}, 100)

// ---------- main loop ----------
const dummy = { move: 0, guard: false, lean: false, punch: null }
const clock = new THREE.Clock()
function frame(dt) {
  const inA = {
    move: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
    guard: !!keys.s, lean: !!keys.w,
    punch: queued && queued.punch, hand: queued && queued.hand,
  }
  stepMatch(match, inA, dummy, dt, hitTest3D)
  queued = null
  const [a, b] = match.boxers
  syncAnim(viewA, a, 1); syncAnim(viewB, b, -1)
  viewA.mixer.update(dt); viewB.mixer.update(dt)
  // post-pose tweaks, applied after the mixer each frame:
  for (const [v, x] of [[viewA, a], [viewB, b]]) {
    // lean tilts the upper spine back — moves the real head out of range
    if (x.lean && v.bones.spine) v.bones.spine.rotation.x -= 1.0
    v.obj.position.x = x.x
  }
  // follow camera: track the midpoint, zoom with the gap (doc §9)
  if (window.__freeCam) { renderer.render(scene, camera); return }  // ponytail: debug, strip before ship
  const mid = (a.x + b.x) / 2
  const spread = Math.abs(a.x - b.x)
  const k = Math.min(1, dt * 3)
  camera.position.x += (mid - camera.position.x) * k
  camera.position.z += (2.8 + spread * 0.8 - camera.position.z) * Math.min(1, dt * 2)
  camera.position.y += (1.55 + spread * 0.06 - camera.position.y) * Math.min(1, dt * 2)
  camera.lookAt(mid, 1.15, 0)
  renderer.render(scene, camera)
}
function tick() {
  requestAnimationFrame(tick)
  frame(Math.min(clock.getDelta(), 0.05))
}
window.__frame = frame  // ponytail: debug hooks (headless testing/AI tuning), strip before ship
window.__views = { viewA, viewB }
window.__cam = camera
window.__loadClip = async f => {   // load+retarget any fbx clip, for scrubbing/classification
  const c = (await loader.loadAsync('models/' + f + '.fbx')).animations[0]
  c.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix) })
  return c
}
msg.textContent = ''
tick()

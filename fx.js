// Impact pack: what makes a landed punch FEEL like one. Nothing here touches the physics —
//   hit-stop   the world holds still for a few frames on contact (longer for harder shots)
//   shake      decaying camera jolt, added just around the render so OrbitControls never sees it
//   sound      synthesized (no assets): noise crack + low body thump, a quiet whoosh when a punch is thrown
// power is sim damage (≈4 light jab … 16 rear hook). Knobs live in P so they tune from the URL: fxStop / fxShake / fxVol (0 = off).
// No visual flash of any kind: a burst at the glove and a blink on the victim were both tried and the user wanted neither.

export function createFx(THREE, camera, P) {
  let stop = 0, shakeAmp = 0, shakeT = 0, actx = null, master = null
  const offset = new THREE.Vector3()

  // ---- sound ----
  function unlock() {   // browsers only start audio from a user gesture: call this from a keydown
    if (actx) { if (actx.state === 'suspended') actx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    actx = new AC(); master = actx.createGain(); master.connect(actx.destination)
  }
  function noise(len, shape) {
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * shape(i / d.length)
    const src = actx.createBufferSource(); src.buffer = buf; return src
  }
  function sfxHit(power, blocked) {
    if (!actx || !P.fxVol) return
    const t = actx.currentTime, k = Math.min(1, power / 16)
    master.gain.value = P.fxVol
    const crack = noise(0.11, x => Math.pow(1 - x, 3)), lp = actx.createBiquadFilter(), cg = actx.createGain()
    lp.type = 'lowpass'; lp.frequency.value = blocked ? 450 : 1100 + 2600 * k; lp.Q.value = 0.8
    cg.gain.value = (blocked ? 0.35 : 0.5 + 0.5 * k)
    crack.connect(lp).connect(cg).connect(master); crack.start(t)
    const o = actx.createOscillator(), og = actx.createGain()   // the thud you feel more than hear
    o.type = 'sine'; o.frequency.setValueAtTime(blocked ? 110 : 150 + 40 * k, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13)
    og.gain.setValueAtTime((blocked ? 0.5 : 0.7 + 0.5 * k), t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    o.connect(og).connect(master); o.start(t); o.stop(t + 0.2)
  }
  function whoosh(power) {
    if (!actx || !P.fxVol) return
    const t = actx.currentTime, k = Math.min(1, power / 16), len = 0.16 + 0.08 * k
    master.gain.value = P.fxVol
    const n = noise(len, x => Math.sin(Math.PI * x) ** 2), bp = actx.createBiquadFilter(), g = actx.createGain()
    bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1600 + 900 * k, t + len)
    g.gain.value = 0.10 + 0.10 * k
    n.connect(bp).connect(g).connect(master); n.start(t)
  }

  // ---- the one call the game makes when a glove lands ----
  function hit(power, blocked = false) {
    const k = Math.min(1, power / 16) * (blocked ? 0.5 : 1)
    stop = Math.max(stop, P.fxStop * (0.02 + 0.085 * k))                 // ≈35 ms jab … 105 ms rear hook
    shakeAmp = Math.max(shakeAmp, P.fxShake * (0.012 + 0.06 * k)); shakeT = 0
    sfxHit(power, blocked)
  }

  // advance the shake; returns true while the hit-stop holds the world (caller skips its simulation step, still draws)
  function step(dt) {
    shakeT += dt; shakeAmp *= Math.exp(-dt / 0.07)
    if (shakeAmp < 0.0005) shakeAmp = 0
    if (stop > 0) { stop -= dt; return true }
    return false
  }
  function apply() {   // call right before render
    if (!shakeAmp) { offset.set(0, 0, 0); return }
    offset.set(Math.sin(shakeT * 97) + Math.sin(shakeT * 41.3), Math.sin(shakeT * 83 + 1.7) + Math.sin(shakeT * 37.1), 0).multiplyScalar(shakeAmp * 0.5).applyQuaternion(camera.quaternion)
    camera.position.add(offset)
  }
  function restore() { camera.position.sub(offset) }   // …and right after, so controls / follow-cam never see the jolt

  return { unlock, hit, whoosh, step, apply, restore, get frozen() { return stop > 0 }, get audio() { return actx ? actx.state : 'locked' } }
}

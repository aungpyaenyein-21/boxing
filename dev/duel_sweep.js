// duel mode, passive opponent: hit rate / damage / when it lands, per punch and per gap between the boxers
//   (await import('/dev/duel_sweep.js')).run([0.6, 0.7, 0.8, 0.9], 3)
import * as THREE from 'three'
const KEYS = { jab: ['ArrowLeft', 0], cross: ['ArrowRight', 0], leadhook: ['ArrowLeft', 1], hook: ['ArrowRight', 1], leadupper: ['ArrowLeft', 2], upper: ['ArrowRight', 2] }
export function run(gaps = [0.6, 0.7, 0.8, 0.9], n = 3, names = Object.keys(KEYS)) {
  const R = window.__rag, A = R.A, B = R.B, dt = 1 / 60
  const kd = (k, sh) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, shiftKey: !!sh }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  const step = () => { window.__forceB = { move: 0, guard: false, lean: false, punch: null }; window.__frame(dt) }
  const out = {}; let nan = false, spikes = 0
  for (const gap of gaps) {
    A.sim.x = -gap / 2; B.sim.x = gap / 2
    for (let i = 0; i < 120; i++) step()
    const row = {}
    for (const name of names) {
      const [arrow, mod] = KEYS[name]; const res = []
      for (let k = 0; k < n; k++) {
        if (R.match) Object.assign(R.match, { clock: 90, phase: 'fighting' })   // the bell must not ring mid-measurement
        A.sim.stamina = 100; A.sim.hp = 100; B.sim.hp = 100; A.sim.x = -gap / 2; B.sim.x = gap / 2
        for (let i = 0; i < 90; i++) step()
        const hp0 = B.sim.hp; let when = null
        if (mod === 1) kd(' '); kd(arrow, mod === 2)
        for (let i = 0; i < 50; i++) {
          step(); if (i === 2) { ku(arrow); ku(' ') }
          if (when == null && B.sim.hp < hp0) when = i + (A.sim.state === 'punch' ? R.punchPhase(A.sim)[0] : '-')
          for (const bx of [A, B]) for (const p of bx.parts) { const v = p.body.linvel(), m = Math.hypot(v.x, v.y, v.z); if (!isFinite(m)) nan = true; if (m > 30) spikes++ }
        }
        res.push(when == null ? 'miss' : `${(hp0 - B.sim.hp).toFixed(0)}@${when}`)
      }
      row[name] = res.join(' ')
    }
    out['gap ' + gap] = row
  }
  out.nan = nan; out.spikeFrames = spikes
  return out
}

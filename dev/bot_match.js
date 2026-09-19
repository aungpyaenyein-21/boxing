// a scripted "player" fights the real AI through a whole match, fast-forward.  const m = await import('/dev/bot_match.js'); m.start({ guard: 0.5 }); m.step(3000)
//   guard: chance per AI punch that the bot raises its guard in time (0 = never defends)
let S = null
export function start({ guard = 0, seed = 12345 } = {}) {
  const R = window.__rag
  window.__pause = true
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR' }))   // rematch → clean state
  S = { t: 0, next: 0.8, log: [], nan: false, phase: R.match.phase, maxV: 0, guardFrames: 0, frames: 0, seed, guard, seen: -1, guardUntil: 0, rel: 0, relKey: null }
  return 'started'
}
export function step(n = 3000) {
  const R = window.__rag, A = R.A, B = R.B, dt = 1 / 60, b = S
  const rnd = () => (b.seed = (b.seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const kd = (k, sh) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, shiftKey: !!sh }))
  const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
  for (let i = 0; i < n && !(R.match.phase === 'over' && b.t > b.overAt + 12); i++) {
    const gap = B.sim.x - A.sim.x; b.t += dt
    if (B.sim.stats.thrown !== b.seen) { b.seen = B.sim.stats.thrown; if (rnd() < b.guard) b.guardUntil = b.t + 0.5 }
    if (b.t < b.guardUntil) kd('s'); else ku('s')
    if (A.sim.state === 'idle' && b.t >= b.guardUntil) {
      if (gap > 0.85) kd('d'); else ku('d')
      if (b.t > b.next && gap < 0.95) {
        b.next = b.t + 0.35 + rnd() * 0.9
        const p = [['ArrowLeft', 0], ['ArrowRight', 0], ['ArrowLeft', 1], ['ArrowRight', 1], ['ArrowLeft', 2], ['ArrowRight', 2]][Math.floor(rnd() * 6)]
        if (p[1] === 1) kd(' '); kd(p[0], p[1] === 2); b.rel = 3; b.relKey = p[0]
      }
    }
    if (b.rel > 0 && --b.rel === 0) { ku(b.relKey); ku(' ') }
    window.__frame(dt); b.frames++
    if (B.sim.guard) b.guardFrames++
    if (R.match.phase !== b.phase) {
      b.phase = R.match.phase; if (b.phase === 'over') b.overAt = b.t
      b.log.push(`t${b.t.toFixed(0)}s → ${b.phase} r${R.match.round} | hp A ${A.sim.hp.toFixed(0)} B ${B.sim.hp.toFixed(0)} | headY A ${A.b.head.translation().y.toFixed(2)} B ${B.b.head.translation().y.toFixed(2)}`)
    }
    for (const bx of [A, B]) for (const p of bx.parts) { const v = p.body.linvel(), m = Math.hypot(v.x, v.y, v.z); if (!isFinite(m)) b.nan = true; b.maxV = Math.max(b.maxV, m) }
  }
  const st = s => ({ hp: +s.hp.toFixed(0), kd: s.knockdowns, thrown: s.stats.thrown, landed: s.stats.landed, blocked: s.stats.blocked, dealt: +s.stats.dealt.toFixed(0) })
  return { t: +b.t.toFixed(0), phase: R.match.phase, round: R.match.round, clock: +R.match.clock.toFixed(0), winner: R.match.winner, byKO: R.match.byKO, A: st(A.sim), B: { ...st(B.sim), guardPct: +(100 * b.guardFrames / b.frames).toFixed(1) }, nan: b.nan, maxPartV: +b.maxV.toFixed(0), log: b.log, big: document.getElementById('big').textContent.replace(/\n/g, ' | ') }
}

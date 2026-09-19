// what does a raised guard really stop?   const g = await import('/dev/guard_test.js'); g.singles(); g.combo(['jab','cross','hook'])
const KEYS = { jab: ['ArrowLeft', 0], cross: ['ArrowRight', 0], leadhook: ['ArrowLeft', 1], hook: ['ArrowRight', 1], leadupper: ['ArrowLeft', 2], upper: ['ArrowRight', 2] }
const dt = 1 / 60
const kd = (k, sh) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, shiftKey: !!sh }))
const ku = k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k }))
function env(gap, bStamina) {
  const R = window.__rag, A = R.A, B = R.B
  const step = (guard = true) => { window.__forceB = { move: 0, guard, lean: false, punch: null }; window.__frame(dt) }
  const reset = () => { Object.assign(R.match, { clock: 90, phase: 'fighting' }); A.sim.stamina = 100; A.sim.hp = 100; B.sim.hp = 100; B.sim.stamina = bStamina; B.guardShock = 0; A.sim.x = -gap / 2; B.sim.x = gap / 2 }
  return { R, A, B, step, reset }
}
function throwPunch(e, name) {   // returns the hitLog entry this punch produced (or 'miss')
  const { R, A, step } = e, [arrow, mod] = KEYS[name], n0 = R.hitLog.length
  if (mod === 1) kd(' '); kd(arrow, mod === 2)
  for (let i = 0; i < 60; i++) { step(); if (i === 2) { ku(arrow); ku(' ') } if (A.sim.state === 'idle' && i > 5) break }
  const mine = R.hitLog.slice(n0).find(h => h.att === 0)
  return mine ? mine.block : 'miss'
}
export function singles({ gaps = [0.7, 0.85], n = 5, bStamina = 100, names = Object.keys(KEYS) } = {}) {
  const out = {}
  for (const name of names) {
    const tally = { full: 0, partial: 0, none: 0, miss: 0 }
    for (const gap of gaps) { const e = env(gap, bStamina); for (let k = 0; k < n; k++) { e.reset(); for (let i = 0; i < 70 + k * 7; i++) e.step(); tally[throwPunch(e, name)]++ } }
    const tot = gaps.length * n
    out[name] = `blocked ${Math.round(100 * tally.full / tot)}%  through-guard ${Math.round(100 * tally.partial / tot)}%  clean ${Math.round(100 * tally.none / tot)}%  miss ${Math.round(100 * tally.miss / tot)}%`
  }
  return out
}
export function combo(seq = ['jab', 'cross', 'hook'], { gap = 0.75, n = 6, bStamina = 100 } = {}) {
  const per = seq.map(() => ({ full: 0, partial: 0, none: 0, miss: 0 }))
  for (let k = 0; k < n; k++) { const e = env(gap, bStamina); e.reset(); for (let i = 0; i < 70 + k * 9; i++) e.step(); seq.forEach((p, i) => { per[i][throwPunch(e, p)]++ }) }
  return Object.fromEntries(seq.map((p, i) => [`${i + 1}.${p}`, `blocked ${per[i].full}/${n}  through ${per[i].partial}/${n}  clean ${per[i].none}/${n}  miss ${per[i].miss}/${n}`]))
}

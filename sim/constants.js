// All tuning numbers live here (design doc §6). Times in seconds, distances in meters.

export const PUNCH = {
  jab:  { windup: 0.06, live: 0.11, recovery: 0.12, dmgHead: 6.4,  dmgBody: 4.2, stamina: 6,  reach: 1.10 },  // Punchers jab: snap 0.07s, hold 0.13s, retract 0.1s
  cross: { windup: 0.08, live: 0.11, recovery: 0.21, dmgHead: 11.0, dmgBody: 7.4, stamina: 10, reach: 1.15 },  // rear straight: hip rotation + rear-foot pivot
  leadhook: { windup: 0.09, live: 0.10, recovery: 0.22, dmgHead: 13.5, dmgBody: 8.6, stamina: 12, reach: 0.90 },  // #3: compact, elbow 90°, quick return (Punchers ≈0.5s)
  hook: { windup: 0.15, live: 0.16, recovery: 0.32, dmgHead: 16.0, dmgBody: 10.5, stamina: 15, reach: 0.95 },  // #4 rear hook: big windup, wide arc, overshoot + follow-through (≈0.8s)
  leadupper: { windup: 0.10, live: 0.11, recovery: 0.22, dmgHead: 12.5, dmgBody: 8.5, stamina: 12, reach: 0.85 },  // #5 lead uppercut: short dip, drives up under the chin, elbow bent
  upper: { windup: 0.14, live: 0.13, recovery: 0.30, dmgHead: 15.0, dmgBody: 10.0, stamina: 15, reach: 0.90 },  // #6 rear uppercut: deeper knee bend + hip rotation, the inside power shot
}

export const C = {
  DAMAGE_SCALE: 0.5,     // table damage × this = hp lost. At 1.0 a fight was over in ~11 clean hits (≈20 s); rounds are 90 s for a reason
  COUNTER: 1.5,          // hitting an opponent stuck in recovery
  FATIGUE_SLOW: 1.0,     // punch duration multiplier grows to 1+this at 0 stamina — tired arms are slow arms
  GUARD_FACTOR: 0.18,    // a punch that dies on the guard: chip damage only
  GUARD_PARTIAL: 0.5,    // a punch that got through / round the guard after touching it
  GUARD_STAMINA: 7,      // defender pays this per blocked punch
  MOMENTUM_K: 0.35,      // ponytail: extra damage per m/s of forward speed, tune by feel in Phase 5
  MOVE_SPEED: 1.0,       // forward; matched to the step clips so the feet don't skate (Short Step Forward travels 0.54 m/s)
  MOVE_SPEED_BACK: 0.8,  // boxers retreat slower than they advance
  STAMINA_REGEN: 5,      // per second while idle/guarding
  HIT_TIME: 0.35,        // ponytail: stun length, tune once visible in Phase 2
  ROUNDS: 3,
  ROUND_SECONDS: 90,     // Punchers feels too short — was 45 in doc
  REST_SECONDS: 3,
  REST_HP: 24,
  COUNT_SECONDS: 6,      // fall ≈2 s + on the canvas + get up ≈2.8 s (the ragdoll layer times its clips to this)
  RISE_HP: 38,
  RISE_STAMINA: 60,      // ponytail: doc is silent, pick something punishing but playable
  MAX_KNOCKDOWNS: 3,     // three-knockdown rule
  RING_HALF: 3,
  MIN_GAP: 0.6,
  HIT_RADIUS: 0.25,      // glove-to-bone contact distance; head/body decided by glove height
  HIT_RADIUS_HOOK: 0.38, // hooks arc wide of the center-line bones, so they get more reach
}

// The ring, built from primitives — no modelling tool, no downloaded assets.
// A real 20-foot ring: 6.1 m square inside the ropes, four ropes, padded corner posts, an apron skirt.
// Ours is 6 m square so the rope line lands exactly on the sim's RING_HALF: when the AI says it is cornered,
// the ropes really are behind it.
//
// The camera lives INSIDE the ropes (cine sits at z ≈ 2.5, the rope line is at 3), so nothing crosses the view —
// the far ropes read as background, which is the shot we want.

const ROPE_Y = [0.42, 0.78, 1.14, 1.50]   // four ropes, lowest to highest
const POST_H = 1.62, POST_R = 0.055, PAD_R = 0.105
const APRON = 0.62, DECK = 0.14, SKIRT = 0.85
// red / blue corners on the fighters' ends, white on the neutral ones (the fighters move along x)
const CORNER = { '-1,-1': 0xb3202a, '-1,1': 0xb3202a, '1,-1': 0x1f4fa8, '1,1': 0x1f4fa8 }

export function buildRing(THREE, scene, { half = 3 } = {}) {
  const ring = new THREE.Group(); ring.name = 'ring'
  const mat = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 12, ...o })
  const canvasMat = mat(0x7d97bd, { shininess: 4 })          // the canvas: a real ring blue, dark enough to read against a light hall
  const deckMat = mat(0x5d6470), skirtMat = mat(0x262b36, { shininess: 30 })
  const ropeMat = mat(0xf2f0eb, { shininess: 60 }), tieMat = mat(0xe4e0d6)
  const postMat = mat(0x9aa0ab, { shininess: 70 })
  const out = half + APRON

  // ---- deck: canvas on top, a band of edging, and the skirt hanging to the floor ----
  const deck = new THREE.Mesh(new THREE.BoxGeometry(out * 2, DECK, out * 2), deckMat)
  deck.position.y = -DECK / 2; ring.add(deck)
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(out * 2 - 0.04, 0.02, out * 2 - 0.04), canvasMat)
  canvas.position.y = 0.001; ring.add(canvas)
  for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const w = ax === 'x' ? 0.02 : out * 2, d = ax === 'x' ? out * 2 : 0.02
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, SKIRT, d), skirtMat)
    skirt.position.set(ax === 'x' ? sign * out : 0, -DECK - SKIRT / 2 + 0.02, ax === 'z' ? sign * out : 0)
    ring.add(skirt)
  }

  // ---- corner posts, each in a padded cover ----
  const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  for (const [sx, sz] of corners) {
    const x = sx * half, z = sz * half
    const post = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R * 1.15, POST_H, 14), postMat)
    post.position.set(x, POST_H / 2, z); ring.add(post)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(POST_R * 1.35, 14, 10), postMat)
    cap.position.set(x, POST_H, z); ring.add(cap)
    const padH = ROPE_Y[3] + 0.14 - 0.18
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R, padH, 18), mat(CORNER[`${sx},${sz}`], { shininess: 30 }))
    pad.position.set(x, 0.18 + padH / 2, z); ring.add(pad)
  }

  // ---- ropes: a shallow sag between posts, and the vertical ties that hold the four together ----
  const rope = (a, b, y) => {
    const from = new THREE.Vector3(a[0], y, a[1]), to = new THREE.Vector3(b[0], y, b[1])
    // a quadratic curve only reaches half way to its control point, so drop the control twice the sag
    const ctrl = new THREE.Vector3((a[0] + b[0]) / 2, y - 0.07, (a[1] + b[1]) / 2)
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, ctrl, to), 14, 0.019, 8), ropeMat)
  }
  const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]
  for (const [a, b] of sides) {
    const A = [a[0] * half, a[1] * half], B = [b[0] * half, b[1] * half]
    for (const y of ROPE_Y) ring.add(rope(A, B, y))
    for (const t of [0.25, 0.5, 0.75]) {   // ties: a white strap lacing the four ropes together
      const x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t
      const tie = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(B[0] - A[0]) > 0.1 ? 0.035 : 0.06, ROPE_Y[3] - ROPE_Y[0] + 0.1, Math.abs(B[1] - A[1]) > 0.1 ? 0.035 : 0.06), tieMat)
      tie.position.set(x, (ROPE_Y[0] + ROPE_Y[3]) / 2 - 0.035, z); ring.add(tie)
    }
  }

  // ---- the hall floor the ring stands on ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0xdcdce3, { shininess: 0 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -DECK - SKIRT + 0.02; ring.add(floor)

  scene.add(ring)
  return { group: ring, half, ropeY: ROPE_Y, deckTop: 0 }
}

// Static colliders on the rope line so a body can lean or fall against the ropes instead of walking through them.
// One thin slab per side, standing from the bottom rope to just over the top one.
export function ringColliders(RAPIER, world, half, group) {
  for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const hx = ax === 'x' ? 0.03 : half + 0.1, hz = ax === 'x' ? half + 0.1 : 0.03
    const h = (ROPE_Y[3] + 0.12 - ROPE_Y[0]) / 2
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, h, hz)
      .setTranslation(ax === 'x' ? sign * half : 0, ROPE_Y[0] + h, ax === 'z' ? sign * half : 0)
      .setRestitution(0.35)          // ropes give a little and push back
      .setCollisionGroups(group))
  }
}

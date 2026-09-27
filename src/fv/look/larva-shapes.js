// The two larvae of the gravel defence, each modelled a unit long along +x (the head at +x,
// the back up, the feet down at y = -REST.foot, which is where the enemy system keeps the
// ground under a crawler's centre), with every part rigged for the shader (kit.js): the six
// legs turn at the hip and fold at the knee, the diving beetle larva's mandibles open, the
// dragonfly larva's mask unfolds.
//
// Parts: 0 the body and everything fixed to it; 1-6 the legs (front pair first, the right
// leg of a pair first); 7 a mandible; 9 the dragonfly larva's postmentum, 10 its
// prementum, 11 a palp with its hook and teeth. Segments (seg): whole numbers at the body's
// joins, -1 for none, -2 a compound eye (faceted in the shader), -3 a simple eye (glossy).

import * as THREE from "three";
import { Rig, blob, curve, loft, mixColour, smooth, tube } from "./kit.js";

export const PART = { body: 0, leg: 1, mandible: 7, postmentum: 9, prementum: 10, palp: 11 };
// How high above the ground the enemy system keeps a larva's centre, in its sizes: alive on its
// feet, and dead on its back (fv/enemies.js, "height = ground + 0.08 size"; a corpse lies at
// 0.06). The models stand on the first; a dead one's back is brought down onto the second.
export const REST = { foot: 0.08, dead: 0.06 };
// How high each back stands above the centre (the top of the plates, the wing pads), for
// laying a dead one on it.
export const BACK = { beetleLarva: 0.058, dragonflyLarva: 0.12 };
// The abdomen bends behind this point (the dead curl, the crawl's sway); the head and the
// thorax stay as they are.
export const WAIST = { beetleLarva: 0.06, dragonflyLarva: 0.06 };
// The dragonfly larva's mask: the postmentum hangs from the head at BASE and folds back to the
// elbow at ELBOW, where the prementum folds forward again under the face.
export const MASK = { base: [0.27, -0.03, 0], elbow: [0.15, -0.056, 0] };
// The middle of each compound eye (the one on the left; the right mirrors it), for the facets.
export const EYE = { dragonflyLarva: [0.33, 0.028, 0.074] };

// Where along the body's segments x lies: whole numbers at the joins, counted from the head.
function segmenter(bounds) {
  return (x) => {
    if (x > bounds[0]) return 0;
    for (let i = 0; i + 1 < bounds.length; i++) if (x <= bounds[i] && x >= bounds[i + 1]) return i + (bounds[i] - x) / (bounds[i] - bounds[i + 1]);
    return bounds.length - 1;
  };
}
// A value along x from knots [x, value], highest x first.
function profile(knots) {
  return (x) => {
    if (x >= knots[0][0]) return knots[0][1];
    for (let i = 0; i + 1 < knots.length; i++) {
      const [x0, a] = knots[i],
        [x1, b] = knots[i + 1];
      if (x <= x0 && x >= x1) {
        const t = (x0 - x) / (x0 - x1);
        return a + (b - a) * t * t * (3 - 2 * t);
      }
    }
    return knots[knots.length - 1][1];
  };
}
// The body's rings: a few along each segment, each segment a little narrower where it tucks
// under the one in front, so the joins show as grooves in the outline too.
function bodyStations(bounds, width, height, lift, { front, tail }) {
  const seg = segmenter(bounds);
  const stations = [{ x: front, w: 0, h: 0, y: lift(front) }];
  for (let i = 0; i + 1 < bounds.length; i++)
    for (const f of [0, 0.14, 0.42, 0.78, 0.97]) {
      const x = bounds[i] - f * (bounds[i] - bounds[i + 1]);
      const tuck = 0.93 + 0.07 * smooth(0, 0.3, f);
      stations.push({ x, w: width(x) * tuck, h: height(x) * tuck, y: lift(x) });
    }
  stations.push({ x: tail, w: 0, h: 0, y: lift(tail) });
  return { stations, seg };
}

// A leg through hip, trochanter, knee, ankle and claw; `paint(t)` colours it along its length.
function addLeg(rig, index, points, radii, paint, samples, radial) {
  const side = Math.sign(points[0][2]);
  const pts = curve(points, samples);
  const g = tube(pts, (t) => {
    // (Radii given at the five points, eased between them.)
    const k = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(k));
    return radii[i] + (radii[i + 1] - radii[i]) * (k - i);
  }, { radial, flat: 0.85 });
  const along = g.userData.along;
  rig.add(g, {
    part: PART.leg + index,
    pivot: points[0],
    knee: points[2],
    dress: (p, n, i) => ({ paint: paint(along[i], p, side), weight: smooth(0.44, 0.58, along[i]) }),
  });
}

// The great diving beetle larva (Dytiscus): a long spindle of a body, eleven plates on the
// back tapering to a slender tail with two fringed cerci, a broad flat head carried forward
// with a pair of huge hollow sickle mandibles, six long legs, a cluster of eyes each side.
export function beetleLarvaGeometry({ detail = 1 } = {}) {
  const radial = detail < 1 ? 10 : 16;
  const rig = new Rig();
  const bounds = [0.285, 0.19, 0.125, 0.06, 0.005, -0.05, -0.105, -0.16, -0.215, -0.275, -0.345, -0.43];
  const width = profile([
    [0.29, 0.034],
    [0.28, 0.046],
    [0.19, 0.056],
    [0.06, 0.064],
    [-0.03, 0.068],
    [-0.12, 0.063],
    [-0.21, 0.052],
    [-0.3, 0.034],
    [-0.38, 0.021],
    [-0.43, 0.013],
  ]);
  const height = (x) => width(x) * (x > 0.06 ? 0.74 : 0.7);
  const lift = (x) => 0.004 + 0.01 * smooth(0.0, 0.25, x);
  const { stations, seg } = bodyStations(bounds, width, height, lift, { front: 0.3, tail: -0.44 });
  // Dark umber plates above (dark enough to stand out from the grey-green gravel), a black
  // line down the middle of the back; paler and soft below.
  const back = [0.05, 0.031, 0.014, 1],
    under = [0.27, 0.21, 0.1, 0.2];
  rig.add(loft(stations, { radial, belly: 0.72 }), {
    dress: (p) => {
      const w = Math.max(1e-3, width(p.x));
      const up = (p.y - lift(p.x)) / (height(p.x) || 1);
      let c = mixColour(under, back, smooth(-0.35, 0.25, up));
      if (up > 0.6 && Math.abs(p.z) < w * 0.12) c = mixColour(c, [0.03, 0.02, 0.01, 1], 0.7);
      // A pale stripe along each flank where plate meets skin.
      if (Math.abs(up) < 0.16) c = mixColour(c, [0.36, 0.28, 0.14, 0.15], 0.55);
      return { paint: c, seg: seg(p.x) };
    },
  });

  // The head: flat, broad, rounded to a blunt square, with dark markings on top.
  const head = [
    { x: 0.262, w: 0, h: 0, y: 0.01 },
    { x: 0.27, w: 0.03, h: 0.022, y: 0.01 },
    { x: 0.284, w: 0.05, h: 0.03, y: 0.01 },
    { x: 0.31, w: 0.062, h: 0.034, y: 0.01 },
    { x: 0.35, w: 0.067, h: 0.034, y: 0.01 },
    { x: 0.385, w: 0.064, h: 0.03, y: 0.009 },
    { x: 0.407, w: 0.055, h: 0.024, y: 0.008 },
    { x: 0.421, w: 0.038, h: 0.016, y: 0.006 },
    { x: 0.428, w: 0, h: 0, y: 0.005 },
  ];
  rig.add(loft(head, { radial: radial + 4, belly: 0.65, square: 0.8 }), {
    dress: (p) => {
      let c = p.y > 0.012 ? [0.15, 0.1, 0.042, 1] : [0.36, 0.28, 0.14, 0.4];
      // A dark lyre on the crown, the way the real head is marked.
      const lyre = Math.abs(Math.abs(p.z) - (0.012 + (p.x - 0.29) * 0.28)) < 0.009 && p.x > 0.29 && p.x < 0.4;
      if (p.y > 0.02 && (lyre || p.x > 0.405)) c = [0.06, 0.04, 0.02, 1];
      return { paint: c };
    },
  });

  // The mandibles: long, sickle-curved, hollow (the larva sucks its prey through them), dark
  // red-brown going black at the points.
  for (const s of [1, -1]) {
    const pts = curve(
      [
        [0.4, 0.003, 0.04 * s],
        [0.438, 0.0, 0.052 * s],
        [0.476, -0.003, 0.046 * s],
        [0.503, -0.005, 0.026 * s],
        [0.515, -0.006, 0.005 * s],
      ],
      detail < 1 ? 9 : 14,
    );
    const g = tube(pts, (t) => (t < 0.999 ? 0.012 * (1 - t) ** 0.7 + 0.0008 : 0), { radial: detail < 1 ? 5 : 7, flat: 0.7 });
    const along = g.userData.along;
    rig.add(g, { part: PART.mandible, pivot: [0.405, 0.002, 0.043 * s], dress: (p, n, i) => ({ paint: mixColour([0.13, 0.055, 0.02, 1], [0.015, 0.01, 0.008, 1], smooth(0.35, 0.9, along[i])) }) });
  }

  // Feelers, ringed.
  for (const s of [1, -1]) {
    const g = tube(
      curve(
        [
          [0.4, 0.02, 0.028 * s],
          [0.438, 0.03, 0.044 * s],
          [0.47, 0.034, 0.06 * s],
          [0.492, 0.036, 0.072 * s],
        ],
        detail < 1 ? 6 : 10,
      ),
      (t) => (t < 0.999 ? 0.0042 - 0.0026 * t : 0),
      { radial: 4 },
    );
    const along = g.userData.along;
    rig.add(g, { dress: (p, n, i) => ({ paint: Math.sin(along[i] * 40) > 0.3 ? [0.1, 0.07, 0.03, 0.8] : [0.3, 0.22, 0.1, 0.6] }) });
  }

  // Six eyes each side, in two short rows at the edge of the head.
  const eyes = detail < 1 ? [[0.372, 0.02], [0.386, 0.016], [0.378, 0.006]] : [[0.366, 0.022], [0.379, 0.024], [0.392, 0.02], [0.37, 0.009], [0.383, 0.01], [0.395, 0.007]];
  for (const s of [1, -1])
    for (const [x, y] of eyes) rig.add(blob([x, y, (0.061 - (x - 0.36) * 0.3) * s], 0.0055, 0.0055, 0.004, { widthSegments: detail < 1 ? 5 : 7, heightSegments: 4 }), { dress: () => ({ paint: [0.008, 0.007, 0.006, 1], seg: -3 }) });

  // The legs: long and slender, the hind pair longest, pale and see-through with dark knees.
  const legs = [
    [[0.235, -0.03, 0.035], [0.252, -0.036, 0.062], [0.29, 0.01, 0.122], [0.33, -0.05, 0.164], [0.352, -0.08, 0.176]],
    [[0.155, -0.03, 0.04], [0.16, -0.036, 0.068], [0.172, 0.014, 0.142], [0.19, -0.05, 0.196], [0.2, -0.08, 0.216]],
    [[0.09, -0.03, 0.04], [0.084, -0.036, 0.068], [0.05, 0.016, 0.152], [0.0, -0.05, 0.204], [-0.03, -0.08, 0.226]],
  ];
  const legPaint = (t) => {
    let c = mixColour([0.3, 0.23, 0.11, 0.35], [0.42, 0.35, 0.2, 0.15], smooth(0.6, 1, t));
    if (Math.abs(t - 0.5) < 0.05) c = [0.12, 0.08, 0.035, 0.7];
    if (t > 0.94) c = [0.08, 0.05, 0.02, 0.9];
    return c;
  };
  legs.forEach((points, pair) => {
    for (const s of [1, -1])
      addLeg(
        rig,
        pair * 2 + (s > 0 ? 0 : 1),
        points.map(([x, y, z]) => [x, y, z * s]),
        [0.011, 0.009, 0.0075, 0.0055, 0.0018],
        legPaint,
        detail < 1 ? 11 : 17,
        detail < 1 ? 4 : 6,
      );
  });

  // The two cerci at the tail, and the fringe of hairs along them (a few stiff bristles).
  for (const s of [1, -1]) {
    const g = tube(
      curve(
        [
          [-0.422, 0.006, 0.006 * s],
          [-0.455, 0.01, 0.017 * s],
          [-0.485, 0.014, 0.026 * s],
          [-0.505, 0.016, 0.03 * s],
        ],
        detail < 1 ? 6 : 10,
      ),
      (t) => (t < 0.999 ? 0.0055 * (1 - 0.8 * t) : 0),
      { radial: 5 },
    );
    rig.add(g, { dress: () => ({ paint: [0.3, 0.22, 0.1, 0.5] }) });
    if (detail >= 1)
      for (let k = 0; k < 4; k++) {
        const x = -0.44 - k * 0.017;
        const b = new THREE.Vector3(x, 0.01 + k * 0.0015, (0.01 + k * 0.005) * s);
        rig.add(tube([b, b.clone().add(new THREE.Vector3(-0.012, 0.004, 0.014 * s))], (t) => (t < 0.999 ? 0.0012 : 0), { radial: 3 }), { dress: () => ({ paint: [0.35, 0.3, 0.2, 0.2] }) });
      }
  }
  return rig.build();
}

// The dragonfly larva (an aeshnid): stout and armoured. The abdomen is broad and flat, widest
// at its sixth and seventh segments, spined at the sides of the last ones and ending in the
// short anal pyramid; the wing pads lie on its back. The head is wider than the thorax, and its
// front corners are the great compound eyes: low domes, olive-brown and faceted, part of the
// head's outline rather than balls stuck on it. Under the face lies the mask, the folded lower
// lip that shoots out with a pair of toothed, hooked palps to seize prey. It is pale straw
// against the dark body, so that it shows when it strikes.
export function dragonflyLarvaGeometry({ detail = 1 } = {}) {
  const radial = detail < 1 ? 10 : 18;
  const rig = new Rig();
  // The prothorax, the wing-bearing thorax, then the ten segments of the abdomen.
  const bounds = [0.25, 0.215, 0.07, 0.035, 0.0, -0.055, -0.11, -0.165, -0.22, -0.275, -0.325, -0.375, -0.43];
  const width = profile([
    [0.255, 0.05],
    [0.245, 0.068],
    [0.215, 0.074],
    [0.17, 0.087],
    [0.1, 0.092],
    [0.06, 0.09],
    [0.0, 0.11],
    [-0.08, 0.134],
    [-0.17, 0.15],
    [-0.24, 0.146],
    [-0.3, 0.126],
    [-0.35, 0.096],
    [-0.4, 0.062],
    [-0.44, 0.03],
  ]);
  // (A deep thorax; the abdomen flatter, like a boat's hull, but not a leaf: the larva has to
  // look heavy from the side too.)
  const height = (x) => width(x) * (0.74 + 0.26 * smooth(0.02, 0.1, x));
  const lift = () => 0.008;
  const { stations, seg } = bodyStations(bounds, width, height, lift, { front: 0.258, tail: -0.44 });
  // Dark umber above, mottled in the shader; a pale line along each flank where the plates
  // meet the soft skin; straw below.
  const back = [0.042, 0.028, 0.013, 0.85],
    under = [0.26, 0.22, 0.12, 0.25];
  rig.add(loft(stations, { radial, belly: 0.72 }), {
    dress: (p) => {
      const up = (p.y - lift()) / (height(p.x) || 1);
      let c = mixColour(under, back, smooth(-0.4, 0.3, up));
      if (Math.abs(up + 0.05) < 0.14) c = mixColour(c, [0.3, 0.25, 0.13, 0.2], 0.45);
      // Paired pale spots down the back of the abdomen, as the aeshnids have.
      const s = seg(p.x);
      if (p.x < 0 && up > 0.45 && Math.abs(Math.abs(p.z) - width(p.x) * 0.35) < width(p.x) * 0.12 && s % 1 > 0.25 && s % 1 < 0.6) c = mixColour(c, [0.22, 0.19, 0.09, 0.6], 0.7);
      return { paint: c, seg: s };
    },
  });
  // Spines at the hind corners of the sixth to ninth segments, pointing back.
  for (let i = 7; i <= 10; i++) {
    const x = bounds[i + 1] + 0.004;
    const w = width(x) * 0.97;
    for (const s of [1, -1]) {
      const b = new THREE.Vector3(x + 0.012, lift(), (w - 0.004) * s);
      rig.add(tube([b, b.clone().add(new THREE.Vector3(-0.03, 0, 0.008 * s))], (t) => (t < 0.999 ? 0.007 * (1 - t) + 0.001 : 0), { radial: 4 }), { dress: () => ({ paint: [0.05, 0.04, 0.02, 0.9] }) });
    }
  }
  // The anal pyramid: the upper spine in the middle, two lower ones, two short cerci.
  const spines = [
    [[-0.425, 0.008, 0], [-0.515, 0.012, 0], 0.014],
    [[-0.425, -0.008, 0.012], [-0.505, -0.012, 0.021], 0.013],
    [[-0.425, -0.008, -0.012], [-0.505, -0.012, -0.021], 0.013],
    [[-0.425, 0.0, 0.022], [-0.468, 0.0, 0.036], 0.008],
    [[-0.425, 0.0, -0.022], [-0.468, 0.0, -0.036], 0.008],
  ];
  for (const [a, b, r] of spines) rig.add(tube([new THREE.Vector3(...a), new THREE.Vector3().lerpVectors(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.5), new THREE.Vector3(...b)], (t) => (t < 0.999 ? r * (1 - t) ** 0.8 : 0), { radial: 5 }), { dress: () => ({ paint: [0.09, 0.075, 0.035, 0.8] }) });

  // The wing pads: two pairs lying flat on the back, pointing back and a little apart,
  // dark with pale rims and veins.
  const pad = (from, to, w) => {
    const length = new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to));
    const g = loft(
      [
        { x: 0, w: 0, h: 0 },
        { x: length * 0.1, w: w * 0.7, h: 0.0045 },
        { x: length * 0.35, w, h: 0.0055 },
        { x: length * 0.75, w: w * 0.85, h: 0.005 },
        { x: length * 0.95, w: w * 0.45, h: 0.004 },
        { x: length, w: 0, h: 0 },
      ],
      { radial: detail < 1 ? 8 : 12, belly: 0.4 },
    );
    const dir = new THREE.Vector3(...from).sub(new THREE.Vector3(...to)).normalize();
    const side = dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    // (Right-handed, so the pad's faces keep their winding.)
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, up, side).setPosition(...to));
    return g;
  };
  for (const s of [1, -1]) {
    for (const [from, to, w] of [
      [[0.17, 0.094, 0.03 * s], [-0.075, 0.093, 0.074 * s], 0.03],
      [[0.19, 0.101, 0.018 * s], [-0.045, 0.1, 0.052 * s], 0.026],
    ]) {
      const a = new THREE.Vector3(...from),
        b = new THREE.Vector3(...to);
      const ab = b.clone().sub(a);
      rig.add(pad(from, to, w), {
        dress: (p) => {
          const t = p.clone().sub(a).dot(ab) / ab.lengthSq();
          const off = p.clone().sub(a).addScaledVector(ab, -t).length() / w;
          return { paint: off > 0.8 || Math.abs(off - 0.35) < 0.08 ? [0.2, 0.18, 0.09, 0.6] : [0.045, 0.04, 0.018, 1] };
        },
      });
    }
  }

  // The head: broad and flat, wider than the thorax, the face short and blunt in front.
  const head = [
    { x: 0.244, w: 0, h: 0, y: 0.012 },
    { x: 0.25, w: 0.06, h: 0.045, y: 0.012 },
    { x: 0.27, w: 0.085, h: 0.055, y: 0.012 },
    { x: 0.3, w: 0.095, h: 0.056, y: 0.012 },
    { x: 0.335, w: 0.09, h: 0.05, y: 0.011 },
    { x: 0.365, w: 0.075, h: 0.042, y: 0.01 },
    { x: 0.39, w: 0.05, h: 0.03, y: 0.008 },
    { x: 0.402, w: 0.028, h: 0.018, y: 0.006 },
    { x: 0.406, w: 0, h: 0, y: 0.006 },
  ];
  rig.add(loft(head, { radial: radial + 2, belly: 0.75, square: 0.6 }), {
    dress: (p) => {
      let c = p.y > 0.018 ? [0.07, 0.06, 0.028, 0.85] : [0.24, 0.2, 0.1, 0.35];
      // A pale band across the crown behind the eyes.
      if (p.y > 0.03 && Math.abs(p.x - 0.268) < 0.008) c = [0.2, 0.17, 0.08, 0.7];
      return { paint: c };
    },
  });
  // The compound eyes: low domes at the head's front corners, olive-brown with a darker band;
  // the shader lays the facets and the dark pseudopupil over them (seg -2).
  const [ex, ey, ez] = EYE.dragonflyLarva;
  for (const s of [1, -1])
    rig.add(blob([ex, ey, ez * s], 0.06, 0.036, 0.04, { widthSegments: detail < 1 ? 12 : 18, heightSegments: detail < 1 ? 8 : 12 }), {
      dress: (p) => {
        const band = Math.abs(p.y - ey + 0.004) < 0.008;
        return { paint: p.y < ey - 0.018 ? [0.06, 0.045, 0.022, 1] : band ? [0.05, 0.036, 0.018, 1] : [0.13, 0.095, 0.045, 1], seg: -2 };
      },
    });
  // Short feelers.
  for (const s of [1, -1]) {
    const g = tube(
      curve(
        [
          [0.392, 0.036, 0.028 * s],
          [0.422, 0.048, 0.04 * s],
          [0.448, 0.054, 0.05 * s],
        ],
        detail < 1 ? 5 : 8,
      ),
      (t) => (t < 0.999 ? 0.0038 - 0.0024 * t : 0),
      { radial: 4 },
    );
    const along = g.userData.along;
    rig.add(g, { dress: (p, n, i) => ({ paint: Math.sin(along[i] * 30) > 0.2 ? [0.07, 0.06, 0.03, 0.8] : [0.24, 0.2, 0.1, 0.6] }) });
  }

  // The mask. The postmentum: a flat bar from under the head back to the elbow between the
  // front legs.
  const [bx, by] = MASK.base,
    [hx, hy] = MASK.elbow;
  const bar = (from, to, w0, w1, h) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const g = loft(
      [
        { x: -0.004, w: 0, h: 0 },
        { x: 0, w: w0 * 0.8, h: h * 0.8 },
        { x: length * 0.5, w: (w0 + w1) * 0.5, h },
        { x: length, w: w1, h },
        { x: length + 0.006, w: 0, h: 0 },
      ],
      { radial: detail < 1 ? 8 : 12, belly: 0.8 },
    );
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], 0).normalize();
    const up = new THREE.Vector3(-dir.y, dir.x, 0);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, up, new THREE.Vector3(0, 0, 1)).setPosition(from[0], from[1], 0));
    return g;
  };
  const straw = [0.44, 0.35, 0.16, 0.3],
    tooth = [0.11, 0.045, 0.018, 1];
  rig.add(bar([hx, hy], [bx, by], 0.024, 0.018, 0.007), { part: PART.postmentum, pivot: MASK.base, dress: () => ({ paint: [0.34, 0.27, 0.12, 0.4] }) });
  // The prementum: a spoon of a plate widening toward the face, folded flush under it like a
  // visor; its front edge toothed dark.
  const plate = loft(
    [
      { x: hx - 0.004, w: 0, h: 0, y: hy - 0.006 },
      { x: hx, w: 0.018, h: 0.006, y: hy - 0.006 },
      { x: 0.2, w: 0.03, h: 0.008, y: -0.063 },
      { x: 0.26, w: 0.045, h: 0.009, y: -0.053 },
      { x: 0.32, w: 0.058, h: 0.01, y: -0.044 },
      { x: 0.36, w: 0.066, h: 0.01, y: -0.036 },
      { x: 0.382, w: 0.064, h: 0.009, y: -0.032 },
      { x: 0.394, w: 0.05, h: 0.007, y: -0.029 },
      { x: 0.398, w: 0, h: 0, y: -0.029 },
    ],
    { radial: detail < 1 ? 10 : 16, belly: 0.9, square: 0.6 },
  );
  rig.add(plate, { part: PART.prementum, pivot: MASK.elbow, dress: (p) => ({ paint: p.x > 0.386 && Math.sin(p.z * 240) > -0.3 ? tooth : straw }) });
  // The palps at its front corners: flat blades curving in to meet under the front of the
  // face (folded, they cover the mouth: the mask's own front edge), each with teeth along its
  // inner edge and a movable hook at its point, dark red-brown.
  for (const s of [1, -1]) {
    const base = [0.366, -0.035, 0.06 * s];
    const pts = curve(
      [
        base,
        [0.388, -0.031, 0.066 * s],
        [0.405, -0.027, 0.054 * s],
        [0.415, -0.025, 0.034 * s],
        [0.418, -0.024, 0.013 * s],
      ],
      detail < 1 ? 9 : 14,
    );
    const g = tube(pts, (t) => (t < 0.999 ? 0.013 * (1 - t) ** 0.5 + 0.0015 : 0), { radial: detail < 1 ? 5 : 7, flat: 0.4 });
    const along = g.userData.along;
    const blade = (t) => mixColour([0.36, 0.27, 0.12, 0.35], [0.1, 0.035, 0.015, 1], smooth(0.35, 0.75, t));
    rig.add(g, { part: PART.palp, pivot: base, dress: (p, n, i) => ({ paint: blade(along[i]) }) });
    rig.add(
      tube(curve([[0.416, -0.024, 0.017 * s], [0.421, -0.024, 0.008 * s], [0.418, -0.024, 0.002 * s]], 5), (t) => (t < 0.999 ? 0.0045 * (1 - t) + 0.0006 : 0), { radial: 4 }),
      { part: PART.palp, pivot: base, dress: () => ({ paint: tooth }) },
    );
    // Teeth on the inner edge, pointing in.
    for (const k of detail < 1 ? [0.45, 0.7] : [0.35, 0.52, 0.68, 0.82]) {
      const q = pts[Math.round(k * (pts.length - 1))].clone();
      const inward = new THREE.Vector3(0.004, 0, -0.012 * s);
      q.z -= 0.009 * s * (1 - k * 0.5);
      rig.add(tube([q, q.clone().add(inward)], (t) => (t < 0.999 ? 0.0028 * (1 - t) + 0.0004 : 0), { radial: 3 }), { part: PART.palp, pivot: base, dress: () => ({ paint: tooth }) });
    }
  }

  // The legs: long, the hind pair longest, ringed light and dark, sprawled wide so the flat
  // body lies close over the gravel.
  const legs = [
    [[0.22, -0.035, 0.045], [0.235, -0.045, 0.066], [0.275, 0.012, 0.14], [0.322, -0.05, 0.182], [0.35, -0.08, 0.192]],
    [[0.15, -0.045, 0.06], [0.152, -0.052, 0.084], [0.162, 0.02, 0.182], [0.178, -0.05, 0.24], [0.19, -0.08, 0.258]],
    [[0.085, -0.045, 0.065], [0.075, -0.052, 0.09], [0.0, 0.026, 0.2], [-0.08, -0.05, 0.258], [-0.12, -0.08, 0.274]],
  ];
  const legPaint = (t) => {
    const light = [0.24, 0.2, 0.1, 0.35],
      dark = [0.045, 0.04, 0.02, 0.7];
    // Two dark rings on the femur and one on the tibia.
    const ring = (a) => Math.abs(t - a) < 0.035;
    let c = ring(0.24) || ring(0.4) || ring(0.72) ? dark : light;
    if (Math.abs(t - 0.5) < 0.03 || t > 0.95) c = dark;
    return c;
  };
  legs.forEach((points, pair) => {
    for (const s of [1, -1])
      addLeg(
        rig,
        pair * 2 + (s > 0 ? 0 : 1),
        points.map(([x, y, z]) => [x, y, z * s]),
        [0.012, 0.0095, 0.008, 0.0058, 0.0018],
        legPaint,
        detail < 1 ? 11 : 17,
        detail < 1 ? 4 : 6,
      );
  });
  return rig.build();
}

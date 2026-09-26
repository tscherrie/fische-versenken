// Shapes for Extreme's own models, built once in a factory: bodies lofted along an axis from
// rings of ellipses, tapered tubes along curves (legs, jaws, feelers), and a rig that gathers
// the parts into one geometry with what the shader needs to move each part on its own.
//
// Every vertex carries, in one interleaved buffer (one vertex buffer however many parts):
//   paint  rgb and `hard` (1 a hard, dark, glossy plate; 0 a soft, pale, translucent skin)
//   rig    the part it belongs to, and the pivot that part turns about
//   joint  a second pivot further along a limb (a knee), and how much of the vertex follows it
//   seg    where it lies along the body's segments (whole numbers at the joins; -1 for none,
//          -2 for an eye)

import * as THREE from "three";

const STRIDE = 13;
const ZERO = [0, 0, 0];

export class Rig {
  constructor() {
    this.position = [];
    this.normal = [];
    this.data = [];
    this.index = [];
  }
  get vertices() {
    return this.position.length / 3;
  }
  // Add a part. `dress(p, n, i)` returns { paint: [r, g, b, hard], weight, seg } for each
  // vertex (in the part's final place); pivot and knee are points in the model's frame.
  add(geometry, { part = 0, pivot = ZERO, knee = ZERO, dress = () => ({}) } = {}) {
    const pos = geometry.attributes.position,
      nor = geometry.attributes.normal;
    const offset = this.vertices;
    const p = new THREE.Vector3(),
      n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      const d = dress(p, n, i) ?? {};
      const paint = d.paint ?? [0.5, 0.5, 0.5, 0.5];
      this.position.push(p.x, p.y, p.z);
      this.normal.push(n.x, n.y, n.z);
      this.data.push(paint[0], paint[1], paint[2], paint[3], part, pivot[0], pivot[1], pivot[2], knee[0], knee[1], knee[2], d.weight ?? 0, d.seg ?? -1);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) this.index.push(geometry.index.getX(i) + offset);
    else for (let i = 0; i < pos.count; i++) this.index.push(i + offset);
    geometry.dispose();
    return this;
  }
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    const data = new THREE.InterleavedBuffer(new Float32Array(this.data), STRIDE);
    geometry.setAttribute("paint", new THREE.InterleavedBufferAttribute(data, 4, 0));
    geometry.setAttribute("rig", new THREE.InterleavedBufferAttribute(data, 4, 4));
    geometry.setAttribute("joint", new THREE.InterleavedBufferAttribute(data, 4, 8));
    geometry.setAttribute("seg", new THREE.InterleavedBufferAttribute(data, 1, 12));
    geometry.setIndex(this.vertices > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// Smooth normals over an indexed grid, turned outward: `inside(p, n)` says whether a normal
// points in (checked once, on the vertex given), and then every triangle is turned round.
function finish(positions, index, probe, outward) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const n = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, probe);
  if (n.dot(outward) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry.setIndex(index);
    geometry.computeVertexNormals();
  }
  return geometry;
}

// A body along +x. Each station { x, w, h, y = 0 } is a ring: an ellipse of half-width w
// (across, z) and half-height h (up, y) about height y. `belly` < 1 flattens the underside;
// `keel` lifts the middle of the back into a ridge. A station with w = 0 at either end
// closes the body in one point there.
export function loft(stations, { radial = 16, belly = 1, keel = 0, square = 0 } = {}) {
  const positions = [],
    index = [];
  const rings = [];
  for (const s of stations) {
    if (s.w <= 0) {
      rings.push({ pole: positions.length / 3 });
      positions.push(s.x, s.y ?? 0, 0);
      continue;
    }
    const start = positions.length / 3;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      // (A squarer section: the ellipse pushed toward its bounding box.)
      const k = square > 0 ? 1 + square * (Math.pow(Math.abs(c * sn) * 2, 0.8) * 0.25) : 1;
      const up = c >= 0 ? c * (1 + keel * Math.pow(Math.abs(Math.cos(a * 1)), 12)) : c * belly;
      positions.push(s.x, (s.y ?? 0) + s.h * up * k, s.w * sn * k);
    }
    rings.push({ start });
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i],
      B = rings[i + 1];
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (A.pole !== undefined) index.push(A.pole, B.start + j1, B.start + j);
      else if (B.pole !== undefined) index.push(A.start + j, A.start + j1, B.pole);
      else index.push(A.start + j, A.start + j1, B.start + j, A.start + j1, B.start + j1, B.start + j);
    }
  }
  const probe = rings.find((r) => r.start !== undefined).start;
  return finish(positions, index, probe, new THREE.Vector3(0, 1, 0));
}

// A tube along the points of a curve, radius(t) with t from 0 at the first point to 1 at the
// last, `flat` squeezing it across its own bend plane. Where the radius is 0 at an end it
// closes in a point; otherwise the end is capped flat.
export function tube(points, radius, { radial = 6, flat = 1, up = new THREE.Vector3(0, 1, 0) } = {}) {
  const n = points.length;
  const tangents = [],
    normals = [],
    binormals = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(n - 1, i + 1)];
    tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  // A frame carried along the curve without twisting, starting square to `up`.
  let normal = new THREE.Vector3().crossVectors(tangents[0], up);
  if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1).cross(tangents[0]);
  normal.normalize();
  normal = new THREE.Vector3().crossVectors(normal, tangents[0]).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      if (axis.lengthSq() > 1e-10) {
        axis.normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normal.applyAxisAngle(axis, angle);
      }
    }
    normals.push(normal.clone());
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], normal).normalize());
  }
  const positions = [],
    index = [],
    along = [];
  const rings = [];
  const q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = radius(t);
    if (r <= 0 && (i === 0 || i === n - 1)) {
      rings.push({ pole: positions.length / 3 });
      positions.push(points[i].x, points[i].y, points[i].z);
      along.push(t);
      continue;
    }
    const start = positions.length / 3;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      q.copy(points[i])
        .addScaledVector(normals[i], Math.cos(a) * r * flat)
        .addScaledVector(binormals[i], Math.sin(a) * r);
      positions.push(q.x, q.y, q.z);
      along.push(t);
    }
    rings.push({ start });
  }
  // Flat caps where an end is open.
  for (const end of [0, n - 1]) {
    const ring = rings[end];
    if (ring.pole !== undefined) continue;
    const centre = positions.length / 3;
    positions.push(points[end].x, points[end].y, points[end].z);
    along.push(end === 0 ? 0 : 1);
    ring.cap = centre;
  }
  for (let i = 0; i + 1 < n; i++) {
    const A = rings[i],
      B = rings[i + 1];
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (A.pole !== undefined) index.push(A.pole, B.start + j1, B.start + j);
      else if (B.pole !== undefined) index.push(A.start + j, A.start + j1, B.pole);
      else index.push(A.start + j, A.start + j1, B.start + j, A.start + j1, B.start + j1, B.start + j);
    }
  }
  if (rings[0].cap !== undefined) for (let j = 0; j < radial; j++) index.push(rings[0].cap, rings[0].start + j, rings[0].start + ((j + 1) % radial));
  if (rings[n - 1].cap !== undefined) for (let j = 0; j < radial; j++) index.push(rings[n - 1].cap, rings[n - 1].start + ((j + 1) % radial), rings[n - 1].start + j);
  const probeRing = rings.find((r) => r.start !== undefined);
  const probe = probeRing.start;
  const k = rings.indexOf(probeRing);
  const outward = new THREE.Vector3(positions[probe * 3], positions[probe * 3 + 1], positions[probe * 3 + 2]).sub(points[k]);
  const geometry = finish(positions, index, probe, outward);
  geometry.userData.along = along;
  return geometry;
}

// Points along a smooth curve through `controls` (arrays), `samples` of them.
export function curve(controls, samples) {
  const c = new THREE.CatmullRomCurve3(
    controls.map((p) => new THREE.Vector3(...p)),
    false,
    "centripetal",
  );
  return c.getPoints(samples - 1);
}

// An ellipsoid (radii rx, ry, rz) at a point, with its own smooth normals.
export function blob(centre, rx, ry, rz, { widthSegments = 10, heightSegments = 7 } = {}) {
  const g = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  g.scale(rx, ry, rz);
  // A stretched sphere's normals lean the other way than its points move (worked out from the
  // unit sphere's own, so the seam stays smooth).
  const nor = g.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    n.set(n.x / rx, n.y / ry, n.z / rz).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.translate(centre[0], centre[1], centre[2]);
  g.deleteAttribute("uv");
  return g;
}

export const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mixColour = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 0) + ((b[3] ?? 0) - (a[3] ?? 0)) * t];

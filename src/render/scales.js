import * as THREE from "three";

// A fish's scales, as a small tile made here once (nothing to download): 8 by 8 cycloid
// scales in staggered rows, each lying over the front of the one behind it the way scales
// do, so what shows of each is its rounded free edge toward the tail.
//
//   r, g  the relief's normal (x toward the tail, y down the flank), * 0.5 + 0.5
//   b     a shade: dark in the groove just behind each free edge, the scale's field paler
//         toward its edge
//   a     a random value for each scale (how it is tilted, how it catches the light)
//
// The mipmaps are box-filtered here as well, not by the graphics card: the normals are
// averaged without being lengthened again, so where many scales fall in one pixel the
// relief flattens out by itself instead of flickering, and the shade goes to its mean.
// Everything is worked out from the scale's own row and column (a hash of the two): no
// random stream is drawn from.

export const SCALE_CELLS = 8;
const SIZE = 256;
// A scale's half-length along the fish and half-height across it, in cells: long enough
// that each covers the front of the one behind it and the rows overlap.
const RX = 0.78,
  RY = 0.62;
// How steep the relief is (height per cell) before the shader scales it.
const RELIEF = 0.2;

const hash = (i, j) => {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const wrap = (n) => ((n % SCALE_CELLS) + SCALE_CELLS) % SCALE_CELLS;

// What shows at (cx, cy), in cells: the scale on top there -- of all those covering the
// point, the one furthest forward, since each lies over the front of those behind it --
// its height, and how close the point is to the free edge of a scale ahead that is not
// covering it (the groove that edge shades).
const candX = new Float64Array(9),
  candDx = new Float64Array(9),
  candDy = new Float64Array(9),
  candI = new Int32Array(9),
  candJ = new Int32Array(9);
function probe(cx, cy, out) {
  const j0 = Math.floor(cy);
  let n = 0,
    best = -1;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    const shift = wrap(j) & 1 ? 0.5 : 0;
    const i0 = Math.floor(cx - shift);
    for (let i = i0 - 1; i <= i0 + 1; i++, n++) {
      const x = i + 0.5 + shift;
      const dx = (cx - x) / RX,
        dy = (cy - (j + 0.5)) / RY;
      candX[n] = x;
      candDx[n] = dx;
      candDy[n] = dy;
      candI[n] = i;
      candJ[n] = j;
      if (dx * dx + dy * dy < 1 && (best < 0 || x < candX[best])) best = n;
    }
  }
  // The groove: the nearest free edge of a scale ahead of this one (not over this point);
  // only a scale's rear edge casts it.
  let edge = Infinity;
  for (let k = 0; k < n; k++) {
    if (candX[k] >= candX[best] || candDx[k] <= 0) continue;
    edge = Math.min(edge, Math.sqrt(candDx[k] * candDx[k] + candDy[k] * candDy[k]) - 1);
  }
  // Rising from where it is tucked in to its free edge, and rounded across.
  const t = (candDx[best] + 1) * 0.5,
    dy = candDy[best];
  out.h = Math.pow(t, 1.4) + 0.25 * Math.sqrt(Math.max(0, 1 - dy * dy));
  out.t = t;
  out.edge = edge;
  out.id = hash(wrap(candI[best]), wrap(candJ[best]));
}

let tile = null;

export function scaleTexture() {
  if (tile) return tile;
  // The height at twice the resolution, then normals and shade averaged down 2 x 2.
  const F = SIZE * 2,
    step = SCALE_CELLS / F;
  const height = new Float32Array(F * F),
    shade = new Float32Array(F * F),
    ids = new Float32Array(F * F);
  const out = {};
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      probe((x + 0.5) * step, (y + 0.5) * step, out);
      const k = y * F + x;
      height[k] = out.h;
      // Dark just behind the edge of the scale ahead, the field paler toward its own edge.
      shade[k] = (1 - 0.5 * Math.exp(-Math.max(out.edge, 0) / 0.1)) * (0.9 + 0.14 * out.t);
      ids[k] = out.id;
    }
  const at = (x, y) => height[((y + F) % F) * F + ((x + F) % F)];
  const level0 = new Uint8Array(SIZE * SIZE * 4);
  const scale = RELIEF / (2 * step);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let nx = 0,
        ny = 0,
        b = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const X = x * 2 + sx,
            Y = y * 2 + sy;
          const gx = (at(X + 1, Y) - at(X - 1, Y)) * scale,
            gy = (at(X, Y + 1) - at(X, Y - 1)) * scale;
          const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          nx -= gx * inv;
          ny -= gy * inv;
          b += shade[Y * F + X];
        }
      const o = (y * SIZE + x) * 4;
      level0[o] = Math.round((nx / 4) * 127.5 + 127.5);
      level0[o + 1] = Math.round((ny / 4) * 127.5 + 127.5);
      level0[o + 2] = Math.min(255, Math.round((b / 4) * 255));
      // (The scale's own value from the centre of the four, not their mean.)
      level0[o + 3] = Math.round(ids[(y * 2 + 1) * F + x * 2 + 1] * 255);
    }
  const mipmaps = [{ data: level0, width: SIZE, height: SIZE }];
  for (let size = SIZE / 2; size >= 1; size /= 2) {
    const above = mipmaps[mipmaps.length - 1].data,
      w = size * 2;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        for (let c = 0; c < 4; c++) {
          const a = (y * 2 * w + x * 2) * 4 + c;
          data[(y * size + x) * 4 + c] = Math.round((above[a] + above[a + 4] + above[a + w * 4] + above[a + w * 4 + 4]) / 4);
        }
    mipmaps.push({ data, width: size, height: size });
  }
  tile = new THREE.DataTexture(level0, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tile.mipmaps = mipmaps;
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.magFilter = THREE.LinearFilter;
  tile.minFilter = THREE.LinearMipmapLinearFilter;
  tile.generateMipmaps = false;
  tile.anisotropy = 8;
  tile.colorSpace = THREE.NoColorSpace;
  tile.name = "fish scales";
  tile.needsUpdate = true;
  return tile;
}

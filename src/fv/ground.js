// The ground a crawling enemy walks on: not only the river's bed (course.js bed()), but the
// stones lying on it and the loose gravel -- the alevins of the redd rest up on the stones,
// and larvae that kept to the bed underneath would never reach them. The stones and pebbles
// near the players are gathered, and sorted into small square cells; the height at a point is
// then the highest of the bed, the tops of the stones there and the tops of the pebbles, and
// only those over the point's own cell need looking at.
//
// Gathering is the costly part (the pebbles are looked up cell by cell), so it is done again
// only when the fish has moved on a little, when the gravel has been laid anew round it, or
// now and then for what streams in and out. A height is exactly what a scan of everything
// gathered would give: a stone goes into every cell its footprint test can pass in, and a
// point outside the cells is answered by the scan.

// The ground is gathered again once the fish has moved this far (u) -- a respawn or a jump
// always is that far -- and it is gathered this much wider than asked, so that everything
// within the asked reach of where the fish is now was among what was gathered. (Just inside
// the reach, within a pebble's radius of it -- a quarter of a unit round an alevin -- a height
// can still differ from one on a gathering at the fish itself: the two take in different
// pebbles from just beyond the reach, and those reach in over their radius.)
const MOVE = 0.5;
// ...and at least this often (s), so that the stones of river blocks streaming in or out are
// picked up while the fish keeps still.
const EVERY = 1;
// The side of a cell (u).
const CELL = 1;
// A hair's breadth added round each footprint when stones are sorted into cells, so that
// rounding can never leave a stone out of a cell where the footprint test would pass.
const SLACK = 1e-4;
// What is kept of each gathered stone, side by side in one array (so that a height reads
// plain numbers, not stones and pebbles of different shapes): x, z, the footprint's bound
// (rx + rz), rx, rz, ry, cos, sin, y.
const STRIDE = 9;

export function createGround({ terrain, pebbles }) {
  const stones = [];
  const gravel = [];
  // The gathered stones' numbers, then the pebbles', by `STRIDE`.
  let packed = new Float64Array(0);
  // The cells: a square of `wide` by `deep` cells from cell (x0, z0). The numbers of cell k's
  // stones in `packed`, in the order they were gathered, are `members` from `first[k]` to just
  // before `first[k + 1]`; `fill` is where each cell is written to while sorting.
  let first = new Int32Array(1),
    fill = new Int32Array(1),
    members = new Int32Array(0);
  let x0 = 0,
    z0 = 0,
    wide = 0,
    deep = 0;
  // Where, how far round and when the ground was last gathered (NaN: never).
  let cx = NaN,
    cz = NaN,
    span = NaN,
    when = NaN;
  // The gravel as it was last put up to be drawn when the ground was gathered: the sum of its
  // meshes' upload counters, and of how many pebbles they drew. The gravel does not keep
  // still while the fish swims: pebbles.js lays the cells ahead of it and drops those behind
  // each time it crosses into another of its small cells (a few tenths of a unit round an
  // alevin), and thins the stones out as it grows. It puts each such change up to be drawn in
  // the step it makes it, before combat's step, so a change here means that the pebbles round
  // the fish are not those gathered any more. (Only a laying that overruns its few
  // milliseconds a frame -- all of it laid afresh when the fish outgrows the size of its cells
  // -- goes up later, with the frame that finishes it or every sixth: until then the crawlers
  // walk on the gravel as it is drawn.)
  let laid = NaN,
    drawn = NaN;

  // Every stone gathered, into `packed`, from index `at` on.
  function pack(list, at) {
    for (let n = 0; n < list.length; n++) {
      const c = list[n];
      const o = (at + n) * STRIDE;
      const rx = c.rx ?? c.r,
        rz = c.rz ?? c.r;
      packed[o] = c.x;
      packed[o + 1] = c.z;
      packed[o + 2] = rx + rz;
      packed[o + 3] = rx;
      packed[o + 4] = rz;
      packed[o + 5] = c.ry ?? c.r;
      packed[o + 6] = c.cos ?? 1;
      packed[o + 7] = c.sin ?? 0;
      packed[o + 8] = c.y;
    }
  }

  // Each packed stone from `from` to `to` into every cell of the square where its footprint
  // test can pass (|ox| and |oz| within rx + rz): counted first, then written (`write`).
  function spread(from, to, write) {
    for (let n = from; n < to; n++) {
      const o = n * STRIDE;
      const x = packed[o],
        z = packed[o + 1],
        bound = packed[o + 2] + SLACK;
      const i0 = Math.max(0, Math.floor((x - bound) / CELL) - x0),
        i1 = Math.min(wide - 1, Math.floor((x + bound) / CELL) - x0);
      const j0 = Math.max(0, Math.floor((z - bound) / CELL) - z0),
        j1 = Math.min(deep - 1, Math.floor((z + bound) / CELL) - z0);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * wide + i;
          if (write) members[fill[k]++] = n;
          else first[k + 1]++;
        }
    }
  }

  // Sort what was gathered into the cells of the square `reach` round (x, z).
  function sort(x, z, reach) {
    const count = stones.length + gravel.length;
    if (packed.length < count * STRIDE) packed = new Float64Array(Math.ceil(count * 1.5) * STRIDE);
    pack(stones, 0);
    pack(gravel, stones.length);
    x0 = Math.floor((x - reach) / CELL);
    z0 = Math.floor((z - reach) / CELL);
    wide = Math.floor((x + reach) / CELL) - x0 + 1;
    deep = Math.floor((z + reach) / CELL) - z0 + 1;
    const cells = wide * deep;
    if (first.length < cells + 1) {
      first = new Int32Array(cells + 1);
      fill = new Int32Array(cells + 1);
    }
    first.fill(0, 0, cells + 1);
    spread(0, count, false);
    for (let k = 0; k < cells; k++) {
      fill[k] = first[k];
      first[k + 1] += first[k];
    }
    if (members.length < first[cells]) members = new Int32Array(Math.ceil(first[cells] * 1.5));
    spread(0, count, true);
  }

  // The height as a scan of everything gathered finds it (for a point outside the cells).
  function scan(x, z, floor) {
    let top = floor;
    for (let n = 0, count = stones.length + gravel.length; n < count; n++) top = over(n * STRIDE, x, z, top);
    return top;
  }

  // The top of the packed stone at `o` over (x, z), if it is higher than `top`.
  function over(o, x, z, top) {
    const ox = x - packed[o],
      oz = z - packed[o + 1],
      bound = packed[o + 2];
    if (Math.abs(ox) > bound || Math.abs(oz) > bound) return top;
    const cs = packed[o + 6],
      sn = packed[o + 7];
    const ax = (ox * cs - oz * sn) / packed[o + 3],
      az = (ox * sn + oz * cs) / packed[o + 4];
    const inside = 1 - ax * ax - az * az;
    if (inside <= 0) return top;
    const y = packed[o + 8] + packed[o + 5] * Math.sqrt(inside);
    return y > top ? y : top;
  }

  return {
    // Gather what lies within `reach` of `center` (a Vector3), if it is time to: called each
    // step with the game's clock `time` (s; without it, it gathers every time).
    refresh(center, reach, time) {
      const meshes = pebbles?.meshes;
      let uploads = 0,
        count = 0;
      if (meshes)
        for (let n = 0; n < meshes.length; n++) {
          uploads += meshes[n].instanceMatrix.version;
          count += meshes[n].count;
        }
      const dx = center.x - cx,
        dz = center.z - cz;
      if (reach === span && uploads === laid && count === drawn && dx * dx + dz * dz < MOVE * MOVE && time >= when && time - when < EVERY) return;
      cx = center.x;
      cz = center.z;
      span = reach;
      when = time;
      laid = uploads;
      drawn = count;
      terrain.collidersNear(center.x, center.z, reach + MOVE, stones);
      gravel.length = 0;
      pebbles?.near?.(center, reach + MOVE, gravel);
      sort(center.x, center.z, reach + MOVE);
    },
    // The height of the ground at (x, z), at least `floor`.
    height(x, z, floor) {
      const i = Math.floor(x / CELL) - x0,
        j = Math.floor(z / CELL) - z0;
      if (!(i >= 0 && i < wide && j >= 0 && j < deep)) return scan(x, z, floor);
      const k = j * wide + i;
      let top = floor;
      for (let m = first[k], end = first[k + 1]; m < end; m++) top = over(members[m] * STRIDE, x, z, top);
      return top;
    },
  };
}

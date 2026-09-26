// The ground a crawling enemy walks on: not only the river's bed (course.js bed()), but the
// stones lying on it and the loose gravel -- the alevins of the redd rest up on the stones,
// and larvae that kept to the bed underneath would never reach them. The stones near the
// players are gathered once a step; the height at a point is then the highest of the bed,
// the tops of the stones there and the tops of the pebbles.

export function createGround({ terrain, pebbles }) {
  const stones = [];
  const gravel = [];
  const probe = { x: 0, y: 0, z: 0 };
  return {
    // Gather what lies within `reach` of `center` (a Vector3), once per step.
    refresh(center, reach) {
      terrain.collidersNear(center.x, center.z, reach, stones);
      gravel.length = 0;
      pebbles?.near?.(center, reach, gravel);
    },
    // The height of the ground at (x, z), at least `floor`.
    height(x, z, floor) {
      let top = floor;
      for (const list of [stones, gravel]) {
        for (const c of list) {
          const rx = c.rx ?? c.r,
            rz = c.rz ?? c.r,
            ry = c.ry ?? c.r;
          const ox = x - c.x,
            oz = z - c.z;
          if (Math.abs(ox) > rx + rz || Math.abs(oz) > rx + rz) continue;
          const cs = c.cos ?? 1,
            sn = c.sin ?? 0;
          const ax = (ox * cs - oz * sn) / rx,
            az = (ox * sn + oz * cs) / rz;
          const inside = 1 - ax * ax - az * az;
          if (inside <= 0) continue;
          const y = c.y + ry * Math.sqrt(inside);
          if (y > top) top = y;
        }
      }
      void probe;
      return top;
    },
  };
}

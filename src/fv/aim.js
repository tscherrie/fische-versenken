// Where the crosshair points: the middle of the view, followed out along the camera's ray to
// the first thing in the way -- an enemy, the bed, the surface -- or to the weapon's reach.
// Shots fly from the weapon on the fish's back to that point, so they meet the crosshair
// although the camera sits behind and above the fish. An enemy close to the middle of the
// view draws the aim onto itself (a little help, as a shooter gives).

import * as THREE from "three";
import { bed, level, locate } from "../course.js";

const ASSIST = Math.tan((3.5 * Math.PI) / 180);

export function createAim(camera) {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const where = { s: null, u: 0 };
  let target = null;

  return {
    point,
    get target() {
      return target;
    },
    direction,
    // Work out the aim for this step. `reach`: how far the weapon carries.
    update(enemies, reach) {
      camera.getWorldPosition(origin);
      camera.getWorldDirection(direction);
      target = null;
      let bestT = reach,
        bestScore = ASSIST;
      for (const e of enemies) {
        if (e.dead) continue;
        offset.subVectors(e.position, origin);
        const t = offset.dot(direction);
        if (t < 0.2 || t > reach + e.size) continue;
        const across = Math.sqrt(Math.max(0, offset.lengthSq() - t * t));
        // Straight on its body, or near enough to the middle of the view to count.
        const score = Math.max(0, across - e.size * 0.3) / t;
        if (score < bestScore || (score === 0 && t < bestT)) {
          bestScore = score;
          bestT = t;
          target = e;
        }
      }
      if (target) return point.copy(target.position);
      // Nothing to aim at: along the ray to the bed or the surface.
      const stepLength = Math.max(0.35, reach / 36);
      where.s = null;
      for (let t = stepLength; t <= reach; t += stepLength) {
        probe.copy(origin).addScaledVector(direction, t);
        locate(probe.x, probe.z, where.s, where);
        if (probe.y < bed(where.s, where.u) || probe.y > level(where.s) + 0.02) return point.copy(probe);
      }
      return point.copy(origin).addScaledVector(direction, reach);
    },
  };
}

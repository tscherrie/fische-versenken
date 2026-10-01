// The shaders of everything the river can show, built behind the title card in turns
// (main.js), so that the loading number can move while they are built (progress.js). Each
// turn draws a part of the scene, alone, into the target the scene is really drawn into;
// together the turns build the very pipelines that one draw of everything would (the same
// 73 here, from the same nodes; three.js names and orders a few uniforms as it meets them,
// so a shader's text can differ a little with the order), and main.js still makes that
// draw after them (it then finds them all built: a few ms).
//
// Nearly all of it is three.js turning node materials into shaders on the main thread: a
// fish's skin or its fins take about 0.2 s each here, most other materials a few ms, and
// what a material will take is not known before it is built. So the turns are ordered for
// the number: each kind of material is spread evenly over the whole way (a fish every few
// turns rather than all the fish at the end), what a kind takes is learned from the last
// one built, and a kind not seen yet is guessed from its type. A turn is a draw call more,
// with a shadow pass of its own, so the cheap things are drawn together in turns about as
// long as the number is shown apart (progress.js, SLICE): the fish come one to a turn.

import { breathe } from "../progress.js";

// What building a material takes before one of its kind has been built: ms, here.
const GUESS = { MeshPhysicalNodeMaterial: 200, SpriteNodeMaterial: 4, PointsNodeMaterial: 4 };
const guess = (material) => GUESS[material.type] ?? (material.isNodeMaterial ? 40 : 2);
// Materials alike in type and in the nodes they are given take alike.
const kindOf = (material) => [material.type, material.transparent ? "t" : "", ...Object.keys(material).filter((key) => key.endsWith("Node") && material[key]?.isNode)].join(",");
// A turn is one material that takes long, or cheap ones up to this many ms together.
const TURN = 200;
// A draw of what is already built.
const DRAW = 0.5;

const drawn = (object) => object.isMesh || object.isSprite || object.isPoints || object.isLine;
const materialsOf = (object) => {
  const list = [];
  object.traverse((o) => {
    if (drawn(o)) list.push(...[o.material].flat().filter(Boolean));
  });
  return list;
};
const holdsLight = (object) => {
  let light = false;
  object.traverse((o) => (light ||= !!o.isLight));
  return light;
};

// Draws `scene` part by part into `target` (everything in it visible already); `step` is
// the loading step it reports to (progress.js).
export async function warmUp({ renderer, scene, camera, target, step }) {
  // The parts: each thing drawn, with whatever hangs under it. (One with a light under it
  // stays in every turn: without its light the others' shaders would be built for a
  // different set of lights.)
  const parts = [];
  (function gather(object) {
    if (drawn(object)) {
      if (!holdsLight(object)) parts.push(object);
      return;
    }
    for (const child of object.children) gather(child);
  })(scene);
  // Each kind spread over the whole way: its i-th of n at (i + o) / n, the offset o differing
  // from kind to kind (by the golden ratio) so that kinds of one or a few are spread too.
  const kinds = new Map();
  for (const part of parts) {
    const key = materialsOf(part).map(kindOf).join("|");
    if (!kinds.has(key)) kinds.set(key, []);
    kinds.get(key).push(part);
  }
  const order = [];
  let k = 0;
  for (const list of kinds.values()) {
    const offset = (0.5 + 0.618034 * k++) % 1;
    list.forEach((part, i) => order.push({ at: (i + offset) / list.length, part }));
  }
  order.sort((a, b) => a.at - b.at);
  // What each part builds: the materials no part before it has.
  const seen = new Set();
  const queue = order.map(({ part }) => {
    const fresh = materialsOf(part).filter((m) => !seen.has(m) && seen.add(m));
    return { part, fresh, kinds: fresh.map(kindOf) };
  });
  const learned = new Map();
  const cost = (material, kind) => learned.get(kind) ?? guess(material);
  const estimate = (item) => DRAW + item.fresh.reduce((sum, m, i) => sum + cost(m, item.kinds[i]), 0);

  for (const { part } of queue) part.visible = false;
  let spent = 0;
  for (let i = 0; i < queue.length; ) {
    // One turn: the next part, and after it cheap ones while the turn stays short -- with
    // one kind not built before at most, as what that takes is only a guess.
    const unknown = (item) => item.kinds.some((kind) => !learned.has(kind));
    const turn = [queue[i]];
    let guessed = estimate(queue[i]),
      guessing = unknown(queue[i]);
    for (i++; i < queue.length && guessed < TURN; i++) {
      const next = estimate(queue[i]);
      if (guessed + next > TURN || (guessing && unknown(queue[i]))) break;
      turn.push(queue[i]);
      guessed += next;
      guessing ||= unknown(queue[i]);
    }
    const guesses = turn.map((item) => item.fresh.map((m, k) => cost(m, item.kinds[k])));
    for (const item of turn) item.part.visible = true;
    const t = performance.now();
    renderer.setRenderTarget(target);
    renderer.shadowMap.needsUpdate = true;
    // (Seen by a camera of its own: the sun's shadow map is drawn once per camera and
    // frame, and each turn's shadow casters must be drawn into it to be built.)
    renderer.render(scene, camera.clone());
    const took = performance.now() - t;
    for (const item of turn) item.part.visible = false;
    spent += took;
    // What the turn took, shared by its materials as they were guessed; each kind keeps
    // the last it took (the first of a kind can build what the rest of it then shares).
    turn.forEach((item, n) => item.kinds.forEach((kind, k) => learned.set(kind, (took * guesses[n][k]) / guessed)));
    let rest = 0;
    for (let j = i; j < queue.length; j++) rest += estimate(queue[j]);
    step.progress(spent / (spent + rest));
    step.expect(rest);
    await breathe();
  }
  for (const { part } of queue) part.visible = true;
}

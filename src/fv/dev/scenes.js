// Test scenes for Extreme's combat, run like the photo points (src/dev/shots.js): each loads
// the game afresh at a stage and a place, settles the river, puts enemies in front of the
// fish, fires, and takes pictures and numbers into shots/<set>/. Run with
//
//   node tools/fv-test.mjs <set> [--only piu,pack] [--port 8150]
//
// The game moves only in fixed steps here (salmon.run), so a scene comes out the same way
// every time.

import { createGround } from "../ground.js";
import { LOOK_SCENES, runLook } from "./scenes-look.js";

// A pack of forty (no more of a kind than may be about at once), in rows ahead of the fish.
const PACK = Array.from({ length: 40 }, (_, i) => [["troutParr", "bullhead", "troutParr", "dragonflyLarva", "troutParr", "bullhead", "trout", "troutParr", "beetleLarva", "dragonflyLarva"][i % 10], 4 + 1.1 * Math.floor(i / 5), 1.1 * ((i % 5) - 2)]);

export const SCENES = [
  // A parr in the brook, a young trout pack and a bullhead ahead: fire into them.
  { name: "piu", stage: "parr", at: 2500, season: "summer", hour: 15, spawn: [["troutParr", 7, -0.8], ["troutParr", 7.5, 0], ["troutParr", 7, 0.8], ["bullhead", 5, 0.4]] },
  // A fry at the nursery pool with a trout stalking it: does it strike, does the fry sink it?
  { name: "forelle", stage: "fingerling", at: 400, season: "summer", hour: 13, spawn: [["trout", 9, 0]] },
  // Nobody fires: the pack goes for the fish (the bites, the strength bar).
  { name: "angriff", stage: "yearling", at: 1500, season: "summer", hour: 14, fire: false, spawn: [["troutParr", 5, -1], ["troutParr", 5.5, 0], ["troutParr", 5, 1]] },
  // Nobody fires back: a brown trout with its submachine gun and a bullhead with its
  // shotgun open up on a parr (the tells, the bursts, the hits).
  { name: "beschuss", stage: "parr", at: 2500, season: "summer", hour: 15, fire: false, spawn: [["trout", 11, 0], ["bullhead", 4, 0.8]] },
  // The kingfisher: it circles over the brook, hovers over the fry and plunges at it --
  // once taking it (no shooting back), once against the laser.
  { name: "eisvogel", stage: "fry", at: 215, season: "summer", hour: 13, fire: false, spawn: [["kingfisher", 3, 0]] },
  { name: "eisvogel-laser", stage: "fry", at: 215, season: "summer", hour: 13, spawn: [["kingfisher", 3, 0]] },
  // The goosander under water with its revolver: once taking it, once against the laser.
  { name: "saeger", stage: "fingerling", at: 400, season: "summer", hour: 13, fire: false, spawn: [["merganser", 8, 0]] },
  { name: "saeger-laser", stage: "parr", at: 2500, season: "summer", hour: 15, spawn: [["merganser", 8, 0]] },
  // A shoal of minnows with razor blades round a parr: once taking it, once with the laser.
  { name: "elritzen", stage: "parr", at: 2500, season: "summer", hour: 15, fire: false, spawn: [["minnow", 4, -1], ["minnow", 4.5, -0.5], ["minnow", 4, 0], ["minnow", 4.5, 0.5], ["minnow", 4, 1], ["minnow", 5, -0.8], ["minnow", 5, 0.2], ["minnow", 5, 0.9], ["minnow", 5.5, 0]] },
  { name: "elritzen-laser", stage: "parr", at: 2500, season: "summer", hour: 15, spawn: [["minnow", 4, -1], ["minnow", 4.5, -0.5], ["minnow", 4, 0], ["minnow", 4.5, 0.5], ["minnow", 4, 1], ["minnow", 5, -0.8], ["minnow", 5, 0.2], ["minnow", 5, 0.9], ["minnow", 5.5, 0]] },
  // The heron in the shallows with its harpoon gun: once taking it, once against the laser.
  { name: "reiher", stage: "fingerling", at: 1500, season: "summer", hour: 14, fire: false, spawn: [["heron", 6, 1]] },
  { name: "reiher-laser", stage: "parr", at: 1800, season: "summer", hour: 14, spawn: [["heron", 6, 1]] },
  // A pack of four perch with pistols round a parr in the middle river: once taking it,
  // once against the laser.
  { name: "barsche", stage: "parr", at: 12500, season: "summer", hour: 14, fire: false, foes: true, spawn: [["perch", 5, -1.2], ["perch", 5.5, 0], ["perch", 5, 1.2], ["perch", 6.5, 0.5]] },
  { name: "barsche-laser", stage: "parr", at: 12500, season: "summer", hour: 14, foes: true, spawn: [["perch", 5, -1.2], ["perch", 5.5, 0], ["perch", 5, 1.2], ["perch", 6.5, 0.5]] },
  // A cod on the bed in the seagrass at the river's mouth (`u`: across the water, where the
  // fish starts; the fourth field: on the bed, not at the fish's height): it comes up at the
  // postsmolt over it, blasts it with its pump-action shotgun and lunges to swallow it --
  // once taking it, once against the laser.
  { name: "dorsch", stage: "postsmolt", at: 16000, u: 350, season: "summer", hour: 12, fire: false, foes: true, spawn: [["cod", 3.5, 0.3, true]] },
  { name: "dorsch-laser", stage: "postsmolt", at: 16000, u: 350, season: "summer", hour: 12, foes: true, spawn: [["cod", 3.5, 0.3, true]] },
  // The pike off to the side in the middle river: a long aim with its red laser line, one
  // heavy round from the elephant gun that throws the parr aside -- once taking it, once
  // against the laser.
  { name: "hecht", stage: "parr", at: 11790, season: "summer", hour: 14, fire: false, foes: true, spawn: [["pike", 8, 1.5]] },
  { name: "hecht-laser", stage: "parr", at: 11790, season: "summer", hour: 14, foes: true, spawn: [["pike", 8, 1.5]] },
  // The otter with its machete, in the upper river: it comes fast, backs off and rears for
  // each blow (the tell), hacks, and now and then goes up for air -- once taking a parr (no
  // shooting back), once against the laser, and once at night, to see that it can be made
  // out in the dark. (`watch`: the fight watched that many seconds; `modes`: a picture the
  // first time it winds up, strikes, and lies at the surface for air.)
  { name: "otter", stage: "parr", at: 3000, season: "summer", hour: 14, fire: false, watch: 24, side: true, modes: ["coil", "strike", "breathe"], spawn: [["otter", 14, 0]] },
  { name: "otter-laser", stage: "parr", at: 3000, season: "summer", hour: 14, watch: 10, side: true, modes: ["coil", "strike"], spawn: [["otter", 14, 0]] },
  { name: "otter-nacht", stage: "parr", at: 3000, season: "summer", hour: 1, fire: false, watch: 8, modes: ["coil"], spawn: [["otter", 14, 0]] },
  // The gravel defence: an alevin in the redd, the larvae coming in waves, the pilot shooting.
  { name: "kiesbett", stage: "alevin", at: null, season: "spring", hour: 11, pilot: 100, still: true },
  // The same without shooting back: do the larvae get to the alevin on its stone?
  { name: "kiesbett-wehrlos", stage: "alevin", at: null, season: "spring", hour: 11, pilot: 60, still: true, nofire: true },
  // The crawlers' ground (ground.js) against the ground as it was first built -- everything
  // within reach gathered afresh each step and scanned whole -- in the redd, for `ground`
  // seconds: the larvae crawl in unopposed for the first half, then the alevin shoots.
  { name: "boden", stage: "alevin", at: null, season: "spring", hour: 11, ground: 40, spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5]] },
  // The same with the alevin swimming round in a wide circle, so that the gravel is laid
  // ahead of it and dropped behind it all the time; and then as it outgrows the gravel's cell
  // size halfway (a fry), so that the gravel is laid afresh, coarser, over several frames
  // (while such a laying overruns its frame, the gravel it holds is not yet the gravel it
  // draws, and the crawlers may walk on either: see ground.js).
  { name: "boden-schwimmt", stage: "alevin", at: null, season: "spring", hour: 11, ground: 30, move: 0.02, spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5]] },
  { name: "boden-wachsen", stage: "alevin", at: null, season: "spring", hour: 11, ground: 30, move: 0.02, grow: [15, 1, 0.8], spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5]] },
  // Both on a slow phone: the gravel gets only a tenth of a millisecond a frame (`budget`), so
  // that nearly every laying runs over several frames and is put up only every sixth -- the
  // steps in which the crawlers' gravel may differ from the gravel as it was gathered before.
  { name: "boden-langsam", stage: "alevin", at: null, season: "spring", hour: 11, ground: 30, move: 0.02, grow: [15, 1, 0.8], budget: 0.1, spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5]] },
  // The old king in his pool: a yearling comes in and fights him (the pilot).
  { name: "koenig", stage: "yearling", at: 690, season: "summer", hour: 13, pilot: 60 },
  // A minute down the brook as a fry with the director sending enemies, a simple pilot
  // shooting at whatever comes: kills, bites, deaths.
  { name: "lauf", stage: "fry", at: 200, season: "summer", hour: 13, pilot: 60 },
  { name: "lauf-parr", stage: "parr", at: 1800, season: "summer", hour: 14, pilot: 60 },
  // The same in the middle river, where the perch packs and the pike come, and at sea, where
  // the cod lies on the bed. (There the pilot keeps `low` units over the bed: the cod is sent
  // only to a salmon swimming that low, and mid-water over the deep sea bed is too high.)
  { name: "lauf-barsch-hecht", stage: "parr", at: 10500, season: "summer", hour: 14, pilot: 60 },
  { name: "lauf-dorsch", stage: "postsmolt", at: 16200, season: "summer", hour: 12, pilot: 60, low: 5 },
  // The same with each weapon (`arm`), the trigger only within `fireRange` fish lengths.
  { name: "lauf-flinte", stage: "fry", at: 200, season: "summer", hour: 13, pilot: 60, arm: "flinte", fireRange: 6 },
  { name: "lauf-granate", stage: "fingerling", at: 400, season: "summer", hour: 13, pilot: 60, arm: "granate", fireRange: 12 },
  { name: "lauf-katana", stage: "yearling", at: 1500, season: "summer", hour: 14, pilot: 60, arm: "katana", fireRange: 1.3 },
  { name: "lauf-flammen", stage: "parr", at: 1800, season: "summer", hour: 14, pilot: 60, arm: "flammen", fireRange: 3.2 },
  // Close looks at the weapons strapped on: [aside, above, ahead] in fish lengths from the
  // fish (aside to its left), looking at it. Which weapons: ?xback=<id>&xbelly=<id>.
  { name: "nah-brut", stage: "fry", at: 240, season: "summer", hour: 13, closeup: [0.9, 0.35, 0.25] },
  { name: "nah-parr", stage: "parr", at: 2500, season: "summer", hour: 15, closeup: [0.9, 0.35, 0.25] },
  { name: "nah-parr-oben", stage: "parr", at: 2500, season: "summer", hour: 15, closeup: [0.35, 0.9, -0.2] },
  { name: "nah-smolt", stage: "smolt", at: 11790, season: "spring", hour: 12, closeup: [0.9, 0.3, 0.2] },
  { name: "nah-smolt-unten", stage: "smolt", at: 11790, season: "spring", hour: 12, closeup: [0.8, -0.35, 0.3] },
  { name: "nah-lachs", stage: "sea", at: 17500, season: "summer", hour: 12, closeup: [0.9, 0.3, 0.2] },
  // Each weapon at the stage it comes with, fired into what it is for (weapon: its id).
  // `pictures`: seconds after the trigger goes down; `side`: [aside, above, ahead] in fish
  // lengths for a camera beside the fight instead of behind the fish (the aim then follows
  // the nearest enemy); `lunges`: seconds at which Space is pressed; `melee`: the trigger
  // only while an enemy is in the blade's reach (as the phone's auto-fire would).
  { name: "w-laser", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "piu", seconds: 5, pictures: [0.1, 0.85, 1.2, 3.4], spawn: [["troutParr", 5, -0.6], ["troutParr", 5.5, 0], ["troutParr", 5, 0.6], ["bullhead", 4, 0.3]] },
  // The laser held: pulses and the beam by turns, the beam longer on the bigger fish.
  { name: "w-laser-seite", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "piu", seconds: 3, side: [3.2, 0.6, -1.5, 2], pictures: [0.3, 0.85], spawn: [["troutParr", 4, -0.3], ["troutParr", 4.5, 0.2], ["bullhead", 3.5, 0]] },
  { name: "w-laser-parr", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "piu", seconds: 4, pictures: [0.2, 0.9, 1.4], spawn: [["troutParr", 3.5, -0.5], ["troutParr", 4, 0], ["troutParr", 3.5, 0.5], ["trout", 6, 0]] },
  { name: "w-flinte", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "flinte", seconds: 5, range: 1.6, pictures: [1.5, 4], snaps: ["shot", "kill", "reload"], spawn: [["troutParr", 2.4, -0.4], ["troutParr", 2.8, 0.3], ["troutParr", 3.2, 0], ["bullhead", 2, 0.5]] },
  { name: "w-flinte-seite", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "flinte", seconds: 3, range: 1.6, side: [0.8, 0.45, 1.0, 2.0], pictures: [1.2], snaps: ["shot", "kill"], spawn: [["troutParr", 2.4, -0.3], ["troutParr", 2.8, 0.2], ["troutParr", 3.2, 0]] },
  { name: "w-granate", stage: "fingerling", at: 400, season: "summer", hour: 13, weapon: "granate", seconds: 6, pictures: [2, 5], snaps: ["flight", "blast", "gas", "kill", "reload"], spawn: [["troutParr", 5, -0.8], ["troutParr", 5.5, 0], ["troutParr", 5, 0.8], ["bullhead", 4.5, 0.3]] },
  { name: "w-granate-seite", stage: "fingerling", at: 400, season: "summer", hour: 13, weapon: "granate", seconds: 3, side: [3.2, 0.6, -2, 5.5], pictures: [1.4], snaps: ["flight", "blast", "gas", "kill"], spawn: [["troutParr", 6, -0.3], ["troutParr", 6.5, 0.2], ["bullhead", 5.5, 0]] },
  { name: "w-katana", stage: "yearling", at: 1500, season: "summer", hour: 14, weapon: "katana", seconds: 6, melee: true, lunges: [2.5, 4.5], pictures: [0.9, 4.6], snaps: ["kill", "konter", "dash"], spawn: [["troutParr", 3.5, -1], ["troutParr", 4, 0], ["troutParr", 3.5, 1], ["trout", 8, 0]] },
  { name: "w-katana-seite", stage: "yearling", at: 1500, season: "summer", hour: 14, weapon: "katana", seconds: 3, melee: true, side: [1.0, 0.45, 0.8, 1.2], pictures: [2.5], snaps: ["kill", "konter"], spawn: [["troutParr", 2.5, -0.5], ["troutParr", 2.8, 0.2], ["troutParr", 2.5, 0.8]] },
  { name: "w-flammen", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "flammen", seconds: 6, pictures: [0.3, 1, 2.5, 5.5], snaps: ["kill", "lock"], spawn: [["troutParr", 2.2, -0.5], ["troutParr", 2.5, 0], ["troutParr", 2.2, 0.5], ["troutParr", 2.8, -0.25], ["troutParr", 2.8, 0.25], ["bullhead", 2, 0.2], ["trout", 6, 0]] },
  // The smolt's pair: the minigun into a shoal, and the belly torpedoes (with the katana on
  // the back, which only cuts what comes close) homing on a trout further off.
  { name: "w-minigun", stage: "smolt", at: 11790, season: "spring", hour: 12, weapon: "minigun", seconds: 5, pictures: [0.3, 1.2, 3.5], spawn: [["minnow", 4, -1], ["minnow", 4.5, -0.4], ["minnow", 4, 0.3], ["minnow", 4.6, 0.9], ["minnow", 5, -0.8], ["minnow", 5.2, 0], ["minnow", 5, 0.7], ["trout", 7, 0]] },
  { name: "w-torpedo", stage: "smolt", at: 11790, season: "spring", hour: 12, weapon: "katana", belly: "torpedo", seconds: 6, pictures: [0.6, 1.4, 4], spawn: [["trout", 9, 0.6], ["trout", 10, -1]] },
  // The postsmolt's pair: a salvo of rockets into a group of trout, and sea mines dropped
  // behind (the katana on the back) with a pack circling through them.
  { name: "w-raketen", stage: "postsmolt", at: 11790, season: "spring", hour: 12, weapon: "raketen", seconds: 5, pictures: [0.5, 1.2, 3.5], spawn: [["trout", 9, -1], ["trout", 10, 0], ["trout", 9, 1.2], ["troutParr", 7, 0.3]] },
  { name: "w-minen-allein", stage: "postsmolt", at: 11790, season: "spring", hour: 12, weapon: "minen", seconds: 8, pictures: [2, 6], spawn: [["troutParr", 4, -1], ["troutParr", 4.5, 0], ["troutParr", 4, 1], ["troutParr", 5, -0.5], ["troutParr", 5, 0.5]] },
  { name: "w-minen", stage: "postsmolt", at: 11790, season: "spring", hour: 12, weapon: "katana", belly: "minen", seconds: 8, pictures: [1, 4, 7], spawn: [["troutParr", 4, -1], ["troutParr", 4.5, 0], ["troutParr", 4, 1], ["troutParr", 5, -0.5], ["troutParr", 5, 0.5]] },
  // The grilse's pair: the anti-materiel rifle held to steady and let go, through a line
  // of fish; and the arc thrower (the katana on the back) jumping through a shoal.
  { name: "w-panzer", stage: "grilse", at: 11790, season: "spring", hour: 12, weapon: "panzerbuechse", seconds: 6, pulse: [0.9, 0.4], pictures: [1, 2.3, 4], spawn: [["trout", 8, 0], ["trout", 10, 0.1], ["trout", 12, -0.1], ["troutParr", 9, 0]] },
  { name: "w-blitz", stage: "grilse", at: 11790, season: "spring", hour: 12, weapon: "katana", belly: "blitz", seconds: 5, pictures: [0.5, 1.5, 3.5], spawn: [["minnow", 3, -1], ["minnow", 3.5, -0.4], ["minnow", 3, 0.3], ["minnow", 3.6, 0.9], ["minnow", 4, -0.8], ["minnow", 4.2, 0], ["minnow", 4, 0.7], ["trout", 5, 0]] },
  // The sea salmon's pair: the particle beam drawn through a shoal and held on a trout; the
  // grenade harpoon (the katana on the back) through a line of fish.
  { name: "w-strahl", stage: "sea", at: 11790, season: "spring", hour: 12, weapon: "strahl", seconds: 5, pictures: [0.5, 2, 4], spawn: [["minnow", 5, -1], ["minnow", 5.5, -0.4], ["minnow", 5, 0.3], ["minnow", 5.6, 0.9], ["trout", 7, 0], ["trout", 8, 0.8]] },
  { name: "w-harpune-allein", stage: "sea", at: 11790, season: "spring", hour: 12, weapon: "harpune", seconds: 5, pictures: [0.3, 0.8, 3], spawn: [["troutParr", 6, 0], ["troutParr", 7, 0.05], ["troutParr", 8, -0.05], ["trout", 10, 0]] },
  { name: "w-harpune", stage: "sea", at: 11790, season: "spring", hour: 12, weapon: "katana", belly: "harpune", seconds: 5, pictures: [0.3, 0.8, 3], spawn: [["troutParr", 6, 0], ["troutParr", 7, 0.05], ["troutParr", 8, -0.05], ["trout", 10, 0]] },
  // The spawner's pair: the nodachi's rotor in a pack all round, and the chainsaw (the
  // nodachi on the back, not held) rammed into a shoal.
  { name: "w-nodachi", stage: "spawner", at: 11790, season: "autumn", hour: 12, weapon: "nodachi", seconds: 5, pictures: [0.3, 1.2, 3.5], spawn: [["trout", 0.9, -0.8], ["trout", 0.9, 0.8], ["trout", -0.5, 1], ["trout", 1.2, 0], ["troutParr", 0.7, 0.5], ["troutParr", 0.7, -0.5]] },
  { name: "w-saege", stage: "spawner", at: 11790, season: "autumn", hour: 12, weapon: "saege", seconds: 5, pictures: [0.5, 1.5, 3.5], spawn: [["trout", 1.1, 0], ["trout", 1.3, 0.05], ["minnow", 1.1, -0.05], ["minnow", 1.2, 0.05], ["minnow", 1.4, 0]] },
  // The ship's cannon: the fuse held down, the ball through a line of trout and on.
  { name: "w-kanone", stage: "sea", at: 11790, season: "spring", hour: 12, weapon: "kanone", seconds: 6, pictures: [1, 1.4, 3], spawn: [["trout", 1.5, 0], ["trout", 2, 0.05], ["trout", 2.5, -0.05], ["trout", 3, 0]] },
  { name: "w-flammen-seite", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "flammen", seconds: 3, side: [1.0, 0.5, 1.0, 1.8], pictures: [0.4, 1.2, 2.6], spawn: [["troutParr", 2.2, -0.3], ["troutParr", 2.5, 0.2], ["troutParr", 2.8, 0]] },
  // The phone's auto-fire (on a computer): the gun fires only while the aim has an enemy in
  // reach, the katana only with one in front within its reach.
  { name: "w-auto-laser", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "piu", seconds: 4, auto: true, pictures: [1.5], spawn: [["troutParr", 5, -0.6], ["troutParr", 5.5, 0], ["bullhead", 4, 0.3]] },
  { name: "w-auto-katana", stage: "yearling", at: 1500, season: "summer", hour: 14, weapon: "katana", seconds: 4, auto: true, spawn: [["troutParr", 3.5, -1], ["troutParr", 4, 0], ["troutParr", 3.5, 1]] },
  // What the effects cost: the flame held three seconds into a pack, and a salvo of six
  // grenades (the frame timed at the given moments, whole and without each of combat's
  // pictures).
  { name: "perf-flammen", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "flammen", seconds: 3.2, perf: [1.5, 3], pictures: [3.1], spawn: [["troutParr", 2.2, -0.5], ["troutParr", 2.5, 0], ["troutParr", 2.2, 0.5], ["troutParr", 2.8, -0.25], ["troutParr", 2.8, 0.25], ["trout", 6, 0]] },
  { name: "perf-granate", stage: "fingerling", at: 400, season: "summer", hour: 13, weapon: "granate", seconds: 3, perf: [1.4, 2.8], pictures: [2.9], spawn: [["troutParr", 6, -0.8], ["troutParr", 6.5, 0], ["troutParr", 6, 0.8], ["bullhead", 5.5, 0.3], ["trout", 9, 0]] },
  // What the crawlers cost: the redd full of larvae (as many as may crawl at once, as with
  // four players), all round the alevin and crawling in, nobody firing so that none drop out.
  { name: "perf-kiesbett", stage: "alevin", at: null, season: "spring", hour: 11, weapon: "piu", fire: false, seconds: 6, perf: [3, 6], pictures: [5.9], spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", 6, -3.5], ["dragonflyLarva", 3.5, -4.5], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["dragonflyLarva", 2, 5], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5], ["beetleLarva", 4, -1], ["beetleLarva", -6, 1]] },
  // The same with the alevin swimming round in a wide circle through the redd, the larvae
  // after it: the gravel is laid anew round it all the time, and the crawlers' ground with it.
  { name: "perf-kiesbett-schwimmt", stage: "alevin", at: null, season: "spring", hour: 11, weapon: "piu", fire: false, swim: 0.02, seconds: 6, perf: [3, 6], pictures: [5.9], spawn: [["dragonflyLarva", 5, -2], ["dragonflyLarva", 5.5, 1.5], ["dragonflyLarva", 4.5, 3], ["dragonflyLarva", 6, -3.5], ["dragonflyLarva", 3.5, -4.5], ["dragonflyLarva", -4, 3], ["dragonflyLarva", -5, -2], ["dragonflyLarva", 2, 5], ["beetleLarva", 6.5, 0], ["beetleLarva", -3, -5], ["beetleLarva", 4, -1], ["beetleLarva", -6, 1]] },
  // What the enemies' rounds cost: four trout with submachine guns and two bullheads with
  // shotguns open up on a parr that shrugs the hits off (`endure`), so they keep firing and
  // the rounds that miss sink and lie on the bed (the rounds' own step is timed as well).
  { name: "perf-beschuss", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "piu", fire: false, endure: true, seconds: 10, perf: [5, 9.5], pictures: [4], spawn: [["trout", 8, -1], ["trout", 9, 0], ["trout", 8, 1], ["trout", 10, 0.5], ["bullhead", 4, 0.8], ["bullhead", 4, -0.8]] },
  // What the players' shots cost: the laser into a pack of forty held where they are
  // (`hold`), with `bolts` more bolts a step from beside the fish, as other players would
  // fire them: three more players at the laser's rate (some ten bolts in flight, the pack
  // being near), and a stress case (some 150). (The shots' own update is timed as well.)
  { name: "perf-schuesse-vier", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "piu", seconds: 8, perf: [4, 7.9], hold: true, bolts: 0.9, spawn: PACK },
  { name: "perf-schuesse", stage: "fry", at: 215, season: "summer", hour: 13, weapon: "piu", seconds: 8, perf: [4, 7.9], hold: true, bolts: 15, spawn: PACK },
  // The same with more guns and the fish held low over the bed (`low`: that far above it, in
  // u, as the bench's soak holds it): the rounds that miss strike the bed or come down onto it
  // and lie there, so that the list holds many rounds at rest.
  { name: "perf-beschuss-tief", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "piu", fire: false, endure: true, low: 1.2, seconds: 12, perf: [6, 11.5], pictures: [5], spawn: [["trout", 8, -1.5], ["trout", 9, -0.5], ["trout", 8, 0.5], ["trout", 9, 1.5], ["trout", 10, 0], ["trout", 7, 0], ["bullhead", 4, 0.8], ["bullhead", 4, -0.8], ["bullhead", 5, 0]] },
  // The rules of the enemies' rounds (hostile.js), on lists of their own beside the fish: a
  // spent round has no drag left and only sinks; it comes to rest on the bed, or where it is
  // when its life is up, and goes REST seconds later; a full list makes way for its oldest
  // round at rest first, then its oldest spent one, then its oldest flying one; and the
  // strikes of a step are told newest round first, however the list was shuffled. A rule
  // broken is an error in the report.
  { name: "kugeln", stage: "parr", at: 2500, season: "summer", hour: 15, rounds: true },
  // The effects' own looks, held still in front of the eye: smoke of each kind, and a blast.
  { name: "fx-probe", stage: "parr", at: 2500, season: "summer", hour: 15, probe: true },
  // The numbers: one target that cannot sink, held still at a distance (in fish lengths),
  // the trigger held; damage a second against the balance unit P (the laser's burst).
  { name: "dps-laser", stage: "fry", at: 240, season: "summer", hour: 13, weapon: "piu", seconds: 6, dummy: ["trout", 8] },
  { name: "dps-flinte", stage: "fry", at: 240, season: "summer", hour: 13, weapon: "flinte", seconds: 6, dummy: ["troutParr", 3] },
  { name: "dps-flinte-weit", stage: "fry", at: 240, season: "summer", hour: 13, weapon: "flinte", seconds: 6, dummy: ["troutParr", 10] },
  { name: "dps-granate", stage: "fingerling", at: 400, season: "summer", hour: 13, weapon: "granate", seconds: 9.3, dummy: ["trout", 8] },
  { name: "dps-katana", stage: "yearling", at: 1500, season: "summer", hour: 14, weapon: "katana", seconds: 6, dummy: ["troutParr", 0.8] },
  { name: "dps-minigun", stage: "smolt", at: 11790, season: "spring", hour: 12, weapon: "minigun", seconds: 6, dummy: ["trout", 3] },
  { name: "dps-flammen", stage: "parr", at: 2500, season: "summer", hour: 15, weapon: "flammen", seconds: 4.5, dummy: ["trout", 2.2] },
  // Kills close to the eye: what a hit and a sinking leave in the water.
  // (`kill`: the weapon the shots count as: a precise one leaves the fish whole to float up,
  // a big gun bursts it.)
  { name: "splatter", stage: "parr", at: 2500, season: "summer", hour: 15, splatter: true, spawn: [["troutParr", 3.5, -0.4], ["troutParr", 4, 0.3], ["bullhead", 3, 0.1], ["trout", 7, 0]] },
  { name: "splatter-gross", stage: "parr", at: 2500, season: "summer", hour: 15, splatter: true, kill: "flinte", spawn: [["troutParr", 3.5, -0.4], ["troutParr", 4, 0.3], ["bullhead", 3, 0.1], ["trout", 7, 0]] },
];

SCENES.push(...LOOK_SCENES);

export function sceneURL(set, scene, extra = "") {
  for (const [k, v] of new URLSearchParams(location.search)) if (k.startsWith("x")) extra += `&${k}=${v}`;
  // (--xwebgl: the scenes on the WebGL 2 fallback.)
  if (new URLSearchParams(location.search).has("xwebgl")) extra += "&webgl";
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality: "detail", fvtest: set, scene: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour) });
  if (scene.u != null) q.set("u", String(scene.u));
  q.set("new", "");
  // (No ?at: a new life starts where it would in the game, in the gravel of the redd; ?at
  // starts mid-water.)
  if (scene.at === null) q.delete("at");
  return `${location.pathname}?${q.toString().replace("new=", "new")}${extra}`;
}

const nextTask = () => new Promise((r) => setTimeout(r, 0));

// Frames drawn back to back, then waited for: what one frame really costs, card and all
// (as the photo points time it, src/dev/shots.js).
async function throughput(salmon, n = 30) {
  const { renderer } = salmon;
  const sync = async () => {
    const device = renderer.backend?.device;
    if (device) return device.queue.onSubmittedWorkDone();
    const gl = renderer.backend?.gl ?? renderer.getContext?.();
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
  const runs = [];
  for (let k = 0; k < 3; k++) {
    await sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) salmon.draw(0);
    await sync();
    runs.push((performance.now() - t0) / n);
  }
  runs.sort((a, b) => a - b);
  return +runs[1].toFixed(2);
}

export async function runScenes(salmon, extreme, query) {
  try {
    await runScene(salmon, extreme, query);
  } catch (error) {
    const set = query.get("fvtest") || "fv";
    await fetch(`/__report/${set}/${query.get("scene")}`, { method: "POST", body: JSON.stringify({ scene: query.get("scene"), record: [], errors: [String(error?.stack ?? error)] }, null, 1) });
  }
}

async function runScene(salmon, extreme, query) {
  const set = query.get("fvtest") || "fv";
  const only = query.get("only")?.split(",");
  const list = only ? SCENES.filter((s) => only.includes(s.name)) : SCENES;
  const extra = only ? `&only=${only.join(",")}` : "";
  const index = list.findIndex((s) => s.name === query.get("scene"));
  if (index < 0) {
    location.href = sceneURL(set, list[0], extra);
    return;
  }
  const scene = list[index];
  // (Tests start with every boss unbeaten.)
  try {
    localStorage.removeItem("extreme-bosses");
  } catch {}
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  const consoleError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
    consoleError(...args);
  };
  const { course, fish, look, THREE } = salmon;
  const combat = extreme.combat;
  salmon.pause(true);
  await salmon.settle(40);
  await salmon.run(1);
  await salmon.settle(20);
  extreme.testing = true;
  // The enemies, placed [kind, ahead, across] from the fish, facing it, at its height (or,
  // with a fourth field, where their kind lies: a bottom kind on the bed).
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const spot = {};
  for (const [kind, ahead, across, own] of scene.spawn ?? []) {
    // (In units of a tenth of a metre, scaled up for a big fish.)
    const scale = Math.max(1, fish.length);
    const p = fish.position.clone().addScaledVector(heading, ahead * scale).addScaledVector(left, across * scale);
    course.locate(p.x, p.z, fish.river.s, spot);
    combat.enemies.spawn(kind, spot.s, spot.u, own ? null : fish.position.y, { heading: heading.clone().multiplyScalar(-1) });
  }
  // Face them, and keep facing them (with `foes`, only them: not the peaceful shoal fish
  // about, which may come nearer than an enemy thrown back by the laser: neutrals.js).
  const aimAt = () => {
    const live = combat.enemies.list.filter((e) => !e.dead && !(scene.foes && e.neutral));
    if (!live.length) return;
    const near = live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a));
    const d = near.position.clone().sub(fish.position);
    look.yaw = Math.atan2(d.z, d.x);
    look.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
  };
  if (scene.look)
    return runLook({ salmon, extreme, set, scene, errors, next: async () => {
      await nextTask();
      if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
    } });
  if (scene.ground) return groundCheck(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.weapon) return weapon(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.pilot) return pilot(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.closeup) return closeup(salmon, extreme, set, scene, list, index, extra, errors, query);
  if (scene.splatter) return splatter(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.probe) return probe(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.rounds) return roundsCheck(salmon, set, scene, list, index, extra, errors);
  if (scene.watch) return watch(salmon, extreme, set, scene, list, index, extra, errors, aimAt);
  aimAt();
  await salmon.run(0.4, aimAt);
  const record = [];
  const note = (label) =>
    record.push({
      label,
      energy: +fish.energy.toFixed(3),
      // (Dead, and by what: a swallowing strike takes the fish whatever its strength.)
      down: combat.players[0].down ? combat.deaths.at(-1)?.by ?? "other" : false,
      stage: fish.stage,
      progress: +fish.progress.toFixed(3),
      kills: combat.players[0].kills,
      heat: +(combat.players[0].arsenal.heat[combat.players[0].arsenal.back] ?? 0).toFixed(2),
      shots: combat.projectiles.live.length,
      incoming: combat.hostile.live.length,
      bars: (extreme.frame(1 / 60), document.querySelectorAll("#foes i.shown").length),
      threats: salmon.life.hunters.threats(fish, []).map((t) => `${t.kind}:${t.level}`),
      enemies: combat.enemies.list.map((e) => ({ kind: e.kind, mode: e.mode, hp: +e.hp.toFixed(1), dead: e.dead, d: +e.position.distanceTo(fish.position).toFixed(2), dy: +(e.position.y - fish.position.y).toFixed(2) })),
    });
  note("start");
  combat.fire(scene.fire !== false);
  await salmon.run(0.5, aimAt);
  note("0.5 s");
  const picture = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${name}`, 1280, 720);
  };
  await picture(`${scene.name}-1`);
  await salmon.run(1.5, aimAt);
  note("2 s");
  await picture(`${scene.name}-2`);
  await salmon.run(3, aimAt);
  note("5 s");
  await picture(`${scene.name}-3`);
  combat.fire(false);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// A fight watched longer than a plain scene's five seconds (`watch`: how many), for an enemy
// whose plan takes that long to play out: the fish faces the nearest enemy and fires or not
// (`fire`), as in a plain scene, and nobody else comes (the director is held). There is a
// note every second, a picture half a second in and one at the end, and one the first time
// an enemy is in each of `modes`: winding up ("coil", most of the way through), striking
// ("strike", a tenth of a second into the blow), or breathing ("breathe", once it is up at
// the surface). With `side` the camera is beside the fight instead of behind the fish.
async function watch(salmon, extreme, set, scene, list, index, extra, errors, aimAt) {
  const { fish, course, THREE } = salmon;
  const combat = extreme.combat;
  combat.director.hold(1e6);
  const dt = 1 / 30;
  const record = [];
  let t = 0,
    strikes = 0,
    breaths = 0,
    blows = 0,
    minEnergy = fish.energy,
    lastEnergy = fish.energy;
  const note = (label) =>
    record.push({
      label,
      t: +t.toFixed(2),
      energy: +fish.energy.toFixed(3),
      kills: combat.players[0].kills,
      dead: extreme.game.now.dead > 0,
      deaths: combat.deaths.map((d) => `${d.by}@${d.t}`),
      threats: salmon.life.hunters.threats(fish, []).map((x) => `${x.kind}:${x.level}`),
      enemies: combat.enemies.list.filter((e) => !e.neutral).map((e) => ({ kind: e.kind, mode: e.mode, hp: +e.hp.toFixed(1), dead: e.dead, air: e.air === undefined ? null : +e.air.toFixed(1), rear: +(e.rear ?? 0).toFixed(2), d: +e.position.distanceTo(fish.position).toFixed(2), under: +(course.level(e.river.s) - e.position.y).toFixed(2) })),
    });
  // The camera beside the fight: level with the middle between the fish and the nearest
  // enemy (a dead one too, to see where it goes), off to whichever side the water is deeper,
  // far enough back to have both in the picture, a little above them and never out of the
  // water or into the bed.
  const mid = new THREE.Vector3(),
    across = new THREE.Vector3(),
    eye = new THREE.Vector3(),
    best = new THREE.Vector3();
  const spot = {};
  const beside = () => {
    if (!scene.side) return;
    const others = combat.enemies.list.filter((e) => !e.neutral);
    if (!others.length) return;
    const e = others.reduce((a, b) => (b.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? b : a));
    mid.addVectors(fish.position, e.position).multiplyScalar(0.5);
    across.set(e.position.z - fish.position.z, 0, fish.position.x - e.position.x);
    const d = across.length();
    if (d < 1e-3) across.set(1, 0, 0);
    else across.divideScalar(d);
    const back = 0.8 * d + 0.9 * e.size + 2 * fish.length;
    let deepest = -Infinity;
    for (const sign of [1, -1]) {
      eye.copy(mid).addScaledVector(across, sign * back);
      course.locate(eye.x, eye.z, fish.river.s, spot);
      const floor = course.bed(spot.s, spot.u),
        top = course.level(spot.s);
      eye.y = Math.min(top - 0.4, Math.max(floor + 0.6, mid.y + 0.15 * back));
      if (top - floor > deepest) {
        deepest = top - floor;
        best.copy(eye);
      }
    }
    salmon.view(best.toArray(), mid.toArray(), 0.05);
  };
  const picture = async (name) => {
    beside();
    await salmon.run(dt, aimAt);
    t += dt;
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${scene.name}-${name}`, 1280, 720);
    note(`picture ${name}`);
  };
  const modes = new Set(scene.modes ?? []);
  // (When each enemy last began a blow, for the picture a tenth of a second into it.)
  const was = new Map(),
    struckAt = new Map();
  const due = (e, m) => !e.dead && (m === "strike" ? t - (struckAt.get(e) ?? Infinity) >= 0.1 : e.mode === m && e.t > (m === "coil" ? 0.75 * e.spec.coil : m === "breathe" ? 0.6 : 0));
  aimAt();
  beside();
  await salmon.run(0.4, aimAt);
  note("start");
  combat.fire(scene.fire !== false);
  let steps = 0,
    nextNote = 1,
    first = false;
  while (t < scene.watch - 1e-6) {
    beside();
    await salmon.run(dt, aimAt);
    t += dt;
    if (++steps % 15 === 0) await nextTask();
    // (What the enemies began this step: a blow, a breath.)
    for (const e of combat.enemies.list) {
      if (e.neutral || e.mode === was.get(e)) continue;
      if (e.mode === "strike") {
        strikes++;
        struckAt.set(e, t);
      }
      if (e.mode === "breathe") breaths++;
      was.set(e, e.mode);
    }
    if (fish.energy < lastEnergy - 0.03) blows++;
    lastEnergy = fish.energy;
    minEnergy = Math.min(minEnergy, fish.energy);
    if (!first && t >= 0.5) {
      first = true;
      await picture("1");
    }
    for (const m of modes) {
      if (!combat.enemies.list.some((e) => due(e, m))) continue;
      modes.delete(m);
      await picture(m);
      break;
    }
    if (t >= nextNote - 1e-6) {
      note(`${nextNote} s`);
      nextNote++;
    }
  }
  await picture("ende");
  combat.fire(false);
  if (scene.side) salmon.view(null);
  record.push({ label: "end", t: +t.toFixed(2), energy: +fish.energy.toFixed(3), minEnergy: +minEnergy.toFixed(3), kills: combat.players[0].kills, strikes, blows, breaths, deaths: combat.deaths.map((d) => `${d.by}@${d.t}`) });
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// The pilot: swims on down the river, turns toward the nearest living enemy in reach and
// holds the trigger while it has one; otherwise it follows the river.
async function pilot(salmon, extreme, set, scene, list, index, extra, errors) {
  const { course, fish, look, held } = salmon;
  const combat = extreme.combat;
  if (scene.arm) combat.players[0].arsenal.back = scene.arm;
  let deaths = 0,
    wasDead = false,
    bites = 0,
    lastEnergy = fish.energy,
    minEnergy = 1;
  const samples = [];
  const deathLog = [];
  const seen = new Set();
  let t0 = 0;
  const steer = (t) => {
    // (An alevin holds on in the gravel with S, as a player would.)
    held.add(scene.still ? "KeyS" : "KeyW");
    const reach = 12 + 10 * fish.length;
    const live = combat.enemies.list.filter((e) => !e.dead && e.position.distanceTo(fish.position) < reach);
    const near = live.length ? live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a)) : null;
    if (near) {
      const d = near.position.clone().sub(fish.position);
      look.yaw = Math.atan2(d.z, d.x);
      look.pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    } else {
      const target = course.place(fish.river.s + 6, fish.river.u * 0.8, {});
      look.yaw = Math.atan2(target.z - fish.position.z, target.x - fish.position.x);
      // (With `low` it keeps about that many units over the bed, as a salmon hunting down
      // there would, instead of holding the height it has.)
      look.pitch = scene.low ? Math.max(-0.7, Math.min(0.7, Math.atan2(course.bed(fish.river.s, fish.river.u) + scene.low - fish.position.y, 4 * fish.length))) : 0;
    }
    combat.fire(!!near && !scene.nofire && (!scene.fireRange || near.position.distanceTo(fish.position) - near.size * 0.45 < scene.fireRange * fish.length));
    const dead = extreme.game.now.dead > 0;
    if (dead && !wasDead) {
      deaths++;
      // (What killed it, if combat knows: a swallowing strike is logged there; anything else
      // -- hunger, the base game's own dangers -- is "other".)
      const last = combat.deaths.at(-1);
      deathLog.push({ t: +(t0 + t).toFixed(1), by: last && !seen.has(last) ? last.by : "other" });
      if (last) seen.add(last);
    }
    wasDead = dead;
    if (fish.energy < lastEnergy - 0.01) bites++;
    lastEnergy = fish.energy;
    minEnergy = Math.min(minEnergy, fish.energy);
  };
  for (let t = 0; t < scene.pilot; t += 10) {
    t0 = t;
    await salmon.run(10, steer);
    // (How many of each kind are about and after the fish, the peaceful shoal fish left out.)
    const foes = {};
    for (const e of combat.enemies.list) if (!e.dead && !e.neutral && !e.passive) foes[e.kind] = (foes[e.kind] ?? 0) + 1;
    samples.push({ t: t + 10, s: +fish.river.s.toFixed(0), stage: fish.stage, progress: +fish.progress.toFixed(3), energy: +fish.energy.toFixed(3), kills: combat.players[0].kills, alive: combat.enemies.list.filter((e) => !e.dead).length, foes, deaths, killedBy: combat.deaths.map((d) => `${d.by}@${d.t}`) , near: combat.enemies.list.filter((e) => !e.dead).slice(0, 4).map((e) => `${e.kind}:${e.mode}:${e.position.distanceTo(fish.position).toFixed(2)}:dy${(e.position.y - fish.position.y).toFixed(2)}`)  });
    if (t === 20) {
      extreme.frame(1 / 60);
      await salmon.capture(`${set}/${scene.name}-1`, 1280, 720);
    }
  }
  held.delete("KeyW");
  held.delete("KeyS");
  combat.fire(false);
  extreme.frame(1 / 60);
  await salmon.capture(`${set}/${scene.name}-2`, 1280, 720);
  const record = [{ label: "end", energy: +fish.energy.toFixed(3), kills: combat.players[0].kills, deaths, deathLog, bites, minEnergy: +minEnergy.toFixed(3), weapon: combat.players[0].arsenal.back, stats: structuredClone(combat.firing?.stats[combat.players[0].arsenal.back] ?? {}) }];
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, samples, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// A close look at the weapons on the fish, held still (the fish stops, the camera sits at
// `closeup` from it), with the weapons named in the address.
async function closeup(salmon, extreme, set, scene, list, index, extra, errors, query) {
  const { fish, THREE } = salmon;
  const a = extreme.combat.players[0].arsenal;
  if (query.get("xback") !== null) a.back = query.get("xback") || null;
  if (query.get("xbelly") !== null) a.belly = query.get("xbelly") || null;
  await salmon.run(0.3);
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const [aside, above, ahead] = scene.closeup;
  const eye = fish.position.clone().addScaledVector(left, aside * L).addScaledVector(heading, ahead * L);
  eye.y += above * L;
  const target = fish.position.clone().addScaledVector(heading, 0.05 * L);
  salmon.view(eye.toArray(), target.toArray(), L * 0.02);
  await salmon.run(0.05);
  extreme.frame(1 / 60);
  await salmon.capture(`${set}/${scene.name}`, 1280, 720);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record: [{ label: "closeup", back: a.back, belly: a.belly, stage: fish.stage, length: L }], errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// The rounds' rules, on small lists of their own (the game's is left alone), at the fish's
// place: rounds are fired straight up, down or along x from set heights over the bed there,
// with a drag strong enough to spend them in their first step where they are to sink.
async function roundsCheck(salmon, set, scene, list, index, extra, errors) {
  const { fish, THREE, course } = salmon;
  const { createHostile, REST } = await import("../hostile.js");
  // (hostile.js's SINK: how fast a spent round goes down, once its speed has gone over to it.)
  const SINK = 0.45;
  const dt = 1 / 30;
  const spot = {};
  const home = fish.position.clone();
  course.locate(home.x, home.z, fish.river.s, spot);
  const s = spot.s,
    floor = course.bed(spot.s, spot.u),
    depth = course.level(s) - floor,
    high = Math.min(8, depth - 1.5);
  const checks = [];
  const check = (what, ok, value) => {
    checks.push({ what, ok, value });
    if (!ok) errors.push(`kugeln: ${what}: ${JSON.stringify(value)}`);
  };
  const position = new THREE.Vector3(),
    velocity = new THREE.Vector3();
  // A round `name` from `up` over the bed here (`x` along x), along (vx, vy, 0).
  const shoot = (lab, name, up, vx, vy, drag, x = 0) => lab.fire({ weapon: name, position: position.set(home.x + x, floor + up, home.z), velocity: velocity.set(vx, vy, 0), damage: 0.1, drag, s });
  const steps = (lab, seconds, players = [], hooks = {}) => {
    for (let i = 0, n = Math.round(seconds / dt); i < n; i++) lab.update(dt, players, hooks);
  };
  // (Steps until `done`, for at most 20 s: how long that took.)
  const until = (lab, done) => {
    let t = 0;
    while (!done() && t < 20) {
      lab.update(dt, [], {});
      t += dt;
    }
    return t;
  };
  const names = (lab) => lab.live.map((p) => p.weapon).sort().join(",");

  // Spent high in the water: no drag left, it goes over to sinking at SINK; its life runs out
  // before it gets down, and it rests where it is, then goes REST seconds later.
  let lab = createHostile({ capacity: 4 });
  const a = shoot(lab, "a", high, 12, 0, 60);
  steps(lab, dt);
  check("spent in its first step", a.spent, a.velocity.length());
  steps(lab, 3);
  check("sinks at SINK, no drag left", Math.abs(a.velocity.y + SINK) < 0.002 && Math.hypot(a.velocity.x, a.velocity.z) < 0.01, a.velocity.toArray());
  until(lab, () => a.rested);
  check("rests where it is when its life is up", Math.abs(a.age - 12) < 1.5 * dt && a.position.y > floor + 0.5, { age: a.age, above: a.position.y - floor });
  steps(lab, REST - 0.5);
  check("still there before REST is up", lab.live.includes(a), lab.live.length);
  steps(lab, 1);
  check("gone once REST is up", lab.live.length === 0, lab.live.length);

  // Spent just over the bed: it comes down onto it and rests there, REST seconds.
  const b = shoot(lab, "b", 0.5, 3, 0, 60);
  const down = until(lab, () => b.rested);
  check("rests on the bed", b.position.y === b.floor && Math.abs(b.floor - floor) < 0.3 && down < 3, { down, y: b.position.y, floor: b.floor });
  steps(lab, REST - 0.5);
  check("still on the bed before REST is up", lab.live.includes(b), lab.live.length);
  steps(lab, 1);
  check("gone from the bed once REST is up", lab.live.length === 0, lab.live.length);

  // A full list: two rounds at rest, one spent and sinking, one flying; each new one takes the
  // place of the oldest at rest, then of the spent one, then of the oldest flying one. The
  // records are the list's own four all along.
  lab = createHostile({ capacity: 4 });
  const records = new Set();
  const note = () => lab.live.forEach((p) => records.add(p));
  shoot(lab, "r1", 0.01, 0, -3, 60);
  steps(lab, 0.2);
  shoot(lab, "r2", 0.01, 0, -3, 60);
  steps(lab, 0.2);
  shoot(lab, "s1", high, 2, 0, 60);
  steps(lab, 0.2);
  shoot(lab, "f1", high, 0.5, 0, 0.01);
  note();
  check("two at rest, one spent, one flying", names(lab) === "f1,r1,r2,s1" && lab.live.filter((p) => p.rested).length === 2 && lab.live.filter((p) => p.spent && !p.rested).length === 1, lab.live.map((p) => [p.weapon, p.spent, p.rested]));
  const evictions = [];
  for (const name of ["f2", "f3", "f4", "f5"]) {
    shoot(lab, name, high, 0.5, 0, 0.01);
    note();
    evictions.push(names(lab));
  }
  check("the oldest at rest first, then the spent one, then the oldest flying", evictions.join(" ") === "f1,f2,r2,s1 f1,f2,f3,s1 f1,f2,f3,f4 f2,f3,f4,f5", evictions);
  check("no records beyond the list's own", records.size === 4 && lab.live.length === 4, records.size);

  // The strikes of a step, told newest first, although a round that left the water in the
  // step before put the newest in the place of the oldest: three rounds come down onto a
  // player's body halfway up the water and one strikes the bed under it, all in the second
  // step. (The rounds' 0.3 u a step and the body's reach of 0.13 u keep the first step clear.)
  lab = createHostile({ capacity: 8 });
  const middle = depth * 0.5;
  const player = { id: 0, fish: { position: new THREE.Vector3(home.x, floor + middle, home.z), heading: new THREE.Vector3(1, 0, 0), length: 1 }, down: false };
  shoot(lab, "z", depth - 0.04, 0, 9, 0.1);
  shoot(lab, "h1", middle + 0.5, 0, -9, 0.1, -0.2);
  shoot(lab, "g", 0.35, 0, -9, 0.1);
  shoot(lab, "h2", middle + 0.5, 0, -9, 0.1);
  shoot(lab, "h3", middle + 0.5, 0, -9, 0.1, 0.2);
  const told = [];
  const hooks = { onPlayer: (p, who) => told.push(`${p.weapon}>${who.id}`), onGround: (p) => told.push(`${p.weapon}>bed`) };
  steps(lab, dt, [player], hooks);
  const shuffled = lab.live.map((p) => p.weapon).join(",");
  steps(lab, dt, [player], hooks);
  check("the list shuffled by a round leaving the water", shuffled === "h3,h1,g,h2", shuffled);
  check("strikes told newest first", told.join(" ") === "h3>0 h2>0 g>bed h1>0", told);
  check("each round told once and gone", lab.live.length === 0, lab.live.length);

  const record = [{ label: "rounds", REST, depth: +depth.toFixed(2), checks }];
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// The effects held still in front of the eye: a row of smoke puffs of each kind, then a
// grenade's blast in the middle of the view, pictured as it goes off and a while after.
async function probe(salmon, extreme, set, scene, list, index, extra, errors) {
  const { fish, THREE } = salmon;
  const combat = extreme.combat;
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const middle = fish.position.clone().addScaledVector(heading, 3 * L);
  const eye = middle.clone().addScaledVector(left, 3 * L);
  eye.y += 0.3 * L;
  salmon.view(eye.toArray(), middle.toArray(), 0.02);
  const picture = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${name}`, 1280, 720);
  };
  await salmon.run(0.1);
  for (let k = 0; k < 5; k++) {
    const p = middle.clone().addScaledVector(heading, (k - 2) * 0.9 * L);
    combat.smoke.puff(k, p.x, p.y, p.z, { size: 0.5 * L, grow: 1.2, life: 30, alpha: k === 4 ? 0.95 : 0.7, drag: 5, lift: 0, s: fish.river.s });
  }
  await salmon.run(0.3);
  await picture(`${scene.name}-rauch`);
  const probed = combat.smoke.probe();
  combat.smoke.reset();
  // A grenade that goes off where it is fired, in the middle of the view.
  const shot = combat.projectiles.fire({ owner: 0, weapon: "granate", position: middle.clone().addScaledVector(heading, -0.3), velocity: heading.clone().multiplyScalar(0.01), damage: 0, life: 0.02, fuse: true, solid: "grenade", scale: L, shooter: L, s: fish.river.s });
  await salmon.run(1 / 30);
  await salmon.run(1 / 30);
  await picture(`${scene.name}-blitz`);
  await salmon.run(0.3);
  await picture(`${scene.name}-gas`);
  await salmon.run(1.2);
  await picture(`${scene.name}-danach`);
  salmon.view(null);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record: [{ label: "end", probed, smoke: combat.smoke.probe(), shot: !!shot }], errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// Kills close to the eye: the enemies are sunk one by one while the camera watches from the
// side, and pictures are taken of the hit, the kill and what is left after a while.
async function splatter(salmon, extreme, set, scene, list, index, extra, errors) {
  const { fish, THREE, course } = salmon;
  const combat = extreme.combat;
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const spot = {};
  for (const [kind, ahead, across] of scene.spawn) {
    const p = fish.position.clone().addScaledVector(heading, ahead * Math.max(1, L)).addScaledVector(left, across * Math.max(1, L));
    course.locate(p.x, p.z, fish.river.s, spot);
    const e = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y + 0.2, { heading: left.clone() });
    if (e) e.mode = "lurk";
  }
  // Watch from the side, between the fish and the enemies.
  const middle = fish.position.clone().addScaledVector(heading, 3.5 * Math.max(1, L));
  const eye = middle.clone().addScaledVector(left, 4 * Math.max(1, L));
  eye.y += 0.6;
  salmon.view(eye.toArray(), middle.toArray());
  await salmon.run(0.1);
  const picture = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${name}`, 1280, 720);
  };
  const live = () => combat.enemies.list.filter((e) => !e.dead);
  // Shots straight into each enemy from the fish's side, until it sinks.
  let n = 0;
  for (const e of live()) {
    const dir = e.position.clone().sub(fish.position).normalize();
    for (let i = 0; i < 40 && !e.dead; i++) {
      combat.projectiles.fire({ owner: 0, weapon: scene.kill ?? "piu", position: e.position.clone().addScaledVector(dir, -1.2), velocity: dir.clone().multiplyScalar(30), damage: 4, radius: 0.05, life: 0.2, size: 0.1, tint: [10, 1.1, 0.6] });
      await salmon.run(1 / 30);
      if (i === 0 && n === 0) await picture(`${scene.name}-treffer`);
    }
    n++;
    await salmon.run(0.15);
    if (n === 1) await picture(`${scene.name}-kill`);
  }
  await salmon.run(1.2);
  await picture(`${scene.name}-danach`);
  await salmon.run(4);
  await picture(`${scene.name}-spaeter`);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record: [{ label: "end", sunk: combat.enemies.list.filter((e) => e.dead).length }], errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// The height of the ground as ground.js first gave it: the highest of `floor` and the tops of
// all the stones and pebbles gathered, each looked at.
function scanGround(lists, x, z, floor) {
  let top = floor;
  for (const list of lists)
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
  return top;
}

// The crawlers' ground against that plain scan, with everything within 12 u of the fish
// gathered afresh for it each step (as combat gathered it before), counted apart in the steps
// in which the gravel was being laid over several frames and had not been put up yet
// ("laying": there the two may differ, see ground.js) and in all others: every height a crawler
// asks for, each step a few dozen random points 3.5 to 6.5 u from the fish ("ring": where the
// larvae crawl, and where the gravel is laid and dropped as the fish swims), and every half
// second a few hundred random points round it -- within 11 u, where the two must agree to the
// last bit, and counted apart from 11 to 12 u ("edge": a pebble lying just past the old
// reach can reach in over its radius, and the two gather it differently) and from 12 to 16 u
// ("outer": beyond the old gathering, where the two have each gathered only part of what lies
// there). The fish keeps still in the gravel, or with `move` swims on and turns that far (rad)
// a step; `grow` [t, stage, progress] makes it bigger at t s, so that the gravel is laid anew
// at a coarser size over several frames. At the end both are timed on the heights the
// crawlers asked for, and on gathering.
async function groundCheck(salmon, extreme, set, scene, list, index, extra, errors) {
  const { fish, look, held } = salmon;
  const combat = extreme.combat;
  const { terrain, pebbles } = extreme.game;
  const lists = [[], []];
  const gather = (center) => {
    terrain.collidersNear(center.x, center.z, 12, lists[0]);
    lists[1].length = 0;
    pebbles?.near?.(center, 12, lists[1]);
  };
  const result = { asked: 0, askedDiffer: 0, askedMaxDiff: 0, askedLaying: 0, askedFarthest: 0, ring: 0, ringDiffer: 0, ringMaxDiff: 0, ringLaying: 0, points: 0, pointsDiffer: 0, pointsMaxDiff: 0, pointsLaying: 0, layingMaxDiff: 0, edge: 0, edgeDiffer: 0, edgeInnermost: null, outer: 0, outerDiffer: 0, steps: 0, layingSteps: 0 };
  // (Who asks the gravel for its pebbles, how far round and how often: combat's ground among
  // them shows how often it really gathers.)
  const askers = new Map();
  const pebblesNear = pebbles?.near;
  if (pebblesNear)
    pebbles.near = (center, reach, out) => {
      if (out !== lists[1]) askers.set(out, { reach: +reach.toFixed(2), calls: (askers.get(out)?.calls ?? 0) + 1 });
      return pebblesNear.call(pebbles, center, reach, out);
    };
  // (How the gravel was laid: in how many steps it put its stones up to be drawn, and in how
  // many it ran out of its time before it was done without putting them up. From such a step
  // until it is put up again the pebbles it holds may not be those it draws (`unsettled`):
  // it changes them only in a step that either puts them up or runs out of its time. With
  // `budget` (ms) the gravel gets that much time a frame instead of its own 2.5 ms.)
  const laying = { steps: 0, uploads: 0, overran: 0, overranAt: [], longestMs: 0, unsettled: false };
  const pebblesUpdate = pebbles?.update;
  const uploads = () => pebbles.meshes.reduce((sum, mesh) => sum + mesh.instanceMatrix.version, 0);
  if (pebblesUpdate)
    pebbles.update = function (position, length, hintS, budget) {
      const before = uploads(),
        t0 = performance.now();
      const out = pebblesUpdate.call(this, position, length, hintS, budget ?? scene.budget);
      const ms = performance.now() - t0,
        uploaded = uploads() !== before;
      laying.steps++;
      if (uploaded) {
        laying.uploads++;
        laying.unsettled = false;
      } else if (ms >= (budget ?? scene.budget ?? 2.5)) {
        laying.overran++;
        laying.unsettled = true;
        if (laying.overranAt.length < 20) laying.overranAt.push(+extreme.game.now.time.toFixed(2));
      }
      laying.longestMs = Math.max(laying.longestMs, +ms.toFixed(2));
      return out;
    };
  const gathering = { ms: 0, calls: 0 };
  // (The heights asked, kept for timing: x, z, floor.)
  const asked = new Float64Array(3 * 8192);
  let ground = null,
    height = null;
  // (When, on the game's clock, the first few differences came.)
  const differed = [];
  const compare = (x, z, floor, h, key) => {
    const before = scanGround(lists, x, z, floor);
    if (laying.unsettled) {
      if (!Object.is(h, before)) result[`${key}Laying`]++;
      result.layingMaxDiff = Math.max(result.layingMaxDiff, Math.abs(h - before));
      return;
    }
    if (!Object.is(h, before)) {
      result[`${key}Differ`]++;
      const at = +extreme.game.now.time.toFixed(2);
      if (differed.length < 30 && differed[differed.length - 1] !== at) differed.push(at);
    }
    result[`${key}MaxDiff`] = Math.max(result[`${key}MaxDiff`], Math.abs(h - before));
  };
  // (A stream of its own for the points, so the game's never moves.)
  let seed = 0x9e3779b9;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // Combat's own ground, found in what it hands the enemies, is watched while they ask.
  const update = combat.enemies.update;
  combat.enemies.update = function (dt, time, players, hooks) {
    if (hooks.ground && !ground) {
      ground = hooks.ground;
      height = ground.height;
      // (What combat's gathering costs a step, from here on: it runs just before this.)
      const refresh = ground.refresh;
      ground.refresh = function (...args) {
        const t0 = performance.now();
        refresh.apply(this, args);
        gathering.ms += performance.now() - t0;
        gathering.calls++;
      };
      ground.height = (x, z, floor) => {
        const h = height(x, z, floor);
        const i = 3 * (result.asked++ % 8192);
        asked[i] = x;
        asked[i + 1] = z;
        asked[i + 2] = floor;
        result.askedFarthest = Math.max(result.askedFarthest, +Math.hypot(x - fish.position.x, z - fish.position.z).toFixed(2));
        compare(x, z, floor, h, "asked");
        return h;
      };
    }
    if (hooks.ground) {
      gather(fish.position);
      result.steps++;
      if (laying.unsettled) result.layingSteps++;
      for (let k = 0; k < 30; k++) {
        const r = 3.5 + 3 * random(),
          a = random() * Math.PI * 2;
        const x = fish.position.x + Math.cos(a) * r,
          z = fish.position.z + Math.sin(a) * r,
          floor = fish.position.y - 2 * random();
        result.ring++;
        compare(x, z, floor, height(x, z, floor), "ring");
      }
    }
    return update.call(this, dt, time, players, hooks);
  };
  let t = 0,
    turn = look.yaw;
  const path = { moved: 0, last: fish.position.clone() };
  const steer = () => {
    path.moved += path.last.distanceTo(fish.position);
    path.last.copy(fish.position);
    if (scene.move) {
      held.add("KeyW");
      turn += scene.move;
      look.yaw = turn;
      look.pitch = -0.1;
      combat.fire(false);
      return;
    }
    held.add("KeyS");
    const live = combat.enemies.list.filter((e) => !e.dead);
    const near = live.length ? live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a)) : null;
    if (near) {
      const d = near.position.clone().sub(fish.position);
      look.yaw = Math.atan2(d.z, d.x);
      look.pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    }
    combat.fire(!!near && t > scene.ground / 2);
  };
  for (; t < scene.ground; t += 0.5) {
    if (scene.grow && t === scene.grow[0]) salmon.salmon.setStage(scene.grow[1], scene.grow[2]);
    await salmon.run(0.5, steer);
    if (!ground) continue;
    gather(fish.position);
    for (let k = 0; k < 400; k++) {
      const far = k >= 300;
      const r = far ? 11 + 5 * random() : 11 * Math.sqrt(random()),
        a = random() * Math.PI * 2;
      const x = fish.position.x + Math.cos(a) * r,
        z = fish.position.z + Math.sin(a) * r,
        floor = fish.position.y - 2 * random();
      const h = height(x, z, floor);
      if (far) {
        const key = r < 12 ? "edge" : "outer";
        result[key]++;
        if (!Object.is(h, scanGround(lists, x, z, floor))) {
          result[`${key}Differ`]++;
          // (How far in, along the nearer axis of the old gathering's square, a difference
          // at its edge was found.)
          const inner = +Math.max(Math.abs(x - fish.position.x), Math.abs(z - fish.position.z)).toFixed(3);
          if (key === "edge") result.edgeInnermost = Math.min(result.edgeInnermost ?? inner, inner);
        }
      } else {
        result.points++;
        compare(x, z, floor, h, "points");
      }
    }
    if (t === 10) {
      extreme.frame(1 / 60);
      await salmon.capture(`${set}/${scene.name}`, 1280, 720);
    }
  }
  held.delete("KeyS");
  held.delete("KeyW");
  combat.fire(false);
  if (pebblesNear) pebbles.near = pebblesNear;
  if (pebblesUpdate) pebbles.update = pebblesUpdate;
  result.moved = +path.moved.toFixed(2);
  result.refreshMsPerStep = +(gathering.ms / Math.max(1, gathering.calls)).toFixed(4);
  result.fishLength = +fish.length.toFixed(3);
  // The timing: the heights the crawlers asked for, by the plain scan and by the cells, the
  // median of five rounds; then gathering, both ways (the cells' gathering forced each time).
  const timing = {};
  if (ground) {
    gather(fish.position);
    const n = Math.min(result.asked, 8192);
    const median = (runs) => runs.sort((p, q) => p - q)[2];
    const time = (fn) => {
      const runs = [];
      for (let round = 0; round < 5; round++) {
        const t0 = performance.now();
        let sum = 0;
        for (let i = 0; i < n; i++) sum += fn(asked[3 * i], asked[3 * i + 1], asked[3 * i + 2]);
        runs.push(((performance.now() - t0) * 1000) / n);
        // (The sum is looked at, so that the work cannot be left out.)
        if (sum === 0.123) console.log(sum);
      }
      return +median(runs).toFixed(3);
    };
    timing.heights = n;
    timing.scanMicros = time((x, z, floor) => scanGround(lists, x, z, floor));
    timing.cellsMicros = time(height);
    const fresh = createGround({ terrain, pebbles });
    const gathers = (fn) => {
      const runs = [];
      for (let round = 0; round < 5; round++) {
        const t0 = performance.now();
        for (let i = 0; i < 20; i++) fn();
        runs.push((performance.now() - t0) / 20);
      }
      return +median(runs).toFixed(3);
    };
    timing.gatherScanMs = gathers(() => gather(fish.position));
    timing.gatherCellsMs = gathers(() => fresh.refresh(fish.position, 12));
    timing.stones = lists[0].length;
    timing.pebbles = lists[1].length;
  }
  const record = [{ label: "ground", ...result, differed, askers: [...askers.values()], laying, timing }];
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// A weapon at work: the fish holds its place facing the enemies (or the one that cannot
// sink), the trigger goes down, pictures at the given moments, numbers at the end.
async function weapon(salmon, extreme, set, scene, list, index, extra, errors) {
  const { fish, look, THREE, course } = salmon;
  const combat = extreme.combat;
  const player = combat.players[0];
  const a = player.arsenal;
  a.back = scene.weapon;
  a.belly = scene.belly ?? null;
  a.ensure(a.back);
  combat.firing.options.debug = true;
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const spot = {};
  // The target that cannot sink, `ahead` fish lengths in front, side on.
  let dummy = null,
    dummyAt = null;
  if (scene.dummy) {
    const [kind, ahead] = scene.dummy;
    dummyAt = fish.position.clone().addScaledVector(heading, ahead * L);
    course.locate(dummyAt.x, dummyAt.z, fish.river.s, spot);
    dummy = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y, { heading: left.clone() });
    if (dummy) {
      dummy.hp = dummy.maxHp = 1e6;
      dummyAt.copy(dummy.position);
    }
  }
  const live = () => combat.enemies.list.filter((e) => !e.dead);
  const nearest = () => {
    const l = live();
    return l.length ? l.reduce((m, e) => (e.position.distanceTo(fish.position) < m.position.distanceTo(fish.position) ? e : m)) : null;
  };
  // `hold`: the enemies there are now are kept where they are from the fish, facing it,
  // and cannot sink, as the dummy is (a fight that stays the same while it is timed).
  const pack = scene.hold ? combat.enemies.list.map((e) => ({ e, at: e.position.clone().sub(fish.position), heading: e.heading.clone() })) : [];
  for (const { e } of pack) e.hp = e.maxHp = 1e6;
  // (`low`: the fish kept that far above the bed under it where it starts, in u.)
  let lowY = null;
  if (scene.low != null) {
    course.locate(fish.position.x, fish.position.z, fish.river.s, spot);
    lowY = course.bed(spot.s, spot.u) + scene.low;
  }
  const keepLow = () => {
    if (lowY === null) return;
    fish.position.y = lowY;
    fish.velocity.y = 0;
  };
  const hold = () => {
    for (const { e, at, heading } of pack) {
      e.position.copy(fish.position).add(at);
      e.heading.copy(heading);
      e.mode = "recover";
      e.t = -5;
      e.velocity.set(0, 0, 0);
      e.speed = 0;
    }
    if (!dummy) return;
    // (Kept at its distance from the fish, which drifts and is kicked back by its gun.)
    dummyAt.copy(fish.position).addScaledVector(heading, scene.dummy[1] * L);
    dummy.position.copy(dummyAt);
    dummy.heading.copy(left);
    dummy.mode = "recover";
    dummy.t = -5;
    dummy.velocity.set(0, 0, 0);
    dummy.speed = 0;
  };
  // `bolts`: so many more laser bolts a step, as more players beside the fish would fire
  // them: from a ring round it, at the enemies in turn, a little scattered -- by a fixed
  // sequence, not the game's random stream, so the fight goes as it would without them.
  const { WEAPONS, damageScale } = scene.bolts ? await import("../weapons.js") : {};
  const boltFrom = new THREE.Vector3(),
    boltDir = new THREE.Vector3();
  let bolts = 0,
    boltsDue = 0;
  const volley = () => {
    const l = live();
    if (!scene.bolts || !l.length) return;
    const w = WEAPONS.piu;
    const speed = w.speed(L);
    for (boltsDue += scene.bolts; boltsDue >= 1; boltsDue--) {
      const k = bolts++;
      const a = k * 2.39996;
      boltFrom.copy(fish.position).addScaledVector(left, Math.cos(a) * 1.5 * L);
      boltFrom.y += Math.sin(a) * 0.8 * L;
      boltDir.copy(l[k % l.length].position).sub(boltFrom).normalize();
      boltDir.x += (((k * 0.618034) % 1) - 0.5) * 0.06;
      boltDir.y += (((k * 0.414214) % 1) - 0.5) * 0.06;
      boltDir.z += (((k * 0.732051) % 1) - 0.5) * 0.06;
      boltDir.normalize().multiplyScalar(speed);
      const p = combat.projectiles.spawn(player.id, "piu", boltFrom, boltDir, fish.river.s);
      p.damage = w.damage * damageScale(L);
      p.radius = w.radius(L);
      p.life = w.reach(L) / speed;
      p.size = w.size(L);
      p.tint = w.tint;
      p.core = w.core;
      p.stretch = w.stretch;
      p.shooter = L;
    }
  };
  const face = () => {
    // (`swim`: the fish swims round in a wide circle instead, turning that far (rad) a step,
    // so that the gravel is laid ahead of it and dropped behind it as it goes.)
    if (scene.swim) {
      salmon.held.add("KeyW");
      look.yaw += scene.swim;
      look.pitch = -0.1;
      return;
    }
    const near = nearest();
    if (!near) return;
    // (The phone's auto-fire goes by the crosshair, the middle of the view: the view itself
    // is steered onto the enemy, by how far the eye's own direction is off.)
    if (scene.auto) {
      const eye = extreme.game.camera;
      const ahead = new THREE.Vector3();
      eye.getWorldDirection(ahead);
      const want = near.position.clone().sub(eye.getWorldPosition(new THREE.Vector3())).normalize();
      let turn = Math.atan2(want.z, want.x) - Math.atan2(ahead.z, ahead.x);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      look.yaw += 0.6 * turn;
      look.pitch = Math.max(-0.9, Math.min(0.9, look.pitch + 0.6 * (Math.asin(Math.max(-1, Math.min(1, want.y))) - Math.asin(Math.max(-1, Math.min(1, ahead.y))))));
      return;
    }
    const d = near.position.clone().sub(fish.position);
    look.yaw = Math.atan2(d.z, d.x);
    look.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
  };
  // A camera of our own following the fish: [aside (to its left), above, behind, looking
  // ahead], in the spawn's units (tenths of a metre, scaled up for a big fish). The aim then
  // follows the nearest enemy instead of the view.
  const follow = () => {
    if (!scene.side) return;
    const [aside, above, behind, ahead] = scene.side;
    const s = Math.max(1, L);
    const fwd = fish.heading.clone().setY(0).normalize();
    const port = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
    const eye = fish.position.clone().addScaledVector(fwd, -behind * s).addScaledVector(port, aside * s);
    eye.y += above * s;
    const target = fish.position.clone().addScaledVector(fwd, ahead * s);
    salmon.view(eye.toArray(), target.toArray(), 0.02);
  };
  if (scene.side) {
    const aim = combat.aim;
    const update = aim.update;
    aim.update = function (enemies, reach) {
      const near = nearest();
      if (!near) return update.call(aim, enemies, reach);
      aim.point.copy(near.position);
      aim.direction.copy(near.position).sub(fish.position).normalize();
      return aim.point;
    };
  }
  hold();
  keepLow();
  face();
  await salmon.run(0.3, () => {
    hold();
    keepLow();
    face();
    follow();
  });
  const id = scene.weapon;
  const w = combat.firing.stats;
  const P = 32.7 * Math.min(12, Math.max(1, Math.pow(L / 0.35, 0.7)));
  const record = [];
  const note = (label, t) =>
    record.push({
      label,
      t: +t.toFixed(2),
      length: +L.toFixed(3),
      P: +P.toFixed(1),
      energy: +fish.energy.toFixed(3),
      kills: player.kills,
      heat: +(a.heat[id] ?? 0).toFixed(2),
      locked: !!a.locked[id],
      ammo: a.ammo[id],
      reloading: +(a.reloading[id] ?? 0).toFixed(2),
      stats: structuredClone(w[id] ?? {}),
      shots: combat.projectiles.live.length,
      enemies: combat.enemies.list.map((e) => ({ kind: e.kind, mode: e.mode, hp: +e.hp.toFixed(1), dead: e.dead, d: +(e.position.distanceTo(fish.position) / L).toFixed(2) })),
    });
  note("start", 0);
  const pictures = [...(scene.pictures ?? [])].sort((x, y) => x - y);
  const lunges = [...(scene.lunges ?? [])];
  let t = 0,
    shot = 0,
    fireTime = 0;
  const dt = 1 / 30;
  const trigger = () => {
    if (scene.fire === false) return false;
    // (`pulse` [held, let go] seconds: for a weapon that fires when the trigger is let go.)
    if (scene.pulse) return t % (scene.pulse[0] + scene.pulse[1]) < scene.pulse[0];
    // (Letting them come close first: only with an enemy within `range`, spawn units.)
    if (scene.range) {
      const near = nearest();
      return !!near && near.position.distanceTo(fish.position) - near.size * 0.4 < scene.range * Math.max(1, L);
    }
    if (!scene.melee) return true;
    // The blade only when something is in reach, in front.
    const near = nearest();
    if (!near) return false;
    const to = near.position.clone().sub(fish.position);
    return to.length() - near.size * 0.45 < 1.05 * L && to.dot(fish.heading) > 0;
  };
  // `snaps`: a picture in the step of the first time each happens ("shot", "blast", "kill",
  // "konter", "dash", "reload", "lock"; "flight": 0.15 s after the first shot; "blast" and
  // "gas": 0.07 and 0.5 s after the first blast that can be seen: in the view, within 25 fish
  // lengths of the eye).
  const snaps = new Set(scene.snaps ?? []);
  const camera = extreme.game.camera;
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const at = new THREE.Vector3();
  let blastsSeen = 0,
    blastsAll = 0,
    blastSeenAt = null,
    firstShot = null;
  const seeBlasts = () => {
    const n = w[id]?.blasts ?? 0;
    if (n > blastsAll) {
      blastsAll = n;
      const p = w[id]?.lastBlast;
      if (p) {
        at.fromArray(p);
        camera.updateMatrixWorld();
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(viewProjection);
        if (frustum.containsPoint(at) && at.distanceTo(camera.position) < 25 * L) {
          // (Pictured two steps on, when the flash is full, and half a second on, when its
          // gas and silt have spread.)
          if (!blastsSeen) blastSeenAt = t;
          blastsSeen++;
        }
      }
    }
    if (firstShot === null && (w[id]?.shots ?? 0) > 0) firstShot = t;
  };
  const after = (from, delay) => (from !== null && t >= from + delay - 1e-6 ? 1 : 0);
  const counters = () => ({ shot: w[id]?.shots ?? 0, flight: after(firstShot, 0.15), blast: after(blastSeenAt, 0.07), gas: after(blastSeenAt, 0.5), kill: player.kills, konter: w[id]?.konter ?? 0, dash: w[id]?.dashes ?? 0, reload: w[id]?.reloads ?? 0, lock: a.locked[id] ? 1 : 0 });
  let before = counters();
  const snap = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${scene.name}-${name}`, 1280, 720);
    note(`picture ${name}`, t);
  };
  // `perf`: at these moments the frame is timed (drawn back to back and waited for), whole
  // and with each of combat's pictures hidden in turn; and what combat's step and frame
  // cost the processor, on average.
  const perf = [...(scene.perf ?? [])];
  const timing = { step: 0, steps: 0, frame: 0, frames: 0, hostile: 0, rounds: 0, shots: 0 };
  if (perf.length) {
    const step = combat.step,
      frame = combat.frame;
    // (The enemies' rounds on their own too, with how many there were.)
    const hostile = combat.hostile,
      update = hostile.update;
    hostile.update = (dt, players, hooks) => {
      const t0 = performance.now();
      update(dt, players, hooks);
      timing.hostile += performance.now() - t0;
      timing.rounds += hostile.live.length;
    };
    // (And the players' shots.)
    const projectiles = combat.projectiles,
      move = projectiles.update;
    projectiles.update = (dt, hooks) => {
      const t0 = performance.now();
      move(dt, hooks);
      timing.shots += performance.now() - t0;
    };
    combat.step = (...args) => {
      const t0 = performance.now();
      step(...args);
      timing.step += performance.now() - t0;
      timing.steps++;
    };
    combat.frame = (...args) => {
      const t0 = performance.now();
      frame(...args);
      timing.frame += performance.now() - t0;
      timing.frames++;
    };
  }
  const timings = [];
  // (Other work on the card makes single timings drift: each part is timed hidden and shown
  // in turn, five times over, and the median of the differences kept.)
  const measure = async (label) => {
    extreme.frame(1 / 60);
    const groups = { all: ["Combat glow", "Combat smoke", "Combat bubbles", "Combat ribbons", "Combat grenades"], "Combat glow": ["Combat glow"], "Combat smoke": ["Combat smoke"], "Combat bubbles": ["Combat bubbles"] };
    const median = (list) => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)];
    const parts = {};
    const wholes = [];
    for (const [key, names] of Object.entries(groups)) {
      const objects = [];
      salmon.scene.traverse((o) => names.includes(o.name) && o.visible && objects.push(o));
      const differences = [];
      for (let k = 0; k < 5; k++) {
        const shown = await throughput(salmon, 20);
        for (const o of objects) o.visible = false;
        const hidden = await throughput(salmon, 20);
        for (const o of objects) o.visible = true;
        wholes.push(shown);
        differences.push(shown - hidden);
      }
      parts[key] = +median(differences).toFixed(2);
    }
    timings.push({ label, t: +t.toFixed(2), frame: +median(wholes).toFixed(2), parts, shots: combat.projectiles.live.length, smoke: combat.smoke.live, stepMs: +(timing.step / Math.max(1, timing.steps)).toFixed(3), frameMs: +(timing.frame / Math.max(1, timing.frames)).toFixed(3), hostileMs: +(timing.hostile / Math.max(1, timing.steps)).toFixed(4), rounds: Math.round(timing.rounds / Math.max(1, timing.steps)), shotsMs: +(timing.shots / Math.max(1, timing.steps)).toFixed(4) });
    timing.step = timing.steps = timing.frame = timing.frames = timing.hostile = timing.rounds = timing.shots = 0;
  };
  if (perf.length) await measure("before");
  let steps = 0;
  while (t < scene.seconds - 1e-6) {
    await salmon.run(dt, () => {
      hold();
      keepLow();
      face();
      follow();
      volley();
      // (A fish that shrugs the enemies' hits off, so that they keep firing.)
      if (scene.endure) fish.energy = 1;
      if (scene.auto) {
        combat.autoFire(true);
        return;
      }
      const on = trigger();
      combat.fire(on);
      if (on) fireTime += dt;
    });
    t += dt;
    // (Each step a frame, as the game draws one: the frame's own work is timed too.)
    if (perf.length) extreme.frame(dt);
    // (Now and then a moment for the page to breathe.)
    if (++steps % 15 === 0) await nextTask();
    if (lunges.length && t >= lunges[0] - 1e-6) {
      lunges.shift();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    }
    seeBlasts();
    const now = counters();
    for (const k of snaps)
      if (now[k] > before[k]) {
        snaps.delete(k);
        await snap(k);
        break;
      }
    before = now;
    if (pictures.length > shot && t >= pictures[shot] - 1e-6) {
      await snap(String(shot + 1));
      shot++;
    }
    if (perf.length && t >= perf[0] - 1e-6) await measure(`t ${perf.shift()}`);
  }
  if (scene.auto) combat.autoFire(false);
  if (scene.swim) salmon.held.delete("KeyW");
  combat.fire(false);
  await salmon.run(0.1);
  note("end", t);
  const s = w[id] ?? {};
  const summary = { weapon: id, length: +L.toFixed(3), P: +P.toFixed(1), fireTime: +fireTime.toFixed(2), damage: +(s.damage ?? 0).toFixed(1), dps: +((s.damage ?? 0) / Math.max(1e-3, scene.seconds)).toFixed(1), dpsInP: +((s.damage ?? 0) / Math.max(1e-3, scene.seconds) / P).toFixed(2), kills: player.kills, energy: +fish.energy.toFixed(3) };
  record.push({ label: "summary", ...summary });
  if (timings.length) record.push({ label: "timing", timings });
  if (scene.side) salmon.view(null);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, summary, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

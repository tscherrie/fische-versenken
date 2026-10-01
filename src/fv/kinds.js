// The enemies of Salmon Survival Extreme: every kind that comes for the salmon, with what it
// is called, how big it is, how much it takes to sink it, how it fights, and where it lives.
// Kinds the base game already has as hunters keep its numbers for their senses and speeds
// (predators.js), so a trout still moves like a trout; what Extreme adds is hit points, how
// many come, and the plan of attack.

import { COATS } from "../anatomy.js";
import { PREDATORS } from "../predators.js";

const TROUT = PREDATORS.trout;
const BULLHEAD = PREDATORS.bullhead;
const PERCH = PREDATORS.perch;
const COD = PREDATORS.cod;
const PIKE = PREDATORS.pike;
const OTTER = PREDATORS.otter;

// Every kind carries one fixed weapon, strapped on like the salmon's: a melee weapon makes
// its strike a stab or a slash, a charge (`contact`, `bomb`) goes off in a blast (combat's
// explode), a ranged one lets it shoot from a distance (hostile.js):
//   range [near, far] in units, tell: how long it aims before it fires (the moment to
//   dodge), burst: shots in a row, interval between them, pellets per shot, spread (rad),
//   speed, drag (how fast the water stops a round, per second), damage per hit (of the
//   strength bar), reload after a burst; a heavy round may `shove` the fish it strikes (how
//   hard, x the fish's cruising speed).
// behaviour:
//   ambush   lies still on the bed until the salmon comes close, then snaps
//   stalker  follows at a distance, draws itself up (the tell) and strikes
//   pack     a few together circle the salmon and dart in one after another; with
//            `school` [least, most] a whole shoal comes, and three may dart at once
//   diver    a bird over the water (flies): it hovers over the salmon (the tell) and plunges
//            beak first at it, `height` above the surface, down to `depth` below it
//   wader    a bird standing in the shallows (wades), its head `head` over the water: it
//            turns to the salmon and shoots down into the river; its legs are its body
//   drifter  drifts with the water, beating its bell, and comes on only very slowly: a mine
//            that goes off at a touch (the jellyfish); with `field` [least, most] a loose
//            field of them comes
//   bomber   a bird high over the water (flies), out of reach: it lines up over the salmon
//            (the tell), dives, lets its bombs go just above the water and climbs away
// (A pack of `pack` [least, most] comes together, three when it does not say; `bank`: it
// lies off to the side of the salmon's way, toward the bank, where the weed is; `rises`:
// an ambusher on the bed that comes up off it at a salmon it sees above, out of its reach.)
// swallows: a strike from a fish at least 2.2 times the salmon's length swallows it whole
// (the base game's rule), otherwise it bites: `bite` of the strength bar, less when the
// enemy is smaller than the salmon.
export const KINDS = {
  bullhead: {
    title: "Groppe",
    name: BULLHEAD.name,
    body: "bullhead",
    coat: "bullhead",
    size: [1.0, 1.5],
    hp: 16,
    capacity: 10,
    behaviour: "ambush",
    swallows: true,
    bite: 0.12,
    sight: 3.2,
    cruise: 0.9,
    chase: 3,
    strike: BULLHEAD.strike,
    range: 1.1,
    turn: BULLHEAD.turn,
    coil: 0.2,
    bottom: true,
    from: 40,
    regions: { brook: 1, upper: 0.7 },
    weapon: { id: "sawnoff", title: "Abgesägte Schrotflinte", kind: "ranged", range: [1, 4], tell: 0.4, burst: 1, interval: 0.1, pellets: 7, spread: 0.16, speed: 13, drag: 2.6, damage: 0.03, reload: 2.6, cause: "Von einer Groppe niedergeschossen" },
  },
  troutParr: {
    title: "Junge Forelle",
    name: "Von einer jungen Forelle erstochen",
    body: "parr",
    coat: { ...COATS.parr, back: [0.04, 0.035, 0.016], redSpots: 1, blackSpots: 0.9, halo: 0.6 },
    size: [0.7, 1.2],
    hp: 10,
    capacity: 18,
    behaviour: "pack",
    swallows: false,
    bite: 0.05,
    sight: 9,
    cruise: 1.6,
    chase: 4.2,
    strike: 7.5,
    range: 0.7,
    turn: 4.4,
    coil: 0.14,
    from: 60,
    regions: { brook: 1, upper: 0.7, middle: 0.3 },
    weapon: { id: "knife", title: "Kampfmesser", kind: "melee", damage: 0.07 },
  },
  trout: {
    title: "Bachforelle",
    name: TROUT.name,
    body: "trout",
    coat: "trout",
    size: TROUT.size,
    hp: 80,
    capacity: 5,
    behaviour: "stalker",
    swallows: true,
    bite: 0.25,
    sight: TROUT.sight,
    cruise: TROUT.cruise,
    chase: TROUT.stalk * 1.3,
    strike: TROUT.strike,
    range: TROUT.range,
    turn: TROUT.turn,
    coil: 0.32,
    from: 130,
    regions: { brook: 1, upper: 0.8 },
    weapon: { id: "smg", title: "Maschinenpistole", kind: "ranged", range: [3, 9], tell: 0.5, burst: 6, interval: 0.085, pellets: 1, spread: 0.045, speed: 16, drag: 1.4, damage: 0.028, reload: 1.9, cause: "Von einer Bachforelle erschossen" },
  },
  // The old king of the trout: a boss (bosses.js), huge, in his own deep pool, with a minigun
  // on his back. He guards the katana.
  king: {
    title: "Der alte König",
    name: "Vom alten König gefressen",
    body: "trout",
    coat: "trout",
    size: [10, 11],
    hp: 900,
    capacity: 1,
    behaviour: "stalker",
    boss: true,
    leash: 42,
    swallows: true,
    bite: 0.35,
    sight: 16,
    cruise: 2,
    chase: 3.6,
    strike: 15,
    range: 3.4,
    turn: 2.4,
    coil: 0.45,
    regions: {},
    weapon: { id: "minigun", title: "Minigun", kind: "ranged", range: [3, 14], tell: 0.8, burst: 26, interval: 0.05, pellets: 1, spread: 0.08, speed: 18, drag: 1.2, damage: 0.018, reload: 2.2, cause: "Vom alten König durchsiebt" },
  },
  // A shoal of minnows with razor blades: many small fish round the salmon, slashing as
  // they dart past. Each is little (a pulse or two of the laser), the shoal is the danger.
  minnow: {
    title: "Elritze",
    name: "Von Elritzen zerschnitten",
    body: "minnow",
    coat: "minnow",
    size: [0.55, 0.85],
    hp: 4,
    capacity: 24,
    behaviour: "pack",
    school: [8, 11],
    swallows: false,
    bite: 0.03,
    sight: 8,
    // (Quick for their size: a shoal keeps round the salmon against the current.)
    cruise: 2.6,
    chase: 5.5,
    strike: 9,
    range: 0.35,
    turn: 6,
    coil: 0.25,
    from: 600,
    regions: { upper: 1, middle: 0.6 },
    weapon: { id: "razor", title: "Rasierklingen", kind: "melee", damage: 0.03 },
  },
  // The river's and the sea's own fish (the base game's shoals, life.js): peaceful until
  // shot at (neutrals.js). Then the weaker ones flee and the stronger turn on the salmon
  // with their weapon from the table (plan, part 4a); the director sends the armed ones as
  // well, in their own waters. (`temper`: how readily it stands up to the salmon, as the
  // base game's brawls have it.)
  grayling: {
    title: "Äsche",
    name: "Von einer Äsche erschossen",
    body: "grayling",
    coat: "grayling",
    size: [1.4, 2.6],
    hp: 36,
    capacity: 6,
    behaviour: "stalker",
    swallows: false,
    bite: 0.12,
    temper: 0.9,
    sight: 10,
    cruise: 1.4,
    chase: 5,
    strike: 9,
    range: 0.6,
    turn: 3.2,
    coil: 0.4,
    from: 1500,
    regions: { upper: 0.5, middle: 1, lower: 0.5 },
    weapon: { id: "crossbow", title: "Armbrust", kind: "ranged", range: [3, 12], tell: 0.8, burst: 1, interval: 0.1, pellets: 1, spread: 0.008, speed: 22, drag: 0.9, damage: 0.1, reload: 2.4, cause: "Von einer Äsche mit der Armbrust erschossen" },
  },
  // The perch hunt as a pack in the middle and lower river, three or four together, each
  // with a pistol: they spread round the salmon and put two rounds into it at a time, one
  // after another. One alone is soon sunk; the pack is the danger. (A big one can still
  // swallow a small parr, as in the base game.)
  perch: {
    title: "Flussbarsch",
    name: PERCH.name,
    body: "perch",
    coat: "perch",
    size: PERCH.size,
    hp: 26,
    capacity: 8,
    behaviour: "pack",
    pack: [3, 4],
    swallows: true,
    bite: 0.1,
    sight: PERCH.sight,
    cruise: PERCH.cruise,
    chase: PERCH.chase,
    strike: PERCH.strike,
    range: PERCH.range,
    turn: PERCH.turn,
    coil: 0.25,
    regions: { middle: 1, lower: 1, estuary: 0.4, upper: 0.2 },
    weapon: { id: "pistol", title: "Pistole", kind: "ranged", range: [2, 8], tell: 0.45, burst: 2, interval: 0.18, pellets: 1, spread: 0.04, speed: 15, drag: 1.5, damage: 0.035, reload: 1.6, cause: "Von Flussbarschen erschossen" },
  },
  // The cod lies on the sea bed in ambush as the bullhead does in the brook, only far
  // bigger, with a pump-action shotgun: a close blast of buckshot. The sea is deep, so it
  // does not wait for the salmon to come down to it: one swimming over it, seen but out of
  // its reach, it comes up at. Big enough to swallow a postsmolt whole.
  cod: {
    title: "Dorsch",
    name: COD.name,
    body: "cod",
    coat: "cod",
    size: COD.size,
    hp: 240,
    capacity: 4,
    behaviour: "ambush",
    bottom: true,
    rises: true,
    swallows: true,
    bite: 0.22,
    sight: COD.sight,
    cruise: COD.cruise,
    // (The base game's cod never chases; this one comes up off the bed at this pace, and
    // goes after the salmon when a shot wakes it.)
    chase: 3.5,
    strike: COD.strike,
    // (A shorter strike than the base game's, so that its gun has a distance of its own
    // before the lunge: a blast of buckshot first, then the jaws.)
    range: 1.2,
    turn: COD.turn,
    coil: 0.25,
    regions: { sea: 1, estuary: 0.3 },
    weapon: { id: "pumpgun", title: "Pumpgun", kind: "ranged", range: [1.5, 6.5], tell: 0.5, burst: 1, interval: 0.1, pellets: 8, spread: 0.13, speed: 14, drag: 1.7, damage: 0.04, reload: 1.3, cause: "Von einem Dorsch mit der Pumpgun erlegt" },
  },
  // The pike: the sniper of the middle river. It lies still in the weed off to the side of
  // the salmon's way, toward the bank, and aims a long while -- the aim is the tell, and its
  // red laser line shows through the water (combat.js) -- then fires one heavy round from
  // an elephant gun that throws the salmon aside, and takes long to reload. Come too close
  // and it strikes instead, and it can swallow nearly any salmon whole. A big fish, hard to
  // sink.
  pike: {
    title: "Hecht",
    name: PIKE.name,
    body: "pike",
    coat: "pike",
    size: PIKE.size,
    hp: 180,
    capacity: 2,
    behaviour: "ambush",
    bank: true,
    swallows: true,
    bite: 0.3,
    sight: PIKE.sight,
    cruise: PIKE.cruise,
    // (The base game's pike never chases; woken by a shot it does, a little.)
    chase: 4.5,
    strike: PIKE.strike,
    // (Its strike from closer than the base game's, so that it shoots first and strikes only
    // at a salmon that comes near.)
    range: 2.5,
    turn: PIKE.turn,
    coil: 0.4,
    regions: { middle: 1, lower: 1, upper: 0.3, estuary: 0.3 },
    weapon: { id: "elephantgun", title: "Elefantenbüchse", kind: "ranged", range: [4, 18], tell: 1.3, burst: 1, interval: 0.1, pellets: 1, spread: 0.002, speed: 26, drag: 0.7, damage: 0.3, shove: 2, reload: 5, cause: "Von einem Hecht aus dem Hinterhalt erschossen" },
  },
  eel: {
    title: "Aal",
    name: "Von einem Aal geschockt",
    body: "eel",
    coat: "eel",
    size: [2.5, 5.0],
    hp: 60,
    capacity: 4,
    behaviour: "ambush",
    bottom: true,
    swallows: false,
    bite: 0.14,
    temper: 1.1,
    sight: 4,
    cruise: 0.8,
    chase: 4,
    strike: 10,
    range: 1,
    turn: 2.4,
    coil: 0.3,
    from: 3500,
    regions: { lower: 1, estuary: 0.8, middle: 0.3 },
    // (It stuns a moment: the salmon is slowed; combat's hurt() reads `stun`.)
    weapon: { id: "shocker", title: "Elektroschocker", kind: "melee", damage: 0.12, stun: 0.8 },
  },
  // The otter: no fish but a mammal the length of a big salmon, drawn with the base game's
  // otter body (it swims in the fish's frame). It hunts by night above all, fast and
  // turning well, and hacks with a machete: before each blow it backs off a little and rears
  // its head for the swing (`rear` in the weapon, radians; the tell, the moment to dodge),
  // brings the blade down hard, and takes its time before the next. It holds its breath
  // `air` seconds and must then go up for a few breaths at the surface -- the salmon's
  // window. (Shorter than the base game's 25 s: in a fight it should come up now and then.)
  otter: {
    title: "Otter",
    name: "Von einem Otter mit der Machete zerhackt",
    body: "otter",
    coat: "otter",
    size: OTTER.size,
    hp: 170,
    capacity: 2,
    behaviour: "stalker",
    nocturnal: true,
    // (Its eyes sit further forward on its flat head than a fish's, for their shine at night:
    // lengths ahead of its middle, up, and to either side; combat.js.)
    eyes: [0.39, 0.03, 0.035],
    // (A heavy beast: a hit hardly checks it or pushes it back, enemies.js.)
    steady: 0.85,
    blood: "mammal",
    swallows: false,
    bite: 0.16,
    air: 16,
    sight: 12,
    cruise: 3,
    chase: 9,
    strike: 12,
    range: 2.2,
    turn: OTTER.turn,
    coil: 0.6,
    // (Seconds it takes after a blow before it goes again: a heavy blade is slow to bring
    // round.)
    rest: 2.4,
    from: 2600,
    regions: { upper: 0.3, middle: 0.7, lower: 1, estuary: 1 },
    weapon: { id: "machete", title: "Machete", kind: "melee", damage: 0.16, rear: 0.45, cause: "Von einem Otter mit der Machete zerhackt" },
  },
  stickleback: {
    title: "Stichling",
    name: "Von Stichlingen gespickt",
    body: "minnow",
    coat: { ...COATS.minnow, back: [0.02, 0.035, 0.018], flank: [0.2, 0.26, 0.14], bars: 0.3, silver: 0.6 },
    size: [0.4, 0.6],
    hp: 2.5,
    capacity: 20,
    behaviour: "pack",
    school: [8, 12],
    swallows: false,
    bite: 0.02,
    temper: 0.9,
    sight: 8,
    cruise: 2.4,
    chase: 5,
    strike: 8,
    range: 0.3,
    turn: 6,
    coil: 0.25,
    from: 4000,
    regions: { estuary: 1, lower: 0.4 },
    weapon: { id: "stars", title: "Wurfsterne", kind: "ranged", range: [1.5, 6], tell: 0.35, burst: 1, interval: 0.1, pellets: 1, spread: 0.05, speed: 11, drag: 2, damage: 0.022, reload: 1.6, cause: "Von Stichlingen mit Wurfsternen gespickt" },
  },
  // A jellyfish with a spiked sea mine strapped under its bell. It drifts with the water,
  // each beat of its bell lifting it a little and the water letting it sink back, and
  // steers toward the salmon only very slowly (`cruise`, on top of the drift); they come as
  // a loose field of them (`field` [least, most]), a minefield to thread through. It has no
  // strike: its mine goes off when the salmon touches it, and when it dies -- it takes very
  // little -- so a blast next to another sets that one off as well. It is drawn with its own
  // placeholder (`render: "jelly"`), faintly glowing, more so at night; `beat` is how often
  // its bell beats (a second), `lift` how fast a beat lifts it and `sink` how fast it sinks
  // between (u/s). (The coat only colours what is left of it.)
  jellyfish: {
    title: "Qualle",
    name: "Von einer Qualle mit Seemine zerrissen",
    render: "jelly",
    coat: { flank: [0.5, 0.52, 0.52], back: [0.34, 0.24, 0.24] },
    size: [2, 2.8],
    hp: 5,
    capacity: 16,
    behaviour: "drifter",
    field: [4, 7],
    blood: "jelly",
    swallows: false,
    bite: 0,
    sight: 16,
    cruise: 0.3,
    chase: 0.3,
    strike: 0,
    range: 0,
    turn: 0.5,
    coil: 0,
    beat: 0.55,
    lift: 1.7,
    sink: 0.36,
    from: 14500,
    regions: { estuary: 1, sea: 0.8 },
    // A contact mine: it goes off when the salmon's body comes within `trigger` (u) of the
    // bell or the mine, with a blast of radius `blast` (u) that takes `damage` of the
    // strength bar at its heart and `edge` of that at its rim, and does `harm` hit points to
    // the enemies caught in it at its heart, `edge` of that at its rim (so a jellyfish near
    // it goes off too, one further off only if it was already hurt).
    weapon: { id: "seamine", title: "Seemine", kind: "contact", trigger: 0.3, blast: 2.8, damage: 0.45, edge: 0.15, harm: 16, cause: "Von einer Qualle mit Seemine zerrissen" },
  },
  // The gannet with bombs under its wings: it circles high over the sea, far out of reach of
  // the salmon's weapons (they carry only a little way out of the water), and draws its
  // circle over the salmon; lined up, its circle tightens and it tips over (the tell,
  // `coil` seconds), then it plunges steeply, lets its bombs go just above the water, pulls
  // out low and climbs away, and comes round again once it has loaded anew. At the bottom
  // of its dive it is in reach: the moment to shoot it. It circles `height` over the water,
  // `radius` round the salmon, at `cruise`; it dives at `strike` (u/s).
  gannet: {
    title: "Basstölpel",
    name: "Von einem Basstölpel mit Fliegerbomben zerfetzt",
    render: "bird",
    model: "gannet",
    size: [8.5, 9.5],
    hp: 45,
    capacity: 1,
    behaviour: "bomber",
    flies: true,
    blood: "bird",
    swallows: false,
    bite: 0,
    sight: 60,
    cruise: 9,
    chase: 13,
    strike: 24,
    range: 0,
    turn: 1.6,
    coil: 1.2,
    height: 17,
    radius: 11,
    from: 15000,
    regions: { sea: 1, estuary: 0.3 },
    // `bombs` a pass, `interval` apart (a pair, one under each wing: let go together),
    // `release` (u) over the water; in the water a bomb is braked (`drag`, per second) and
    // sinks, and goes off on its fuse -- set when it is let go for the depth the salmon is
    // at, within `fuse` [least, most] seconds after it went in -- or at once when it comes
    // within `trigger` (u) of the salmon's body; its blast as the sea mine's. `reload`:
    // seconds before the next pass. It goes for a salmon no deeper than `depth` (u): its
    // bombs would not get down to one deeper.
    weapon: { id: "bombs", title: "Fliegerbomben", kind: "bomb", bombs: 2, interval: 0, release: 2.6, drag: 3.2, fuse: [0.1, 1.2], depth: 12, trigger: 1, blast: 3.2, damage: 0.3, edge: 0.25, harm: 60, reload: 4.5, cause: "Von einem Basstölpel mit Fliegerbomben zerfetzt" },
  },
  herring: {
    title: "Hering",
    name: "Von Heringen erstochen",
    body: "herring",
    coat: "herring",
    size: [1.2, 2.2],
    hp: 6,
    capacity: 24,
    behaviour: "pack",
    school: [10, 14],
    swallows: false,
    bite: 0.04,
    temper: 0.5,
    sight: 12,
    cruise: 3,
    chase: 8,
    strike: 12,
    range: 0.5,
    turn: 5,
    coil: 0.25,
    from: 5000,
    regions: { sea: 1 },
    weapon: { id: "knives", title: "Wurfmesser", kind: "ranged", range: [2, 7], tell: 0.4, burst: 1, interval: 0.1, pellets: 1, spread: 0.04, speed: 12, drag: 1.8, damage: 0.03, reload: 1.8, cause: "Von Heringen mit Wurfmessern gespickt" },
  },
  mackerel: {
    title: "Makrele",
    name: "Von Makrelen erschossen",
    body: "mackerel",
    coat: "mackerel",
    size: [2.2, 3.4],
    hp: 14,
    capacity: 16,
    behaviour: "pack",
    school: [6, 9],
    swallows: false,
    bite: 0.06,
    temper: 0.6,
    sight: 14,
    cruise: 3.4,
    chase: 9,
    strike: 13,
    range: 0.7,
    turn: 4.4,
    coil: 0.3,
    from: 5000,
    regions: { sea: 1 },
    weapon: { id: "rifle", title: "Sturmgewehr", kind: "ranged", range: [3, 12], tell: 0.5, burst: 3, interval: 0.1, pellets: 1, spread: 0.035, speed: 18, drag: 1.3, damage: 0.028, reload: 2.2, cause: "Von Makrelen niedergeschossen" },
  },
  // The sand eel has nothing in the table: shot at, it only ever flees.
  sandeel: {
    title: "Sandaal",
    name: "Von Sandaalen gebissen",
    body: "sandeel",
    coat: "sandeel",
    size: [0.8, 2.0],
    hp: 4,
    capacity: 12,
    behaviour: "pack",
    swallows: false,
    bite: 0.03,
    temper: 0.4,
    sight: 10,
    cruise: 2.2,
    chase: 9,
    strike: 10,
    range: 0.3,
    turn: 5,
    coil: 0.2,
    regions: {},
    weapon: null,
  },
  // The kingfisher over the brook, with a push dagger strapped to its beak (plan, part 4a).
  // It is drawn with its own model (`render: "bird"`; for now the base game's), and is hit
  // like any enemy: shots and the beam carry on a little above the surface for it.
  kingfisher: {
    title: "Eisvogel",
    name: "Von einem Eisvogel erdolcht",
    render: "bird",
    model: "kingfisher",
    size: [1.5, 1.8],
    hp: 14,
    capacity: 2,
    behaviour: "diver",
    flies: true,
    blood: "bird",
    swallows: false,
    bite: 0.12,
    sight: 14,
    cruise: 4,
    chase: 7,
    strike: 15,
    range: 0.5,
    turn: 5,
    coil: 1.1,
    height: 2.6,
    depth: 3.2,
    from: 20,
    regions: { brook: 1, upper: 0.5 },
    weapon: { id: "pushdagger", title: "Stoßdolch", kind: "melee", damage: 0.12 },
  },
  // The goosander: a diving duck the size of a big trout, hunting under water, with a
  // revolver. It comes down from the surface and goes up again for air (`air` seconds).
  merganser: {
    title: "Gänsesäger",
    name: "Von einem Gänsesäger erschossen",
    render: "bird",
    model: "merganser",
    size: [5.5, 6.5],
    hp: 60,
    capacity: 2,
    behaviour: "stalker",
    blood: "bird",
    swallows: false,
    bite: 0.15,
    air: 20,
    sight: 11,
    cruise: 3,
    chase: 6,
    strike: 12,
    range: 1.6,
    turn: 3.5,
    coil: 0.4,
    from: 400,
    regions: { brook: 0.4, upper: 1, middle: 1 },
    weapon: { id: "revolver", title: "Revolver", kind: "ranged", range: [2.5, 9], tell: 0.6, burst: 6, interval: 0.28, pellets: 1, spread: 0.03, speed: 15, drag: 1.5, damage: 0.035, reload: 3, cause: "Von einem Gänsesäger erschossen" },
  },
  // The grey heron: it stands on its stilts in the shallows, head high over the water, and
  // shoots a harpoon gun down into the river -- one heavy shot, then a long reload. What of
  // it is in the water, its legs, is what can be hit.
  heron: {
    title: "Graureiher",
    name: "Von einem Graureiher harpuniert",
    render: "bird",
    model: "heron",
    size: [3, 3],
    hp: 90,
    capacity: 1,
    behaviour: "wader",
    wades: true,
    blood: "bird",
    swallows: false,
    bite: 0.2,
    head: 16,
    sight: 20,
    cruise: 0,
    chase: 0,
    strike: 0,
    range: 0,
    turn: 1.2,
    coil: 1.1,
    from: 700,
    regions: { upper: 1, middle: 1, lower: 0.6 },
    weapon: { id: "speargun", title: "Harpunengewehr", kind: "ranged", air: true, range: [3, 24], tell: 1.1, burst: 1, interval: 0.1, pellets: 1, spread: 0.003, speed: 24, drag: 0.9, damage: 0.22, reload: 4.5, cause: "Von einem Graureiher harpuniert" },
  },
  // The gravel defence (gravel.js): water-insect larvae crawling through the redd at the
  // alevins. They are drawn by their own models (look/larvae.js), not with a fish body
  // (`render`); until those are in, a stand-in body shows where they are.
  dragonflyLarva: {
    title: "Libellenlarve",
    name: "Von einer Libellenlarve gepackt",
    render: "larva",
    body: "eel",
    coat: "eel",
    size: [0.32, 0.45],
    hp: 5,
    capacity: 8,
    behaviour: "stalker",
    crawls: true,
    bottom: true,
    swallows: false,
    bite: 0.09,
    sight: 6,
    cruise: 0.4,
    chase: 0.65,
    strike: 3,
    range: 0.28,
    turn: 3,
    coil: 0.35,
    regions: {},
    weapon: { id: "switchblade", title: "Springmesser", kind: "melee", damage: 0.09 },
  },
  beetleLarva: {
    title: "Gelbrandkäferlarve",
    name: "Von einer Gelbrandkäferlarve zerrissen",
    render: "larva",
    body: "eel",
    coat: "eel",
    size: [0.45, 0.6],
    hp: 9,
    capacity: 4,
    behaviour: "stalker",
    crawls: true,
    bottom: true,
    swallows: false,
    bite: 0.14,
    sight: 6,
    cruise: 0.35,
    chase: 0.7,
    strike: 3.4,
    range: 0.3,
    turn: 2.6,
    coil: 0.4,
    regions: {},
    weapon: { id: "nailgun", title: "Nagelpistole", kind: "ranged", range: [0.8, 3], tell: 0.45, burst: 3, interval: 0.16, pellets: 1, spread: 0.06, speed: 9, drag: 2.4, damage: 0.05, reload: 2.2, cause: "Von einer Gelbrandkäferlarve festgenagelt" },
  },
  // The salmon's own school, fallen (fv/school.js): never an enemy and never sent. A school
  // fish that is killed becomes a body of one of these, dead from the start (enemies.fallen),
  // so that it floats up belly first and goes as the enemies' dead do -- or bursts -- in its
  // own coat: a smolt's silver, a spawner's hooked jaw and hump (school.js sets those). `kin`:
  // the salmon does not eat its own.
  schoolSmolt: {
    title: "Smolt",
    name: "Smolt",
    body: "salmon",
    coat: "smolt",
    size: [1.4, 8.5],
    hp: 1,
    capacity: 16,
    behaviour: "stalker",
    kin: true,
    swallows: false,
    bite: 0,
    sight: 0,
    cruise: 0,
    chase: 0,
    strike: 0,
    range: 0,
    turn: 0,
    coil: 0,
    regions: {},
    weapon: null,
  },
  schoolSpawner: {
    title: "Laichlachs",
    name: "Laichlachs",
    body: "salmon",
    coat: "spawner",
    size: [8, 9.5],
    hp: 1,
    capacity: 10,
    behaviour: "stalker",
    kin: true,
    swallows: false,
    bite: 0,
    sight: 0,
    cruise: 0,
    chase: 0,
    strike: 0,
    range: 0,
    turn: 0,
    coil: 0,
    regions: {},
    weapon: null,
  },
};

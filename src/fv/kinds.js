// The enemies of Salmon Survival Extreme: every kind that comes for the salmon, with what it
// is called, how big it is, how much it takes to sink it, how it fights, and where it lives.
// Kinds the base game already has as hunters keep its numbers for their senses and speeds
// (predators.js), so a trout still moves like a trout; what Extreme adds is hit points, how
// many come, and the plan of attack.

import { COATS } from "../anatomy.js";
import { PREDATORS } from "../predators.js";

const TROUT = PREDATORS.trout;
const BULLHEAD = PREDATORS.bullhead;

// Every kind carries one fixed weapon, strapped on like the salmon's: a melee weapon makes
// its strike a stab or a slash, a ranged one lets it shoot from a distance (hostile.js):
//   range [near, far] in units, tell: how long it aims before it fires (the moment to
//   dodge), burst: shots in a row, interval between them, pellets per shot, spread (rad),
//   speed, drag (how fast the water stops a round, per second), damage per hit (of the
//   strength bar), reload after a burst.
// behaviour:
//   ambush   lies still on the bed until the salmon comes close, then snaps
//   stalker  follows at a distance, draws itself up (the tell) and strikes
//   pack     a few together circle the salmon and dart in one after another; with
//            `school` [least, most] a whole shoal comes, and three may dart at once
//   diver    a bird over the water (flies): it hovers over the salmon (the tell) and plunges
//            beak first at it, `height` above the surface, down to `depth` below it
//   wader    a bird standing in the shallows (wades), its head `head` over the water: it
//            turns to the salmon and shoots down into the river; its legs are its body
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
};

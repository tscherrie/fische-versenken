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
//   speed, damage per hit (of the strength bar), reload after a burst.
// behaviour:
//   ambush   lies still on the bed until the salmon comes close, then snaps
//   stalker  follows at a distance, draws itself up (the tell) and strikes
//   pack     a few together circle the salmon and dart in one after another
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
    weapon: { id: "sawnoff", title: "Abgesägte Schrotflinte", kind: "ranged", range: [1.2, 5.5], tell: 0.4, burst: 1, interval: 0.1, pellets: 7, spread: 0.16, speed: 13, damage: 0.03, reload: 2.6, cause: "Von einer Groppe niedergeschossen" },
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
    weapon: { id: "smg", title: "Maschinenpistole", kind: "ranged", range: [3.5, 15], tell: 0.5, burst: 6, interval: 0.085, pellets: 1, spread: 0.045, speed: 16, damage: 0.028, reload: 1.9, cause: "Von einer Bachforelle erschossen" },
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
    cruise: 0.35,
    chase: 0.45,
    strike: 3,
    range: 0.28,
    turn: 3,
    coil: 0.35,
    regions: {},
    weapon: { id: "mask", title: "Fangmaske", kind: "melee", damage: 0.09 },
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
    cruise: 0.3,
    chase: 0.5,
    strike: 3.4,
    range: 0.3,
    turn: 2.6,
    coil: 0.4,
    regions: {},
    weapon: { id: "mandibles", title: "Saugzangen", kind: "melee", damage: 0.14 },
  },
};

// The enemies of Salmon Survival Extreme: every kind that comes for the salmon, with what it
// is called, how big it is, how much it takes to sink it, how it fights, and where it lives.
// Kinds the base game already has as hunters keep its numbers for their senses and speeds
// (predators.js), so a trout still moves like a trout; what Extreme adds is hit points, how
// many come, and the plan of attack.

import { COATS } from "../anatomy.js";
import { PREDATORS } from "../predators.js";

const TROUT = PREDATORS.trout;
const BULLHEAD = PREDATORS.bullhead;

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
  },
  troutParr: {
    title: "Junge Forelle",
    name: "Von einer jungen Forelle totgebissen",
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
  },
};

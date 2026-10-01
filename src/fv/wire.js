// The co-op wire for the enemies (plan, part 5; owners.js is what uses it): how the pages
// tell each other about the enemies each of them runs, in as few bytes as will do. An
// enemy's place, heading, mode and strength go out several times a second to every mate
// near it, so they are packed tight -- eight 16-bit words a record, all the records of a
// batch in one base64 string, which the room passes on as it is. The rest (an enemy's
// intro the first time a mate hears of it, the events: shots, hits, deaths, claims) is rare
// enough for plain JSON arrays.
//
// Nothing here knows the game: the tables of kinds and weapons are handed in (both pages
// run the same version -- the lobby checks it -- so an index means the same on both), and
// the module runs in node for its test (tools/fv-wire-test.mjs).

// An enemy's modes as the records carry them (enemies.js; neutrals.js's for the stand-ins).
export const MODES = ["approach", "orbit", "coil", "strike", "recover", "lurk", "aim", "fire", "hover", "breathe", "circle", "drift", "stand", "leave", "wander", "flee", "dead", "neutral"];
const MODE_INDEX = new Map(MODES.map((m, i) => [m, i]));
export const modeIndex = (mode) => MODE_INDEX.get(mode) ?? 0;

// The kinds and the weapons by index, and back (weapons: the players' own, then what else
// can sink an enemy: the enemies' charges, and a bite).
export function tables(kinds, weapons) {
  const weaponList = [...weapons, "seamine", "bombs", "bite"];
  return {
    kinds: kinds.slice(),
    kindIndex: new Map(kinds.map((k, i) => [k, i])),
    weapons: weaponList,
    weaponIndex: new Map(weaponList.map((w, i) => [w, i])),
  };
}

// A record, one enemy's state, in words (16 bits each):
//   0, 1   its id (low and high half)
//   2-4    x, y, z less the batch's origin, in POS steps a unit (1 mm: +-327 u)
//   5      its heading: the yaw in a byte (1.4 degrees), the pitch in a signed byte above it
//   6      mf: the mode (5 bits), its target's place + 1 (3 bits), rolled, burning, rising,
//          and its claim's version mod 16 (owners.js)
//   7      its strength in percent (7 bits); the top bit says an extra word follows
//   8      the extra, for a kind that needs one: the heron's facing, a rearing kind's rear,
//          a bomber's bank (radians x ANGLE)
export const RECORD_WORDS = 8;
export const POS = 100;
export const ANGLE = 5000;
// (How far from the origin a record can place an enemy.)
export const REACH = 32767 / POS;
const TAU = Math.PI * 2;

// The mode word: what the records say besides the place.
export function packMF(mode, targetSeat, rolled, burning, rising, version) {
  return (mode & 31) | ((targetSeat + 1) & 7) << 5 | (rolled ? 1 << 8 : 0) | (burning ? 1 << 9 : 0) | (rising ? 1 << 10 : 0) | ((version & 15) << 11);
}
export function unpackMF(mf, out) {
  out.mode = mf & 31;
  out.target = ((mf >> 5) & 7) - 1;
  out.rolled = !!(mf & (1 << 8));
  out.burning = !!(mf & (1 << 9));
  out.rising = !!(mf & (1 << 10));
  out.version = (mf >> 11) & 15;
  return out;
}

const s16 = (w) => (w & 0x8000 ? w - 0x10000 : w);
const clamp16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));

// The heading's yaw and pitch in a word, and back into a unit vector ({x, y, z}).
export function packHeading(hx, hy, hz) {
  const yaw = Math.atan2(hz, hx);
  const pitch = Math.asin(Math.max(-1, Math.min(1, hy)));
  const y = Math.round(((yaw + Math.PI) / TAU) * 256) & 255;
  const p = Math.max(-127, Math.min(127, Math.round((pitch / (Math.PI / 2)) * 127)));
  return y | ((p + 128) << 8);
}
export function unpackHeading(word, out) {
  const yaw = ((word & 255) / 256) * TAU - Math.PI;
  const pitch = ((((word >> 8) & 255) - 128) / 127) * (Math.PI / 2);
  const c = Math.cos(pitch);
  out.x = Math.cos(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = Math.sin(yaw) * c;
  return out;
}

// Records are written into a growing word buffer, and a batch's worth packed at once.
export function createRecords() {
  let words = new Uint16Array(512);
  let n = 0;
  const room = (k) => {
    if (n + k <= words.length) return;
    const bigger = new Uint16Array(Math.max(words.length * 2, n + k));
    bigger.set(words.subarray(0, n));
    words = bigger;
  };
  return {
    get length() {
      return n;
    },
    get words() {
      return words;
    },
    clear() {
      n = 0;
    },
    // One enemy: its id, its place (less the origin), its heading word and mode word, its
    // strength (0..1), and the extra (null for none). Where it lies past what a record can
    // reach from the origin, it is left out (false).
    add(id, dx, dy, dz, heading, mf, strength, extra = null) {
      if (Math.abs(dx) > REACH || Math.abs(dy) > REACH || Math.abs(dz) > REACH) return false;
      room(RECORD_WORDS + 1);
      words[n++] = id & 0xffff;
      words[n++] = (id >>> 16) & 0xffff;
      words[n++] = clamp16(dx * POS) & 0xffff;
      words[n++] = clamp16(dy * POS) & 0xffff;
      words[n++] = clamp16(dz * POS) & 0xffff;
      words[n++] = heading & 0xffff;
      words[n++] = mf & 0xffff;
      const hp = Math.max(0, Math.min(100, Math.round(strength * 100)));
      words[n++] = hp | (extra === null ? 0 : 0x8000);
      if (extra !== null) words[n++] = clamp16(extra * ANGLE) & 0xffff;
      return true;
    },
    // The last record's words from `from` on (for skipping a record that did not change).
    same(from, previous) {
      if (!previous) return false;
      const k = n - from;
      if (previous.length !== k) return false;
      // (Not the id: it is the same enemy.)
      for (let i = 2; i < k; i++) if (words[from + i] !== previous[i]) return false;
      return true;
    },
    // Take the last record back out (unchanged, not sent after all).
    drop(from) {
      n = from;
    },
    copy(from, into) {
      const k = n - from;
      if (!into || into.length !== k) into = new Uint16Array(k);
      into.set(words.subarray(from, n));
      return into;
    },
    // The words from `from` to `to`, as base64 (little end first).
    pack(from = 0, to = n) {
      return encodeWords(words, from, to);
    },
  };
}

export function encodeWords(words, from, to) {
  let text = "";
  const bytes = new Uint8Array(2 * (to - from));
  for (let i = from, j = 0; i < to; i++) {
    bytes[j++] = words[i] & 255;
    bytes[j++] = words[i] >> 8;
  }
  // (In pieces: fromCharCode takes only so many arguments at once.)
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function decodeWords(text) {
  let binary;
  try {
    binary = atob(text);
  } catch {
    return new Uint16Array(0);
  }
  const words = new Uint16Array(binary.length >> 1);
  for (let i = 0; i < words.length; i++) words[i] = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8);
  return words;
}

// One record out of the words at `at` into `out` ({ id, x, y, z, heading, mf, hp, extra }),
// positions still relative to the origin; how many words it took (0 at the end).
export function readRecord(words, at, out) {
  if (at + RECORD_WORDS > words.length) return 0;
  out.id = (words[at] | (words[at + 1] << 16)) >>> 0;
  out.x = s16(words[at + 2]) / POS;
  out.y = s16(words[at + 3]) / POS;
  out.z = s16(words[at + 4]) / POS;
  out.heading = words[at + 5];
  out.mf = words[at + 6];
  out.hp = (words[at + 7] & 0x7f) / 100;
  const more = !!(words[at + 7] & 0x8000);
  if (more && at + RECORD_WORDS >= words.length) return 0;
  out.extra = more ? s16(words[at + RECORD_WORDS]) / ANGLE : null;
  return RECORD_WORDS + (more ? 1 : 0);
}

// Numbers for the JSON arrays: rounded to what they need, and a unit vector's parts x 100.
export const r2 = (v) => Math.round(v * 100) / 100;
export const dir100 = (v) => Math.round(v * 100);

// The version order of the claims (owners.js): a record's version mod 16 is newer than the
// one this page holds when it is ahead by 1 to 7 (a page that missed a claim or two catches
// up; one eight or more behind is stale and does not count).
export function newer(recordVersion, known) {
  const d = (recordVersion - known) & 15;
  return d >= 1 && d <= 7;
}

// A small generator from a seed (16 bits), the same on every page: the pellets of an
// enemy's shot fly the same way everywhere (mulberry32).
export function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

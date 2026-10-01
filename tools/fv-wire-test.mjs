// A check of the co-op wire (src/fv/wire.js) without a browser: records packed and read
// back come out where they went in, to the step the wire promises; the mode word and the
// heading survive the round trip; the version order and the seeded pellets behave.
//
//   node tools/fv-wire-test.mjs

import { ANGLE, MODES, POS, REACH, createRecords, decodeWords, modeIndex, newer, packHeading, packMF, readRecord, seeded, tables, unpackHeading, unpackMF } from "../src/fv/wire.js";

let failed = 0;
const ok = (cond, what) => {
  if (!cond) {
    failed++;
    console.log(`FAIL ${what}`);
  } else console.log(`ok   ${what}`);
};

// A batch of records at random, read back.
const rnd = seeded(7);
const records = createRecords();
const sent = [];
for (let i = 0; i < 300; i++) {
  const id = Math.floor(rnd() * 4e8) * 4 + (i % 4);
  const x = (rnd() - 0.5) * 2 * (REACH - 1),
    y = (rnd() - 0.5) * 60,
    z = (rnd() - 0.5) * 2 * (REACH - 1);
  const yaw = (rnd() - 0.5) * 2 * Math.PI,
    pitch = (rnd() - 0.5) * 1.4;
  const h = { x: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(yaw) * Math.cos(pitch) };
  const mf = packMF(Math.floor(rnd() * MODES.length), Math.floor(rnd() * 5) - 1, rnd() < 0.5, rnd() < 0.5, rnd() < 0.5, Math.floor(rnd() * 40));
  const hp = rnd();
  const extra = i % 3 === 0 ? (rnd() - 0.5) * 6 : null;
  ok(records.add(id, x, y, z, packHeading(h.x, h.y, h.z), mf, hp, extra), `record ${i} fits`) || null;
  sent.push({ id, x, y, z, h, mf, hp, extra });
}
ok(!records.add(1, REACH + 1, 0, 0, 0, 0, 1), "a record out of reach is left out");
const words = decodeWords(records.pack());
ok(words.length === records.length, `words through base64: ${words.length}`);
const out = {};
const head = {};
let at = 0,
  worst = 0,
  worstAngle = 0,
  n = 0;
for (const s of sent) {
  const k = readRecord(words, at, out);
  if (!k) break;
  at += k;
  n++;
  if (out.id !== s.id) ok(false, `id ${s.id} read as ${out.id}`);
  worst = Math.max(worst, Math.abs(out.x - s.x), Math.abs(out.y - s.y), Math.abs(out.z - s.z));
  unpackHeading(out.heading, head);
  worstAngle = Math.max(worstAngle, Math.acos(Math.min(1, head.x * s.h.x + head.y * s.h.y + head.z * s.h.z)));
  if (out.mf !== s.mf) ok(false, `mode word of ${s.id}`);
  if (Math.abs(out.hp - s.hp) > 0.0051) ok(false, `strength of ${s.id}: ${out.hp} for ${s.hp}`);
  if ((out.extra === null) !== (s.extra === null) || (s.extra !== null && Math.abs(out.extra - s.extra) > 0.6 / ANGLE)) ok(false, `extra of ${s.id}`);
}
ok(n === sent.length, `all ${sent.length} records read back`);
ok(worst <= 0.5 / POS + 1e-9, `places within half a step (${worst.toFixed(4)} u)`);
ok(worstAngle < 0.03, `headings within 1.7 degrees (${((worstAngle * 180) / Math.PI).toFixed(2)})`);
const bytes = Math.ceil((records.length * 2 * 4) / 3);
ok(bytes / sent.length < 25, `about ${(bytes / sent.length).toFixed(1)} characters a record`);

// The mode word.
const mf = unpackMF(packMF(modeIndex("strike"), 3, true, false, true, 21), {});
ok(MODES[mf.mode] === "strike" && mf.target === 3 && mf.rolled && !mf.burning && mf.rising && mf.version === 5, "mode word round trip");
ok(unpackMF(packMF(0, -1, false, false, false, 0), {}).target === -1, "no target");

// The version order.
ok(newer(5, 4) && newer(0, 15) && newer(3, 12) && !newer(4, 4) && !newer(3, 5) && !newer(12, 3), "claim versions mod 16");

// The tables.
const t = tables(["a", "b"], ["piu", "flinte"]);
ok(t.weapons[t.weaponIndex.get("seamine")] === "seamine" && t.kindIndex.get("b") === 1, "tables");

// The seeded pellets: the same seed gives the same numbers.
const a = seeded(1234),
  b = seeded(1234),
  c = seeded(1235);
let same = true,
  differs = false;
for (let i = 0; i < 50; i++) {
  const x = a();
  if (x !== b()) same = false;
  if (x !== c()) differs = true;
  if (!(x >= 0 && x < 1)) same = false;
}
ok(same && differs, "seeded numbers repeat for a seed, differ between seeds");

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

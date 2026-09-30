// A quick check of the room service against `wrangler dev` (or a deployed one: ROOMS=url):
// two players open a room, see each other in the lobby, get ready, are started together,
// and one's state and events reach the other; the first comes back with its token to the
// same place.
const base = process.env.ROOMS ?? "http://localhost:8787";
const ws = base.replace(/^http/, "ws");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function player(code, name, token) {
  const sock = new WebSocket(`${ws}/rooms/${code}/ws`);
  const got = [];
  const waiters = [];
  sock.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    got.push(m);
    for (const w of waiters.splice(0)) w();
  });
  const opened = new Promise((r) => sock.addEventListener("open", r));
  const next = async (t, ms = 4000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = got.findIndex((m) => m.t === t);
      if (i >= 0) return got.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`${name}: no ${t}`);
      await new Promise((r) => (waiters.push(r), setTimeout(r, 100)));
    }
  };
  return { sock, next, opened, send: (m) => sock.send(JSON.stringify(m)), hello: async () => { await opened; sock.send(JSON.stringify({ t: "hello", name, version: "test 1", token })); } };
}
const ok = (cond, what) => {
  if (!cond) throw new Error("FAILED: " + what);
  console.log("ok  " + what);
};
const { code } = await (await fetch(`${base}/rooms/new`)).json();
ok(/^[A-Z2-9]{6}$/.test(code), `room code ${code}`);
const a = player(code, "Anna");
await a.hello();
const wa = await a.next("welcome");
ok(wa.seat === 0 && wa.host === 0 && !wa.started, "the first is host in place 0");
const b = player(code, "Ben");
await b.hello();
const wb = await b.next("welcome");
ok(wb.seat === 1, "the second gets place 1");
const lobby = await a.next("lobby");
ok(lobby.seats.length >= 1, "the host hears the lobby");
a.send({ t: "ready", ready: true });
b.send({ t: "ready", ready: true });
const sa = await a.next("start");
const sb = await b.next("start");
ok(sa.at === sb.at && sa.at > Date.now() - 1000, "both are started at the same moment");
a.send({ t: "state", x: 1.5, y: -2, z: 3, s: 40 });
const st = await b.next("state");
ok(st.seat === 0 && st.x === 1.5, "a state reaches the other");
b.send({ t: "ev", kind: "shot", w: "piu" });
const ev = await a.next("ev");
ok(ev.seat === 1 && ev.kind === "shot", "an event reaches the other");
a.send({ t: "ping", c: 7 });
const pong = await a.next("pong");
ok(pong.c === 7 && pong.s > 0, "ping is answered with the room's time");
a.sock.close();
const left = await b.next("left");
ok(left.seat === 0, "the other hears when one leaves");
await wait(200);
const a2 = player(code, "Anna", wa.token);
await a2.hello();
const w2 = await a2.next("welcome");
ok(w2.seat === 0 && w2.started, "coming back with the token gives the same place, the game still on");
a2.sock.close();
b.sock.close();
console.log("all good");
process.exit(0);

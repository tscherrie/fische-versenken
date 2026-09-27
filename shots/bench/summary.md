# Combat bench

Budget for all of combat: at most 1.5 ms on the card and 1 ms of script a frame, on WebGPU, WebGL 2 and Eco. Two fights in one place: **four players** as the game can have them today (40 enemies firing their own guns, as many laser bolts as four players firing without pause keep in the water) and a **stress case** (40 enemies, 150 players' shots, 60 enemy rounds held in flight). Fight minus the same place without it, median of the repeats (their range in brackets). Card: combat's meshes shown against hidden in turns in the stress case, all pairs of the repeats pooled, with the 95 % interval of the median and the same method on nothing (A/A). "All of it": combat.step + combat.frame and everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card).

| configuration | card (ms) | card A/A (ms) | four players: step + frame | four players: all of it | stress: step + frame | stress: all of it | combat's draw calls / triangles | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| webgpu-detail | 0.637 (0.550 … 0.725) | −0.019 (-0.138 … 0.125) | 1.606 (1.354 … 1.756) | 2.353 (1.983 … 2.483) | 2.656 (2.571 … 2.888) | 3.358 (3.277 … 3.616) | +19 / +62320 | 0 |
| webgl2-detail | 0.631 (0.525 … 0.750) | +0.013 (-0.037 … 0.075) | 1.454 (1.379 … 1.762) | 2.226 (2.174 … 2.609) | 2.521 (2.447 … 2.915) | 3.400 (3.345 … 3.796) | +19 / +57714 | 0 |
| webgpu-eco | 0.719 (0.537 … 1.025) | +0.056 (-0.313 … 0.338) | 1.514 (1.457 … 1.790) | 2.324 (2.205 … 2.600) | 2.480 (2.337 … 2.932) | 3.301 (3.113 … 3.741) | +19 / +31524 | 0 |

(≤: the script, not the card, held up the frames drawn back to back, so the card's number is an upper bound.) Details: bench-<configuration>.md.

## Verdicts

- **webgpu-detail:** card within; four players: step + frame **over**, all of it **over**; stress case: step + frame **over**, all of it **over**.
- **webgl2-detail:** card within; four players: step + frame **over**, all of it **over**; stress case: step + frame **over**, all of it **over**.
- **webgpu-eco:** card within; four players: step + frame **over**, all of it **over**; stress case: step + frame **over**, all of it **over**.

## Where the script's time goes (ms a frame: four players / stress case)

| part | webgpu-detail | webgl2-detail | webgpu-eco |
|---|---:|---:|---:|
| projectiles.update | 0.242 / 1.260 | 0.205 / 1.211 | 0.224 / 1.188 |
| enemies.update | 0.531 / 0.467 | 0.522 / 0.437 | 0.622 / 0.547 |
| hostile.update | 0.039 / 0.117 | 0.063 / 0.113 | 0.053 / 0.099 |
| the crawlers' ground gathered (collidersNear, pebbles.near) | 0.293 / 0.270 | 0.240 / 0.242 | 0.260 / 0.269 |
| the stones for the shots (collidersNear) | 0.024 / 0.027 | 0.017 / 0.018 | 0.029 / 0.027 |
| the local player's weapons (firing.fire, firing.after) | 0.040 / 0.064 | 0.035 / 0.055 | 0.066 / 0.064 |
| aim, director, pickups, smoke | 0.031 / 0.034 | 0.041 / 0.030 | 0.047 / 0.041 |
| rest of combat.step | 0.313 / 0.312 | 0.192 / 0.301 | 0.173 / 0.233 |
| combat.frame | 0.187 / 0.249 | 0.179 / 0.239 | 0.142 / 0.186 |
| firing done for the game by the bench | 0.005 / 0.009 | 0.005 / 0.010 | 0.007 / 0.021 |
| the threat list | 0.017 / 0.018 | 0.013 / 0.017 | 0.016 / 0.019 |
| style and layout | 0.242 / 0.254 | 0.231 / 0.249 | 0.315 / 0.333 |
| handing combat's meshes to the card | 0.425 / 0.425 | 0.563 / 0.563 | 0.438 / 0.438 |

## What the proposals save (ms a frame of combat.step, timed in turns)

| proposal | fight | webgpu-detail | webgl2-detail | webgpu-eco |
|---|---:|---:|---:|---:|
| (check: the copy of projectiles.update against the original) | stress case | −0.370 (-0.500 … -0.200) | −0.360 (-0.540 … -0.290) | −0.170 (-0.290 … -0.110) |
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.080 (-0.120 … -0.010) | −0.040 (-0.150 … -0.020) | −0.090 (-0.210 … 0.000) |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.140 (-0.200 … -0.070) | −0.130 (-0.200 … -0.060) | −0.160 (-0.240 … -0.090) |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.050 (-0.110 … 0.070) | +0.020 (-0.060 … 0.060) | +0.000 (-0.120 … 0.110) |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.170 (-0.250 … -0.070) | −0.160 (-0.250 … -0.070) | −0.080 (-0.230 … 0.060) |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.380 (-0.480 … -0.310) | −0.350 (-0.380 … -0.320) | −0.350 (-0.440 … -0.250) |
| The same three together | four players | −0.090 (-0.150 … -0.050) | −0.060 (-0.120 … 0.000) | −0.040 (-0.140 … 0.100) |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.220 (-0.280 … -0.190) | −0.230 (-0.270 … -0.180) | −0.270 (-0.430 … -0.170) |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.040 (-0.040 … 0.090) | −0.080 (-0.140 … -0.010) | +0.010 (-0.100 … 0.070) |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.510 (-0.600 … -0.440) | −0.610 (-0.820 … -0.530) | −0.890 (-1.140 … -0.710) |
| Everything together: the three for the shots, both for the ground | four players | −0.550 (-0.620 … -0.510) | −0.850 (-1.030 … -0.680) | −0.720 (-0.850 … -0.650) |
| Style and layout without the health bars (#foes, moved by transform since main's 96c98ec) | stress case | −0.030 (-0.050 … 0.000) | −0.050 (-0.120 … -0.030) | −0.050 (-0.090 … -0.020) |
| Style and layout without all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | stress case | −0.100 (-0.120 … -0.040) | −0.110 (-0.170 … -0.060) | −0.180 (-0.220 … -0.130) |
| Style and layout without the game's threat arrows (#threats, base game: Next's to change) | stress case | −0.070 (-0.100 … -0.060) | −0.090 (-0.130 … -0.050) | −0.090 (-0.140 … -0.060) |

(Median change with the middle half of the blocks; negative saves. The variants for the shots are timed against a plain copy of projectiles.update. Taking a part of the HUD off the page is the most that writing it by transform alone could save.)

## Notes

Written by hand; `node tools/fv-bench.mjs --summary-only` keeps this section when it writes the tables above again. Measured on 27.09.2026 between 05:42 and 06:21 on look-bench after merging Extreme main 3c7b5b9. That main has the serious weapons (the laser's pulses and beam), the real splatter, the gear models, the crawlers on fv/ground.js and a pooled projectiles.js with water ballistics. The machine was an Apple M1 Pro shared with 7–10 other headless Chromes, at a load of 107–423. Script times from this run are therefore high and spread wide; what is timed in turns (the card, the proposals) holds up better.

This branch's history has two quieter runs:

- on main 534f45d (6b46787), which differs from this main only in the enemies' pose refactor and the heartbeat sound: four players' step + frame 1.37–1.51 ms and 2.07–2.35 ms with everything else, the same verdicts;
- on main 23d279a (5055f72), before the weapons merge: 0.97–1.00 ms.

### What the numbers say

- **Card:** 0.64 ms on WebGPU, 0.63 ms on WebGL 2 and 0.72 ms on Eco. The 95 % intervals reach 0.73 / 0.75 / 1.03 ms. The A/A test gives −0.02 to +0.06 ms. That is within 1.5 ms everywhere.
  - Combat now draws 19 calls: the crowds and their far fish, glow, bubbles, blood, specks, smoke, ribbons and the player's gear.
- **Script, four players:** combat.step + combat.frame costs 1.61 / 1.45 / 1.51 ms, which is **over** 1 ms. With everything else the fight costs the script, it is 2.35 / 2.23 / 2.32 ms, also **over**.
- **Script, stress case:** 2.48–2.66 ms, and 3.30–3.40 ms with everything else.
- **Where the time goes at four players:**

| part | ms a frame |
|---|---:|
| enemies.update (mostly the crawlers' heights: each larva looks over about 50 stones and 1860 pebbles, twice a step) | 0.52–0.62 |
| handing combat's meshes to the renderer | 0.43–0.56 |
| rest of combat.step (gore.update, fx.update, the shots' trails, rules) | 0.17–0.31 |
| style and layout | 0.23–0.32 |
| gathering the crawlers' ground (pebbles.near looks up 2 × 529 cells by string key every step) | 0.24–0.29 |
| projectiles.update | 0.21–0.24 |
| combat.frame (the gear, smoke, splatter and glows) | 0.14–0.19 |
| the local player's weapons, beam included | 0.04–0.07 |

- **Players' shots:** projectiles.update costs 7.5–9.0 µs a shot per step, about twice what it did before the weapons merge. It allocates 1.3–1.6 MB a frame at the stress case, at projectiles.js:221; Math.abs results are among the top sites, which is how code that V8 does not keep optimized looks (see item 7).
- **Enemy rounds:** a flying round costs 0.8–1.2 µs a step, a spent one 0.08–0.31 µs, and one lying on the bed 0.02–0.27 µs.
- **Enemy rounds at the enemies' own pace** (19–22 a second, with the fish held low): they lie on the bed for up to 8 s and then go. The list held at most 119–131 of 160 rounds, and 90 of 90 on Eco (the oldest evicted). hostile.update took 0.06–0.07 ms a step.

### Proposals, with what they save (combat.step, timed in turns)

For the owner (combat code):

1. **The crawlers' ground (fv/ground.js).** Gather it again only once the fish has moved (0.5 u), and look up heights in 1 u cells sorted when it is gathered. Together these save **0.51–0.89 ms** at four players. Separately:
   - gathering only after a move saves 0.22–0.27 ms;
   - cells alone save about nothing (+0.04 to −0.08 ms), because sorting about 1900 pebbles every step costs what the cells save.

   height() also allocates 0.61–0.78 MB a frame at its own line. Its array literal and the iterators it makes on every call are the likely source, and two plain loops would avoid them.
2. **The players' shots (fv/projectiles.js).** Each variant was checked against the original on 60 steps (hits, stones, ground, bounces):
   - stones sorted into 2 u cells, redone only when the list changes: 0.13–0.16 ms at the stress case;
   - the enemies' positions and sizes in flat arrays for the first test of each pair: 0.08–0.17 ms;
   - the bed and surface lookup every other step: 0.04–0.09 ms, but the crossing between two lookups must be found (a bolt travels 4 u between them at Eco's 50 ms step).

   All three together save **0.35–0.38 ms** at the stress case and 0.04–0.09 ms at four players. Sorting the enemies into cells saves nothing at 40 enemies.
3. **Everything together, four players:** **0.55–0.85 ms** saved. combat.step + combat.frame would drop to about 0.60–1.06 ms: within budget on WebGL 2 and Eco, and at it on WebGPU in this loaded run (about 0.8 ms from the quieter run's 1.37–1.51 ms). Everything the fight costs the script would still be about 1.4–1.8 ms, which is over. What is left:
   - handing 19 meshes to the renderer: 0.43–0.56 ms (fewer draws would help, such as the far-fish meshes and item 4);
   - style and layout: 0.23–0.32 ms, of which combat's own HUD is 0.10–0.18 ms;
   - combat.frame: 0.14–0.19 ms;
   - gore.update and fx.update inside the step.
4. **The ribbons (look/smoke.js).** They draw even when there are none: one draw call with no vertices every frame. This is the WebGPU warning "Draw with a vertex count of 0". Hide the mesh, or set its count to 0, while it is empty.
5. **The allocations in projectiles.update.** They go with item 7: V8 keeps throwing its code away. Once that is fixed, measure them again.

For Next (base game):

6. **#threats:** Next 3.16 moves the threat arrows by transform. Taking them off the page still saves 0.07–0.09 ms of style and layout.
7. **course.js FALLS.** The river's falls come in four shapes of record, and fields are added to them after they are made. V8 keeps throwing level()'s compiled code away ("instance migration failed" on a fall, at course.js:511) wherever it has inlined level() into the caller:
   - **The plain game does it without the bench:** 34 times in 75 s of the lauf-parr scene, in life.js:1461.
   - **In the stress case:** 157 times in 30 s in projectiles.update, and 43 times in gore's update. An identical copy of projectiles.update runs 0.17–0.37 ms faster than the original, which is the "copy against the original" row above.
   - **With the falls rebuilt as records of one shape** (every field in one order from the start, poolLength and sill in the literal), in one probe run at a load of 57–80, measured once before and once after, not in turns:
     - projectiles.update fell from 1.17 to 0.69 ms;
     - combat.step + combat.frame from 2.58 to 2.09 ms;
     - the world's whole step from 3.56 to 2.96 ms;
     - the copy's lead from 0.43 to 0.05 ms.

     At four players the gain was only about 0.06 ms, in projectiles.update.

   A record of five fields beginning with `s`, as most of the falls are, can set it off from anywhere. The bench's own place record did so before it was changed.
8. **"Draw with an index count of 0":** no longer seen on this main. The "vertex count of 0" warning is item 4's.

### What changed in the bench after the review

- **Loads:**
  - A fight of four players now stands beside the stress case. The local player fires through weapons.js's verbs; bolts the bench fires for the other three carry what bolt() gives them.
  - Enemy firing forced by the bench is counted as combat's.
  - Enemies stay within their crowds; none is simulated but not drawn.
  - Corpses are cleared 0.5 s after the kill.
- **Metering:**
  - collidersNear and pebbles.near are metered for combat's calls only; the crawlers' ground, the shots' stones and the beam's stones are kept apart.
  - The weapon verbs and the smoke are parts of their own.
  - "All of it" counts style and layout, the paired mesh hand-over and the threat list.
  - The parts are all plain means.
- **Card:**
  - The pairs are pooled over the repeats, with a 95 % interval and an A/A test.
  - The player's gear ("FV gear", drawn in the mirror and the shadows too) now counts as combat's.
  - The per-part and sweep card numbers are gone (draw calls and triangles per part remain).
- **Proposals:**
  - Measured in turns in 32 blocks of 6 frames, leaving out each block's slowest frame.
  - They are timed against a copy of the pooled projectiles.update that hands its records back to the pool through the original.
- **Spent rounds:** they reach the spent state and the bed through hostile.js's own path. The soak runs at the enemies' own pace with the fish held low.
- **Allocation:** Chrome's sampling heap profiler replaces reading the heap's size.
- **Tools:**
  - Patches are undone however the bench ends.
  - fv-bench and fv-test take their Chrome (its whole process group) and server down on Ctrl-C or a kill, and remove the profile folder; this was checked with SIGINT and SIGTERM.
  - fv-bench uses a debugging port that Chrome picks, refuses a server that serves another tree, fails instead of hanging, and marks a configuration that failed in this run.
  - fv-test gives each scene its own profile and refuses an unknown --quality.
- **Found while measuring again, and fixed:**
  - The fish grew during the bench: kills feed it, by half a stage a minute. This invalidated the first bench's toggles, sweep and soak.
  - The bench's place record set off item 7.

### Review points not taken

- **look-models' run.mjs** runs manual scenes, and its header says fv-test cannot do --webgl or --quality. This is not a bench file. Whoever merges look-models should add `.filter((s) => !s.manual)` to its default list and fix that comment.
- **The scene address is built in three places.** scenes.js is the owner's file; the two tools say so in comments.
- **fv-bench's default port stays 8170:** 8170 upward is the Next session's agreed range. These runs passed `--port 8182`, and the debugging port is now Chrome's own.

### Open

- Merging look-models into look-bench leaves one conflicting line in runLook. Keep both lines, the models' first, then `if (ctx.scene.name === "bench") await bench(ctx);`.
- The other three players' beams are not simulated; the local player's pulses and beam are.
- Sound is not measured headless, since sound.buses() is null.
- Eco is the Eco settings on an M1 Pro, not Eco-class hardware.
- The larvae in the parr mix stand in for any crawler.
- A stray profile folder, `extreme-bench-IZed77`, has been in the temp folder since 26.09 23:49, from an earlier run that was interrupted. It was left alone.

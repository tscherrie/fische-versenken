# Combat bench

Budget for all of combat: at most 1.5 ms on the card and 1 ms of script a frame, on WebGPU, WebGL 2 and Eco. Two fights in one place: **four players** as the game can have them today (40 enemies firing their own guns, as many laser bolts as four players firing without pause keep in the water) and a **stress case** (40 enemies, 150 players' shots, 60 enemy rounds held in flight). Fight minus the same place without it, median of the repeats (their range in brackets). Card: combat's meshes shown against hidden in turns in the stress case, all pairs of the repeats pooled, with the 95 % interval of the median and the same method on nothing (A/A). "All of it": combat.step + combat.frame and everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card).

| configuration | card (ms) | card A/A (ms) | four players: step + frame | four players: all of it | stress: step + frame | stress: all of it | combat's draw calls / triangles | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| webgpu-detail | 0.463 (0.425 … 0.500) | +0.013 (-0.037 … 0.050) | 0.974 (0.924 … 1.020) | 1.381 (1.359 … 1.464) | 1.456 (1.435 … 1.488) | 1.915 (1.846 … 1.940) | +12 / +51242 | 0 |
| webgl2-detail | 0.475 (0.438 … 0.525) | +0.000 (-0.063 … 0.037) | 0.981 (0.955 … 1.001) | 1.508 (1.468 … 1.604) | 1.443 (1.417 … 1.492) | 1.992 (1.954 … 2.137) | +12 / +53992 | 0 |
| webgpu-eco | 0.463 (0.450 … 0.487) | +0.013 (-0.013 … 0.037) | 0.999 (0.990 … 1.016) | 1.477 (1.411 … 1.571) | 1.494 (1.469 … 1.502) | 1.997 (1.897 … 2.055) | +12 / +34960 | 0 |

(≤: the script, not the card, held up the frames drawn back to back, so the card's number is an upper bound.) Details: bench-<configuration>.md.

## Verdicts

- **webgpu-detail:** card within; four players: step + frame within, all of it **over**; stress case: step + frame **over**, all of it **over**.
- **webgl2-detail:** card within; four players: step + frame within, all of it **over**; stress case: step + frame **over**, all of it **over**.
- **webgpu-eco:** card within; four players: step + frame within, all of it **over**; stress case: step + frame **over**, all of it **over**.

## Where the script's time goes (ms a frame: four players / stress case)

| part | webgpu-detail | webgl2-detail | webgpu-eco |
|---|---:|---:|---:|
| projectiles.update | 0.132 / 0.571 | 0.128 / 0.565 | 0.143 / 0.635 |
| enemies.update | 0.484 / 0.403 | 0.520 / 0.418 | 0.512 / 0.429 |
| hostile.update | 0.032 / 0.088 | 0.028 / 0.096 | 0.033 / 0.076 |
| the crawlers' ground gathered (collidersNear, pebbles.near) | 0.221 / 0.219 | 0.195 / 0.193 | 0.187 / 0.186 |
| the stones for the shots (collidersNear) | 0.010 / 0.013 | 0.011 / 0.011 | 0.011 / 0.008 |
| aim, director, pickups | 0.026 / 0.022 | 0.024 / 0.018 | 0.026 / 0.024 |
| rest of combat.step | 0.038 / 0.104 | 0.064 / 0.102 | 0.059 / 0.079 |
| combat.frame | 0.032 / 0.038 | 0.031 / 0.040 | 0.032 / 0.039 |
| firing done for the game by the bench | 0.001 / 0.006 | 0.000 / 0.003 | 0.002 / 0.011 |
| the threat list | 0.012 / 0.013 | 0.009 / 0.012 | 0.009 / 0.010 |
| style and layout | 0.172 / 0.196 | 0.186 / 0.212 | 0.227 / 0.238 |
| handing combat's meshes to the card | 0.213 / 0.213 | 0.350 / 0.350 | 0.237 / 0.237 |

## What the proposals save (ms a frame of combat.step, timed in turns)

| proposal | fight | webgpu-detail | webgl2-detail | webgpu-eco |
|---|---:|---:|---:|---:|
| (check: the copy of projectiles.update against the original) | stress case | −0.010 (-0.030 … 0.010) | +0.010 (-0.010 … 0.040) | +0.010 (-0.030 … 0.040) |
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.090 (-0.110 … -0.070) | −0.060 (-0.090 … -0.040) | −0.070 (-0.090 … -0.030) |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.140 (-0.170 … -0.120) | −0.110 (-0.120 … -0.090) | −0.120 (-0.150 … -0.100) |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.010 (-0.040 … 0.010) | +0.000 (-0.030 … 0.020) | −0.010 (-0.030 … 0.010) |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.140 (-0.190 … -0.110) | −0.140 (-0.150 … -0.110) | −0.100 (-0.150 … -0.090) |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.320 (-0.340 … -0.300) | −0.280 (-0.310 … -0.260) | −0.270 (-0.300 … -0.240) |
| The same three together | four players | −0.050 (-0.070 … -0.030) | −0.040 (-0.060 … -0.020) | −0.060 (-0.080 … -0.030) |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.210 (-0.230 … -0.180) | −0.170 (-0.200 … -0.140) | −0.160 (-0.190 … -0.140) |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.020 (0.000 … 0.050) | +0.030 (0.010 … 0.060) | +0.010 (-0.020 … 0.030) |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.490 (-0.510 … -0.470) | −0.470 (-0.490 … -0.450) | −0.450 (-0.480 … -0.440) |
| Everything together: the three for the shots, both for the ground | four players | −0.560 (-0.590 … -0.520) | −0.520 (-0.550 … -0.500) | −0.530 (-0.550 … -0.510) |
| Style and layout without the health bars (#foes, moved by transform since main's 96c98ec) | stress case | −0.030 (-0.050 … -0.010) | −0.030 (-0.050 … -0.010) | −0.030 (-0.050 … -0.020) |
| Style and layout without all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | stress case | −0.060 (-0.070 … -0.040) | −0.050 (-0.080 … -0.040) | −0.100 (-0.130 … -0.040) |
| Style and layout without the game's threat arrows (#threats, base game: Next's to change) | stress case | −0.070 (-0.080 … -0.040) | −0.070 (-0.090 … -0.050) | −0.060 (-0.090 … -0.040) |

(Median change with the middle half of the blocks; negative saves. The variants for the shots are timed against a plain copy of projectiles.update. Taking a part of the HUD off the page is the most that writing it by transform alone could save.)

## Notes

Written by hand; `node tools/fv-bench.mjs --summary-only` keeps this section when it writes the tables above again. Measured on 27.09.2026 between 04:10 and 04:28 on look-bench after merging Extreme main 23d279a (crawlers on fv/ground.js, capsules, spent rounds that work out their landing once, health bars by transform). The machine was an Apple M1 Pro with three other headless Chromes and a load of 8–30. An earlier run at a load of 300–400 gave the same verdicts with twice the spread.

### What the numbers say

- **Card:** 0.46–0.48 ms, with every 95 % interval below 0.53 ms. The A/A test gives 0.00–0.01 ms, so the method has no bias. That is within 1.5 ms on WebGPU, WebGL 2 and Eco, with room to spare.
- **Script, four players (the realistic fight today):** combat.step + combat.frame costs 0.97 ms on WebGPU, 0.98 ms on WebGL 2 and 1.00 ms on Eco. That is right at the 1 ms budget: Eco's repeats run 0.99–1.02 ms, so "within" is a coin toss. With everything else the fight costs the script, it is 1.38 / 1.51 / 1.48 ms, which is **over**. The extra 0.4–0.5 ms breaks down as:
  - the page's style and layout: 0.17–0.23 ms;
  - handing combat's 12 meshes to the renderer: 0.21–0.35 ms;
  - the threat list: 0.01 ms.
- **Script, stress case (150 shots, 60 rounds):** 1.44–1.49 ms, and 1.9–2.0 ms with everything else, which is over. This is headroom for later: the players' own bullets get water ballistics after the owner's weapons merge and will then stay in the list while they are spent.
- **Where the time goes at four players:**
  - enemies.update: 0.48–0.52 ms, about half. Most of it is the crawlers' heights: each larva looks over all of about 50 stones and 1860 pebbles within 12 u, twice a step.
  - Gathering the crawlers' ground: 0.19–0.22 ms. pebbles.near looks up 2 × 529 cells by string key every step.
  - projectiles.update: 0.13–0.14 ms.
  - Main's ground.js is the largest new cost since the first bench: about 0.4–0.45 ms of the 1.0 ms. ground.js:19 also allocates 0.7–0.9 MB a frame.
- **Players' shots:** 3.9–4.6 µs a shot per step at the stress case; projectiles.update grows by 3.4–4.3 µs per extra shot at 40 enemies.
- **Enemy rounds:** a flying round costs 0.7–0.9 µs a step, a spent one 0.10–0.24 µs, and one lying on the bed 0.04 µs.
- **Enemy rounds at the enemies' own pace** (13–16 a second, with the fish held low): rounds lie on the bed for up to 8 s and then go. The list held at most 108–119 of 160 rounds (detail) and 90 of 90 (Eco, so the oldest round was evicted). hostile.update took 0.04 ms a step.

### Proposals, with what they save (combat.step, timed in turns)

For the owner (combat code):

1. **The crawlers' ground (fv/ground.js).** Gather it again only once the fish has moved (0.5 u), and look up heights in 1 u cells sorted when it is gathered. Together these save **0.45–0.49 ms** at four players. Separately:
   - gathering only after a move saves 0.16–0.21 ms;
   - cells alone cost 0.01–0.03 ms, because sorting about 1900 pebbles every step costs what the cells save.
   
   height() also allocates 0.7–0.9 MB a frame at its own line. Its array literal and the iterators it makes on every call are the likely source, and two plain loops would avoid them.
2. **The players' shots (fv/projectiles.js).** Each of these was checked to give the same hits:
   - stones sorted into 2 u cells, redone only when the list changes: 0.11–0.14 ms at the stress case;
   - the enemies' positions and sizes in flat arrays for the first test of each shot-enemy pair: 0.10–0.14 ms (the enemy records come in about ten shapes);
   - the bed and surface lookup every other step: 0.06–0.09 ms, but the crossing between two lookups must be found, since at Eco's 50 ms step a bolt travels 4 u between them.
   
   All three together save **0.27–0.32 ms** at the stress case and 0.04–0.06 ms at four players. Sorting the enemies into cells (a broad phase) saves nothing at 40 enemies.
3. **Everything together, four players:** **0.52–0.56 ms** saved. combat.step + combat.frame would drop to about 0.41–0.47 ms, and everything the fight costs the script to about 0.82–0.99 ms, which is within budget on all three configurations, WebGL 2 only just.
4. **projectiles.update allocations:** it allocates 0.24–0.28 MB a frame at the stress case, most of it at its own line (projectiles.js:79), about 1.6–1.9 KB per shot per step. The cause is not pinned down; boxed numbers, such as the module-level `along`, are one suspect.
5. **Already on main:** proposals 3 and 4 from the first bench. Spent rounds now cost 0.10–0.24 µs a step each. Taking the (transform-moved) health bars off the page now saves only 0.03 ms of layout, and all of combat's HUD 0.05–0.10 ms.

For Next (base game):

6. **#threats:** taking the threat arrows off the page saves 0.06–0.07 ms of style and layout. That is the upper bound for writing them by transform alone. The first bench's single measurement said 0.13–0.17 ms.
7. **course.js FALLS:** the records come in four shapes, and fields are added to them after they are made.
   - **Trigger:** a record of five fields beginning with `s`, made anywhere, shares V8's hidden classes with them. The bench's own place record did this.
   - **Effect:** V8 then threw level()'s compiled code away in a loop wherever it was inlined. There were 477 "instance migration failed" deopts at course.js:511 in 25 s, inlined into projectiles.js:144 and hostile.js:144. projectiles.update went from 0.58–0.66 ms to 1.26–1.64 ms at the stress case, and the world's whole step grew by about 0.7 ms.
   - **Fix:** with the falls rebuilt as records of one shape (every field in one order from the start), the loop ends at once.
   
   The bench no longer makes such a record, but the game could one day by accident. This is a cheap robustness fix in Next.
8. **"Draw with an index count of 0":** it comes only from the warm-up render at start-up: base-game transparent objects with an empty index, two per pass. It is not from combat.

### What changed in the bench after the review

- **Loads:**
  - A fight of four players now stands beside the stress case.
  - Enemy firing forced by the bench is counted as combat's.
  - Enemies stay within their crowds; none is simulated but not drawn.
  - Corpses are cleared 0.5 s after the kill.
- **Metering:**
  - collidersNear and pebbles.near are metered for combat's calls only, and the crawlers' ground is kept apart from the shots' stones.
  - "All of it" counts style and layout, the paired mesh hand-over and the threat list.
  - The parts are all plain means, so the rest of combat.step is a difference of like with like.
- **Card:** the pairs are pooled over the repeats, with a 95 % interval and an A/A test. The per-part and sweep card numbers are gone (per-part draw calls and triangles remain).
- **Proposals:** measured in turns in 32 blocks of 6 frames, leaving out each block's slowest frame, against a copy that is checked against the original.
- **Spent rounds:** they reach the spent state and the bed through hostile.js's own path. The soak runs at the enemies' own pace with the fish held low, so rounds lie on the bed and are removed.
- **Allocation:** Chrome's sampling heap profiler replaces reading the heap's size.
- **Tools:**
  - Patches are undone however the bench ends.
  - fv-bench and fv-test take their Chrome (its whole process group) and server down on Ctrl-C or a kill; this was checked with SIGINT and SIGTERM.
  - fv-bench uses a debugging port that Chrome picks, refuses a server that serves another tree, and fails instead of hanging.
  - fv-test gives each scene its own profile and refuses an unknown --quality.
- **Found while measuring again, and fixed:**
  - The fish grew during the bench: kills feed it, by half a stage a minute. This invalidated the first bench's toggles, sweep and soak.
  - The place record triggered item 7.

### Review points not taken

- **look-models' run.mjs** runs manual scenes, and its header says fv-test cannot do --webgl or --quality. This is not a bench file. Whoever merges look-models should add `.filter((s) => !s.manual)` to its default list and fix that comment.
- **The scene address is built in three places.** scenes.js is the owner's file; the two tools say so in comments.
- **fv-bench's default port stays 8170:** 8170 upward is the Next session's agreed range. These runs passed `--port 8182`, and the debugging port is now Chrome's own.

### Open

- Merging look-models into look-bench leaves one conflicting line in runLook. Keep both lines, the models' first, then `if (ctx.scene.name === "bench") await bench(ctx);`.
- Not measured or not real yet:
  - Sound is not measured headless, since sound.buses() is null.
  - Gore and the weapon models are still stubs.
  - Eco is the Eco settings on an M1 Pro, not Eco-class hardware.
  - The larvae in the parr mix stand in for any crawler.
- A stray profile folder, `extreme-bench-IZed77`, has been in the temp folder since 26.09 23:49, from an earlier run that was interrupted. It was left alone.

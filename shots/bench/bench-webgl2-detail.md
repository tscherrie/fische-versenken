# Combat bench: webgl2, detail

ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version) · WebGL 2 (the fallback, ?webgl) · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.9, u 0, water 12.11 u deep, a parr of 1 u 7.14 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 40 (38–40) |
| dead ones (cleared 0.5 s after the kill) | 0 (0–1) | 2 (0–5) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (24–29) | 146 (101–150) |
| enemy rounds flying | 13 (7–18) | 62 (35–71) |
| … spent and sinking | 37 (29–48) | 98 (89–125) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 122 (94–180) / 95 (85–109) | 493 (416–524) / 296 (179–383) |
| hits / kills a second (median of the repeats) | 33 / 1.0 | 80 / 6.0 |
| players' shots fired by the bench a second | 49 | 269 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 11 | 108 / 11 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.588 (95 % 0.487 … 0.688, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.438 … 0.700 ms. The same method with nothing shown or hidden (A/A): 0.000 (95 % -0.075 … 0.087, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.370 ms (repeats 1.326 … 1.398) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.098 ms (2.045 … 2.225): **over**. The slowest tenth of the frames take over 1.700 ms for step and frame, the slowest 2.400 ms.
- **Script, stress case:** combat.step + combat.frame 2.469 ms (repeats 2.338 … 2.578) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.256 ms (3.098 … 3.373): **over**. The slowest tenth of the frames take over 3.900 ms for step and frame, the slowest 5.000 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.370 (1.326 … 1.398) | +2.469 (2.338 … 2.578) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.002 (0.002 … 0.005) | +0.008 (0.006 … 0.016) |
| the threat list (signals.js, asked for by the game's own step) | +0.013 (0.008 … 0.014) | +0.013 (0.011 … 0.016) |
| the page's style and layout (fight against no fight) | +0.223 (0.189 … 0.255) | +0.259 (0.237 … 0.282) |
| handing combat's meshes to the card (paired, stress case) | +0.512 (0.462 … 0.575) | +0.512 (0.462 … 0.575) |
| **all of it** | +2.098 (2.045 … 2.225) | +3.256 (3.098 … 3.373) |
| (seconds apart, noisy:) the frame's whole script | +1.93 (1.31 … 2.21) | +3.24 (2.86 … 3.59) |
| (seconds apart, noisy:) … of it the draw's script | +0.31 (-0.31 … 0.55) | +0.34 (0.16 … 0.62) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +66492 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 9.01 → 9.51 ms, whole frames back to back 9.03 → 11.26 ms.

How: WebGL 2: frames drawn back to back, then gl.finish() and a pixel read back (EXT_disjoint_timer_query_webgl2 is recorded in the report but not used: per frame on ANGLE's Metal it reads high). The card, not the script, held up the frames drawn back to back. While it ran (9 minutes), 5 other headless Chromes were open on this machine (load 16.0 / 30.5 / 30.9): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.490 | 35 % | 11.98 µs an enemy | 0.439 | 17 % | 10.46 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.200 | 14 % | 7.35 µs a shot | 1.187 | 46 % | 8.16 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.042 | 3 % | 0.97 µs a round | 0.108 | 4 % | 0.68 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.033 | 2 % |  | 0.050 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.002 | 0 % |  | 0.001 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.003 | 0 % |  | 0.005 | 0 % |  |
| aim.update | 0.031 | 2 % |  | 0.018 | 1 % |  |
| director.update | 0.002 | 0 % |  | 0.003 | 0 % |  |
| pickups.update | 0.002 | 0 % |  | 0.001 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.017 | 1 % |  | 0.016 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.205 | 15 % |  | 0.209 | 8 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.212 | 15 % |  | 0.315 | 12 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.171 | 12 % |  | 0.222 | 9 % |  |
| combat.step + combat.frame | 1.407 | 100 % |  | 2.573 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 148 shots, 44 enemies): a shot's locate + bed + level 0.79 (locate 0.27, bed 0.38, level 0.09); an enemy's current + locate + bed + level 1.29 (current 0.53); terrain.collidersNear 0.012 ms a call, 195 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.833, spent and sinking 0.181, lying on the bed 0.035; a players' shot flying along the river 4.410, without the bed and surface lookup 2.604 (tested against 195 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.340 ms (-0.410 … -0.260). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.080 | -0.140 … -0.060 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.120 | -0.180 … -0.050 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | +0.000 | -0.060 … 0.060 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.130 | -0.180 … -0.090 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.330 | -0.370 … -0.290 |
| The same three together | four players | −0.070 | -0.110 … -0.030 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.170 | -0.200 … -0.140 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.050 | 0.010 … 0.100 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.490 | -0.560 … -0.420 |
| Everything together: the three for the shots, both for the ground | four players | −0.510 | -0.550 … -0.450 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.040 | -0.070 … -0.010 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.100 | -0.120 … -0.070 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.070 | -0.100 … -0.050 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 2.247 against 2.174 ms, enemies.update 0.453 against 0.410, projectiles.update 1.159 against 1.166.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3399 KB a frame in all; within combat.step 2678.2, combat.frame 63.0, projectiles.update 1765.6, enemies.update 738.2, hostile.update 26.4, hud.bars 1.9, fx.update 7.1 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1533.2 |
| height (ground.js:19) | 667.2 |
| next (native) | 120.2 |
| update (life.js:1447) | 93.1 |
| abs (native) | 87.0 |
| subarray (native) | 59.1 |
| drawLocal (minimap.js:138) | 57.8 |
| near (pebbles.js:250) | 49.1 |
| update (gore.js:852) | 49.0 |
| _update (three.webgpu.js:33882) | 45.6 |
| frame (gore.js:1143) | 40.1 |
| hypot (native) | 22.2 |
| _bindUniforms (three.webgpu.js:76738) | 22.0 |
| meters.gravel.fn (scenes-look.js:356) | 21.4 |
| riverBed (course.js:757) | 21.0 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +8016 |
| Combat bullhead far | +1 | +1440 |
| Combat troutParr | +2 | +19208 |
| Combat troutParr far | +1 | +2640 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +720 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +256 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +966 |
| Combat bubbles | +1 | +820 |
| Combat blood | +1 | +1316 |
| Combat specks | +1 | +406 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +4910 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 60 / 100 / 0 | 1.692 | 0.213 | 0.168 | 0.905 | 0.124 | +17 | 32 | 2.5 |
| 20 (22) | 150 (146) | 60 / 61 / 99 / 0 | 2.207 | 0.221 | 0.278 | 1.052 | 0.138 | +18 | 81 | 5.5 |
| 40 (40) | 150 (146) | 60 / 62 / 98 / 0 | 2.435 | 0.216 | 0.430 | 1.146 | 0.119 | +18 | 93 | 6.0 |
| 80 (77, 35 not drawn) | 150 (145) | 60 / 61 / 99 / 0 | 2.978 | 0.207 | 0.765 | 1.532 | 0.129 | +19 | 131 | 6.0 |
| 40 (40) | 28 (27) | 60 / 61 / 99 / 0 | 1.337 | 0.160 | 0.586 | 0.202 | 0.125 | +19 | 36 | 1.5 |
| 40 (40) | 50 (49) | 60 / 61 / 99 / 0 | 1.438 | 0.188 | 0.494 | 0.332 | 0.127 | +19 | 36 | 4.5 |
| 40 (38) | 300 (293) | 60 / 61 / 98 / 0 | 3.106 | 0.229 | 0.438 | 2.032 | 0.120 | +19 | 82 | 9.5 |
| 40 (39) | 150 (146) | 0 / 2 / 3 / 0 | 2.217 | 0.217 | 0.489 | 1.192 | 0.007 | +19 | 85 | 7.0 |
| 40 (40) | 150 (146) | 120 / 120 / 40 / 0 | 2.360 | 0.211 | 0.474 | 1.232 | 0.150 | +19 | 58 | 5.0 |
| 40 (40) | 0 (0) | 0 / 7 / 12 / 0 | 1.076 | 0.118 | 0.678 | 0.001 | 0.036 | +17 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.041 | 0.032 | 0.031 | 0.001 | 0.000 | – | 0 | 0.0 |

enemies.update ≈ 0.082 + 8.79 µs·n + 0.002 µs·n² (n enemies alive): at 40 that is 351 µs growing with the number and 3 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 6.90 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20 | 11 | 37 | 1 | 1.6 | 0.3 | 0.050 | 1.255 | 40 (0) | 238.2 |
| 5 | 6 | 5 | 64 | 25 | 5.6 | 4.3 | 0.050 | 1.517 | 41 (1) | 254 |
| 10 | 18 | 3 | 44 | 65 | 10.6 | 7.9 | 0.055 | 1.340 | 41 (1) | 237.9 |
| 15 | 9 | 4 | 48 | 27 | 11.6 | 6.9 | 0.045 | 1.410 | 44 (5) | 245 |
| 20 | 35 | 15 | 47 | 41 | 11.6 | 7.3 | 0.057 | 1.397 | 44 (5) | 254.7 |
| 25 | 12 | 4 | 48 | 42 | 11.8 | 7.3 | 0.057 | 1.440 | 44 (6) | 238.9 |
| 30 | 19 | 12 | 50 | 48 | 10.8 | 7.9 | 0.065 | 1.285 | 41 (1) | 257.4 |

The enemies fired 21.0 rounds a second on their own. The list held at most 117 rounds (capacity 160); up to 67 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.055 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgl2-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

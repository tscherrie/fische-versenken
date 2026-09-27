# Combat bench: webgl2, detail

ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version) · WebGL 2 (the fallback, ?webgl) · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.6, u 0, water 12.02 u deep, a parr of 1 u 7.04 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 39 (37–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–2) | 3 (0–7) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (24–28) | 146 (107–150) |
| enemy rounds flying | 7 (2–12) | 61 (39–69) |
| … spent and sinking | 42 (31–47) | 99 (91–121) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 131 (104–211) / 86 (71–105) | 490 (435–535) / 311 (193–371) |
| hits / kills a second (median of the repeats) | 26 / 1.0 | 76 / 5.5 |
| players' shots fired by the bench a second | 50 | 266 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 11 | 107 / 10 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.631 (95 % 0.525 … 0.750, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.362 … 0.963 ms. The same method with nothing shown or hidden (A/A): 0.013 (95 % -0.037 … 0.075, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.454 ms (repeats 1.379 … 1.762) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.226 ms (2.174 … 2.609): **over**. The slowest tenth of the frames take over 1.800 ms for step and frame, the slowest 2.500 ms.
- **Script, stress case:** combat.step + combat.frame 2.521 ms (repeats 2.447 … 2.915) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.400 ms (3.345 … 3.796): **over**. The slowest tenth of the frames take over 4.000 ms for step and frame, the slowest 5.600 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.454 (1.379 … 1.762) | +2.521 (2.447 … 2.915) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.005 (0.003 … 0.006) | +0.010 (0.008 … 0.018) |
| the threat list (signals.js, asked for by the game's own step) | +0.013 (0.012 … 0.018) | +0.017 (0.016 … 0.026) |
| the page's style and layout (fight against no fight) | +0.231 (0.216 … 0.261) | +0.249 (0.236 … 0.297) |
| handing combat's meshes to the card (paired, stress case) | +0.563 (0.525 … 0.688) | +0.563 (0.525 … 0.688) |
| **all of it** | +2.226 (2.174 … 2.609) | +3.400 (3.345 … 3.796) |
| (seconds apart, noisy:) the frame's whole script | +2.02 (1.64 … 3.22) | +3.38 (3.09 … 4.40) |
| (seconds apart, noisy:) … of it the draw's script | +0.41 (0.00 … 0.90) | +0.49 (0.18 … 0.97) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +57714 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 8.91 → 9.66 ms, whole frames back to back 9.27 → 11.60 ms.

How: WebGL 2: frames drawn back to back, then gl.finish() and a pixel read back (EXT_disjoint_timer_query_webgl2 is recorded in the report but not used: per frame on ANGLE's Metal it reads high). The card, not the script, held up the frames drawn back to back. While it ran (13 minutes), 7 other headless Chromes were open on this machine (load 106.5 / 148.4 / 137.1): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.522 | 35 % | 12.81 µs an enemy | 0.437 | 17 % | 10.40 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.205 | 14 % | 7.54 µs a shot | 1.211 | 46 % | 8.32 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.063 | 4 % | 1.28 µs a round | 0.113 | 4 % | 0.71 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.033 | 2 % |  | 0.051 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.003 | 0 % |  | 0.004 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.003 | 0 % |  | 0.005 | 0 % |  |
| aim.update | 0.033 | 2 % |  | 0.021 | 1 % |  |
| director.update | 0.003 | 0 % |  | 0.003 | 0 % |  |
| pickups.update | 0.003 | 0 % |  | 0.002 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.017 | 1 % |  | 0.018 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.240 | 16 % |  | 0.242 | 9 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.192 | 13 % |  | 0.301 | 11 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.179 | 12 % |  | 0.239 | 9 % |  |
| combat.step + combat.frame | 1.494 | 100 % |  | 2.646 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 148 shots, 43 enemies): a shot's locate + bed + level 0.72 (locate 0.25, bed 0.43, level 0.09); an enemy's current + locate + bed + level 1.32 (current 0.54); terrain.collidersNear 0.012 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.819, spent and sinking 0.083, lying on the bed 0.021; a players' shot flying along the river 5.646, without the bed and surface lookup 2.701 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.360 ms (-0.540 … -0.290). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.040 | -0.150 … -0.020 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.130 | -0.200 … -0.060 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | +0.020 | -0.060 … 0.060 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.160 | -0.250 … -0.070 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.350 | -0.380 … -0.320 |
| The same three together | four players | −0.060 | -0.120 … 0.000 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.230 | -0.270 … -0.180 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | −0.080 | -0.140 … -0.010 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.610 | -0.820 … -0.530 |
| Everything together: the three for the shots, both for the ground | four players | −0.850 | -1.030 … -0.680 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.050 | -0.120 … -0.030 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.110 | -0.170 … -0.060 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.090 | -0.130 … -0.050 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 3.116 against 3.035 ms, enemies.update 0.580 against 0.605, projectiles.update 1.488 against 1.667.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3549 KB a frame in all; within combat.step 2803.6, combat.frame 67.5, projectiles.update 1851.4, enemies.update 776.6, hostile.update 30.4, hud.bars 1.6, fx.update 8.1 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1596.2 |
| height (ground.js:19) | 702.5 |
| next (native) | 131.0 |
| abs (native) | 99.3 |
| update (life.js:1447) | 93.1 |
| subarray (native) | 61.0 |
| drawLocal (minimap.js:138) | 54.5 |
| near (pebbles.js:250) | 51.2 |
| _update (three.webgpu.js:33882) | 49.8 |
| frame (gore.js:1143) | 41.9 |
| update (gore.js:852) | 39.0 |
| _bindUniforms (three.webgpu.js:76738) | 25.0 |
| riverBed (course.js:757) | 23.8 |
| meters.gravel.fn (scenes-look.js:356) | 23.8 |
| update (hostile.js:71) | 23.6 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +13360 |
| Combat bullhead far | +1 | +720 |
| Combat troutParr | +2 | +30184 |
| Combat troutParr far | +1 | +1440 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +1200 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +720 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +284 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +998 |
| Combat bubbles | +1 | +776 |
| Combat blood | +1 | +1380 |
| Combat specks | +1 | +336 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +4910 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 61 / 99 / 0 | 2.634 | 0.249 | 0.274 | 1.305 | 0.157 | +16 | 21 | 4.5 |
| 20 (22) | 150 (146) | 60 / 61 / 99 / 0 | 2.630 | 0.265 | 0.417 | 1.436 | 0.157 | +18 | 75 | 4.5 |
| 40 (39) | 150 (146) | 60 / 61 / 99 / 0 | 3.098 | 0.265 | 0.593 | 1.778 | 0.150 | +19 | 86 | 8.0 |
| 80 (77, 35 not drawn) | 150 (146) | 60 / 62 / 98 / 0 | 3.662 | 0.255 | 0.936 | 2.278 | 0.142 | +19 | 89 | 6.5 |
| 40 (40) | 28 (27) | 60 / 62 / 98 / 0 | 2.102 | 0.234 | 0.923 | 0.341 | 0.159 | +18 | 41 | 2.5 |
| 40 (40) | 50 (49) | 60 / 61 / 99 / 0 | 2.310 | 0.230 | 0.880 | 0.872 | 0.174 | +19 | 36 | 2.5 |
| 40 (38) | 300 (293) | 60 / 61 / 99 / 0 | 4.454 | 0.299 | 0.628 | 3.083 | 0.160 | +19 | 84 | 10.5 |
| 40 (40) | 150 (146) | 0 / 10 / 9 / 0 | 2.518 | 0.236 | 0.544 | 1.327 | 0.036 | +19 | 77 | 5.0 |
| 40 (39) | 150 (146) | 120 / 119 / 40 / 0 | 2.588 | 0.237 | 0.492 | 1.333 | 0.176 | +17 | 80 | 6.5 |
| 40 (40) | 0 (0) | 0 / 8 / 15 / 0 | 1.093 | 0.120 | 0.693 | 0.001 | 0.054 | +17 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.045 | 0.024 | 0.012 | 0.002 | 0.003 | – | 0 | 0.0 |

enemies.update ≈ 0.156 + 12.35 µs·n + -0.029 µs·n² (n enemies alive): at 40 that is 494 µs growing with the number and -46 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 10.33 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11 | 4 | 45 | 3 | 1.6 | 0.7 | 0.055 | 1.748 | 42 (2) | 234.8 |
| 5 | 16 | 16 | 56 | 16 | 5.6 | 4.7 | 0.040 | 2.198 | 42 (4) | 250.7 |
| 10 | 13 | 10 | 62 | 59 | 10.6 | 7.2 | 0.073 | 2.035 | 41 (1) | 277.9 |
| 15 | 25 | 20 | 57 | 46 | 11.6 | 7.0 | 0.087 | 2.642 | 42 (3) | 234.2 |
| 20 | 11 | 7 | 33 | 60 | 11.9 | 8.0 | 0.078 | 1.642 | 42 (2) | 268.5 |
| 25 | 24 | 8 | 55 | 38 | 11.1 | 7.8 | 0.065 | 1.440 | 41 (1) | 263.3 |
| 30 | 37 | 11 | 54 | 52 | 11.8 | 8.0 | 0.080 | 1.542 | 43 (5) | 276.1 |

The enemies fired 21.8 rounds a second on their own. The list held at most 131 rounds (capacity 160); up to 67 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.073 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgl2-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

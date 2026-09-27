# Combat bench: webgl2, detail

ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version) · WebGL 2 (the fallback, ?webgl) · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.5, u 0, water 11.95 u deep, a parr of 1 u 6.97 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (40–40) | 40 (38–40) |
| dead ones (cleared 0.5 s after the kill) | 0 (0–0) | 3 (0–6) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (25–29) | 146 (96–151) |
| enemy rounds flying | 8 (2–11) | 62 (33–69) |
| … spent and sinking | 36 (26–45) | 98 (91–127) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 83 (65–100) / 110 (83–150) | 378 (328–456) / 431 (269–480) |
| hits / kills a second (median of the repeats) | 19 / 0.5 | 56 / 6.0 |
| players' shots fired by the bench a second | 48 | 269 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 10 | 109 / 8 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.475 (95 % 0.438 … 0.525, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.362 … 0.525 ms. The same method with nothing shown or hidden (A/A): 0.000 (95 % -0.063 … 0.037, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 0.981 ms (repeats 0.955 … 1.001) against 1 ms: **within**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.508 ms (1.468 … 1.604): **over**. The slowest tenth of the frames take over 1.100 ms for step and frame, the slowest 1.500 ms.
- **Script, stress case:** combat.step + combat.frame 1.443 ms (repeats 1.417 … 1.492) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.992 ms (1.954 … 2.137): **over**. The slowest tenth of the frames take over 1.600 ms for step and frame, the slowest 2.100 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +0.981 (0.955 … 1.001) | +1.443 (1.417 … 1.492) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.000 (0.000 … 0.003) | +0.003 (0.003 … 0.004) |
| the threat list (signals.js, asked for by the game's own step) | +0.009 (0.007 … 0.013) | +0.012 (0.007 … 0.015) |
| the page's style and layout (fight against no fight) | +0.186 (0.181 … 0.201) | +0.212 (0.204 … 0.213) |
| handing combat's meshes to the card (paired, stress case) | +0.350 (0.300 … 0.425) | +0.350 (0.300 … 0.425) |
| **all of it** | +1.508 (1.468 … 1.604) | +1.992 (1.954 … 2.137) |
| (seconds apart, noisy:) the frame's whole script | +1.59 (1.41 … 1.63) | +2.10 (1.93 … 2.25) |
| (seconds apart, noisy:) … of it the draw's script | +0.34 (0.22 … 0.36) | +0.38 (0.23 … 0.42) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +12 draw calls and +53992 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 8.52 → 9.01 ms, whole frames back to back 8.64 → 9.23 ms.

How: WebGL 2: frames drawn back to back, then gl.finish() and a pixel read back (EXT_disjoint_timer_query_webgl2 is recorded in the report but not used: per frame on ANGLE's Metal it reads high). The card, not the script, held up the frames drawn back to back. While it ran (7 minutes), 3 other headless Chromes were open on this machine (load 8.5 / 9.7 / 23.1): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.520 | 52 % | 12.90 µs an enemy | 0.418 | 29 % | 9.87 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.128 | 13 % | 4.67 µs a shot | 0.565 | 39 % | 3.88 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.028 | 3 % | 0.85 µs a round | 0.096 | 7 % | 0.60 µs a round |
| aim.update | 0.021 | 2 % |  | 0.013 | 1 % |  |
| director.update | 0.001 | 0 % |  | 0.003 | 0 % |  |
| pickups.update | 0.003 | 0 % |  | 0.002 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.011 | 1 % |  | 0.011 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.195 | 19 % |  | 0.193 | 13 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.064 | 6 % |  | 0.102 | 7 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.031 | 3 % |  | 0.040 | 3 % |  |
| combat.step + combat.frame | 1.001 | 100 % |  | 1.443 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 147 shots, 43 enemies): a shot's locate + bed + level 0.70 (locate 0.25, bed 0.45, level 0.09); an enemy's current + locate + bed + level 1.24 (current 0.47); terrain.collidersNear 0.026 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.813, spent and sinking 0.104, lying on the bed 0.035; a players' shot flying along the river 3.243, without the bed and surface lookup 1.708 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: +0.010 ms (-0.010 … 0.040). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.060 | -0.090 … -0.040 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.110 | -0.120 … -0.090 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | +0.000 | -0.030 … 0.020 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.140 | -0.150 … -0.110 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.280 | -0.310 … -0.260 |
| The same three together | four players | −0.040 | -0.060 … -0.020 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.170 | -0.200 … -0.140 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.030 | 0.010 … 0.060 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.470 | -0.490 … -0.450 |
| Everything together: the three for the shots, both for the ground | four players | −0.520 | -0.550 … -0.500 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.030 | -0.050 … -0.010 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.050 | -0.080 … -0.040 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.070 | -0.090 … -0.050 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.395 against 1.403 ms, enemies.update 0.401 against 0.441, projectiles.update 0.563 against 0.565.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 1897 KB a frame in all; within combat.step 1321.4, combat.frame 4.9, projectiles.update 240.0, enemies.update 979.9, hostile.update 18.1, hud.bars 1.2, fx.update 9.1 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| height (ground.js:19) | 907.8 |
| update (projectiles.js:79) | 217.4 |
| update (life.js:1447) | 87.3 |
| subarray (native) | 58.2 |
| near (pebbles.js:250) | 50.2 |
| _update (three.webgpu.js:33882) | 47.3 |
| drawLocal (minimap.js:138) | 29.6 |
| meters.gravel.fn (scenes-look.js:346) | 22.6 |
| update (life.js:430) | 22.1 |
| _bindUniforms (three.webgpu.js:76738) | 22.0 |
| split (anatomy.js:2084) | 20.2 |
| add (native) | 19.0 |
| riverBed (course.js:757) | 17.7 |
| update (three.webgpu.js:66245) | 15.8 |
| update (life.js:836) | 15.5 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +10688 |
| Combat bullhead far | +1 | +720 |
| Combat troutParr | +2 | +30184 |
| Combat troutParr far | +1 | +1680 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +960 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +480 |
| Combat glow | +1 | +740 |
| Combat bubbles | +1 | +954 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 61 / 99 / 0 | 0.954 | 0.035 | 0.175 | 0.339 | 0.098 | +9 | 21 | 3.0 |
| 20 (22) | 150 (146) | 60 / 61 / 99 / 0 | 1.145 | 0.041 | 0.268 | 0.437 | 0.114 | +11 | 65 | 5.0 |
| 40 (40) | 150 (146) | 60 / 61 / 99 / 0 | 1.442 | 0.031 | 0.458 | 0.577 | 0.088 | +11 | 51 | 6.5 |
| 80 (77, 35 not drawn) | 150 (145) | 60 / 62 / 98 / 0 | 2.099 | 0.031 | 0.817 | 0.873 | 0.092 | +12 | 89 | 5.0 |
| 40 (40) | 28 (27) | 60 / 61 / 99 / 0 | 1.066 | 0.024 | 0.507 | 0.125 | 0.116 | +9 | 37 | 1.5 |
| 40 (40) | 50 (49) | 60 / 61 / 99 / 0 | 1.095 | 0.020 | 0.513 | 0.208 | 0.102 | +12 | 20 | 2.0 |
| 40 (39) | 300 (293) | 60 / 62 / 98 / 0 | 1.932 | 0.031 | 0.485 | 1.038 | 0.100 | +12 | 61 | 7.0 |
| 40 (39) | 150 (146) | 0 / 11 / 17 / 0 | 1.429 | 0.029 | 0.487 | 0.586 | 0.034 | +12 | 60 | 7.5 |
| 40 (40) | 150 (146) | 120 / 119 / 41 / 0 | 1.517 | 0.036 | 0.458 | 0.590 | 0.133 | +11 | 48 | 6.0 |
| 40 (40) | 0 (0) | 0 / 8 / 4 / 0 | 0.810 | 0.013 | 0.540 | 0.000 | 0.025 | +12 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.021 | 0.001 | 0.014 | 0.000 | 0.001 | – | 0 | 0.0 |

enemies.update ≈ 0.077 + 9.23 µs·n + 0.005 µs·n² (n enemies alive): at 40 that is 369 µs growing with the number and 8 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 3.43 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 17 | 6 | 33 | 1 | 1.6 | 0.9 | 0.033 | 0.930 | 41 (1) | 265.4 |
| 5 | 10 | 10 | 53 | 15 | 5.6 | 4.9 | 0.037 | 0.977 | 43 (5) | 221.8 |
| 10 | 23 | 7 | 46 | 51 | 10.6 | 8.0 | 0.065 | 1.012 | 42 (3) | 233.7 |
| 15 | 14 | 6 | 49 | 26 | 11.9 | 7.8 | 0.050 | 0.998 | 40 (1) | 251.1 |
| 20 | 15 | 1 | 51 | 45 | 11.9 | 7.5 | 0.053 | 1.138 | 42 (3) | 224.6 |
| 25 | 13 | 12 | 40 | 29 | 11.7 | 8.0 | 0.033 | 1.008 | 41 (2) | 253 |
| 30 | 22 | 12 | 31 | 42 | 11.1 | 7.9 | 0.045 | 1.025 | 41 (5) | 242.7 |

The enemies fired 14.7 rounds a second on their own. The list held at most 108 rounds (capacity 160); up to 55 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.045 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgl2-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

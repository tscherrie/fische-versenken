# Combat bench: webgpu, detail

apple metal-3 · WebGPU · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.5, u 0, water 11.98 u deep, a parr of 1 u 6.99 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 40 (38–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–2) | 3 (1–5) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (22–29) | 145 (109–150) |
| enemy rounds flying | 3 (0–6) | 61 (46–67) |
| … spent and sinking | 27 (22–31) | 99 (93–114) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 109 (86–159) / 100 (81–121) | 500 (440–540) / 333 (219–393) |
| hits / kills a second (median of the repeats) | 36 / 1.0 | 78 / 5.0 |
| players' shots fired by the bench a second | 55 | 264 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 6 | 109 / 8 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.588 (95 % 0.563 … 0.625, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.563 … 0.650 ms. The same method with nothing shown or hidden (A/A): 0.050 (95 % -0.013 … 0.087, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.422 ms (repeats 1.374 … 1.617) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.069 ms (2.045 … 2.370): **over**. The slowest tenth of the frames take over 1.700 ms for step and frame, the slowest 2.000 ms.
- **Script, stress case:** combat.step + combat.frame 2.459 ms (repeats 2.346 … 2.519) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.141 ms (3.003 … 3.270): **over**. The slowest tenth of the frames take over 3.600 ms for step and frame, the slowest 4.800 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.422 (1.374 … 1.617) | +2.459 (2.346 … 2.519) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.003 (0.002 … 0.005) | +0.009 (0.007 … 0.015) |
| the threat list (signals.js, asked for by the game's own step) | +0.014 (0.008 … 0.018) | +0.013 (0.010 … 0.017) |
| the page's style and layout (fight against no fight) | +0.224 (0.218 … 0.240) | +0.227 (0.217 … 0.235) |
| handing combat's meshes to the card (paired, stress case) | +0.425 (0.350 … 0.500) | +0.425 (0.350 … 0.500) |
| **all of it** | +2.069 (2.045 … 2.370) | +3.141 (3.003 … 3.270) |
| (seconds apart, noisy:) the frame's whole script | +2.06 (1.48 … 2.42) | +3.14 (2.41 … 3.27) |
| (seconds apart, noisy:) … of it the draw's script | +0.25 (-0.12 … 0.62) | +0.31 (-0.16 … 0.43) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +57514 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 7.91 → 8.42 ms, whole frames back to back 8.02 → 8.87 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (8 minutes), 5 other headless Chromes were open on this machine (load 73.8 / 57.8 / 34.3): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.498 | 34 % | 12.30 µs an enemy | 0.433 | 17 % | 10.27 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.199 | 14 % | 7.35 µs a shot | 1.167 | 46 % | 8.01 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.033 | 2 % | 1.04 µs a round | 0.105 | 4 % | 0.66 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.028 | 2 % |  | 0.051 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.003 | 0 % |  | 0.002 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.002 | 0 % |  | 0.004 | 0 % |  |
| aim.update | 0.023 | 2 % |  | 0.020 | 1 % |  |
| director.update | 0.003 | 0 % |  | 0.002 | 0 % |  |
| pickups.update | 0.001 | 0 % |  | 0.001 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.018 | 1 % |  | 0.015 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.234 | 16 % |  | 0.229 | 9 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.257 | 17 % |  | 0.311 | 12 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.172 | 12 % |  | 0.219 | 9 % |  |
| combat.step + combat.frame | 1.472 | 100 % |  | 2.558 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 147 shots, 43 enemies): a shot's locate + bed + level 1.07 (locate 0.45, bed 0.64, level 0.16); an enemy's current + locate + bed + level 1.94 (current 0.93); terrain.collidersNear 0.014 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 1.403, spent and sinking 0.236, lying on the bed 0.021; a players' shot flying along the river 7.299, without the bed and surface lookup 4.444 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.370 ms (-0.410 … -0.260). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.100 | -0.140 … -0.070 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.170 | -0.230 … -0.110 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.030 | -0.110 … 0.010 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.160 | -0.210 … -0.100 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.350 | -0.400 … -0.280 |
| The same three together | four players | −0.080 | -0.120 … -0.030 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.190 | -0.220 … -0.150 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.030 | -0.020 … 0.100 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.540 | -0.620 … -0.490 |
| Everything together: the three for the shots, both for the ground | four players | −0.650 | -0.770 … -0.590 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.020 | -0.040 … 0.000 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.090 | -0.130 … -0.050 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.080 | -0.110 … -0.060 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 2.307 against 2.324 ms, enemies.update 0.441 against 0.425, projectiles.update 1.195 against 1.199.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3351 KB a frame in all; within combat.step 2671.5, combat.frame 69.4, projectiles.update 1865.5, enemies.update 637.8, hostile.update 27.4, hud.bars 1.5, fx.update 5.5 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1607.4 |
| height (ground.js:19) | 560.3 |
| next (native) | 133.8 |
| abs (native) | 101.1 |
| update (life.js:1447) | 89.1 |
| subarray (native) | 62.4 |
| drawLocal (minimap.js:138) | 51.9 |
| near (pebbles.js:250) | 48.7 |
| _update (three.webgpu.js:33882) | 46.4 |
| update (gore.js:852) | 43.0 |
| frame (gore.js:1143) | 42.9 |
| hypot (native) | 26.6 |
| riverBed (course.js:757) | 20.8 |
| update (life.js:430) | 20.5 |
| add (native) | 20.5 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +2672 |
| Combat bullhead far | +1 | +1680 |
| Combat troutParr | +2 | +13720 |
| Combat troutParr far | +1 | +3120 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +960 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +264 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +958 |
| Combat bubbles | +1 | +920 |
| Combat blood | +1 | +1352 |
| Combat specks | +1 | +336 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +4910 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 60 / 99 / 0 | 1.728 | 0.212 | 0.193 | 0.864 | 0.128 | +16 | 40 | 3.5 |
| 20 (22) | 150 (146) | 60 / 61 / 99 / 0 | 2.106 | 0.244 | 0.307 | 1.032 | 0.142 | +18 | 90 | 6.0 |
| 40 (39) | 150 (146) | 60 / 62 / 98 / 0 | 2.485 | 0.237 | 0.472 | 1.230 | 0.146 | +19 | 97 | 7.0 |
| 80 (76, 35 not drawn) | 150 (145) | 60 / 62 / 98 / 0 | 3.216 | 0.236 | 0.811 | 1.596 | 0.137 | +19 | 122 | 8.5 |
| 40 (40) | 28 (27) | 60 / 61 / 99 / 0 | 1.475 | 0.171 | 0.536 | 0.208 | 0.130 | +19 | 35 | 2.0 |
| 40 (40) | 50 (49) | 60 / 61 / 99 / 0 | 1.484 | 0.201 | 0.483 | 0.343 | 0.115 | +19 | 28 | 1.5 |
| 40 (40) | 300 (293) | 60 / 62 / 98 / 0 | 3.353 | 0.273 | 0.484 | 2.095 | 0.126 | +19 | 64 | 5.0 |
| 40 (39) | 150 (146) | 0 / 12 / 12 / 0 | 2.301 | 0.235 | 0.476 | 1.210 | 0.033 | +19 | 49 | 6.0 |
| 40 (39) | 150 (146) | 120 / 119 / 41 / 0 | 2.346 | 0.230 | 0.447 | 1.184 | 0.155 | +19 | 48 | 5.5 |
| 40 (40) | 0 (0) | 0 / 7 / 5 / 0 | 0.895 | 0.081 | 0.509 | 0.000 | 0.019 | +17 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.043 | 0.021 | 0.018 | 0.001 | 0.001 | – | 0 | 0.0 |

enemies.update ≈ 0.093 + 10.12 µs·n + -0.009 µs·n² (n enemies alive): at 40 that is 405 µs growing with the number and -14 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 7.11 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 29 | 12 | 42 | 5 | 1.6 | 0.7 | 0.068 | 1.357 | 41 (1) | 238.5 |
| 5 | 21 | 16 | 45 | 28 | 5.6 | 4.7 | 0.038 | 1.413 | 42 (4) | 255.3 |
| 10 | 20 | 10 | 54 | 50 | 10.6 | 7.9 | 0.052 | 1.712 | 44 (5) | 284.1 |
| 15 | 28 | 9 | 48 | 43 | 11.4 | 8.0 | 0.062 | 1.588 | 43 (3) | 255.9 |
| 20 | 32 | 17 | 64 | 34 | 11.9 | 7.8 | 0.063 | 1.562 | 43 (3) | 272.8 |
| 25 | 10 | 5 | 73 | 53 | 11.5 | 7.8 | 0.055 | 1.630 | 42 (2) | 269.1 |
| 30 | 15 | 7 | 54 | 60 | 11.6 | 7.9 | 0.078 | 1.808 | 41 (1) | 242.5 |

The enemies fired 22.0 rounds a second on their own. The list held at most 139 rounds (capacity 160); up to 70 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.062 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with a vertex count of 0 is unusual. (http://localhost:8182/)

(Draws with nothing in them in the stress case, a draw call each and no triangles: Combat ribbons.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

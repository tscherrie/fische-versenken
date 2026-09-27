# Combat bench: webgpu, eco

apple metal-3 · WebGPU · quality eco (light pools) · canvas 1280×720, scene drawn at 1280×720 · one step of 50.0 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2504.1, u 0, water 12.16 u deep, a parr of 1 u 7.19 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 39 (37–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–3) | 3 (0–6) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 25 (22–28) | 138 (108–147) |
| enemy rounds flying | 7 (0–15) | 58 (44–67) |
| … spent and sinking | 45 (22–60) | 32 (23–46) |
| … lying on the bed | 3 (0–6) | 0 (0–0) |
| glow points / bubbles | 125 (97–167) / 74 (44–105) | 391 (352–400) / 239 (196–240) |
| hits / kills a second (median of the repeats) | 25 / 1.0 | 62 / 5.3 |
| players' shots fired by the bench a second | 49 | 246 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 10 | 101 / 9 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.719 (95 % 0.487 … 1.137, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.475 … 1.488 ms. The same method with nothing shown or hidden (A/A): 0.031 (95 % -0.300 … 0.325, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.509 ms (repeats 1.328 … 1.671) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.348 ms (2.073 … 2.436): **over**. The slowest tenth of the frames take over 2.000 ms for step and frame, the slowest 2.800 ms.
- **Script, stress case:** combat.step + combat.frame 2.537 ms (repeats 2.322 … 2.909) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.376 ms (3.047 … 3.657): **over**. The slowest tenth of the frames take over 4.300 ms for step and frame, the slowest 6.200 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.509 (1.328 … 1.671) | +2.537 (2.322 … 2.909) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.007 (0.004 … 0.010) | +0.016 (0.013 … 0.026) |
| the threat list (signals.js, asked for by the game's own step) | +0.012 (0.010 … 0.021) | +0.014 (0.012 … 0.023) |
| the page's style and layout (fight against no fight) | +0.309 (0.304 … 0.313) | +0.335 (0.309 … 0.351) |
| handing combat's meshes to the card (paired, stress case) | +0.425 (0.363 … 0.500) | +0.425 (0.363 … 0.500) |
| **all of it** | +2.348 (2.073 … 2.436) | +3.376 (3.047 … 3.657) |
| (seconds apart, noisy:) the frame's whole script | +2.30 (1.40 … 2.63) | +3.44 (3.03 … 4.02) |
| (seconds apart, noisy:) … of it the draw's script | +0.24 (-0.14 … 0.62) | +0.32 (0.17 … 0.58) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +37526 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 7.89 → 9.07 ms, whole frames back to back 7.85 → 8.94 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (9 minutes), 5 other headless Chromes were open on this machine (load 102.3 / 86.0 / 58.6): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.619 | 40 % | 15.29 µs an enemy | 0.488 | 18 % | 11.57 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.237 | 15 % | 9.28 µs a shot | 1.312 | 48 % | 9.53 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.052 | 3 % | 0.99 µs a round | 0.097 | 4 % | 1.08 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.057 | 4 % |  | 0.058 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.003 | 0 % |  | 0.002 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.003 | 0 % |  | 0.004 | 0 % |  |
| aim.update | 0.031 | 2 % |  | 0.025 | 1 % |  |
| director.update | 0.003 | 0 % |  | 0.001 | 0 % |  |
| pickups.update | 0.002 | 0 % |  | 0.002 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.024 | 2 % |  | 0.032 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.252 | 16 % |  | 0.260 | 10 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.144 | 9 % |  | 0.253 | 9 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.140 | 9 % |  | 0.184 | 7 % |  |
| combat.step + combat.frame | 1.566 | 100 % |  | 2.718 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 138 shots, 44 enemies): a shot's locate + bed + level 0.89 (locate 0.29, bed 0.60, level 0.14); an enemy's current + locate + bed + level 2.20 (current 1.21); terrain.collidersNear 0.030 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 1.708, spent and sinking 0.243, lying on the bed 0.076; a players' shot flying along the river 7.208, without the bed and surface lookup 4.792 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.320 ms (-0.450 … -0.060). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.050 | -0.160 … 0.030 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.180 | -0.220 … -0.070 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | +0.030 | -0.060 … 0.110 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.070 | -0.140 … -0.030 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.340 | -0.410 … -0.210 |
| The same three together | four players | −0.090 | -0.150 … 0.020 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.260 | -0.320 … -0.140 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | −0.170 | -0.320 … -0.060 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.810 | -0.940 … -0.670 |
| Everything together: the three for the shots, both for the ground | four players | −0.780 | -0.840 … -0.660 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.040 | -0.080 … -0.020 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.150 | -0.170 … -0.120 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.100 | -0.130 … -0.070 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 2.375 against 2.307 ms, enemies.update 0.511 against 0.500, projectiles.update 1.357 against 1.258.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3359 KB a frame in all; within combat.step 2690.1, combat.frame 33.4, projectiles.update 1768.2, enemies.update 798.4, hostile.update 19.8, hud.bars 1.7, fx.update 9.3 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1529.0 |
| height (ground.js:19) | 726.4 |
| next (native) | 116.1 |
| drawLocal (minimap.js:138) | 107.9 |
| abs (native) | 85.9 |
| subarray (native) | 61.1 |
| update (life.js:1447) | 57.9 |
| near (pebbles.js:250) | 52.7 |
| _update (three.webgpu.js:33882) | 40.2 |
| place (course.js:563) | 35.6 |
| split (anatomy.js:2092) | 19.8 |
| waterColour (minimap.js:129) | 19.6 |
| meters.gravel.fn (scenes-look.js:356) | 18.9 |
| frame (gore.js:1143) | 18.5 |
| riverBed (course.js:757) | 18.4 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +8016 |
| Combat bullhead far | +1 | +1200 |
| Combat troutParr | +2 | +8232 |
| Combat troutParr far | +1 | +3600 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +480 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +232 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +780 |
| Combat bubbles | +1 | +480 |
| Combat blood | +1 | +568 |
| Combat specks | +1 | +292 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +3870 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (139) | 60 / 58 / 32 / 0 | 1.751 | 0.175 | 0.214 | 1.002 | 0.104 | +16 | 25 | 2.8 |
| 20 (22) | 150 (138) | 60 / 57 / 33 / 0 | 2.131 | 0.181 | 0.357 | 1.183 | 0.100 | +17 | 41 | 4.5 |
| 40 (39) | 150 (138) | 60 / 59 / 31 / 0 | 2.487 | 0.179 | 0.505 | 1.368 | 0.101 | +17 | 62 | 5.3 |
| 80 (75, 35 not drawn) | 150 (137) | 60 / 59 / 31 / 0 | 3.388 | 0.172 | 0.896 | 1.893 | 0.097 | +15 | 89 | 7.7 |
| 40 (40) | 28 (26) | 60 / 58 / 32 / 0 | 1.508 | 0.143 | 0.669 | 0.252 | 0.107 | +19 | 27 | 1.2 |
| 40 (40) | 50 (46) | 60 / 59 / 31 / 0 | 1.615 | 0.153 | 0.652 | 0.431 | 0.098 | +19 | 29 | 3.0 |
| 40 (39) | 300 (138, pool full) | 60 / 58 / 31 / 0 | 2.231 | 0.151 | 0.497 | 1.216 | 0.093 | +19 | 69 | 5.7 |
| 40 (39) | 150 (138) | 0 / 10 / 29 / 0 | 2.398 | 0.180 | 0.594 | 1.387 | 0.083 | +19 | 62 | 7.0 |
| 40 (39) | 150 (138) | 120 / 90 / 0 / 0 | 2.478 | 0.181 | 0.626 | 1.313 | 0.117 | +19 | 65 | 5.5 |
| 40 (40) | 0 (0) | 0 / 7 / 29 / 0 | 0.950 | 0.075 | 0.599 | 0.001 | 0.039 | +14 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.047 | 0.028 | 0.020 | 0.001 | 0.001 | – | 0 | 0.0 |

enemies.update ≈ 0.125 + 9.79 µs·n + 0.006 µs·n² (n enemies alive): at 40 that is 392 µs growing with the number and 9 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 8.54 µs a shot at 40 enemies (26 → 138 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 5 | 47 | 0 | 1.5 | 0.0 | 0.060 | 1.965 | 41 (2) | 247.7 |
| 5 | 28 | 11 | 54 | 25 | 5.5 | 4.0 | 0.050 | 1.335 | 41 (1) | 257.4 |
| 10 | 31 | 11 | 40 | 36 | 7.3 | 5.3 | 0.045 | 1.440 | 41 (1) | 241.9 |
| 15 | 10 | 5 | 45 | 37 | 10.1 | 7.3 | 0.055 | 1.460 | 42 (2) | 251.3 |
| 20 | 26 | 8 | 57 | 25 | 10.3 | 4.8 | 0.050 | 1.405 | 43 (3) | 261.1 |
| 25 | 19 | 9 | 52 | 25 | 6.8 | 4.7 | 0.045 | 1.565 | 43 (4) | 267.5 |
| 30 | 25 | 18 | 52 | 20 | 6.8 | 3.0 | 0.080 | 1.585 | 41 (3) | 276.3 |

The enemies fired 21.2 rounds a second on their own. The list held at most 90 rounds (capacity 90); up to 51 lay on the bed at once, in 29 of 30 seconds, the longest 7.7 s (they go after 8 s there, or at 12 s old). hostile.update took 0.050 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with a vertex count of 0 is unusual. (http://localhost:8182/)

(Draws with nothing in them in the stress case, a draw call each and no triangles: Combat ribbons.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-eco-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

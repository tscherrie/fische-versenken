# Combat bench: webgpu, detail

apple metal-3 · WebGPU · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.5, u 0, water 11.98 u deep, a parr of 1 u 6.99 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (38–40) | 40 (38–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–2) | 3 (1–5) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (23–29) | 145 (109–150) |
| enemy rounds flying | 5 (2–11) | 61 (46–67) |
| … spent and sinking | 33 (24–36) | 99 (93–114) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 117 (94–164) / 87 (77–105) | 500 (440–540) / 333 (219–393) |
| hits / kills a second (median of the repeats) | 53 / 1.0 | 101 / 6.5 |
| players' shots fired by the bench a second | 66 | 285 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 6 | 105 / 9 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.637 (95 % 0.550 … 0.725, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.300 … 2.525 ms. The same method with nothing shown or hidden (A/A): -0.019 (95 % -0.138 … 0.125, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.606 ms (repeats 1.354 … 1.756) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.353 ms (1.983 … 2.483): **over**. The slowest tenth of the frames take over 2.100 ms for step and frame, the slowest 3.400 ms.
- **Script, stress case:** combat.step + combat.frame 2.656 ms (repeats 2.571 … 2.888) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.358 ms (3.277 … 3.616): **over**. The slowest tenth of the frames take over 4.200 ms for step and frame, the slowest 6.400 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.606 (1.354 … 1.756) | +2.656 (2.571 … 2.888) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.005 (0.003 … 0.008) | +0.009 (0.004 … 0.012) |
| the threat list (signals.js, asked for by the game's own step) | +0.017 (0.008 … 0.019) | +0.018 (0.007 … 0.037) |
| the page's style and layout (fight against no fight) | +0.242 (0.217 … 0.292) | +0.254 (0.238 … 0.271) |
| handing combat's meshes to the card (paired, stress case) | +0.425 (0.400 … 0.450) | +0.425 (0.400 … 0.450) |
| **all of it** | +2.353 (1.983 … 2.483) | +3.358 (3.277 … 3.616) |
| (seconds apart, noisy:) the frame's whole script | +2.38 (1.48 … 3.21) | +3.56 (3.14 … 3.91) |
| (seconds apart, noisy:) … of it the draw's script | +0.33 (-0.04 … 0.95) | +0.49 (0.20 … 0.59) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +62320 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 12.85 → 14.15 ms, whole frames back to back 12.63 → 13.22 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (12 minutes), 7 other headless Chromes were open on this machine (load 214.0 / 173.8 / 119.6): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.531 | 31 % | 13.11 µs an enemy | 0.467 | 17 % | 11.01 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.242 | 14 % | 9.01 µs a shot | 1.260 | 45 % | 8.67 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.039 | 2 % | 1.02 µs a round | 0.117 | 4 % | 0.73 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.038 | 2 % |  | 0.060 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.002 | 0 % |  | 0.004 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.001 | 0 % |  | 0.005 | 0 % |  |
| aim.update | 0.028 | 2 % |  | 0.027 | 1 % |  |
| director.update | 0.002 | 0 % |  | 0.001 | 0 % |  |
| pickups.update | 0.001 | 0 % |  | 0.002 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.024 | 1 % |  | 0.027 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.293 | 17 % |  | 0.270 | 10 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.313 | 18 % |  | 0.312 | 11 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.187 | 11 % |  | 0.249 | 9 % |  |
| combat.step + combat.frame | 1.701 | 100 % |  | 2.800 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 147 shots, 42 enemies): a shot's locate + bed + level 0.86 (locate 0.32, bed 0.50, level 0.14); an enemy's current + locate + bed + level 1.27 (current 0.71); terrain.collidersNear 0.010 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 1.229, spent and sinking 0.201, lying on the bed 0.271; a players' shot flying along the river 7.340, without the bed and surface lookup 3.104 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.370 ms (-0.500 … -0.200). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.080 | -0.120 … -0.010 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.140 | -0.200 … -0.070 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.050 | -0.110 … 0.070 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.170 | -0.250 … -0.070 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.380 | -0.480 … -0.310 |
| The same three together | four players | −0.090 | -0.150 … -0.050 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.220 | -0.280 … -0.190 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.040 | -0.040 … 0.090 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.510 | -0.600 … -0.440 |
| Everything together: the three for the shots, both for the ground | four players | −0.550 | -0.620 … -0.510 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.030 | -0.050 … 0.000 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.100 | -0.120 … -0.040 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.070 | -0.100 … -0.060 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 2.366 against 2.270 ms, enemies.update 0.431 against 0.435, projectiles.update 1.210 against 1.178.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3386 KB a frame in all; within combat.step 2698.7, combat.frame 85.6, projectiles.update 1806.1, enemies.update 674.7, hostile.update 27.6, hud.bars 1.1, fx.update 9.6 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1564.7 |
| height (ground.js:19) | 607.6 |
| next (native) | 120.1 |
| abs (native) | 92.1 |
| update (life.js:1447) | 90.7 |
| update (gore.js:852) | 88.9 |
| subarray (native) | 59.5 |
| drawLocal (minimap.js:138) | 52.1 |
| near (pebbles.js:250) | 47.2 |
| _update (three.webgpu.js:33882) | 46.9 |
| frame (gore.js:1143) | 40.1 |
| draw (weapons.js:1565) | 24.9 |
| riverBed (course.js:757) | 23.4 |
| hypot (native) | 22.4 |
| update (hostile.js:71) | 21.8 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +13360 |
| Combat bullhead far | +1 | +720 |
| Combat troutParr | +2 | +41160 |
| Combat troutParr far | +1 | +480 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +960 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +292 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +956 |
| Combat bubbles | +1 | +820 |
| Combat blood | +1 | +1334 |
| Combat specks | +1 | +376 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +4910 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 60 / 100 / 0 | 1.672 | 0.215 | 0.178 | 0.838 | 0.125 | +13 | 50 | 5.0 |
| 20 (22) | 150 (146) | 60 / 61 / 99 / 0 | 2.084 | 0.226 | 0.314 | 1.063 | 0.142 | +18 | 74 | 6.0 |
| 40 (40) | 150 (145) | 60 / 61 / 99 / 0 | 2.681 | 0.242 | 0.539 | 1.401 | 0.132 | +19 | 123 | 5.5 |
| 80 (76, 35 not drawn) | 150 (145) | 60 / 62 / 98 / 0 | 3.312 | 0.229 | 0.783 | 1.807 | 0.127 | +17 | 129 | 8.0 |
| 40 (40) | 28 (27) | 60 / 62 / 98 / 0 | 1.670 | 0.210 | 0.714 | 0.237 | 0.147 | +19 | 46 | 2.0 |
| 40 (40) | 50 (49) | 60 / 62 / 98 / 0 | 1.749 | 0.198 | 0.627 | 0.417 | 0.143 | +17 | 36 | 0.5 |
| 40 (38) | 300 (293) | 60 / 61 / 99 / 0 | 4.221 | 0.281 | 0.573 | 3.118 | 0.151 | +19 | 87 | 8.5 |
| 40 (40) | 150 (146) | 0 / 9 / 7 / 0 | 2.427 | 0.234 | 0.548 | 1.317 | 0.029 | +19 | 77 | 5.0 |
| 40 (39) | 150 (146) | 120 / 118 / 41 / 0 | 3.529 | 0.291 | 0.854 | 2.061 | 0.236 | +19 | 55 | 4.5 |
| 40 (40) | 0 (0) | 0 / 2 / 0 / 0 | 1.320 | 0.126 | 0.819 | 0.001 | 0.018 | +17 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.051 | 0.031 | 0.017 | 0.001 | 0.000 | – | 0 | 0.0 |

enemies.update ≈ 0.023 + 15.65 µs·n + -0.074 µs·n² (n enemies alive): at 40 that is 626 µs growing with the number and -118 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 10.86 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 9 | 5 | 38 | 4 | 1.6 | 0.3 | 0.065 | 1.233 | 40 (0) | 257.5 |
| 5 | 7 | 6 | 57 | 20 | 5.6 | 4.3 | 0.045 | 1.782 | 44 (4) | 250.2 |
| 10 | 31 | 8 | 38 | 66 | 10.6 | 7.9 | 0.060 | 1.473 | 40 (0) | 289.7 |
| 15 | 18 | 9 | 46 | 34 | 9.9 | 7.5 | 0.082 | 2.472 | 44 (5) | 230.3 |
| 20 | 11 | 8 | 64 | 47 | 11.4 | 8.0 | 0.058 | 1.367 | 41 (1) | 266.5 |
| 25 | 29 | 23 | 38 | 55 | 11.8 | 7.5 | 0.043 | 1.543 | 41 (1) | 259.1 |
| 30 | 17 | 5 | 36 | 37 | 11.1 | 7.9 | 0.037 | 1.650 | 42 (4) | 234.5 |

The enemies fired 19.2 rounds a second on their own. The list held at most 119 rounds (capacity 160); up to 71 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.057 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with a vertex count of 0 is unusual. (http://localhost:8182/)

(Draws with nothing in them in the stress case, a draw call each and no triangles: Combat ribbons.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

# Combat bench: webgpu, eco

apple metal-3 · WebGPU · quality eco (light pools) · canvas 1280×720, scene drawn at 1280×720 · one step of 50.0 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.7, u 0, water 12.04 u deep, a parr of 1 u 7.06 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (38–40) | 39 (35–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–2) | 3 (0–7) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 26 (21–29) | 137 (96–149) |
| enemy rounds flying | 7 (1–14) | 58 (44–69) |
| … spent and sinking | 47 (24–72) | 32 (20–46) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 132 (93–193) / 71 (63–81) | 391 (334–400) / 238 (179–240) |
| hits / kills a second (median of the repeats) | 23 / 1.2 | 65 / 5.8 |
| players' shots fired by the bench a second | 48 | 246 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 8 | 101 / 10 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.719 (95 % 0.537 … 1.025, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.450 … 2.063 ms. The same method with nothing shown or hidden (A/A): 0.056 (95 % -0.313 … 0.338, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 1.514 ms (repeats 1.457 … 1.790) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 2.324 ms (2.205 … 2.600): **over**. The slowest tenth of the frames take over 2.000 ms for step and frame, the slowest 2.700 ms.
- **Script, stress case:** combat.step + combat.frame 2.480 ms (repeats 2.337 … 2.932) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 3.301 ms (3.113 … 3.741): **over**. The slowest tenth of the frames take over 4.100 ms for step and frame, the slowest 7.800 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +1.514 (1.457 … 1.790) | +2.480 (2.337 … 2.932) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.007 (0.006 … 0.007) | +0.021 (0.017 … 0.027) |
| the threat list (signals.js, asked for by the game's own step) | +0.016 (0.014 … 0.020) | +0.019 (0.016 … 0.019) |
| the page's style and layout (fight against no fight) | +0.315 (0.299 … 0.362) | +0.333 (0.308 … 0.380) |
| handing combat's meshes to the card (paired, stress case) | +0.438 (0.425 … 0.500) | +0.438 (0.425 … 0.500) |
| **all of it** | +2.324 (2.205 … 2.600) | +3.301 (3.113 … 3.741) |
| (seconds apart, noisy:) the frame's whole script | +2.19 (1.96 … 3.04) | +3.53 (2.68 … 4.45) |
| (seconds apart, noisy:) … of it the draw's script | +0.32 (0.15 … 0.64) | +0.48 (0.06 … 0.81) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +19 draw calls and +31524 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 11.15 → 11.55 ms, whole frames back to back 10.79 → 11.40 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (14 minutes), 10 other headless Chromes were open on this machine (load 423.1 / 371.3 / 272.2): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.622 | 38 % | 15.35 µs an enemy | 0.547 | 21 % | 12.89 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.224 | 14 % | 8.76 µs a shot | 1.188 | 45 % | 8.63 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.053 | 3 % | 0.91 µs a round | 0.099 | 4 % | 1.11 µs a round |
| firing.fire (the local player's weapons: the laser's pulses, and its beam's ray) | 0.061 | 4 % |  | 0.062 | 2 % |  |
| firing.after (thrown and stunned enemies, fire, the katana's cuts) | 0.005 | 0 % |  | 0.003 | 0 % |  |
| smoke.update (powder smoke, silt) | 0.003 | 0 % |  | 0.005 | 0 % |  |
| aim.update | 0.037 | 2 % |  | 0.029 | 1 % |  |
| director.update | 0.003 | 0 % |  | 0.004 | 0 % |  |
| pickups.update | 0.004 | 0 % |  | 0.003 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.029 | 2 % |  | 0.027 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.260 | 16 % |  | 0.269 | 10 % |  |
| rest of combat.step (bosses, rules, the shots' trails, fx.update, gore.update, corpses) | 0.173 | 11 % |  | 0.233 | 9 % |  |
| combat.frame (hud and health bars, the weapons' models, the shots' glows, smoke.frame, gore.frame) | 0.142 | 9 % |  | 0.186 | 7 % |  |
| combat.step + combat.frame | 1.617 | 100 % |  | 2.653 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 135 shots, 43 enemies): a shot's locate + bed + level 0.74 (locate 0.27, bed 0.40, level 0.10); an enemy's current + locate + bed + level 1.24 (current 0.54); terrain.collidersNear 0.010 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.792, spent and sinking 0.306, lying on the bed 0.062; a players' shot flying along the river 7.639, without the bed and surface lookup 7.403 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.170 ms (-0.290 … -0.110). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.090 | -0.210 … 0.000 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.160 | -0.240 … -0.090 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | +0.000 | -0.120 … 0.110 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.080 | -0.230 … 0.060 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.350 | -0.440 … -0.250 |
| The same three together | four players | −0.040 | -0.140 … 0.100 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.270 | -0.430 … -0.170 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.010 | -0.100 … 0.070 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.890 | -1.140 … -0.710 |
| Everything together: the three for the shots, both for the ground | four players | −0.720 | -0.850 … -0.650 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.050 | -0.090 … -0.020 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.180 | -0.220 … -0.130 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.090 | -0.140 … -0.060 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 2.372 against 2.370 ms, enemies.update 0.598 against 0.588, projectiles.update 1.218 against 1.170.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 3102 KB a frame in all; within combat.step 2425.8, combat.frame 36.8, projectiles.update 1422.9, enemies.update 847.1, hostile.update 20.9, hud.bars 1.5, fx.update 9.1 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| update (projectiles.js:221) | 1265.8 |
| height (ground.js:19) | 775.8 |
| drawLocal (minimap.js:138) | 107.4 |
| next (native) | 74.2 |
| subarray (native) | 60.4 |
| update (life.js:1447) | 55.9 |
| near (pebbles.js:250) | 55.2 |
| abs (native) | 48.5 |
| place (course.js:563) | 38.8 |
| _update (three.webgpu.js:33882) | 38.7 |
| update (gore.js:852) | 34.8 |
| meters.gravel.fn (scenes-look.js:356) | 20.7 |
| frame (gore.js:1143) | 20.5 |
| split (anatomy.js:2092) | 19.7 |
| waterColour (minimap.js:129) | 18.1 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +8016 |
| Combat bullhead far | +1 | +1680 |
| Combat troutParr | +2 | +2744 |
| Combat troutParr far | +1 | +3840 |
| Combat trout | +2 | +10976 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +480 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +960 |
| Combat grenades | +0 | +0 |
| Combat smoke | +2 | +256 |
| Combat ribbons | +1 | +0 |
| Combat glow | +1 | +748 |
| Combat bubbles | +1 | +480 |
| Combat blood | +1 | +588 |
| Combat specks | +1 | +260 |
| Combat gibs | +0 | +0 |
| FV gear | +2 | +3870 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (139) | 60 / 57 / 33 / 0 | 2.306 | 0.211 | 0.357 | 1.280 | 0.138 | +14 | 20 | 2.8 |
| 20 (22) | 150 (138) | 60 / 58 / 32 / 0 | 2.557 | 0.205 | 0.518 | 1.528 | 0.111 | +17 | 42 | 3.2 |
| 40 (39) | 150 (138) | 60 / 58 / 32 / 0 | 3.038 | 0.199 | 0.877 | 1.752 | 0.121 | +19 | 55 | 4.7 |
| 80 (75, 35 not drawn) | 150 (136) | 60 / 58 / 31 / 0 | 4.196 | 0.192 | 1.288 | 2.702 | 0.122 | +17 | 108 | 7.8 |
| 40 (40) | 28 (26) | 60 / 57 / 32 / 0 | 2.197 | 0.185 | 0.993 | 0.408 | 0.139 | +15 | 16 | 1.3 |
| 40 (39) | 50 (46) | 60 / 58 / 32 / 0 | 2.445 | 0.188 | 1.117 | 0.608 | 0.142 | +19 | 33 | 3.2 |
| 40 (39) | 300 (139, pool full) | 60 / 58 / 32 / 0 | 3.269 | 0.196 | 1.150 | 2.561 | 0.128 | +19 | 58 | 5.8 |
| 40 (39) | 150 (138) | 0 / 8 / 32 / 0 | 3.401 | 0.203 | 1.009 | 2.175 | 0.047 | +19 | 56 | 5.2 |
| 40 (39) | 150 (138) | 120 / 90 / 0 / 0 | 2.869 | 0.200 | 0.742 | 1.670 | 0.130 | +19 | 58 | 6.5 |
| 40 (40) | 0 (0) | 0 / 5 / 23 / 0 | 1.503 | 0.092 | 1.032 | 0.003 | 0.047 | +11 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.051 | 0.041 | 0.034 | 0.002 | 0.001 | – | 0 | 0.0 |

enemies.update ≈ 0.126 + 21.90 µs·n + -0.085 µs·n² (n enemies alive): at 40 that is 876 µs growing with the number and -136 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 19.00 µs a shot at 40 enemies (26 → 139 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11 | 4 | 39 | 2 | 1.5 | 0.4 | 0.130 | 3.870 | 41 (1) | 255 |
| 5 | 11 | 1 | 63 | 19 | 5.5 | 4.4 | 0.035 | 1.855 | 42 (2) | 261.8 |
| 10 | 21 | 4 | 49 | 30 | 7.3 | 4.1 | 0.035 | 2.985 | 42 (3) | 266.1 |
| 15 | 9 | 0 | 71 | 18 | 8.2 | 5.8 | 0.050 | 2.265 | 41 (2) | 246.9 |
| 20 | 23 | 9 | 46 | 29 | 8.0 | 6.2 | 0.100 | 3.020 | 42 (5) | 255.6 |
| 25 | 18 | 5 | 35 | 44 | 11.9 | 7.5 | 0.090 | 3.260 | 42 (5) | 267 |
| 30 | 24 | 7 | 56 | 18 | 8.7 | 6.5 | 0.075 | 2.995 | 43 (3) | 280.6 |

The enemies fired 19.3 rounds a second on their own. The list held at most 90 rounds (capacity 90); up to 44 lay on the bed at once, in 30 of 30 seconds, the longest 7.9 s (they go after 8 s there, or at 12 s old). hostile.update took 0.060 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with a vertex count of 0 is unusual. (http://localhost:8182/)

(Draws with nothing in them in the stress case, a draw call each and no triangles: Combat ribbons.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-eco-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

# Combat bench: webgpu, eco

apple metal-3 · WebGPU · quality eco (light pools) · canvas 1280×720, scene drawn at 1280×720 · one step of 50.0 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.5, u 0, water 11.98 u deep, a parr of 1 u 6.99 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 39 (37–40) |
| dead ones (cleared 0.5 s after the kill) | 0 (0–2) | 3 (0–7) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 26 (18–29) | 138 (96–147) |
| enemy rounds flying | 9 (0–14) | 58 (32–68) |
| … spent and sinking | 51 (21–81) | 31 (22–58) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 103 (64–160) / 104 (69–141) | 292 (251–376) / 240 (238–240) |
| hits / kills a second (median of the repeats) | 20 / 1.2 | 55 / 5.0 |
| players' shots fired by the bench a second | 47 | 242 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 9 | 102 / 9 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.463 (95 % 0.450 … 0.487, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.400 … 0.525 ms. The same method with nothing shown or hidden (A/A): 0.013 (95 % -0.013 … 0.037, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 0.999 ms (repeats 0.990 … 1.016) against 1 ms: **within**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.477 ms (1.411 … 1.571): **over**. The slowest tenth of the frames take over 1.100 ms for step and frame, the slowest 1.300 ms.
- **Script, stress case:** combat.step + combat.frame 1.494 ms (repeats 1.469 … 1.502) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.997 ms (1.897 … 2.055): **over**. The slowest tenth of the frames take over 1.600 ms for step and frame, the slowest 1.900 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +0.999 (0.990 … 1.016) | +1.494 (1.469 … 1.502) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.002 (0.001 … 0.003) | +0.011 (0.009 … 0.016) |
| the threat list (signals.js, asked for by the game's own step) | +0.009 (0.007 … 0.020) | +0.010 (0.008 … 0.013) |
| the page's style and layout (fight against no fight) | +0.227 (0.212 … 0.264) | +0.238 (0.231 … 0.266) |
| handing combat's meshes to the card (paired, stress case) | +0.237 (0.175 … 0.288) | +0.237 (0.175 … 0.288) |
| **all of it** | +1.477 (1.411 … 1.571) | +1.997 (1.897 … 2.055) |
| (seconds apart, noisy:) the frame's whole script | +1.58 (1.49 … 1.73) | +2.16 (1.99 … 2.23) |
| (seconds apart, noisy:) … of it the draw's script | +0.30 (0.16 … 0.42) | +0.35 (0.20 … 0.40) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +12 draw calls and +34960 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 4.81 → 5.13 ms, whole frames back to back 4.91 → 6.66 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (5 minutes), 3 other headless Chromes were open on this machine (load 9.3 / 9.3 / 18.9): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.512 | 51 % | 12.57 µs an enemy | 0.429 | 29 % | 10.22 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.143 | 14 % | 5.58 µs a shot | 0.635 | 43 % | 4.61 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.033 | 3 % | 0.69 µs a round | 0.076 | 5 % | 0.85 µs a round |
| aim.update | 0.020 | 2 % |  | 0.019 | 1 % |  |
| director.update | 0.004 | 0 % |  | 0.002 | 0 % |  |
| pickups.update | 0.002 | 0 % |  | 0.003 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.011 | 1 % |  | 0.008 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.187 | 19 % |  | 0.186 | 13 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.059 | 6 % |  | 0.079 | 5 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.032 | 3 % |  | 0.039 | 3 % |  |
| combat.step + combat.frame | 1.002 | 100 % |  | 1.477 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 137 shots, 43 enemies): a shot's locate + bed + level 0.68 (locate 0.27, bed 0.39, level 0.10); an enemy's current + locate + bed + level 1.08 (current 0.62); terrain.collidersNear 0.026 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.708, spent and sinking 0.111, lying on the bed 0.042; a players' shot flying along the river 4.000, without the bed and surface lookup 2.486 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: +0.010 ms (-0.030 … 0.040). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.070 | -0.090 … -0.030 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.120 | -0.150 … -0.100 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.010 | -0.030 … 0.010 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.100 | -0.150 … -0.090 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.270 | -0.300 … -0.240 |
| The same three together | four players | −0.060 | -0.080 … -0.030 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.160 | -0.190 … -0.140 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.010 | -0.020 … 0.030 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.450 | -0.480 … -0.440 |
| Everything together: the three for the shots, both for the ground | four players | −0.530 | -0.550 … -0.510 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.030 | -0.050 … -0.020 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.100 | -0.130 … -0.040 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.060 | -0.090 … -0.040 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.428 against 1.443 ms, enemies.update 0.403 against 0.435, projectiles.update 0.634 against 0.621.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 1697 KB a frame in all; within combat.step 1165.2, combat.frame 7.0, projectiles.update 276.9, enemies.update 795.6, hostile.update 13.1, hud.bars 2.9, fx.update 7.0 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| height (ground.js:19) | 727.5 |
| update (projectiles.js:79) | 238.0 |
| drawLocal (minimap.js:138) | 74.9 |
| subarray (native) | 60.2 |
| update (life.js:1447) | 58.2 |
| near (pebbles.js:250) | 49.5 |
| _update (three.webgpu.js:33882) | 38.9 |
| meters.gravel.fn (scenes-look.js:346) | 22.3 |
| split (anatomy.js:2084) | 19.8 |
| segmentDistance2 (projectiles.js:16) | 16.8 |
| frame (course.js:546) | 15.6 |
| riverBed (course.js:757) | 15.1 |
| update (life.js:836) | 14.7 |
| update (life.js:430) | 14.6 |
| add (native) | 13.6 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +5344 |
| Combat bullhead far | +1 | +960 |
| Combat troutParr | +2 | +5488 |
| Combat troutParr far | +1 | +3600 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +960 |
| Combat glow | +1 | +652 |
| Combat bubbles | +1 | +480 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (139) | 60 / 58 / 32 / 0 | 0.948 | 0.018 | 0.170 | 0.379 | 0.078 | +9 | 19 | 2.7 |
| 20 (22) | 150 (139) | 60 / 58 / 32 / 0 | 1.135 | 0.029 | 0.267 | 0.485 | 0.080 | +12 | 36 | 4.2 |
| 40 (39) | 150 (138) | 60 / 58 / 32 / 0 | 1.483 | 0.023 | 0.455 | 0.647 | 0.080 | +12 | 52 | 5.2 |
| 80 (76, 35 not drawn) | 150 (137) | 60 / 59 / 31 / 0 | 2.232 | 0.034 | 0.852 | 0.982 | 0.091 | +8 | 85 | 6.2 |
| 40 (40) | 28 (26) | 60 / 58 / 32 / 0 | 1.029 | 0.032 | 0.512 | 0.143 | 0.078 | +12 | 23 | 1.7 |
| 40 (40) | 50 (46) | 60 / 58 / 32 / 0 | 1.096 | 0.024 | 0.487 | 0.228 | 0.083 | +10 | 26 | 2.5 |
| 40 (39) | 300 (139, pool full) | 60 / 58 / 32 / 0 | 1.481 | 0.036 | 0.459 | 0.634 | 0.087 | +12 | 58 | 4.7 |
| 40 (39) | 150 (138) | 0 / 8 / 30 / 0 | 1.448 | 0.033 | 0.457 | 0.654 | 0.037 | +12 | 49 | 5.7 |
| 40 (38) | 150 (137) | 120 / 90 / 0 / 0 | 1.501 | 0.041 | 0.443 | 0.644 | 0.095 | +10 | 70 | 7.8 |
| 40 (40) | 0 (0) | 0 / 6 / 21 / 0 | 0.727 | 0.003 | 0.491 | 0.002 | 0.024 | +9 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.031 | 0.000 | 0.018 | 0.000 | 0.000 | – | 0 | 0.0 |

enemies.update ≈ 0.076 + 8.86 µs·n + 0.018 µs·n² (n enemies alive): at 40 that is 354 µs growing with the number and 28 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 4.33 µs a shot at 40 enemies (26 → 139 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 8 | 41 | 3 | 1.5 | 0.4 | 0.045 | 1.020 | 41 (1) | 230.4 |
| 5 | 5 | 5 | 52 | 25 | 5.5 | 4.4 | 0.005 | 0.970 | 41 (4) | 241.4 |
| 10 | 5 | 2 | 27 | 46 | 10.5 | 7.8 | 0.020 | 0.970 | 43 (4) | 247.5 |
| 15 | 23 | 13 | 30 | 24 | 11.9 | 7.5 | 0.055 | 1.010 | 42 (3) | 253.5 |
| 20 | 14 | 3 | 49 | 19 | 9.9 | 6.8 | 0.050 | 1.105 | 42 (2) | 230.4 |
| 25 | 1 | 0 | 37 | 44 | 11.1 | 6.3 | 0.060 | 1.080 | 41 (1) | 236.6 |
| 30 | 17 | 10 | 37 | 27 | 10.6 | 7.9 | 0.015 | 1.025 | 41 (1) | 236.7 |

The enemies fired 13.2 rounds a second on their own. The list held at most 90 rounds (capacity 90); up to 46 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.040 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with an index count of 0 is unusual. (http://localhost:8182/)

(The draws with an index count of 0 come from the base game's warm-up render at start-up -- two transparent objects with an empty index in each pass, the mirror's too, which never sees combat -- not from combat.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-eco-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).

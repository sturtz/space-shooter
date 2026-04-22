# Space Shooter — Changelog

All notable changes, organized by date. Newest at bottom.

---

### 2026-03-09

- Unified cone range with loading ring visual (12→18px)
- Removed decorative rings from enemies (elite still differentiated by tint)
- Removed purple asteroid sprites — pulse SVGs only
- Fixed rock hitboxes — drawSize `radius*5` → `radius*2.5`
- Fixed pause/unpause breaking weapon firing (missing beat callback)
- Fixed mega asteroid file extension (.png → .svg)
- Lowered default music volume (0.2→0.07)
- Replaced per-screen backgrounds with shared p5.js "Deep Field" on `#bg-canvas`
- Upgrade screen: available ring cyan→white, gradient node fills, semi-transparent backdrop
- Full pause/settings menu: track selector, volume bar, resume, forfeit
- Music track switching with persistent preferences in SaveData
- Mobile pause button (top-right)
- Fixed fire.mp3 BPM (120→100), reset beat offset
- Locked chill (requires Scythe) and trap (requires prestige) tracks
- Scaled up mobile visuals: player, rocks, coins, bullets (1.75×)
- Bigger + repositioned dash button for mobile
- Dimmed aurora ribbons during gameplay (75%)
- Shrunk mothership hitbox (18→12px)
- Movement speed as first upgrade (depth 1, requires root)
- Extra +1 base coin drop on all enemies
- T1 upgrade costs: explicit [10, 15, 25] arrays
- Mothership spin animation
- Auto-switch to chill track on Scythe purchase
- Restored SVG icon rendering on upgrade nodes
- Scaled up pause menu + tutorial for mobile
- Wired barrier into CollisionSystem (Bug #1)
- Prevented double `onEnemyKilled` calls (Bug #9)
- Updated `IGame` interface with missing fields (Bug #5)
- Fixed damage number alpha (Bug #8) — `maxLife` field
- Unified `coinMultiplier` (removed duplicate fields, Bug #4)
- Extracted 17 weapon constants to Constants.ts
- Added splash damage numbers (Bug #14)
- Player engine glow gold→cyan
- Swarm Attractor moved to early game (depth 1)
- First boss auto-grants Dash Bomb
- Shooting stars: wider position/angle/speed/tail ranges
- Dash thruster animation + ripple ring + fires cone weapon
- Upgrade screen visual overhaul ("Constellation Map"): vignette, frosted header, currency chips, luminous connections, node auras/bodies/ring states, root player sprite, sparkle particles, purchase flash, floating tooltips, frosted bottom bar, cost badges
- Cone attack overhaul: shockwave ring, radial spikes, upgraded particles, screen shake, rebuilt SFX with 4 audio layers
- Boss variants: Level 2 bee, Level 3 butterfly, Level 4+ alternating with scaling
- Pulse enemy ships at level 3+ (fast, fragile, melee-only)
- Background aurora ribbons: slower breathing (2s→10s cycle)
- Big rock hitbox increased (16→22px)
- Boss rewards auto-granted per level (1=Dash Bomb, 2=Laser, 3=Dash Bomb, 4+=choice)
- Joystick clamped to screen bounds
- Dash bomb spawns at landing point (not origin)
- Bigger settings cog icon for mobile
- Boss reward shows actual ability card (bosses 1-3)
- Boss reward → upgrades directly (skip gameover screen)
- Tutorial condensed to single visual "CONTROLS" screen
- Mobile 1.75× sprite scale-up (player, rocks, mothership)

### 2026-03-10

- HTML volume slider works on mobile (touch-action fixes)
- Volume control always expanded on mobile (CSS media query)
- Volume slider wired in constructor (works from menu)
- Mute icon touch support
- Pause menu volume bar supports touch drag
- Bosses deal 3× mothership damage, 2× bullet damage
- Player health system (3 HP, 1s i-frames, damage flash)
- Enemy bullets damage player (generous hitbox, red particles)
- Player HP hearts in HUD
- Enemy ship + bullet sprites scaled for mobile
- Fixed rock glow halo (missing `ctx.arc()` call)
- Fixed boss ship sprite oversized vs hitbox (4×→2.5×)
- Fixed boss ships spawning at wrong angle
- Increased `ENEMY_SHIP_SIZE` 12→18, reduced sprite multiplier 3→2
- Scaled canvas-drawn hull to match new radius
- Fixed mega rock sprite assignment (if→if/else if chain)
- Applied `BOSS_BULLET_DAMAGE` to mothership hits
- Added Hypersonic Bolt upgrade (pierce, requires dmg_core L2)
- Added Lucky Strike upgrade (5× coin chance, requires econ_value L1)
- Fixed SFX volume after unmute
- Rebalanced asteroid coin values (medium 2→3, large 3→5)
- Cleaned up duplicate imports in Game.ts
- Tutorial page 2: player renders over asteroid
- Death screen with cause-of-death theming (4 variants)
- Mothership explosion 1.2s delay with particles
- Fixed touchend triggering next-screen buttons (0.6s guard)
- Tutorial buttons positioned higher for mobile
- All buttons unified to cyan START RUN style
- Targeting laser: aim-based instead of auto-target
- Fixed mothership rendering after destruction
- Mobile camera zoom system (1.75× on mobile, lerp follow, pushScreenSpace/popScreenSpace)
- Replaced custom build-number plugin with Vite define + package.json version

### 2026-03-11

- Fixed joystick/dash coordinate sync on orientation change
- Fixed music disappearing on mobile (blur/focus→visibilitychange)
- Fixed UI disappearing on window resize (re-apply baseTransform in beginFrame)
- Fixed joystick using CSS pixel space (refactored to raw CSS deltas)
- Bug #18: `highestLevel` persisted immediately
- Squared-distance collision (zero sqrt) + inlined Vec2 in hot paths
- Skip splash/chain when stats are 0, skip dead enemies
- Cached noise buffer in AudioManager, throttled explosion SFX
- Fixed `source-atop` compositing on EnemyShip/Rock/Mothership (offscreen canvas)
- Fixed `lifetimeKills` double-count on boss reward
- Fixed hex→rgba conversion in PauseMenu
- Replaced rock `ctx.filter` with red radial gradient glow
- Removed ALL `ctx.filter` and per-entity `shadowBlur` from codebase
- New `Debris` entity (ambient killable asteroids, 50% coin drop)
- Game.ts refactoring Phase 1+2: utils extraction + 4 UI module extractions (~900 lines removed)
- Two new upgrades: Gravity Well (ms_slow) + Forward Field (dmg_forward)
- Interactive tutorial system (3-step: move→dash→destroy ship)
- Algorithmic art system: sacred geometry bg, geometric death bursts, formation spawning
- Shooting star performance fix (removed shadowBlur, shortened tails)
- Font string cache + glow halo texture cache in Renderer
- Algo art toggle in pause menu (persisted)
- Sacred geometry beat-sync pulse
- Tutorial UX: instant control + debris overhaul
- Killable debris with coin drops
- Boss hitbox fix (edge-based pulse weapon check)
- Upgrade screen: constellation map with flyable ship navigation
- Upgrade screen UX: ship orientation, interaction cleanup, expanded tooltip zone
- Mobile view: camera zoom 1.5→1.75, upgrade screen scale-up, debris visibility, rock glow
- Upgrade screen: thruster trail, widened branch angles, removed HOME text
- Purchase key Space→Shift (Dash), tutorial step 2 fix
- Favicon redesign (algo art style), fixed UpgradeIcons.ts duplicates
- Player pulse visual: purchase-style shockwave system
- Tutorial step 3: enemy ship kill + mothership explosion

### 2026-03-12

- Dash input: Click, Space, Shift, Enter, Z, X, J all trigger dash. Space removed from pause.
- Bug #21: Coin particle colors match visuals (purple ≥50, gold ≥5)
- Bug #23: Added `paused` to `IGame` interface
- Bug #31: Upgrade ship stops following mouse near bottom bar
- Bug #32: K-key forfeit shows "ROUND FORFEITED" (grey theme)

### 2026-03-13

- Dead code cleanup: `screenFlashColor`, `streakBonus`, `getUpgradeEffect()`/`effectPerLevel`, 10 unused `PlayerStats` stubs, lifesteal JSDoc
- Bumped tsconfig to ES2022, added `build.target: "esnext"` to Vite

### 2026-03-16

- Fixed coin tint bleed (source-atop → offscreen canvas)
- Wired `barrageSplashBonus` into CollisionSystem
- Fixed player hit SFX (was playing mothership hit sound)
- Font caching consistency in GameOverScreen
- Removed dead `magnetRange` field from Coin/CollisionSystem
- Removed duplicate `hexToRgba` from PauseMenu

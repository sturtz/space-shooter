# Space Shooter — Architecture & Agent Quick-Start Guide

> **Incremental space shooter** — defend your mothership, collect coins, unlock upgrades between rounds.

---

## Quick Reference

| Item | Detail |
|---|---|
| **Stack** | TypeScript · Vite · HTML5 Canvas 2D |
| **Package manager** | pnpm (workspace enabled) |
| **Dev server** | `pnpm dev` → `http://localhost:3000` |
| **Build** | `pnpm build` → `dist/` |
| **Entry point** | `src/main.ts` → creates `ScreenManager`, starts `requestAnimationFrame` loop |
| **Canvas elements** | 3 canvases: `menu-canvas`, `game-canvas`, `upgrade-canvas` in `index.html` |
| **Fonts** | "Tektur" (Google Fonts, loaded in `index.html`) |
| **Resolution** | Logical `1200 × 800` (`GAME_WIDTH`/`GAME_HEIGHT`), hi-DPI scaled |

---

## Game Loop

```
main.ts
  └─ new ScreenManager(menuCanvas, gameCanvas, upgradeCanvas)
  └─ requestAnimationFrame → gameLoop(timestamp)
       ├─ manager.update(dt)   — delegates to active screen
       └─ manager.render()     — delegates to active screen
```

`dt` is capped at `1/30` to prevent spiral-of-death on tab-unfocus.

---

## Directory Map

```
src/
├── main.ts                  # Bootstrap: orient lock, canvas grab, ScreenManager, game loop
├── game/
│   ├── ScreenManager.ts     # 3-canvas orchestrator: owns shared state, switches screens
│   ├── MenuScreen.ts        # Menu canvas: title screen + tutorial overlay
│   ├── Game.ts              # Game canvas: gameplay, boss reward, game over
│   └── GameInterface.ts     # TypeScript interface for Game (used by subsystems)
├── entities/
│   ├── Entity.ts            # Base class: pos, vel, radius, active flag
│   ├── Player.ts            # Keyboard/touch-controlled ship; dash, firing, shield
│   ├── Enemy.ts             # Abstract enemy base (hp, speed, scoreValue)
│   ├── EnemyShip.ts         # Flying enemy that shoots at the player
│   ├── Rock.ts              # Asteroid variants (small/medium/large/mega)
│   ├── Mothership.ts        # Stationary ally at bottom; has HP bar, turret, barrier
│   ├── Bullet.ts            # Player & mothership projectiles (pierce, splash, chain)
│   ├── Coin.ts              # Dropped loot; magnet-attracted to player
│   └── Missile.ts           # Homing missiles fired by player upgrade
├── systems/
│   ├── CollisionSystem.ts   # Bullet↔enemy, enemy↔mothership, coin pickup
│   ├── ParticleSystem.ts    # Object-pooled particles (emit / emitDirectional)
│   └── SpawnSystem.ts       # Wave spawning, enemy shooting AI, mothership turret/regen
├── rendering/
│   └── Renderer.ts          # Canvas 2D wrapper: hi-DPI, screen shake, drawing helpers
├── input/
│   └── InputManager.ts      # Keyboard + mouse + touch → moveDirection, dashRequested, fire
├── audio/
│   └── AudioManager.ts      # Background music tracks (chill/trap/phat-bass), SFX
├── ui/
│   ├── HUD.ts               # In-game overlay: HP bars, coin count, round timer, dash CD
│   └── UpgradeScreen.ts     # Between-round upgrade tree rendered on canvas
├── upgrades/
│   ├── UpgradeManager.ts    # Reads upgrade tree → computes PlayerStats each round
│   └── UpgradeTree.ts       # Defines all upgrade nodes, costs, tiers, dependencies
└── utils/
    ├── Assets.ts            # Preloads images (ships, items, upgrade icons)
    ├── Constants.ts         # All magic numbers: sizes, speeds, colors, base stats
    ├── Math.ts              # Vec2 helpers, lerp, clamp, distance, angle, random range
    └── SaveManager.ts       # localStorage persistence (coins, upgrade levels, stars)
```

---

## Screen Architecture (3-Canvas)

The app uses 3 separate `<canvas>` elements, one per screen. `ScreenManager` owns shared state (SaveData, AudioManager, UpgradeManager) and switches which canvas is visible.

| Screen | Canvas | Class | States |
|---|---|---|---|
| **Menu** | `menu-canvas` | `MenuScreen` | Title screen + tutorial overlay |
| **Game** | `game-canvas` | `Game` | `"playing"` · `"bossReward"` · `"gameover"` |
| **Upgrade** | `upgrade-canvas` | `UpgradeScreen` | Upgrade tree, prestige, start run |

Screen transitions (managed by `ScreenManager`):
- **Menu** → **Game** (click Start → `manager.startGame()`)
- **Game** `"gameover"` → **Upgrade** (click Continue → `manager.goToUpgradeScreen()`)
- **Game** `"playing"` + K key → **Upgrade** (forfeit shortcut)
- **Upgrade** → **Game** (click Start Run → `manager.startRunFromUpgrade()`)
- **Upgrade** → **Menu** (click Menu → `manager.goToMenu()`)

---

## Entity Hierarchy

```
Entity (base: x, y, vx, vy, radius, active)
├── Player        — controlled ship, dash, shield, firing
├── Enemy         — abstract: hp, speed, scoreValue, status effects (poison, slow)
│   ├── Rock      — asteroid; 4 sizes (small/medium/large/mega); splits on death
│   └── EnemyShip — flies toward mothership, shoots projectiles at player
├── Mothership    — stationary bottom-center ally; has HP, turret, energy barrier
├── Bullet        — projectile (player or enemy); pierce count, splash, chain
├── Coin          — dropped by enemies; magnet range, collected by player
└── Missile       — homing projectile from missile upgrade
```

---

## Upgrade System

### Structure
- **UpgradeTree.ts** defines an array of `UpgradeNode` objects, each with:
  - `id`, `name`, `description`, `maxLevel`, `costBase`, `costGrowth`
  - `tier` (1–4), `requires` (dependency node IDs)
  - `icon` (SVG path)
- **Star upgrades** (`StarUpgrade[]`) are a separate prestige track unlocked with star currency.
- **UpgradeManager** reads current upgrade levels from `SaveData` and computes a flat `PlayerStats` object each round.

### Key Stats Computed
`damage`, `critChance`, `critMultiplier`, `splashRadius`, `pierceCount`, `chainTargets`, `missileLevel`, `poisonDps`, `slowOnHit`, `moveSpeed`, `flashbangRadius`, `mineOnDash`, `magnetRange`, `shieldHP`, `lifeSteal`, `coinMultiplier`, `roundDuration`, `mothershipHP`, `mothershipRegen`, `turretFireRate`, `turretDamage`, `barrierHP`, `slowAuraRadius`, `slowAuraStrength`, `overtimeBonus`, `fireRate`, `bulletSpeed`

---

## Collision System

Handled in `CollisionSystem.ts` with circle-circle distance checks:

1. **Bullet → Enemy**: Damage, pierce, splash (AoE), chain lightning, poison, slow, lifesteal, crit rolls, damage numbers via particles.
2. **Enemy → Mothership**: Enemies/enemy bullets that reach the mothership deal damage.
3. **Coin → Player**: Magnet-attracts within range; collected for coin currency.
4. **Overtime bonus**: Extra coins for enemies killed after the round timer expires.

---

## Spawning (`SpawnSystem.ts`)

- **Rocks**: Spawn from top of screen in 3 sizes (small/medium/large) + mega rocks; frequency scales with round number.
- **Enemy Ships**: Spawn with increasing frequency; elite variants have 2× HP + different colors.
- **Enemy Bullets**: EnemyShips target the player position.
- **Mothership Turret**: Auto-fires at nearest enemy within range.
- **Mothership Regen**: Passive HP regeneration each frame.
- **Energy Barrier**: Shield ring around mothership that absorbs hits.

---

## Rendering

`Renderer.ts` wraps `CanvasRenderingContext2D` with:
- **Hi-DPI support**: Scales canvas by `devicePixelRatio`.
- **Screen shake**: Offset applied during trauma events (hits, explosions).
- **Drawing helpers**: `drawCircle`, `drawRect`, `drawLine`, `drawText`, `drawRoundedRect`, `drawGradientBar`, `drawGlowCircle`, `drawPanel`, `drawButton`.
- All text uses the **"Tektur"** font family.

---

## Input

`InputManager.ts` unifies three input sources:

| Source | Move | Fire | Dash |
|---|---|---|---|
| Keyboard | WASD / Arrow keys | Space / left-click | Shift / right-click |
| Mouse | Cursor position (when held) | Left click | Right click |
| Touch | Touch-follow (drag) | Auto-fire while touching | Tap bottom-right zone |

Exposes: `moveDirection: Vec2`, `isFiring: boolean`, `dashRequested: boolean`.

---

## Audio

`AudioManager.ts` manages:
- **Background tracks**: `chill.mp3`, `trap.mp3`, `phat-bass.wav` — cycled or selectable.
- **SFX**: `fire.mp3`, `hit.wav`, `shot 2.wav`.
- Volume toggle via on-screen icon.

---

## Save System

`SaveManager.ts` uses `localStorage` key `"space-shooter-save"`:
```ts
interface SaveData {
  coins: number;
  stars: number;
  upgradeLevels: Record<string, number>;
  starUpgradeLevels: Record<string, number>;
  highScore: number;
  round: number;
}
```

---

## Constants (`Constants.ts`)

All tuning values live here — base stats, sizes, speeds, colors, etc. Key ones:
- `GAME_WIDTH = 1200`, `GAME_HEIGHT = 800`
- `PLAYER_BASE_SPEED = 300`, `PLAYER_BASE_FIRE_RATE = 4`, `PLAYER_BASE_DAMAGE = 10`
- `MOTHERSHIP_BASE_HP = 100`
- `BASE_ROUND_DURATION = 30` (seconds)
- `COLORS` object with themed hex values (pulse-cyan, magenta, gold, etc.)

---

## Assets

### Images (preloaded in `Assets.ts`)
- **Ships**: `pulse-player.svg`, `pulse-enemy-ship.svg`, `pulse-mothership.svg`, `enemy-bee.svg`, `enemy-butterfly.svg`, `enemy-boss.svg`, death GIFs
- **Items**: `coin1.png`, `bomb.gif`, `orb-*.png`, `pulse-asteroid*.svg`, volume icons
- **Backgrounds**: `stars.png`, `pink-parallax-space-stars.png`
- **Upgrade tree icons**: ~25 SVGs in `public/assets/upgrade-tree/`

### Sounds
- Music: `chill.mp3`, `trap.mp3`, `phat-bass.wav`
- SFX: `fire.mp3`, `hit.wav`, `shot 2.wav`

---

## Common Patterns for Agents

### Adding a new entity type
1. Create `src/entities/NewEntity.ts` extending `Entity`.
2. Add it to the entity arrays in `Game.ts` (e.g., `this.newEntities: NewEntity[] = []`).
3. Update `SpawnSystem.ts` for spawning logic.
4. Update `CollisionSystem.ts` for interaction rules.
5. Add rendering in `Game.ts` → `render()` or a dedicated render method.

### Adding a new upgrade
1. Add a new `UpgradeNode` entry in `UpgradeTree.ts` with unique `id`, tier, cost curve, and dependencies.
2. Add the corresponding stat field to `PlayerStats` in `UpgradeManager.ts`.
3. Wire the stat into gameplay logic (e.g., `Player.ts`, `CollisionSystem.ts`, `SpawnSystem.ts`).
4. Add an SVG icon to `public/assets/upgrade-tree/`.

### Modifying game balance
- Tweak values in `src/utils/Constants.ts` for base stats.
- Tweak `costBase`/`costGrowth` in `UpgradeTree.ts` for economy.
- Spawn rates and scaling are in `SpawnSystem.ts`.

### Debugging tips
- `pnpm dev` for hot-reload dev server.
- Canvas is fixed logical resolution — coordinates are always in 1200×800 space.
- `SaveManager.clear()` or delete `localStorage["space-shooter-save"]` to reset progress.
- Max `dt` cap means pausing/tabbing won't cause physics explosions.

---

## Bugs & Issues Found

### 🔴 Bugs (Likely Gameplay Impact)

1. **Barrier system is defined but never wired into collisions**
   - `SpawnSystem.barrierAbsorb()` exists and tracks `msBarrierHitsRemaining`, but `CollisionSystem.checkEnemyMothershipCollisions()` never calls it. The barrier upgrade (`ms_barrier`) does nothing.
   - **Fix**: In `CollisionSystem`, before `game.mothership.takeDamage()`, call `game.spawner.barrierAbsorb()` — if it returns `true`, skip the damage and play a barrier-hit effect instead.

2. **Menu render: blink branch does nothing different**
   - In `Game.renderMenu()`, both the `if (blink)` and `else` branches render the exact same "TAP TO START" button with identical parameters. The blinking effect is broken — the button is always fully visible.
   - **Fix**: Make the `else` branch use a dimmer `bg`/`textColor` or `ctx.globalAlpha` to create the actual blinking visual.

3. **`source-atop` compositing on Mothership damage flash affects other sprites**
   - In `Mothership.render()`, `ctx.globalCompositeOperation = "source-atop"` is used to tint the sprite red on damage. But this composite mode applies to the whole canvas, not just the sprite. If other entities overlap the mothership area, their rendering may be affected.
   - **Fix**: Draw the mothership sprite to an offscreen canvas, apply the tint there, then draw the result to the main canvas. Or use `ctx.filter` / `ctx.globalCompositeOperation` within a clipped region.

4. **`coinValueMultiplier` and `coinDropMultiplier` are the same value**
   - In `UpgradeManager.computeStats()`, both are set to `coinValueMult`. This means `econ_value` upgrade double-dips if any code uses them separately. Currently `CollisionSystem` uses `coinDropMultiplier` only, so the `coinValueMultiplier` field is dead code — but it's confusing and could cause bugs if someone uses the wrong one.
   - **Fix**: Decide on one field or differentiate them (value = worth per coin, drop = number of coins dropped).

5. **`IGame` interface is stale / missing fields**
   - `IGame` doesn't include `spawner` (needed for barrier), `gameTime`, `bossEnemy`, `bossDefeated`, `dashRings`, `laserBeams`, `pendingBombs`, or several other fields that systems reference via `game.` casting. The interface compiles only because subsystems cast through `IGame` but `Game` implements more.
   - **Fix**: Extend `IGame` with missing fields, or use a different pattern (e.g., pass specific dependencies to each system instead of the whole game).

### 🟡 Potential Issues

6. **`endRound` can be called twice in the same frame**
   - `updatePlaying()` checks `roundTimer <= 0` and calls `endRound()`. Then it continues to run collision checks which can also call `endRound(true)` if mothership dies. After the first `endRound()`, `this.state` changes, but the rest of `updatePlaying()` still executes.
   - **Fix**: Add an early return after `endRound()` in the timer check (like the collision system already does with `return`).

7. **Pausing with Space conflicts with general gameplay**
   - Space, Escape, and P all toggle pause. Space is typically "fire" in shooters. While the cone weapon fires automatically on beat, if bullet firing is re-enabled (commented out), Space would both fire and pause.
   - **Fix**: Remove Space from pause keys, or use a separate key mapping system.

8. **`damageNumbers` alpha assumes `maxLife = 0.8` but "DODGE" text uses `life = 0.6`**
   - In `renderPlaying()`, damage number alpha is `dn.life / 0.8`, but dodge numbers start with `life = 0.6`. This means dodge text starts at alpha 0.75 instead of 1.0.
   - **Fix**: Store `maxLife` on each `DamageNumber` and use `dn.life / dn.maxLife`.

9. **`onEnemyKilled` can be called multiple times for the same enemy**
   - If an enemy is killed by poison tick in `updatePlaying()`, `onEnemyKilled` is called. But if splash damage or chain lightning in `CollisionSystem` also processes that enemy in the same frame (before it's filtered), it could be called again. The `enemy.alive` checks prevent double-damage but `onEnemyKilled` side effects (coins, particles, kill count) could double.
   - **Fix**: Check `enemy.alive` at the start of `onEnemyKilled` and return early if already dead.

10. **Boss reward always goes to `gameover` — should go to `upgradeScreen`**
    - `selectSpecialAbility()` sets `this.state = "gameover"`. But `gameover` click handler sends to `upgradeScreen`. So the player sees a "round complete" screen after selecting their boss ability, then has to click again to upgrade. This feels like an extra unnecessary step.
    - **Fix**: Consider going directly to `upgradeScreen` from `selectSpecialAbility()`.

### 🟢 Improvements

11. **Game.ts is ~1200 lines — extract render methods**
    - `renderMenu()`, `renderPlaying()`, `renderGameOver()`, `renderTutorial()`, `renderBossReward()` are each 50–200 lines. Extract them into a `GameRenderer.ts` or individual state renderer files.

12. **Hardcoded magic numbers scattered throughout**
    - Many values like `30` (cone range), `180` (missile speed), `2.5` (laser interval), `0.3` (ring life), `80` (bomb radius), `12` (first boss elapsed), etc. are defined as `readonly` or literals in `Game.ts` but not in `Constants.ts`.
    - **Fix**: Move all tuning constants to `Constants.ts` for centralized balance tweaking.

13. **No object pooling for bullets/enemies/coins**
    - Every bullet, enemy, and coin is `new`'d and then filtered out when dead. For a game that fires on every music beat and spawns continuously, this creates GC pressure.
    - **Fix**: Implement object pooling (like `ParticleSystem` already does for particles).

14. **Splash damage has no damage number display**
    - In `CollisionSystem.checkBulletEnemyCollisions()`, splash damage hits nearby enemies but doesn't call `spawnDamageNumber` for them — only for the primary hit.

15. **`PlayerStats` has ~20 unused "compat stub" fields**
    - Fields like `playerHp`, `playerShields`, `evasionChance`, `reflectFraction`, `lifestealChance`, `armorReduction`, `shieldRegenInterval`, etc. are set to defaults and never read. They clutter the interface.
    - **Fix**: Remove or comment out until actually needed.

16. **Event listeners in constructor are never cleaned up**
    - `Game` constructor adds `click`, `touchend`, `mousedown`, `mousemove`, `mouseup`, `touchstart`, `touchmove`, and `keydown` listeners. These are never removed. If `Game` is ever re-instantiated, listeners will stack.
    - **Fix**: Store listener references and provide a `destroy()` method, or use `AbortController`.

17. **`buildBgCache()` is called during first render frame**
    - Building the background (600 dust particles, 350+80+20 stars, nebulae) happens synchronously on the first `render()` call, which could cause a visible frame hitch.
    - **Fix**: Build it in the constructor or use `requestIdleCallback`.

---

## Known Architecture Notes / Future Refactors

- ~~**Split into 3 canvases**~~ ✅ **DONE** — Implemented `ScreenManager` + `MenuScreen` + refactored `Game` + standalone `UpgradeScreen`, each with own canvas and renderer.
- **No ECS**: Uses class-based entity hierarchy rather than a formal Entity-Component-System. This is fine at current scale but may need refactoring if entity types proliferate.
- **Collision is O(n²)**: Brute-force circle checks. Fine for current entity counts (<200), but spatial partitioning (grid/quadtree) may be needed if scale increases.
- **No unit tests**: All testing is manual/visual.
- **Upgrade tree UI**: Rendered directly on canvas in `UpgradeScreen.ts` — complex layout logic that could be fragile to modify.
- **Touch controls**: Floating virtual joystick on left half, dash button (bottom-right), pause button (top-right).

---

---

## Changelog

### 2026-03-09 — Visual/Hitbox Cleanup

1. **Cone range unified with loading ring** — `CONE_RANGE` was 12px while the visual loader arc drew at radius 18px, meaning the damage zone was invisible inside the loader. Changed `CONE_RANGE` from 12 → 18 so the white loading ring accurately represents the cone weapon's hit zone.

2. **Removed decorative rings from enemies** — Stripped three ring-drawing routines:
   - Elite dashed circle on `EnemyShip` (gold dashed ring at `ENEMY_SHIP_SIZE + 4`)
   - Thin rim highlight stroke on `Rock` sprites (at `radius * 1.05`)
   - Elite dashed glow ring on `Rock` (at `radius + 5`)
   
   Elite enemies are still differentiated via gold tint overlay and color changes.

3. **Removed purple asteroid sprites** — `purple-asteroid-small.png` was referenced in both `AsteroidImages.small` and `AsteroidImages.big` pools. Both pools now contain only the pulse-style SVGs (`pulse-asteroid-small.svg`, `pulse-asteroid-big.svg`), giving a consistent visual style.

4. **Fixed rock hitboxes** — Rock sprite `drawSize` was `radius * 5`, creating a visual 5× larger than the collision circle. Changed to `radius * 2.5` so the rendered sprite closely matches the actual collision radius. This means rocks will now look proportional to their hitbox — players should no longer feel like they're hitting invisible walls or bullets passing through visible rock.

   Hitbox summary (unchanged collision radii, just visual alignment):
   | Entity | Collision Radius | Notes |
   |---|---|---|
   | Player | `PLAYER_COLLISION_RADIUS` (4px) | Sprite 10×14.75px — tight hitbox is intentional (bullet-hell style) |
   | Rock (small) | `ROCK_SIZE` (10px) × sizeScale | drawSize now `radius * 2.5` = 25px (was 50px) |
   | Rock (big) | `ROCK_BIG_SIZE` (16px) × sizeScale | drawSize now 40px (was 80px) |
   | Rock (mega) | 30px (set in `spawnMegaRock`) | drawSize now 75px (was 150px) |
   | EnemyShip | `ENEMY_SHIP_SIZE` (12px) | Canvas-drawn hull spans ~20px tip-to-tip — reasonable match |
   | Mothership | `MOTHERSHIP_COLLISION_RADIUS` (18px) | Sprite 60px — loose hitbox, intentional for defense gameplay |
   | Bullet | `BULLET_SIZE` (4px) | Small pixel projectile — appropriate |
   | Missile | 5px | Diamond shape ~15px long — hitbox is center-body, fine |
   | Coin | `COIN_SIZE` (6px) | Sprite drawn at 15–18px — generous pickup zone is player-friendly |

5. **Fixed pause/unpause breaking weapon firing** — `startConeTrack()` was called without the beat callback on unpause, so the cone weapon and missiles would never fire again after pausing. Now the full callback (cone weapon + missile firing) is re-passed on unpause.

6. **Fixed mega asteroid file extension** — `AsteroidImages.mega` referenced `pulse-asteroid-mega.png` but the actual file on disk is `pulse-asteroid-mega.svg`. Fixed the extension so the mega boss rock sprite loads correctly.

7. **Lowered default music volume** — `fire.mp3` default volume reduced from 0.2 → 0.07 for a less jarring initial experience. Players can still adjust via the volume slider.

*Last updated by agent — 2026-03-09. Visual/hitbox cleanup + pause bug fix + audio tuning.*

### 2026-03-09 — Background Overhaul + Upgrade Screen Visual Refresh

1. **Replaced all per-screen backgrounds with shared p5.js "Deep Field" background**
   - Removed `buildBgCache()`, `renderStarfield()`, `Star` interface, and star generation from both `Game.ts` and `MenuScreen.ts`.
   - `Renderer.beginFrame()` now uses `clearRect` instead of `fillRect(COLORS.bg)`, making all three canvases transparent.
   - Embedded the "Deep Field" p5.js sketch (from `main-screen-bg.html`) directly in `index.html` as a `#bg-canvas` div behind `#game-container` (z-index 0 vs 1).
   - CSS updated: removed opaque `background` from `#game-container`, added `#bg-canvas` positioning with `pointer-events: none`.
   - All screens now show the animated cosmic background (nebulae, aurora ribbons, parallax stars, shooting stars, dust motes, scanlines, vignette) through their transparent canvases.

2. **Upgrade screen: available ring changed from cyan to white**
   - `#00ffff` → `#ffffff` for the "can buy" node ring stroke and shadow, making it more visible against the cosmic background.

3. **Upgrade screen: replaced blocky SVG icons with colored gradient fills**
   - Removed SVG icon rendering (`drawImage` of preloaded upgrade-tree SVGs).
   - Each node now renders a radial gradient fill using `BRANCH_COLORS[node.branch]` (fading to dark), with the emoji icon overlaid in white text.
   - Maxed nodes get a hexagonal gradient fill; non-maxed get a circular fill.
   - Icon alpha varies by state: locked (0.35), not-affordable (0.5), available (0.85).

4. **Upgrade screen: background made semi-transparent**
   - Replaced opaque `COLORS.panelBg` + vignette with `rgba(6, 6, 18, 0.55)` overlay so the Deep Field background is visible behind the upgrade tree.

*Last updated by agent — 2026-03-09. Background overhaul + upgrade visual refresh.*

### 2026-03-09 — Pause/Settings Menu + Music Track Switching + Mobile Pause Button

1. **Full pause/settings menu** — Replaced the basic "PAUSED" overlay with a proper settings panel featuring:
   - **Music track selector**: Three buttons (🔥 FIRE, ❄️ CHILL, 🎵 TRAP) to switch between `fire.mp3`, `chill.mp3`, and `trap.mp3` mid-game. Active track is highlighted with its theme color.
   - **Volume control**: Clickable gradient bar showing current volume (0–100%). Click anywhere on the bar to set volume.
   - **Resume button**: Green "▶ RESUME" button.
   - **Forfeit button**: Red "✕ FORFEIT ROUND" button (replaces the old K-key-only forfeit).
   - **Keyboard hints**: "P / ESC to resume · K to forfeit" shown only on desktop.

2. **Music track switching in AudioManager** — Added `switchTrack()`, `applyPreferences()`, `get track`, `get availableTracks`, `getMusicVolume()`, `playClick()` methods. Track switching preserves volume, playback state, and cone track (beat-synced weapon firing) — BPM and beat offset update automatically per track (fire=120, chill=100, trap=140).

3. **Persistent music preferences** — Added `musicTrack: MusicTrack` and `musicVolume: number` fields to `SaveData` (defaults: `"fire"`, `0.07`). Track and volume choices are saved to localStorage when changed in the pause menu and restored on game start via `audio.applyPreferences()`.

4. **Mobile pause button** — Touch users now see a pause button (‖ icon) in the top-right corner during gameplay. Tapping it opens the settings menu. The pause menu's Resume/Forfeit/Track/Volume controls all work with touch.

5. **Refactored pause logic** — Extracted `togglePause()` and `resumeFromPause()` methods from the inline keyboard handler. Both keyboard (P/ESC/Space) and touch (pause button) now use the same code path.

*Last updated by agent — 2026-03-09. Pause menu + music switching + mobile controls.*

---

## TODO — Next Batch (from playtesting feedback 2026-03-09)

- [ ] **fire.mp3 is 100 BPM, not 120** — `AudioManager` `TRACK_INFO.fire.bpm` is wrong. Fix to 100. Redo beat-sync math so cone weapon fires correctly on beat.
- [ ] **Lock chill track** — Chill should be gated behind the "faster cone damage" upgrade (player must unlock it first).
- [ ] **Lock trap track** — Trap should stay locked even longer (decide gate: level, upgrade tier, or star prestige).
- [ ] **Scale up everything for mobile** — Player model bigger, enemies bigger, coins bigger, bullets bigger. Currently tuned for desktop at 1200×800; mobile needs beefier visuals.
- [ ] **Dash button: bigger + more central** — Currently bottom-right corner (GAME_WIDTH-60, GAME_HEIGHT-80, radius 30). Move more central and increase radius for fat-finger usability.
- [ ] **Dim p5.js ribbons during gameplay** — The aurora ribbons in the Deep Field background are too bright/distracting during active gameplay. Reduce opacity or brightness when `active === "game"` and `state === "playing"`.
- [ ] **Mothership hitbox too big** — `MOTHERSHIP_COLLISION_RADIUS` is 18px but sprite is 60px. Hitbox feels too generous — enemies reach the mothership too easily. Consider shrinking the collision radius or adjusting the sprite size.
- [ ] **Movement speed as a first/early upgrade** — Players should feel slow at start and upgrade into speed. Make movement speed a prominent early-game upgrade node.
- [ ] **Enemies drop extra coin by default** — Increase base coin drop or add guaranteed +1 coin per enemy kill.
- [ ] **Upgrade cost curve: 10 → 15 → 25** — Rework `costBase`/`costGrowth` in `UpgradeTree.ts` so early upgrades cost 10, then 15, then 25 (rather than current exponential formula).

# Space Shooter — Architecture & Agent Quick-Start Guide

> **Incremental space shooter** — defend your mothership, collect coins, unlock upgrades between rounds.

** check context-rules-steps and cd../Cline/skills **
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
│   ├── MenuScreen.ts        # Menu canvas: title screen + tutorial button
│   ├── Game.ts              # Game canvas: gameplay, tutorial, boss reward, game over
│   ├── GameInterface.ts     # TypeScript interface for Game (used by subsystems)
│   └── TutorialSystem.ts    # Interactive 3-step tutorial (movement, dash, enemies)
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
| **Menu** | `menu-canvas` | `MenuScreen` | Title screen + tutorial button |
| **Game** | `game-canvas` | `Game` | `"playing"` · `"tutorial"` · `"bossReward"` · `"gameover"` |
| **Upgrade** | `upgrade-canvas` | `UpgradeScreen` | Upgrade tree, prestige, start run |

Screen transitions (managed by `ScreenManager`):
- **Menu** → **Game tutorial** (first-time or click Tutorial → `manager.startTutorial("menu")`)
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

| Source | Move | Dash | Fire |
|---|---|---|---|
| Keyboard | WASD / Arrow keys | Click, Space, Shift, Enter, Z, X, J | Beat-synced (auto) |
| Mouse | Cursor position | Left click | Beat-synced (auto) |
| Touch | Touch-follow (drag) | Tap bottom-right zone | Auto-fire while touching |

Exposes: `moveDirection: Vec2`, `isFiring: boolean`, `dashRequested: boolean`.

**Dash triggers**: Left click, Space, Shift, Enter, Z, X, J keys, and touch dash zone. Firing is fully automatic (beat-synced pulse weapon), so all common action keys are mapped to dash for accessibility.

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

1. ~~**Barrier system is defined but never wired into collisions**~~ ✅ **FIXED 2026-03-09**
   - `CollisionSystem.checkEnemyMothershipCollisions()` now calls `game.spawner.barrierAbsorb()` before applying damage. If the barrier absorbs the hit, a shield-colored particle burst plays and no HP/time penalty is applied. `IGame` updated to expose `spawner`.

2. **Menu render: blink branch does nothing different**
   - In `Game.renderMenu()`, both the `if (blink)` and `else` branches render the exact same "TAP TO START" button with identical parameters. The blinking effect is broken — the button is always fully visible.
   - **Fix**: Make the `else` branch use a dimmer `bg`/`textColor` or `ctx.globalAlpha` to create the actual blinking visual.

3. **`source-atop` compositing on Mothership damage flash affects other sprites**
   - In `Mothership.render()`, `ctx.globalCompositeOperation = "source-atop"` is used to tint the sprite red on damage. But this composite mode applies to the whole canvas, not just the sprite. If other entities overlap the mothership area, their rendering may be affected.
   - **Fix**: Draw the mothership sprite to an offscreen canvas, apply the tint there, then draw the result to the main canvas. Or use `ctx.filter` / `ctx.globalCompositeOperation` within a clipped region.

4. ~~**`coinValueMultiplier` and `coinDropMultiplier` are the same value**~~ ✅ **FIXED 2026-03-09**
   - Unified into single `coinMultiplier` field in `PlayerStats`. Removed duplicate `coinValueMultiplier` / `coinDropMultiplier`. All code now references `stats.coinMultiplier`.

5. ~~**`IGame` interface is stale / missing fields**~~ ✅ **FIXED 2026-03-09**
   - `IGame` now includes `spawner: SpawnSystem`, `gameTime`, `bossEnemy`, `bossDefeated`. All fields that subsystems actually reference are present.

6. **`medium sized asteroids not droping 3 coins (start value)`**
   - medium asteroids should drop 3 coins 

### 🟡 Potential Issues

6. **`endRound` can be called twice in the same frame**
   - `updatePlaying()` checks `roundTimer <= 0` and calls `endRound()`. Then it continues to run collision checks which can also call `endRound(true)` if mothership dies. After the first `endRound()`, `this.state` changes, but the rest of `updatePlaying()` still executes.
   - **Fix**: Add an early return after `endRound()` in the timer check (like the collision system already does with `return`).

7. **Pausing with Space conflicts with general gameplay**
   - Space, Escape, and P all toggle pause. Space is typically "fire" in shooters. While the cone weapon fires automatically on beat, if bullet firing is re-enabled (commented out), Space would both fire and pause.
   - **Fix**: Remove Space from pause keys, or use a separate key mapping system.

8. ~~**`damageNumbers` alpha assumes `maxLife = 0.8` but "DODGE" text uses `life = 0.6`**~~ ✅ **FIXED 2026-03-09**
   - `DamageNumber` interface now has `maxLife` field. `spawnDamageNumber()` sets it alongside `life`. Render loop uses `dn.life / dn.maxLife` so DODGE text starts at full alpha.

9. ~~**`onEnemyKilled` can be called multiple times for the same enemy**~~ ✅ **FIXED 2026-03-09**
   - Added `if (!enemy.alive) return;` guard at the top of `onEnemyKilled()`. Prevents double coins/particles/kill count from splash/chain/poison triggers in the same frame.

10. ~~**Boss reward always goes to `gameover` — should go to `upgradeScreen`**~~ ✅ **FIXED 2026-03-09**
    - Both `selectSpecialAbility()` (boss 4+ choice) and auto-granted boss rewards (bosses 1-3) now go directly to `manager.goToUpgradeScreen()`. No more extra "Round Complete" click.

### 🟢 Improvements

11. **Game.ts is ~1200 lines — extract render methods**
    - `renderMenu()`, `renderPlaying()`, `renderGameOver()`, `renderTutorial()`, `renderBossReward()` are each 50–200 lines. Extract them into a `GameRenderer.ts` or individual state renderer files.

12. ~~**Hardcoded magic numbers scattered throughout**~~ ✅ **FIXED 2026-03-09**
    - Extracted 17 weapon/gameplay constants from Game.ts into Constants.ts: `CONE_RANGE`, `CONE_FIRE_EVERY`, `CONE_FLASH_DURATION`, `MISSILE_SPEED`, `MISSILE_FIRE_EVERY`, `LASER_INTERVAL`, `LASER_DAMAGE_MULT`, `BOMB_FUSE`, `BOMB_RADIUS`, `BOMB_DAMAGE_MULT`, `DASH_RING_LIFE`, `DASH_DAMAGE_MULT`, `STUN_DURATION`, `STUN_EXTRA_RADIUS`, `FIRST_BOSS_ELAPSED`, `CHAIN_RANGE`, `SPLASH_DAMAGE_MULT`. Game.ts imports and references these.

13. **No object pooling for bullets/enemies/coins**
    - Every bullet, enemy, and coin is `new`'d and then filtered out when dead. For a game that fires on every music beat and spawns continuously, this creates GC pressure.
    - **Fix**: Implement object pooling (like `ParticleSystem` already does for particles).

14. ~~**Splash damage has no damage number display**~~ ✅ **FIXED 2026-03-09**
    - `CollisionSystem` now calls `game.spawnDamageNumber()` for each splash-hit enemy, not just the primary target.

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

- [x] **fire.mp3 is 100 BPM, not 120** — Fixed BPM to 100, beatOffset to 0.0, cone measured interval to 1.2s.
- [x] **Lock chill track** — Gated behind `dmg_overclock` (Scythe) upgrade. Shows 🔒 with "Req: Scythe" hint.
- [x] **Lock trap track** — Gated behind first prestige (`prestigeCount >= 1`). Shows 🔒 with "Req: Prestige" hint.
- [x] **Scale up everything for mobile** — Player sprite 10→16px W, rocks drawSize `radius*3.5`, coins `COIN_SIZE*3.5/4.5`, bullets core rect 5→8px.
- [x] **Dash button: bigger + more central** — Moved from (W-60, H-80, r=30) to (W-120, H-120, r=48) with 14px font.
- [x] **Dim p5.js ribbons during gameplay** — Aurora intensity multiplied by 0.25 when game-canvas is visible.
- [x] **Mothership hitbox too big** — `MOTHERSHIP_COLLISION_RADIUS` reduced from 18px to 12px.
- [x] **Movement speed as a first/early upgrade** — `move_speed` (Thrusters) now depth 1, requires only `root`, costs [10, 15, 25].
- [x] **Enemies drop extra coin by default** — `+1` added to base coin value in `onEnemyKilled`.
- [x] **Upgrade cost curve: 10 → 15 → 25** — T1 upgrades (dmg_core, econ_duration, move_speed) now cost [10, 15, 25].

### 2026-03-09 — Playtesting Batch: BPM Fix, Track Locking, Mobile Scaling, Balance

1. **Fixed fire.mp3 BPM** — Changed from 120 to 100 BPM in `TRACK_INFO`. Reset `beatOffset` to 0.0. Updated `coneMeasuredInterval` default from `(60/120)*2=1.0s` to `(60/100)*2=1.2s`. Beat-synced weapon now fires correctly on fire.mp3 beats.

2. **Locked chill & trap music tracks** — Added `isTrackUnlocked()` to `AudioManager`. Chill requires `dmg_overclock >= 1` (Scythe upgrade), Trap requires `prestigeCount >= 1`. Pause menu shows 🔒 icons with requirement hints for locked tracks. Clicking a locked track plays an error buzz.

3. **Scaled up mobile visuals** — Player sprite: 10×14.75 → 16×23.6px. Rock drawSize: `radius*2.5` → `radius*3.5`. Coin drawSize: `COIN_SIZE*2.5/3` → `COIN_SIZE*3.5/4.5`. Bullet core rect: 5×3px → 8×5px. All entities now read better on small screens.

4. **Bigger + more central dash button** — Position moved from (W-60, H-80) to (W-120, H-120). Radius increased 30→48px. Font 9→14px. Much easier to hit on mobile.

5. **Dimmed aurora ribbons during gameplay** — p5.js `bgDrawAuroras()` checks if `game-canvas` is visible; if so, multiplies aurora intensity by 0.25 (75% dimmer). Auroras return to full brightness on menu/upgrade screens.

6. **Shrunk mothership hitbox** — `MOTHERSHIP_COLLISION_RADIUS` reduced from 18px to 12px in Constants.ts. Enemies and bullets must get closer before dealing damage. Sprite remains 60px for visual presence.

7. **Movement speed as first/early upgrade** — `move_speed` (Thrusters) moved from depth 2 (requires `dmg_core`) to depth 1 (requires only `root`). Cost curve set to [10, 15, 25]. Players can now buy movement speed immediately after round 1.

8. **Extra coin drops by default** — Added `+1` to base coin value in `onEnemyKilled()`. All enemies now drop at least 2 coins worth of value (base coinValue + 1), improving early-game economy.

9. **Upgrade cost curve: 10 → 15 → 25** — T1 upgrades (`dmg_core`, `econ_duration`, `move_speed`) now all use explicit `costs: [10, 15, 25]` arrays instead of exponential growth formula. Provides a clean, predictable early-game progression.

*Last updated by agent — 2026-03-09. Playtesting batch: BPM, track locking, mobile scaling, balance.*

### 2026-03-09 — Mothership Spin, Music Auto-Switch, Icon Fix, Pause Menu Mobile Scale-Up

1. **Mothership spin animation** — Added `spinAngle` field to `Mothership.ts`. The mothership sprite now rotates slowly (~0.5 rad/s) via `ctx.translate`/`ctx.rotate` in the render loop, giving it a constant gentle spin. Damage flash tint coordinates updated to local space.

2. **Auto-switch music to chill on Scythe purchase** — In `UpgradeScreen.tryPurchaseNode()`, when the player buys `dmg_overclock` (Scythe), the music automatically switches to the `chill` track via `audio.switchTrack("chill")` and the preference is saved to localStorage.

3. **Fixed upgrade node icons** — Restored SVG icon rendering in `UpgradeScreen.renderNodes()`. Nodes now draw their preloaded SVG icon (`node.iconPath`) at `r * 1.3` size on top of the colored gradient fill, falling back to emoji text only if the SVG hasn't loaded. The `preloadIcons()` method was already loading these images — they just weren't being drawn.

4. **Scaled up pause menu for mobile** — Complete overhaul of pause menu dimensions for fat-finger usability:
   - Panel: 300×320 → 380×420
   - Track buttons: 72×28 → 90×38, gap 10→14, fontSize 9→11
   - Volume slider: 14px tall → 30px tall (more than 2× thicker), label fontSize 9→11
   - Resume button: 28px → 40px tall, fontSize 11→14
   - Forfeit button: 28px → 40px tall, fontSize 9→12
   - Button spacing: resume at +280, forfeit at +340 (was +230/+268) — 60px gap between buttons (was 38px)
   - All rounded corners bumped from radius 6–7 → 8

5. **Scaled up mobile tutorial** — Both tutorial steps (Movement + Dash) updated for mobile readability:
   - Instruction panels: 360×90 → 400×110, font sizes 13/11/10 → 16/13/12
   - Bottom info panels: 340×50 → 400×60, font 9→11
   - Dash button illustration: moved from (W-60, H-80, r=30) to (W-120, H-120, r=48) matching actual in-game position
   - Dash label font: 9→14px
   - Continue button: 240×36 → 280×44, font 13→15

*Last updated by agent — 2026-03-09. Mothership spin, music auto-switch, icon fix, pause menu + tutorial mobile scale-up.*

### 2026-03-09 — Bug Fix Batch: Barrier, Double-Kill, Interface, Constants Cleanup

1. **Wired barrier into CollisionSystem (Bug #1)** — `CollisionSystem.checkEnemyMothershipCollisions()` now checks `game.spawner.barrierAbsorb()` before applying damage. If the barrier absorbs the hit, a blue shield-colored particle burst plays, the screen shakes lightly, and no HP loss or time penalty occurs. Both enemy body collisions and enemy bullet collisions check the barrier.

2. **Prevented double `onEnemyKilled` calls (Bug #9)** — Added `if (!enemy.alive) return;` guard at the top of `Game.onEnemyKilled()`. This prevents splash damage, chain lightning, and poison ticks from triggering duplicate coins, kill count increments, and particle bursts for the same enemy in a single frame.

3. **Updated `IGame` interface (Bug #5)** — Added missing fields: `spawner: SpawnSystem`, `gameTime: number`, `bossEnemy: Rock | null`, `bossDefeated: boolean`. CollisionSystem now accesses `game.spawner` through the typed interface instead of implicit casting.

4. **Fixed damage number alpha (Bug #8)** — `DamageNumber` interface now has a `maxLife` field set at spawn time. The render loop computes alpha as `dn.life / dn.maxLife` instead of hardcoded `dn.life / 0.8`. DODGE text (life=0.6) now starts at full alpha instead of 0.75.

5. **Unified coin multiplier (Bug #4)** — Removed duplicate `coinValueMultiplier` and `coinDropMultiplier` fields from `PlayerStats`. Both were set to the same value from `econ_value`. Replaced with single `coinMultiplier` field. All references updated.

6. **Extracted 17 weapon constants to Constants.ts (Improvement #12)** — Moved hardcoded magic numbers from Game.ts and CollisionSystem.ts to centralized `Constants.ts`: `CONE_RANGE`, `CONE_FIRE_EVERY`, `CONE_FLASH_DURATION`, `MISSILE_SPEED`, `MISSILE_FIRE_EVERY`, `LASER_INTERVAL`, `LASER_DAMAGE_MULT`, `BOMB_FUSE`, `BOMB_RADIUS`, `BOMB_DAMAGE_MULT`, `DASH_RING_LIFE`, `DASH_DAMAGE_MULT`, `STUN_DURATION`, `STUN_EXTRA_RADIUS`, `FIRST_BOSS_ELAPSED`, `CHAIN_RANGE`, `SPLASH_DAMAGE_MULT`. All game balance values are now in one file.

7. **Added splash damage numbers (Bug #14)** — `CollisionSystem` now calls `game.spawnDamageNumber()` for each enemy hit by splash AoE, not just the primary target. Players can now see damage feedback for area-of-effect hits.

*Last updated by agent — 2026-03-09. Bug fix batch: barrier wiring, double-kill guard, interface sync, alpha fix, coin multiplier cleanup, constants extraction, splash damage numbers.*

### 2026-03-09 — Playtesting Feedback: Visuals, Balance, Dash Overhaul

1. **Player engine glow changed from gold to cyan** — `COLORS.engineGlow` changed from `#ffcc00` to `#00ccff` to match the player's cyan theme. Affects engine shadow, bomb countdown ring, and boss defeat title glow.

2. **Swarm Attractor moved to early game** — `econ_swarm` upgrade changed from depth 3 (requires econ_magnet level 2, costs [100, 250]) to depth 1 (requires root, costs [15, 35]). Players can now buy +40% enemy spawn rate immediately for faster coin farming.

3. **First boss auto-grants Dash Bomb** — When the level-1 boss is defeated and the player has no special ability yet, `bomb_dash` is auto-equipped instead of showing the 3-card selection screen. Subsequent boss kills still show the choice screen so players can switch.

4. **Shooting stars more random in background** — p5.js shooting star spawner now uses wider position range (2–98% of screen vs 10–90%), wider angle range (−27° to +99° vs 14°–68°, allowing left-angled and more horizontal trajectories), wider speed range (7–20 vs 9–16), and wider tail lengths (60–250 vs 80–200).

5. **Dash thruster animation** — Dashing now emits a directional particle burst behind the player (opposite of facing direction): 8 cyan engine-glow particles + 4 white core particles, creating a visible thruster flame trail at dash start.

6. **Dash ripple ring restored** — Expanding cyan ring visual at dash origin point now renders again (was disabled). Ring fades out over 0.3s with decreasing line width for a clean ripple effect.

7. **Dash fires cone weapon** — Dashing now triggers one free `fireConeWeapon()` hit, dealing normal pulse weapon damage to any enemies within CONE_RANGE at the player's current position. This makes dash offensive even without upgrades.

*Last updated by agent — 2026-03-09. Playtesting feedback: visuals, balance, dash overhaul.*

### 2026-03-09 — Upgrade Screen Visual Overhaul ("Constellation Map")

Complete redesign of the upgrade screen UI from a flat programmer layout to a polished constellation-style skill map:

1. **Backdrop: vignette over cosmic bg** — Replaced opaque dark overlay with a subtle `rgba(4,4,14,0.45)` wash + radial vignette (transparent center, darker edges). The p5.js Deep Field background now shows prominently through the upgrade tree.

2. **Frosted header strip** — Replaced blocky panel title with a gradient-faded top strip (`rgba(6,8,22,0.8)` → transparent). Title "UPGRADE STATION" rendered with cyan text glow (`shadowBlur: 12`). Thin accent line at strip bottom.

3. **Currency chips** — Replaced single text line with three pill-shaped chips (coins 💰, stars ⭐, level LV) using `drawChip()` — rounded rect with tinted bg and border per currency type.

4. **Constellation connections** — Purchased paths: solid luminous lines with branch-colored glow (`shadowBlur: 6`) + wider faint core line. Unpurchased paths: animated dashed lines (`setLineDash([4,6])` with `lineDashOffset` cycling at 12px/s).

5. **Node auras** — Each node state has a distinct radial gradient aura:
   - Maxed: gold breathing aura (`rgba(255,210,0)`)
   - Purchasable: white breathing aura
   - Partially purchased: branch-colored soft aura
   - Locked/unaffordable: no aura

6. **Node bodies** — Dark disc with inner radial gradient (slightly lighter center). Three tint variants: warm dark for maxed, blue-dark for purchased, deep dark for unpurchased.

7. **Ring states** — Clear visual hierarchy:
   - Maxed: gold hexagonal border with shadowBlur
   - In progress: branch-colored progress arc (partial circle, rounded lineCap)
   - Purchasable: pulsing white ring
   - Unlocked but can't afford: dim red ring
   - Locked: very dim white ring

8. **Root node** — Player sprite with rotating cyan ring segments (3 arcs, 120° apart, spinning at 0.5 rad/s). Cyan energy aura radiates outward.

9. **Sparkle particles** — New particle system: maxed nodes emit ambient gold sparkles (rising, fading). Purchase triggers a 12-particle burst from the bought node.

10. **Purchase flash** — Branch-colored expanding circle overlay that fades over 0.6s on successful purchase.

11. **Contextual tooltips** — Repositioned from fixed bottom bar to floating panel near the hovered node. Features left accent bar in branch color, name, level badge, description, and status line. Auto-clamps to screen bounds.

12. **Frosted bottom bar** — Gradient-faded bottom strip with pulsing START RUN button (cyan glow oscillates), styled MENU and PRESTIGE buttons.

13. **Cost badges** — Affordable unpurchased nodes show coin cost below the node (`10💰`).

14. **Node radius increased** — `NODE_RADIUS` from 20 → 22 for better tap targets and visual presence.

*Last updated by agent — 2026-03-09. Upgrade screen constellation map overhaul.*

### 2026-03-09 — Cone Attack Overhaul, Boss Variants, Pulse Enemy Ships

1. **Cone attack made more prominent — visual splash + reverb SFX**
   - **Visual overhaul**: Replaced the subtle white flash with a full shockwave system:
     - Expanding cyan shockwave ring with `shadowBlur` glow, fading out over 0.18s
     - Inner white ring for depth
     - Central radial gradient splash fill (cyan → transparent)
     - 12 radial spike lines that rotate during expansion for a "splash" feel
     - Loader ring changed from white to cyan (`COLORS.player`), now gets brighter as it fills
     - Pre-fire glow: subtle ambient radial gradient appears when loader is >75% full
   - **Particle upgrade**: Each hit now emits 5 cyan + 2 white particles (was 3 white). 16 directional ring particles expand outward from player on every fire. 6 white inner burst particles.
   - **Screen shake**: 1.5px shake on every cone hit (not just kills)
   - **SFX reverb**: `playConeBlast()` completely rebuilt with 4 audio layers:
     - Punchy sawtooth thump (220→60 Hz, lowpass filtered 600→100 Hz)
     - Sub bass thud (80→25 Hz sine)
     - Noise burst reverb tail (bandpass 300 Hz, exponential decay over 0.35s)
     - High shimmer ring (1200→400 Hz sine, 0.18s)

2. **Boss variants for levels 2–4 (bee → butterfly → cycling)**
   - `spawnMegaRock()` renamed to `spawnBoss()` with level-based variant selection:
     - **Level 1**: Mega asteroid boss (unchanged)
     - **Level 2**: Bee boss (`enemy-bee.svg`) — fast (35 speed), shoots, radius 20, 15 coins
     - **Level 3**: Butterfly boss (`enemy-butterfly.svg`) — tanky (1.5× HP), shoots, radius 24, 20 coins
     - **Level 4+**: Alternating bee/butterfly with scaling HP (2×), speed (30 + level×2), radius (22 + level)
   - `EnemyShip` now has `variant` field (`"normal" | "pulse" | "bee" | "butterfly" | "boss"`)
   - Sprite-based rendering for non-normal variants using `ShipImages.enemyBee`, `enemyButterfly`, `enemy` (pulse)
   - Each variant has unique glow color (bee=gold, butterfly=purple, boss=red, pulse=cyan)
   - Boss ships render a pulsing aura ring in their variant color
   - `isBoss` flag added to `Enemy` base class for shared boss logic
   - `bossEnemy` type widened from `Rock | null` to `Rock | EnemyShip | null` in both `Game.ts` and `IGame`

3. **Pulse-enemy-ships introduced at level 3**
   - 35% chance to spawn as "pulse" variant when level ≥ 3 (instead of normal enemy ship)
   - **Really fast**: speed = `ENEMY_SHIP_BASE_SPEED × 3 + level × 4` (~75+ px/s at lvl 3)
   - **Fragile**: HP = `ENEMY_SHIP_BASE_HP - 1` (3 HP) — glass cannon
   - **Melee only**: `canShoot = false` — they ram toward the mothership
   - Uses `pulse-enemy-ship.svg` sprite with cyan glow halo
   - Coin value = 1 (low reward for low threat individually, but dangerous in swarms)
   - Cannot be elite (elite check skipped for pulse variants)

*Last updated by agent — 2026-03-09. Cone attack overhaul + boss variants + pulse enemy ships.*

### 2026-03-09 — Playtesting Fixes: Ribbons, Hitbox, Boss Rewards, Joystick

1. **Background aurora ribbons fade much slower** — `auroraPulse` cycle changed from `PI/120` (2s full cycle) to `PI/600` (10s full cycle) with softer exponent (1.6→1.2). Ribbons now breathe slowly instead of visibly flickering on/off.

2. **Big rock hitbox increased** — `ROCK_BIG_SIZE` increased from 16px to 22px in Constants.ts. Big rocks now have a collision radius that better matches their visual sprite (drawn at `radius * 3.5 = 77px`). Players should no longer feel like bullets pass through visible rock.

3. **Boss rewards auto-granted per level** — Boss defeat no longer only triggers on level 1. All boss kills now advance `currentLevel`, grant a star coin, and transition to the boss reward screen:
   - **Boss 1** (mega asteroid): Auto-grants **Dash Bomb** (unchanged)
   - **Boss 2** (bee): Auto-grants **Targeting Laser**
   - **Boss 3** (butterfly): Auto-grants **Dash Bomb** (bomb at end of dash)
   - **Boss 4+**: Shows the 3-card choice screen so players can switch abilities

4. **Joystick clamped to screen bounds** — Virtual joystick base position is now clamped with `JOYSTICK_RADIUS + 16px` padding from all screen edges. Touching near the far left, right, top, or bottom of the screen no longer creates a joystick base that's partially or fully off-screen.

5. **Dash bomb now spawns at landing point** — `bomb_dash` ability previously placed the bomb at the dash origin (where you started). Now calculates the dash landing position (`origin + dashDir × dashDist`, clamped to screen bounds) and spawns the bomb there, matching the card description "Dash drops a bomb at landing point".

*Last updated by agent — 2026-03-09. Playtesting fixes: ribbons, hitbox, boss rewards, joystick.*

---

### 2026-03-09 — Mobile Settings Cog Scale-Up

1. **Bigger settings cog icon** — Gear inner radius increased from 7→11px, tooth outer radius from 10→16px, center hole from 3.5→5.5px. The cog is now ~60% larger and much easier to see on mobile screens.

2. **Moved further right** — Button position shifted from `GAME_WIDTH - 44` to `GAME_WIDTH - 52` with increased hit area (36×32 → 48×44px). Sits closer to the screen edge for easier thumb access.

*Last updated by agent — 2026-03-09. Mobile settings cog scale-up.*

### 2026-03-09 — Boss Reward Flow + Tutorial Overhaul

1. **Boss reward shows actual ability card** — Bosses 1-3 now show a single centered reward card with the auto-granted ability (icon, name, description, "✓ EQUIPPED" badge) instead of the confusing 3-card choice screen. Boss 4+ still shows the 3-card choice.

2. **Boss reward → upgrades directly (Bug #10 fix)** — Both auto-granted rewards and manual choice now go straight to the upgrade screen via `manager.goToUpgradeScreen()`. Eliminated the unnecessary "Round Complete" gameover screen between boss defeat and upgrades.

3. **Tutorial condensed to single screen** — Replaced the old 2-step text-heavy tutorial with a single visual "CONTROLS" screen showing:
   - Simulated player ship in center with pulse ring
   - Animated joystick on left (thumb circling) with "DRAG TO MOVE" label
   - Animated dash button on right with EMP ripple and "TELEPORT + EMP" label  
   - Dashed arrow connecting joystick to player
   - Bottom info strip: "Auto-fires to the beat • Destroy enemies → Coins → Upgrade"
   - Single "GOT IT — LET'S GO!" button (no more 2-step progression)

*Last updated by agent — 2026-03-09. Boss reward flow + tutorial overhaul.*

### 2026-03-09 — Mobile 1.75× Sprite Scale-Up (Player, Rocks, Mothership)

1. **Added `isMobileDevice` and `MOBILE_SPRITE_SCALE` to Constants.ts** — `isMobileDevice` is a one-time check at module load (`ontouchstart` or `maxTouchPoints > 0`). `MOBILE_SPRITE_SCALE = 1.75` is the multiplier applied to visual sprite sizes on mobile devices. Desktop rendering is unchanged (multiplier = 1).

2. **Player sprite 1.75× on mobile** — `SPRITE_W` (16px) and `SPRITE_H` (23.6px) are now multiplied by `MOBILE_SPRITE_SCALE` on touch devices, making the player ship 32×47.2px on mobile. Collision radius is unchanged.

3. **Rock sprites 1.75× on mobile** — `drawSize` (`radius * 3.5`) is now multiplied by `MOBILE_SPRITE_SCALE` on touch devices. Small rocks render at ~70px, big rocks at ~154px on mobile. Collision radii are unchanged.

4. **Mothership sprite 1.75× on mobile** — `SPRITE_SIZE` (60px) is now multiplied by `MOBILE_SPRITE_SCALE` on touch devices (120px on mobile). HP bar, HP text font, fallback circle, and death animation GIF are all scaled proportionally. Collision radius is unchanged.

*Last updated by agent — 2026-03-09. Mobile 2× sprite scale-up.*

### 2026-03-10 — Mobile Touch Fixes: Volume Control, Mute Icon, Pause Menu Volume Drag

1. **HTML volume slider now works on mobile** — Added `touch-action: auto` to `#volume-control`, `#volume-icon`, and `touch-action: pan-x` to `#music-volume` slider in CSS, overriding the global `body { touch-action: none }` that was blocking all touch interaction on the HTML volume control.

2. **Volume control always expanded on mobile** — Added `@media (hover: none) and (pointer: coarse)` CSS rules that force the volume control to 160px width (instead of relying on `:hover` which doesn't exist on touch devices), with bigger slider thumb (24px), thicker track (10px), pill-shaped background, and larger icon (28px).

3. **Volume slider wired in constructor, not just `init()`** — Moved slider event wiring from `AudioManager.init()` (only called on game start) to the constructor, so the HTML volume slider works from the menu screen before any game has started. Added both `input` and `change` event listeners for reliable mobile support. Touch events on the slider `stopPropagation()` to prevent them from reaching the game canvas.

4. **Mute icon touch support** — Added `touchend` listener (with `preventDefault` + `stopPropagation`) to the volume icon alongside the existing `click` listener. Mobile users can now tap the speaker icon to toggle mute.

5. **Pause menu volume bar supports touch drag** — Added `touchstart` and `touchmove` listeners on the game canvas that detect when a touch begins on the pause menu volume bar area (with ±10px generous hit zone). When dragging, volume updates in real-time as the finger moves horizontally. The `touchend` handler finalizes the drag and prevents it from triggering other UI interactions (resume, forfeit, etc.).

*Last updated by agent — 2026-03-10. Mobile touch fixes: volume control, mute icon, pause menu volume drag.*

---

### 2026-03-10 — Boss Damage, Player Health, Mobile Scaling Fixes

1. **Bosses deal much more damage to mothership** — Boss enemies now deal `BOSS_MOTHERSHIP_DAMAGE` (3×) damage to the mothership on body collision instead of the default 1. Time penalty is also multiplied by the damage amount. Screen shake is heavier (8 instead of 5) for boss hits. Constants `BOSS_MOTHERSHIP_DAMAGE = 3` and `BOSS_BULLET_DAMAGE = 2` added to Constants.ts.

2. **Player health system** — Player is no longer invincible. New constants: `PLAYER_BASE_HP = 3`, `PLAYER_HIT_INVULN = 1.0s`.
   - `Player.ts` gains `hp`, `maxHp`, `invulnTimer`, `damageFlash` fields, plus `takeDamage()`, `resetHp()`, and `isInvulnerable` getter.
   - Player is invulnerable during dash and for 1 second after taking damage (i-frames).
   - Invulnerability renders as rapid blinking (10Hz flicker) with a red damage flash ring.
   - Player HP is reset via `player.resetHp(PLAYER_BASE_HP)` at the start of each run.

3. **Enemy bullets damage the player** — New `CollisionSystem.checkEnemyBulletPlayerCollisions()` method checks enemy bullets against the player with a slightly generous hitbox (`PLAYER_COLLISION_RADIUS + 6`). Each hit deals 1 HP damage, triggers red particle burst + screen shake, and plays a hit SFX. If player HP reaches 0, the round ends with a dramatic explosion effect.

4. **Player HP displayed in HUD** — Hearts system below the top bar shows filled (red with glow) and empty (dark outline) diamond-shaped hearts. `HUDData` interface extended with `playerHp` and `playerMaxHp` fields.

5. **Enemy ship sprites scaled for mobile** — `EnemyShip.render()` now applies `MOBILE_SPRITE_SCALE` (1.75×) to both sprite-based variants (bee, butterfly, boss, pulse) and the canvas-drawn normal variant (via `ctx.scale()`). Enemy ships are now proportionally sized with the already-scaled player, rocks, and mothership on mobile.

6. **Enemy bullets scaled for mobile** — `Bullet.render()` now applies `MOBILE_SPRITE_SCALE` to enemy bullet rectangles on mobile devices, making them ~1.75× larger with an added red glow for visibility. Player bullets were already scaled in a previous patch.

*Last updated by agent — 2026-03-10. Boss damage, player health, mobile scaling fixes.*

---

### 2026-03-10 — Hitbox & Boss Spawn Fixes

1. **Fixed rock glow halo not rendering** — `Rock.render()` had `ctx.beginPath(); ctx.fill()` with no `ctx.arc()` call in between, so the radial gradient glow behind rocks was silently discarded. Added the missing `ctx.arc(0, 0, this.radius * 1.7, 0, Math.PI * 2)` call. Rocks now properly show their warm/poison/elite glow halo, making them read better against the dark background and appear closer to their actual collision size.

2. **Fixed boss EnemyShip sprite vastly oversized vs hitbox** — Boss ship sprites were drawn at `radius * 4` (e.g., a bee boss with radius 20 would render as an 80px sprite, but only collide at 20px). Reduced boss drawSize multiplier from `4` to `2.5` so the visual sprite closely matches the collision circle. Regular enemy ship sprites remain at `radius * 3`.

3. **Fixed boss ships spawning at wrong angle** — All `EnemyShip` instances started with `angle = 0` (facing right) from the `Entity` base class. Since boss ships spawn on-screen (350px from center, within the 1200×800 viewport), they'd appear sideways for one frame before `update()` corrected the angle. Added initial angle calculation in the `EnemyShip` constructor: `this.angle = Math.atan2(targetPos.y - y, targetPos.x - x)` so they face the center of the screen immediately on spawn.

*Last updated by agent — 2026-03-10. Hitbox & boss spawn fixes.*

---

### 2026-03-10 — Enemy Hitbox Fix

1. **Increased `ENEMY_SHIP_SIZE` from 12→18** — Enemy ships had a collision radius of 12px but their sprite-based variants (bee, butterfly, boss, pulse) were drawn at `radius * 3 = 36px`, meaning the visual sprite was 3× the collision diameter. Bullets and cone attacks would pass through the visible edges of enemies without registering hits. Increased the base collision radius to 18px so hitboxes encompass most of the visible sprite.

2. **Reduced sprite draw multiplier from 3→2** — Sprite-based enemy ships now render at `radius * 2` (diameter = collision diameter) instead of `radius * 3`. Combined with the radius increase, the visual sprite (36px) now closely matches the collision circle (36px diameter). Boss ships also use the same `radius * 2` multiplier (previously had a separate `2.5` path).

3. **Scaled canvas-drawn hull (normal variant) to match** — The hand-drawn hull outline for the "normal" enemy ship variant was designed for the old 12px radius. All hull vertex coordinates scaled by 1.5× to match the new 18px collision radius (e.g., tip at x=12→18, wings at y=±10→±15).

   Updated hitbox summary:
   | Entity | Collision Radius | Visual Size | Ratio |
   |---|---|---|---|
   | EnemyShip (sprite) | 18px | 36px (radius×2) | 1:1 ✓ |
   | EnemyShip (canvas) | 18px | ~36px tip-to-tip | 1:1 ✓ |
   | EnemyShip (boss) | varies (20-24+) | radius×2 | 1:1 ✓ |
   | Rock (small) | 10px | 22px (radius×2.2) | ~1:1.1 ✓ |
   | Rock (big) | 22px | 48px (radius×2.2) | ~1:1.1 ✓ |

*Last updated by agent — 2026-03-10. Enemy hitbox fix.*

---

### 2026-03-10 — Bug Fix & Improvement Batch

1. **Fixed mega rock sprite never showing (Rock.ts)** — The sprite assignment used sequential `if` blocks instead of `if/else if`, so mega rocks had their sprite immediately overwritten by the big or small pool. Changed to proper `if/else if/else` chain. Mega boss asteroids now correctly display the `pulse-asteroid-mega.svg` sprite.

2. **Applied BOSS_BULLET_DAMAGE to mothership (CollisionSystem.ts)** — `BOSS_BULLET_DAMAGE` constant was imported but never used. Enemy bullets hitting the mothership now check if they're high-damage (boss) bullets and apply `BOSS_BULLET_DAMAGE` (2×) instead of hardcoded 1. Time penalty also scales with bullet damage.

3. **Added Hypersonic Bolt upgrade (guns_bolt) to upgrade tree** — `pierceCount` in UpgradeManager referenced `guns_bolt` but no such upgrade existed, so pierce was always 0. Added "Hypersonic Bolt" node: +1 bullet pierce per level (max 3), requires dmg_core level 2, costs [40, 100, 250]. Players can now unlock bullet pierce as a mid-tier weapon upgrade.

4. **Added Lucky Strike upgrade (econ_lucky) to upgrade tree** — `econ_lucky` was referenced in Game.ts for 5× coin drops but had no upgrade node. Added "Lucky Strike" node: +4% chance per level (max 3, up to 12%) for enemies to drop 5× coins, requires econ_value level 1, costs [50, 120, 280]. Wired into `PlayerStats.luckyChance` field computed from the upgrade tree instead of raw `getLevel()` call.

5. **Fixed SFX volume after unmute (AudioManager.ts)** — `toggleMute()` was restoring `masterGain` to `volumeBeforeMute` (the music volume, typically 0.07) instead of the SFX master gain value (0.2). After muting and unmuting, all procedural SFX were ~65% quieter. Now correctly restores `masterGain` to 0.2.

6. **Rebalanced asteroid coin values** — Small rocks: 1 coin (unchanged). Medium rocks: 2→3 coins (Bug #6 fix — medium asteroids now drop meaningful coins). Large rocks: 3→5 coins (reward proportional to difficulty).

7. **Cleaned up duplicate imports in Game.ts** — Removed `saveGame as persistSave` and `hasAbility as _hasAbility` duplicate imports. All code now uses the single `saveGame` import. Removed unused `type SaveData` import from the alias line.

8. **Removed unused variable in MenuScreen.ts** — `playerPhase` was declared but never read in `renderTutorialPage2_HowToPlay()`.

*Last updated by agent — 2026-03-10. Bug fix & improvement batch.*

---

### 2026-03-10 — Tutorial Page 2: Player Over Asteroid Fix

1. **Step 1 card ("MOVE TO ENEMIES")** — Player ship now moves all the way onto the asteroid instead of stopping short. Asteroid is drawn first (behind), then player on top, so the layering shows the ship overlapping the rock. Asteroid position moved slightly left to center the overlap visually.

2. **Step 2 card ("HIT TO THE BEAT")** — Player ship is now rendered overlapping the asteroid (both centered in the card). Previously the asteroid was 45px above the player with no overlap, making it unclear they needed to be close. Now asteroid is drawn first behind the player with a warm glow, player on top with the beat loader ring centered on the cluster.

*Last updated by agent — 2026-03-10. Tutorial page 2 player-over-asteroid fix.*

---

## Bugs & Issues Found (2026-03-10 Audit)

### 🔴 Bugs

18. ~~**`highestLevel` saved BEFORE being updated (Game.ts)**~~ ✅ **FIXED 2026-03-11**

19. **`lifetimeKills` double-counted on boss kill** — ✅ **Verified NOT a bug (2026-03-13)**: Each exit path is mutually exclusive. Boss kill → bossReward → handleBossRewardClick persists kills. Normal round → endRound persists kills. Forfeit → forfeitRound persists kills. No double-counting.

20. ~~**Splash + chain can still double-kill same enemy**~~ ✅ **FIXED** — `!other.alive` / `!enemy.alive` guards added in splash and chain loops.

21. ~~**`coinRare` color particle mismatch**~~ ✅ **FIXED 2026-03-12** — Split into `isPurple` (≥50) and `isGold` (≥5) thresholds.

22. ~~**Missing `iconPath` on `ms_turret` upgrade node**~~ ✅ **Verified OK (2026-03-12)** — `UpgradeIcons.ts` has `ms_turret: drawCrosshair` in ICON_MAP; canvas icon renders.

23. ~~**Missing `paused` field in `IGame` interface**~~ ✅ **FIXED 2026-03-12**

### 🟡 Potential Issues

24. ~~**`getUpgradeEffect()` and `effectPerLevel` are dead code**~~ ✅ **FIXED 2026-03-13** — Removed `getUpgradeEffect()` export, `effectPerLevel` from `UpgradeNode` and `StarUpgrade` interfaces, and all ~32 node object instances.

25. ~~**`screenFlashColor` declared but never read**~~ ✅ **FIXED 2026-03-13** — Removed from `Game.ts` and `GameInterface.ts`.

26. ~~**`streakBonus` is always 1 (dead code path)**~~ ✅ **FIXED 2026-03-13** — Removed `streakBonus` variable from Game.ts, `streakCoinBonus` from `HUDData` interface, and the multiplier display string from HUD.ts.

27. ~~**Lifesteal mentioned in JSDoc but never implemented**~~ ✅ **FIXED 2026-03-13** — Removed "lifesteal" from CollisionSystem JSDoc. Removed `lifestealChance` from `PlayerStats` interface and `computeStats()` return.

28. **`resetHp` always uses `PLAYER_BASE_HP` instead of upgraded HP**
    - `startRun()` calls `player.resetHp(PLAYER_BASE_HP)` (always 3). If a future upgrade increases HP, the call won't use it. Low priority — no HP upgrade exists yet.

29. **Event listeners still leak on Game/ScreenManager re-instantiation (Bug #16 persists)**
    - `Game` constructor registers anonymous click/touch/key listeners with no cleanup. `ScreenManager` registers resize/mousemove with no `destroy()`. Listeners accumulate on re-instantiation.

30. ~~**`type SaveData` imported but unused in Game.ts**~~ ✅ **FIXED** (previously resolved)

---

### 2026-03-10 — Death Screen, Mothership Delay, Touch Fix, Button Unification

1. **Death screen with cause of death** — Game over screen now shows context-specific titles and subtitles based on how the round ended:
   - **"MOTHERSHIP DESTROYED" / "The mothership exploded!"** (red theme) — when mothership HP reaches 0
   - **"SHIP DESTROYED" / "Killed by enemy fire!"** (orange theme) — when player HP reaches 0
   - **"TIME EXPIRED" / "The clock ran out!"** (gold theme) — when round timer hits 0 from time penalties
   - **"ROUND COMPLETE"** (cyan theme) — when timer naturally expires (normal end)
   - Panel border and glow colors match the death cause for visual reinforcement.

2. **Mothership explosion delay (1.2s)** — When the mothership is destroyed and there's still round time left, the game now waits 1.2 seconds before showing the game over screen. During the delay, a massive particle explosion plays (50 red + 30 orange + 20 white particles), heavy screen shake (10), and enemies/coins continue updating so players can collect last-second coins. `deathDelayActive` flag prevents double-triggering.

3. **Fixed touchend triggering next screen buttons** — Added a 0.6s `stateChangeTime` guard. When the game state changes (to gameover or bossReward), a timestamp is recorded. Touch/click interactions on gameover and bossReward screens are ignored for 0.6 seconds after the state change. This prevents the joystick release touchend from accidentally clicking "Continue" or boss reward cards.

4. **Tutorial buttons positioned higher for mobile** — `drawContinueButton()` in `MenuScreen.ts` moved from `GAME_HEIGHT - 52` to `GAME_HEIGHT - 80` (28px higher), with increased height from 40→48px. Buttons are now in the same Y zone as the upgrade screen's START RUN button, making them reachable on mobile without scrolling.

5. **All buttons unified to cyan START RUN style** — Every interactive button across all screens now uses the same visual language as the upgrade screen's START RUN button:
   - Dark blue background (`rgba(0, 50, 110, 0.9)`)
   - Pulsing cyan border (`rgba(0, 180, 255, ...)`)
   - Cyan text color (`COLORS.player` / `#00d4ff`)
   - Breathing cyan glow shadow
   - Rounded corners (radius 10)
   - Applied to: Menu "TAP TO START", tutorial "NEXT →" / "GOT IT — LET'S GO!", game over "CONTINUE"

6. **`IGame` interface updated** — Added `deathCause` field. `endRound()` signature expanded with optional `cause` parameter (`"mothership" | "player" | "time"`). `CollisionSystem` passes appropriate cause for each death type.

*Last updated by agent — 2026-03-10. Death screen, mothership delay, touch fix, button unification.*

---

### 2026-03-10 — Targeting Laser: Aim-Based Instead of Auto-Target

1. **Laser fires toward pointer/aim direction** — The boss 2 reward "TARGETING LASER" no longer auto-targets the nearest enemy. Instead it raycasts from the player toward the current mouse/touch aim position (`input.mousePos`). A ray-vs-circle check finds the first enemy along the aim line (with `enemy.radius + 4` generous hitbox). If an enemy is hit, it takes 3× weapon damage and the beam terminates at the enemy. If no enemy is hit, the beam extends to max range (1600px) in the aim direction, providing visual feedback of the shot direction. On mobile, `mousePos` is set by the joystick touch position, so the laser fires in the direction the player is moving.

2. **Boss reward card description updated** — Changed from "Fires at nearest enemy" to "Fires where you aim" to reflect the new behavior.

3. **Fixed mothership rendering after destruction** — Mothership sprite (with `shadowColor`/`shadowBlur` glow) and HP bar continued rendering after `isDestroyed = true`, causing a bright yellow shadow artifact during the death delay. Both the sprite and HP bar are now wrapped in `if (!this.isDestroyed)` guards. Only the death animation GIF renders when destroyed. Also fixed pre-existing lint errors: removed unused `_e` catch param in AudioManager, prefixed unused `totalHeartsW` in HUD.

*Last updated by agent — 2026-03-10. Targeting laser aim-based + mothership death render fix.*

---

### 2026-03-10 — Mobile Camera Zoom System

Implemented a renderer-level camera system that zooms into the game world on mobile devices, making everything larger and more playable on small screens. Desktop rendering is completely unchanged.

1. **Camera state in Renderer** — Added `cameraX`, `cameraY`, `cameraZoom` fields to `Renderer.ts`. At zoom 1.0 (desktop), the full 1200×800 world is visible. At zoom 1.5 (mobile), the visible area is ~800×533, centered on the camera position.

2. **Camera transform in beginFrame()** — When `cameraZoom > 1`, `beginFrame()` applies `translate(GAME_WIDTH/2, GAME_HEIGHT/2) → scale(zoom) → translate(-cameraX, -cameraY)` after shake, making all world-space rendering (entities, particles, effects) automatically zoomed and centered on the camera. Camera position is clamped to world bounds so no out-of-bounds area is shown.

3. **Camera follows player** — In `Game.updatePlaying()`, the camera lerps toward the player position each frame (`lerpSpeed = 0.08`) with a +40px downward Y bias to keep the mothership partially visible. Camera starts centered on the player at `startRun()`.

4. **Screen-space rendering for UI** — Added `pushScreenSpace()` / `popScreenSpace()` methods to Renderer that save/restore the canvas transform. When called, drawing reverts to the base viewport transform (no camera zoom). Used in `renderPlaying()` to render HUD, mobile controls (joystick, dash button), pause button, and ability labels at fixed screen positions regardless of camera. Pause overlay, boss reward screen, and game over screen also render in screen-space.

5. **`MOBILE_CAMERA_ZOOM` constant** — Added to `Constants.ts` (default: `1.5`). Easy to tune — `1.5×` shows ~800×533 of the world (good balance), `1.75×` would show ~685×457 (more intimate). Desktop always uses `1.0`.

6. **`screenToWorld()` utility** — Added to Renderer for converting screen-space coordinates to world-space, accounting for camera zoom and position. Available for future use in input mapping if needed.

7. **What scales automatically** — All entities (player, enemies, rocks, mothership, bullets, coins, missiles), all particles and effects (explosions, glow, shockwaves, dash rings), damage numbers, laser beams, pending bombs — everything drawn in world-space gets the zoom for free with zero per-sprite changes.

8. **What stays fixed (screen-space)** — HUD (timer, coins, kills, HP hearts), mobile joystick, dash button, pause button, pause menu, boss reward cards, game over panel, ability labels.

   **Files modified**: `Constants.ts` (+1 constant), `Renderer.ts` (+camera state, transform, pushScreenSpace/popScreenSpace, screenToWorld), `Game.ts` (imports, startRun camera init, updatePlaying camera follow, render flow with push/popScreenSpace).

   **Build note**: `compactAlive` references in Game.ts cause TS errors (pre-existing from another branch — not related to camera changes). Camera system itself compiles cleanly.

*Last updated by agent — 2026-03-10. Mobile camera zoom system.*

---

### 2026-03-10 — Auto-Increment BUILD_NUMBER on Build → Replaced with package.json version

~~1. **Vite plugin `increment-build-number`** — Added a custom Vite plugin in `vite.config.ts` that runs during production builds only. On `buildStart`, it reads `src/utils/Constants.ts`, finds the `BUILD_NUMBER` constant via regex, increments it by 1, and writes the file back.~~

**Replaced**: The custom Vite plugin was removed in favor of the standard approach:

1. **`package.json` version as source of truth** — `APP_VERSION` is injected at compile-time via Vite's built-in `define` option, reading `version` from `package.json`. No source files are mutated during builds.
2. **`APP_VERSION` replaces `BUILD_NUMBER`** — `Constants.ts` exports `APP_VERSION` (string, e.g. `"0.0.2"`) instead of `BUILD_NUMBER` (number). `SaveManager.ts` compares `appVersion` (string) instead of `buildNumber` (number).
3. **Backwards-compatible migration** — `loadGame()` checks for both `appVersion` and old `buildNumber` fields, so existing saves from the old format are wiped cleanly on first load.
4. **To wipe saves**: Run `npm version patch` (or `minor`/`major`) — standard npm workflow that also creates a git tag. No custom plugin needed.
5. **`src/env.d.ts`** — Declares the `__APP_VERSION__` global constant for TypeScript.

*Last updated by agent — 2026-03-10. Replaced custom build-number plugin with Vite define + package.json version.*

---

### 2026-03-11 — Mobile Fixes: Touch Coord Sync, Dash in Landscape, Music Resume

1. **Fixed joystick/dash rendering position on mobile** — `InputManager.setCoordTransform()` was only called once in the `Game` constructor. After orientation changes or window resizes, `Renderer.resize()` updated `gameOffsetX/Y/gameScale` but `InputManager` kept stale values, causing touch→game coordinate mapping to be wrong. Fixed by calling `setCoordTransform()` in the `ScreenManager` resize handler and when switching to the game screen.

2. **Fixed dash not working in landscape** — Same root cause as above. The dash zone detection (`gameX > GAME_WIDTH * 0.75 && gameY > GAME_HEIGHT * 0.6`) used stale coordinate transforms after orientation change, so taps in the dash area were mapped to wrong game coordinates. Now works correctly with the synced transforms.

3. **Fixed music disappearing on mobile** — `window.blur`/`focus` events fired aggressively on mobile during normal interactions (notification bar, orientation change, keyboard appearance). `blur` → `onSuspend()` → `musicEl.pause()`, then `focus` → `onResume()` → `musicEl.play()` was rejected by mobile autoplay policy (no user gesture context). Fixed by:
   - Removed `blur`/`focus` listeners entirely — now using only `visibilitychange` which is the standard API and works reliably on both desktop and mobile, only firing on actual tab/app switches.
   - Making `onResume()` resilient: if `play()` is rejected, a one-shot `touchstart`/`click` listener is queued so the next user interaction resumes music automatically.

4. **Fixed UI disappearing on window resize** — `Renderer.resize()` calls `ctx.setTransform()` to set the new base transform, but if resize fires mid-frame (between `beginFrame`'s `ctx.save()` and `endFrame`'s `ctx.restore()`), the restore pops back the old pre-resize transform. All subsequent frames then draw with the stale transform, making the entire UI invisible. Fixed by re-applying `baseTransform` via `ctx.setTransform()` at the start of every `beginFrame()` before `ctx.save()`, ensuring the correct transform is always used regardless of when resize fired.

5. **Fixed joystick input using CSS pixel space instead of game coords** — Joystick direction and magnitude were computed from game-coordinate deltas, but on small screens the game scale compresses those coords, making the joystick feel wrong (thumb far left, had to drag to screen center to turn right). Refactored so direction/magnitude are calculated from raw CSS pixel deltas (`touch.clientX/Y` relative to base), with a fixed `JOYSTICK_CSS_RADIUS = 80px` physical radius. Game-coord positions (`baseX/Y`, `thumbX/Y`) are still computed for rendering but are derived from the CSS-space calculations. This makes the joystick feel identical regardless of screen size or game scale.

*Last updated by agent — 2026-03-11. Mobile touch coord sync, landscape dash, music resume, resize transform fix, joystick radius scaling.*

---

## Performance Audit (2026-03-11)

### 🔴 Critical — Hot-Path Object Allocation (GC Pressure)

**P1. Vec2 allocation storm in Math.ts**
Every `vecAdd`, `vecSub`, `vecScale`, `vecNormalize`, `vecFromAngle`, `vecLerp` returns a **new `{x, y}` object**. These are called hundreds of times per frame across all entity updates, collision checks, and particle updates. 11 of 14 math functions allocate new Vec2s. Worst offenders per frame:
- `ParticleSystem.update()` — 2 new Vec2 per particle per frame (400+ allocs at 200 particles)
- `CollisionSystem` — 1 new Vec2 per collision pair via `vecDist→vecSub` (B×E pairs)
- `Coin.attractTo()` — 4+ Vec2 per attracted coin per frame
- `EnemyShip.update()` / `Rock.update()` — 3–4 Vec2 per enemy per frame

**Fix:** Add mutating variants (`vecAddMut`, `vecScaleMut`) or inline dx/dy math in hot paths. Keep pure functions for cold paths.

**P2. `circleCollision` uses `Math.sqrt` + allocates temp Vec2**
`circleCollision → vecDist → vecLength(vecSub(a,b)) → Math.sqrt(...)` — every single collision pair pays for both a `sqrt` call and a temporary `{x, y}` allocation. Called B×E times per frame in bullet-enemy checks alone.

**Fix:** Replace with squared-distance comparison: `dx*dx + dy*dy < (r1+r2)*(r1+r2)`. Eliminates sqrt AND the Vec2 allocation in one change. Same for `vecDist` calls in splash/chain.

**P3. Splash damage is O(B × E²) — inner enemy scan per hit**
`checkBulletEnemyCollisions` is O(B×E). When a bullet has splash radius, each hit triggers *another* full scan of `game.enemies` for AoE targets. Chain lightning does the same (scans all enemies per chain hop, up to `chainTargets` hops). Effective worst case: O(B × E × (E + chainTargets×E)).

**Fix:** Short-circuit: skip splash/chain scans when `stats.splashRadius === 0` and `stats.chainTargets === 0`. For spatial queries, even a simple grid partition would reduce inner scans.

**P4. Audio nodes created and discarded on every SFX call**
Every `play*()` method creates new `OscillatorNode` + `GainNode` pairs (2–10 nodes per call). `playConeBlast()` is the worst: 3 oscillators, 4 gain nodes, 2 filters, 1 buffer source, plus a **new AudioBuffer** (`sampleRate × 0.35` floats) — 10 Web Audio nodes + buffer allocation every ~1.2s. `playExplosion()` creates 4 nodes and fires dozens of times per second during intense gameplay. No audio node pooling exists.

**Fix:** Cache the noise buffer for `playConeBlast()` (create once, reuse). Pool oscillator "voices" for frequent SFX. At minimum, throttle `playExplosion()` to max 3–4 per frame.

---

### 🟡 Medium — Per-Frame Rendering Waste

**P5. Gradient objects created every frame (never cached)**
`Renderer.ts` helper methods allocate gradients on every call:
- `drawGradientBar()` — 2 `createLinearGradient` per call (timer bar, HP bar)
- `drawPanel()` — 1 `createLinearGradient` per call (header highlight)
- `drawButton()` — 2 `createLinearGradient` per call (body + shine)
- `drawGlowCircle()` — 1 `createRadialGradient` per call (entity glows)

A typical gameplay frame allocates **10–20+ gradient objects**, all immediately discarded. Upgrade screen is worse with many panels/buttons.

**Fix:** Cache gradients for fixed-layout elements (HUD bars, buttons). For dynamic elements, consider pre-rendered gradient textures on offscreen canvases.

**P6. Shadow state changes not batched**
`shadowBlur` and `shadowColor` are set per-entity in render loops (glow halos on rocks, enemies, mothership). Each shadow state change forces the canvas compositor to reconfigure. Shadow rendering is one of the most expensive canvas operations.

**Fix:** Batch all shadow-rendered entities together. Or render glows to an offscreen canvas and composite once. Consider replacing `shadowBlur` with pre-rendered glow sprites.

**P7. Font string construction per frame**
`Renderer.drawText()` constructs a font string (`${size}px Tektur`) on every call. HUD and upgrade screen make 15–30+ `drawText` calls per frame. While font parsing is fast, it's unnecessary repeated work.

**Fix:** Cache font strings by size (Map<number, string>).

---

### 🟡 Medium — Entity Lifecycle & Memory

**P8. No object pooling for bullets, coins, or missiles**
`new Bullet()`, `new Coin()`, `new Missile()` are allocated on every fire/kill/spawn. The game fires bullets on every beat (~2–4/sec), spawns coins on every kill, and missiles up to 3 per beat. These entities are short-lived and filtered out when dead. `compactAlive()` does in-place array compaction (good), but the allocations themselves create GC pressure.

**Fix:** Implement object pools (like `ParticleSystem` already does for particles). Add `reset()` methods to `Bullet`, `Coin`, `Missile` and reuse dead instances.

**P9. Entity arrays never shrink**
`compactAlive()` compacts in-place but never reduces array capacity. After a large wave, arrays like `bullets[]` and `enemies[]` may have allocated internal capacity for 200+ slots that persist even when only 10 are active. V8 arrays don't auto-shrink.

**Fix:** Periodically (e.g., at round start) reset arrays: `this.bullets.length = 0`.

**P10. Event listeners leak on re-instantiation (Bug #16 still open)**
`Game` constructor registers 8+ anonymous event listeners (click, touchend, mousedown, mousemove, mouseup, touchstart, touchmove, keydown) that are never removed. `ScreenManager` adds resize/mousemove listeners with no cleanup. If either class is re-instantiated, listeners stack.

**Fix:** Use `AbortController` or store listener references with a `destroy()` method.

---

### 🟡 Medium — Collision Algorithm

**P11. O(n²) brute-force collision with no spatial partitioning**
`checkBulletEnemyCollisions` checks every bullet against every enemy. At 50 bullets × 30 enemies = 1,500 collision checks per frame, each with sqrt + Vec2 allocation. Current entity counts (<200) are manageable, but performance degrades quadratically.

**Fix:** For current scale, fixing P2 (squared distance) is sufficient. If entity counts grow past 200, implement a spatial hash grid (cell size = max entity diameter). The grid update is O(n) and queries are O(1) amortized.

**P12. Dead enemies still processed in splash/chain scans**
When splash damage kills an enemy, the `onEnemyKilled` guard prevents double rewards, but the dead enemy still receives chain damage and triggers redundant particles. The inner splash/chain loops don't skip `!enemy.alive` entries.

**Fix:** Add `if (!enemy.alive) continue;` at the top of splash and chain inner loops.

---

### 🟢 Low — Build & Config

**P13. TypeScript target is conservative (`ES2020`)**
Modern browsers (2024+) support ES2022+. Using `ES2020` prevents the compiler from emitting native `Object.hasOwn`, `Array.at()`, top-level await, and other features that minify better and run faster.

**Fix:** Set `"target": "ES2022"` or `"ESNext"` in `tsconfig.json`. Set matching `build.target: 'esnext'` in Vite config.

**P14. p5.js loaded as full library via CDN**
`index.html` loads the complete p5.js library (~1MB uncompressed) via CDN for just the background animation. p5.js is not tree-shakeable.

**Fix:** Long-term, rewrite the background with raw Canvas2D (it's just particles/gradients). Short-term, use `p5.min.js` and ensure it's cached. The background could also be rendered to a static texture and scrolled rather than animated every frame.

**P15. No `build.target` in Vite config**
Vite defaults may produce ES module output without explicit target. Setting `build.target: 'esnext'` enables maximum minification and modern syntax.

**P16. 3 stacked canvases always in DOM**
All 3 canvases (`menu-canvas`, `game-canvas`, `upgrade-canvas`) exist in the DOM at all times. Only one is visible via CSS `display`, but all consume GPU memory for their backing stores. At 1200×800 × DPR=2, each canvas is ~7.3MB.

**Fix:** Consider using a single canvas and switching render functions, or destroying hidden canvases' contexts.

---

### 🟢 Low — Dead Code & Cleanup

**P17. `getUpgradeEffect()` and `effectPerLevel` are dead code**
`getUpgradeEffect()` is exported from `UpgradeTree.ts` but never called. `effectPerLevel` values on nodes are documentation-only — `computeStats()` uses hardcoded multipliers. Values can silently drift.

**P18. `screenFlashColor` declared but never read**
Dead field in `Game.ts` and `GameInterface.ts`.

**P19. `streakBonus` is always 1 (dead code path)**
`streakBonus` in Game.ts is always `1` with comment "kill streak bonus removed." HUD receives it as `streakCoinBonus` but only displays when `> 1.0` — entire prop chain unused.

**P20. `PlayerStats` has ~15 unused compat stub fields**
Fields like `playerHp`, `playerShields`, `evasionChance`, `reflectFraction`, `lifestealChance`, `armorReduction`, `shieldRegenInterval` etc. are set to defaults and never read.

---

### Priority Implementation Order

| Priority | Items | Impact | Effort |
|---|---|---|---|
| **Do First** | P2 (squared distance) | Eliminates sqrt + Vec2 alloc in ALL collision checks | 15 min |
| **Do First** | P1 (inline Vec2 math in hot paths) | Eliminates 500+ allocs/frame | 1 hour |
| **Do Second** | P4 (cache noise buffer, throttle SFX) | Reduces audio GC + mobile stalls | 30 min |
| **Do Second** | P8 (object pool for Bullet/Coin) | Eliminates frequent new allocations | 1 hour |
| **Do Second** | P3 (skip splash/chain when stat is 0) | Eliminates O(E) inner scans for most bullets | 10 min |
| **Do Third** | P5 (cache HUD gradients) | Eliminates 10-20 gradient allocs/frame | 30 min |
| **Do Third** | P12 (skip dead enemies in splash/chain) | Reduces redundant work | 5 min |
| **Whenever** | P13-P16 (build config) | Minor bundle/load improvements | 15 min |
| **Whenever** | P17-P20 (dead code) | Code cleanliness | 15 min |

---

### 2026-03-11 — Red Glow on Damaging Rocks + Harmless Debris Asteroids

1. **Damaging rocks glow red** — Replaced `ctx.filter = "brightness(1.5)..."` and `ctx.shadowBlur` on Rock sprites with a cheap red radial gradient halo (`rgba(255,40,40,0.6)`, radius×2). Rocks that can damage the mothership now emit a visible red glow behind them. Poisoned rocks get green glow + green `source-atop` composite tint. Elite rocks retain gold glow + gold overlay.

2. **Removed ALL `ctx.filter` and entity `shadowBlur` from codebase** — 9 filter usages + per-entity `shadowBlur` eliminated:
   - **Rock.ts**: Poison `hue-rotate` filter → green radial gradient glow + `source-atop` tint. Normal `brightness/drop-shadow` filter → red radial gradient glow. No `shadowBlur` on sprite draw.
   - **EnemyShip.ts**: Poison `hue-rotate` + normal `brightness(1.4) drop-shadow(...)` filters → removed entirely. Radial gradient glow halo was already present. `shadowBlur` on sprite draw removed. Poisoned state uses `source-atop` green tint.
   - **MenuScreen.ts**: Two `brightness(...)` tutorial asteroid filters → `shadowColor`/`shadowBlur` white glow (tutorial-only, not per-frame gameplay).
   - Zero `ctx.filter` assignments remain. Entity rendering no longer uses `shadowBlur` (expensive per-frame canvas operation).

3. **New `Debris` entity** — Created `src/entities/Debris.ts` extending `Entity`. Small, semi-transparent asteroid sprites (opacity 0.12–0.3) that:
   - Spawn from screen edges (top/left/right) every 0.3–0.7s, capped at 40 active
   - Float toward the mothership area at 18–45 px/s with wide target spread (±200px)
   - Veer away when within 60–160px of target (perpendicular deflection + outward push)
   - Self-destruct when off-screen (50px margin)
   - Have no collision, no damage, no glow, no shadow — purely visual ambiance
   - Use the small asteroid sprite pool at reduced size (2–5px radius, 1.6–2.4× draw scale)

4. **Debris wired into Game.ts** — `debris: Debris[]` array + `debrisTimer` added to Game. Debris spawning, updating, and compaction happen in `updatePlaying()`. Rendering happens first in `renderPlaying()` (behind all gameplay entities). Array is reset in `startRun()`.

---

## TODO — Game.ts Refactoring Plan (2026-03-11)

Game.ts is **2322 lines** — a monolith that owns gameplay logic, all weapon systems, all UI overlays, event handling, and multiple render passes. Below is a comprehensive analysis of repeating code, extractable utilities, and a phased extraction plan.

---

### Repeating Patterns Found

#### 1. AoE "damage enemies in radius" pattern (×5 sites, ~15 lines each)

All five share the identical structure: `for enemy → vecDist check → takeDamage → spawnDamageNumber → particles → onEnemyKilled guard`.

| Site | Method | Line Range | Notes |
|---|---|---|---|
| A | `handleDash()` — ring damage | ~540–565 | Ring radius, 0.5× damage |
| B | `handleDash()` — flashbang stun | ~567–578 | Stun only (no damage), different radius |
| C | `fireConeWeapon()` | ~745–770 | Crit rolls, shockwave particles |
| D | `fireDashConeHit()` | ~712–733 | Same as cone but no beat reset |
| E | `updateBombs()` | ~1140–1160 | BOMB_DAMAGE_MULT, bomb radius |

**Refactor**: Extract `damageEnemiesInRadius(center, radius, damage, opts?)` into `CollisionSystem` or a new `CombatHelper`. Options bag handles crit, stun, particles. Each call site becomes 1–3 lines.

#### 2. Rectangle hit-test (×8 sites)

`mx >= x && mx <= x + w && my >= y && my <= y + h` repeated verbatim:

| Site | Method | Description |
|---|---|---|
| 1 | `hitTestPauseButton()` | Multi-line form |
| 2 | `handlePauseMenuClick()` | Track button loop |
| 3 | `handlePauseMenuClick()` | Volume bar |
| 4 | `handlePauseMenuClick()` | Resume button |
| 5 | `handlePauseMenuClick()` | Forfeit button |
| 6 | `touchstart` handler | Volume bar drag init |
| 7 | `handleBossRewardClick()` | Card hit-test loop |
| 8 | `UpgradeScreen.handleClick()` | Clickable area loop |

**Refactor**: Add `hitTestRect(mx, my, x, y, w, h): boolean` to `utils/Math.ts`. Replace all 8 inline checks.

#### 3. `getScaledCoords()` — CSS→game coordinate transform (×3 independent copies)

| File | Implementation |
|---|---|
| `Game.ts` constructor | `(clientX - renderer.gameOffsetX) / renderer.gameScale` inline closure |
| `MenuScreen.ts` | Same formula in its own closure |
| `UpgradeScreen.ts` | Same formula in its own closure |

Plus `InputManager.touchToGame()` does the same transform with cached values.

**Refactor**: Move to `Renderer.screenToGame(clientX, clientY): {x, y}` (Renderer already owns `gameOffsetX/Y/gameScale`). All three screens call `renderer.screenToGame()` instead of duplicating the math.

#### 4. Beat callback duplication (×2 identical closures)

Both `startRun()` and `resumeFromPause()` create the exact same callback:
```ts
() => {
  this.coneBeatCount++;
  if (this.coneBeatCount % CONE_FIRE_EVERY === 0) this.fireConeWeapon();
  this.missileBeatCount++;
  if (this.missileBeatCount % MISSILE_FIRE_EVERY === 0) this.fireMissile();
}
```

**Refactor**: Extract to a `private onBeat()` method or a bound function.

#### 5. Particle burst recipes (×12+ sites, same 3-color pattern)

Boss kill, mothership death, bomb explosion all emit the same 3-layer burst pattern (red + orange + white with different counts/sizes). E.g.:
```ts
this.particles.emit(pos, 50, "#ff4444", 200, 0.8, 6);
this.particles.emit(pos, 30, "#ffaa00", 160, 0.6, 5);
this.particles.emit(pos, 20, "#ffffff", 120, 0.4, 3);
```

**Refactor**: Add named burst presets to `ParticleSystem`: `emitExplosion(pos, scale)`, `emitCoinPickup(pos)`, etc.

---

### Module Extraction Plan (Phased)

#### Phase 1 — Quick Wins (utils + helpers, no architecture change)

| # | What | From | To | Lines Saved | Effort |
|---|---|---|---|---|---|
| 1a | `compactAlive<T>()` | Game.ts top-level fn | `utils/Array.ts` | ~10 | 5 min |
| 1b | `hitTestRect()` | 8 inline sites | `utils/Math.ts` | ~30 | 10 min |
| 1c | `screenToGame()` | 3 inline closures | `Renderer.ts` method | ~15 | 10 min |
| 1d | Beat callback dedup | 2 identical closures | `private onBeat()` | ~10 | 5 min |
| 1e | `damageEnemiesInRadius()` | 5 AoE sites (~75 lines) | `CollisionSystem` | ~60 | 20 min |
| 1f | Particle burst presets | 12+ emit clusters | `ParticleSystem` named methods | ~40 | 15 min |

**Total Phase 1**: ~165 lines removed, ~1 hour

#### Phase 2 — UI Extractions (self-contained render+click modules)

| # | What | Lines in Game.ts | New File | Effort |
|---|---|---|---|---|
| 2a | **Pause menu** — layout, click handling, render, volume drag, track switching | ~300 | `src/ui/PauseMenu.ts` | 45 min |
| 2b | **Boss reward screen** — data, card layout, click handling, render, ability icons | ~350 | `src/ui/BossRewardScreen.ts` | 45 min |
| 2c | **Game over screen** — death cause switch, stats panel, continue button | ~110 | `src/ui/GameOverScreen.ts` | 20 min |
| 2d | **Mobile controls** — joystick render, dash button render | ~100 | `src/ui/MobileControls.ts` | 15 min |

Each module receives `(renderer, game)` or a small data bag. Game.ts calls `pauseMenu.render()` / `pauseMenu.handleClick(mx, my)`.

**Total Phase 2**: ~860 lines extracted, ~2 hours

#### Phase 3 — Systems Extraction (gameplay logic modules)

| # | What | Lines in Game.ts | New File | Effort |
|---|---|---|---|---|
| 3a | **WeaponSystem** — cone state, missile state, laser state/timer, bomb state, `fireCone`, `fireMissile`, `fireLaser`, `updateBombs`, `fireDashConeHit` | ~250 | `src/systems/WeaponSystem.ts` | 1 hour |
| 3b | **EffectsManager** — DamageNumber[], DashRing[], LaserBeam[] types + update + render | ~150 | `src/systems/EffectsManager.ts` | 30 min |
| 3c | **BossSystem** — `spawnBoss()` level-variant logic, boss reward granting | ~80 | fold into `SpawnSystem.ts` | 20 min |

**Total Phase 3**: ~480 lines extracted, ~2 hours

#### Phase 4 — Interface Cleanup

| # | What | Effort |
|---|---|---|
| 4a | Update `IGame` to match slimmed-down Game.ts | 15 min |
| 4b | Remove dead fields (`screenFlashColor`, `streakBonus`, unused PlayerStats stubs) | 10 min |
| 4c | Wire `AbortController` for event listener cleanup (Bug #16) | 20 min |

---

### Expected Result

| Metric | Before | After |
|---|---|---|
| **Game.ts lines** | 2322 | ~500–600 (core loop, startRun, endRound, event wiring, entity management) |
| **New files** | 0 | 6–8 focused modules |
| **Repeated `hitTestRect`** | 8 inline | 1 utility + 8 calls |
| **Repeated AoE pattern** | 5 × 15 lines | 1 helper + 5 × 2 lines |
| **Repeated `getScaledCoords`** | 3 closures | 1 `Renderer.screenToGame()` |
| **Dead code fields** | ~8 | 0 |

### Implementation Order

Do Phase 1 first — it's safe, doesn't change architecture, and immediately removes duplication. Phase 2 is the biggest win (860 lines) and each UI module is fully self-contained so they can be extracted one at a time with zero risk. Phase 3 requires more careful interface design but makes Game.ts purely an orchestrator. Phase 4 is cleanup.

### Phase 1 Status: ✅ COMPLETE (2026-03-11)

All 6 Phase 1 items implemented and verified (`pnpm finish` passes):

| # | What | Status | Notes |
|---|---|---|---|
| 1a | `compactAlive<T>()` → `utils/Array.ts` | ✅ Done | New file. Game.ts imports from `utils/Array`. |
| 1b | `hitTestRect()` → `utils/Math.ts` | ✅ Done | Added to Math.ts. Imported in Game.ts (available for Phase 2 wiring). |
| 1c | `screenToGame()` → `Renderer.ts` | ✅ Done | New method on Renderer. Game.ts constructor uses `this.renderer.screenToGame()`. MenuScreen/UpgradeScreen still have local closures (will be replaced in Phase 2). |
| 1d | Beat callback → `private onBeat()` | ✅ Done | Both `startRun()` and `resumeFromPause()` call `this.onBeat()`. |
| 1e | `damageEnemiesInRadius()` → `CollisionSystem` | ✅ Done | New public method with `AoEOptions` interface (crit, stun, stunOnly). Available for Phase 2 wiring of handleDash/fireCone/updateBombs. |
| 1f | Particle presets → `ParticleSystem` | ✅ Done | `emitExplosion()`, `emitEnemyDeath()`, `emitCoinPickup()` added. Available for Phase 2 wiring. |

**New files created:** `src/utils/Array.ts`
**Files modified:** `Game.ts`, `Math.ts`, `Renderer.ts`, `CollisionSystem.ts`, `ParticleSystem.ts`

### Phase 2 Status: 🔶 MODULES CREATED (2026-03-11)

4 self-contained UI modules extracted to standalone files. Game.ts imports them and removed the duplicate `BOSS_REWARD_CHOICES` constant. The inline render/click methods in Game.ts still exist alongside the module classes — the next step is replacing each inline method with a delegation call to the extracted module.

| # | Module | Lines | Status |
|---|---|---|---|
| 2a | `src/ui/PauseMenu.ts` | 324 | ✅ Created — `hitTestPauseButton()`, `handleClick()`, `handleVolumeTouch()`, `renderPauseButton()`, `renderOverlay()` |
| 2b | `src/ui/BossRewardScreen.ts` | 345 | ✅ Created — `handleClick()`, `render()` with auto-grant + choice screens, `drawAbilityIcon()` |
| 2c | `src/ui/GameOverScreen.ts` | 143 | ✅ Created — `render()` with death-cause theming + stats panel + continue button |
| 2d | `src/ui/MobileControls.ts` | 102 | ✅ Created — `render()` with joystick + dash button |

### Phase 2 Status: ✅ COMPLETE (2026-03-11)

All 4 UI modules are now fully wired into Game.ts. Inline render/click methods replaced with delegation calls:

| # | Module | Wiring | Lines Removed |
|---|---|---|---|
| 2a | `PauseMenu.ts` | `pauseMenu.handleClick()`, `pauseMenu.renderOverlay()`, `pauseMenu.renderPauseButton()`, `pauseMenu.hitTestPauseButton()`, `pauseMenu.handleVolumeTouch()`, `pauseMenu.getLayout()` | ~300 (pause overlay + button + layout + click handler + volume touch) |
| 2b | `BossRewardScreen.ts` | `bossRewardUI.render()`, `bossRewardUI.handleClick()` | ~350 (boss reward render + card layout + ability icons + click handler) |
| 2c | `GameOverScreen.ts` | `gameOverUI.render()` with `GameOverData` bag | ~110 (game over render + death cause theming) |
| 2d | `MobileControls.ts` | `mobileControlsUI.render()` | ~100 (joystick + dash button render) |

**Removed from Game.ts:** `renderPauseOverlay()`, `renderMobilePauseButton()`, `renderMobileControls()`, `renderBossReward()`, `renderGameOver()`, `handlePauseMenuClick()`, `handlePauseVolumeTouch()`, `handleBossRewardClick()`, `hitTestPauseButton()`, `getPauseMenuLayout()`, `drawAbilityIcon()`, `getBossRewardLayout()`, `selectSpecialAbility()`, `PAUSE_BTN_*` constants, `PAUSE_PANEL_*` constants, `volumeDragActive` field.

**Game.ts at ~1414 lines** after wiring (down from ~2322 at start of refactoring plan — ~900 lines removed across Phase 1 + Phase 2).

---

### 2026-03-11 — Performance Quick Wins + Bug #18 Fix

1. **Bug #18 fix: `highestLevel` persisted immediately** — `saveGame()` is now called right after `highestLevel` is updated in `onEnemyKilled()`, fixing data loss where the new high level was never written to localStorage.

2. **P2: Squared-distance collision (zero sqrt)** — `circleCollision()` now uses `dx*dx + dy*dy < r*r` instead of `Math.sqrt()`. `vecDist()` inlined to avoid temp Vec2 allocation. New `vecDistSq()` utility added. Eliminates sqrt + object allocation on every collision pair.

3. **P1: Inlined Vec2 math in hot paths** — Removed allocating `vecAdd`/`vecScale`/`vecSub`/`vecNormalize`/`vecDist` calls from the hottest per-frame loops:
   - **ParticleSystem.update()**: Inline `p.pos.x += p.vel.x * dt` (was `vecAdd(vecScale(...))` — 2 allocs per particle per frame, ~400+ eliminated at 200 particles)
   - **Coin.update()**: Inline position update
   - **Coin.attractTo()**: Inline distance check (squared first to early-out without sqrt), normalize, and scale — was 4+ Vec2 allocs per attracted coin per frame
   - **Debris.update()**: Full inline of distance, normalize, deflection math — was 6+ Vec2 allocs per debris per frame

4. **P3: Skip splash/chain when stats are 0** — Splash damage inner loop (`O(E)`) now uses squared-distance comparison and is already gated behind `splashRadius > 0`. Chain lightning search also uses `vecDistSq` with pre-computed `chainRangeSq`.

5. **P12: Dead enemies skipped in splash/chain** — Added `!other.alive` / `!enemy.alive` continue guards in splash damage inner loop and chain lightning search. Prevents redundant damage/particles on already-killed enemies.

6. **P4: Cached noise buffer in AudioManager** — `playConeBlast()` no longer allocates a new `AudioBuffer` (sampleRate × 0.35 floats) every 1.2 seconds. The noise buffer is created once and reused. Buffer is invalidated if sample rate changes.

7. **P4: Throttled explosion SFX** — `playExplosion()` now rate-limited to max ~20/sec (50ms cooldown). During intense gameplay with dozens of kills per second, this prevents audio node spam and GC pressure from oscillator/gain pairs.

**Files modified**: `Math.ts` (+`vecDistSq`, inline `vecDist`, squared `circleCollision`), `CollisionSystem.ts` (squared distance in splash/chain/coin/AoE), `ParticleSystem.ts` (inline particle update), `Coin.ts` (inline update+attract), `Debris.ts` (inline all Vec2 math), `AudioManager.ts` (cached buffer, throttle), `Game.ts` (Bug #18 fix).

---

## Performance Audit Status (updated 2026-03-11)

### 2026-03-11 — Code Review Bug Fixes (3 Bugs + Mothership source-atop)

1. **Bug #1 fix: `source-atop` compositing no longer corrupts entire canvas** — `EnemyShip.ts`, `Rock.ts`, and `Mothership.ts` all used `ctx.globalCompositeOperation = "source-atop"` + `fillRect` on the **main canvas** to tint poisoned/elite/damaged sprites. `source-atop` operates on the entire canvas destination, so the green/gold/red tint would bleed onto every pixel already drawn (background, earlier entities). Fixed by drawing sprite + tint to a shared **offscreen canvas** (one per entity file, lazily allocated, reused), then `drawImage`-ing the composited result back to the main canvas. `save()`/`restore()` does not scope composite operations — offscreen canvas is the correct solution. The existing Mothership `source-atop` (Bug #3 from original audit) was also fixed in this pass.

2. **Bug #2 fix: `lifetimeKills` no longer double-counted on boss 4+ reward** — `onEnemyKilled()` added `roundKills` to `lifetimeKills` when a boss died and state transitioned to `"bossReward"`. Then `handleBossRewardClick()` added `roundKills` **again** when the player picked an ability (boss 4+ choice screen path). Bosses 1-3 (auto-grant, "continue" click) were also missing the `lifetimeKills` increment entirely. Fixed by removing the `lifetimeKills +=` from `onEnemyKilled()` boss transition, and ensuring **both** paths in `handleBossRewardClick()` ("continue" for auto-grant and ability-choice for boss 4+) add `roundKills` to `lifetimeKills` exactly once before saving.

3. **Bug #3 fix: Hex color glow now converts correctly to rgba** — `PauseMenu.ts` used `.replace(")", ",0.2)").replace("rgb", "rgba")` to add alpha to track button glow colors, but `trackColors` uses hex strings (`"#ff6644"` etc.). The `.replace()` chain expects `rgb()` format and was a complete no-op on hex, resulting in full-opacity glow instead of 20%. Added a `hexToRgba(hex, alpha)` helper that properly parses hex and returns `rgba(r,g,b,alpha)`.

4. **Should-fix #5: `volumeDragActive` kept** — Reviewed usage: `volumeDragActive` is set in `PauseMenu.handleVolumeTouch()` and read/checked in `Game.ts` constructor's `touchend` and `touchmove` event handlers as a guard for volume bar drag state. It IS used — the review note was incorrect. No change needed.

**Files modified**: `EnemyShip.ts`, `Rock.ts`, `Mothership.ts`, `Game.ts`, `PauseMenu.ts`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Code review bug fixes.*

---

| Item | Description | Status |
|---|---|---|
| P1 | Inline Vec2 math in hot paths | ✅ Done — Particle, Coin, Debris |
| P2 | Squared-distance collision | ✅ Done — circleCollision, splash, chain, coin pickup, AoE |
| P3 | Skip splash/chain when stat is 0 | ✅ Done |
| P4 | Cache noise buffer, throttle SFX | ✅ Done |
| P5 | Cache HUD gradients | ❌ Not started |
| P6 | Batch shadow state changes | ❌ Not started |
| P7 | Cache font strings | ✅ Done — Renderer.getFont() + all call sites |
| P8 | Object pool for Bullet/Coin/Missile | ❌ Not started |
| P9 | Shrink entity arrays at round start | ❌ Not started |
| P10 | Event listener cleanup (Bug #16) | ❌ Not started |
| P11 | Spatial partitioning | ❌ Not needed at current scale |
| P12 | Skip dead enemies in splash/chain | ✅ Done |
| P13 | tsconfig ES2022 + Vite build.target esnext | ✅ Done (2026-03-13) |
| P14 | p5.js full library via CDN | ❌ Not started (long-term: rewrite in raw Canvas2D) |
| P15 | Vite build.target | ✅ Done (2026-03-13) |
| P16 | 3 stacked canvases always in DOM | ❌ Not started |
| P17 | getUpgradeEffect + effectPerLevel dead code | ✅ Done (2026-03-13) |
| P18 | screenFlashColor dead field | ✅ Done (2026-03-13) |
| P19 | streakBonus dead code path | ✅ Done (2026-03-13) |
| P20 | Unused PlayerStats compat stubs | ✅ Done (2026-03-13) — removed 10 fields |

---

### 2026-03-11 — Two New Upgrade Nodes: Gravity Well + Forward Field

Added two new upgrade nodes to the upgrade tree with full gameplay logic, visuals, canvas-drawn icons, and SVG art.

1. **Gravity Well (`ms_slow`)** — Mothership defense upgrade that slows enemies near the mothership.
   - **Branch**: Mothership (blue), depth 2, requires `econ_duration` level 1
   - **3 levels**: 50% / 60% / 75% slow strength, costs [10, 15, 30] — cheap defensive investment
   - **100px radius** around mothership where enemies are slowed every frame
   - **Visual**: Animated blue radial gradient ring + spinning dashed circle around mothership (rendered behind mothership sprite in world-space)
   - **Gameplay**: `SpawnSystem.applyMothershipSlow()` checks distance to mothership and applies `enemy.applySlow()` — reuses existing slow debuff system
   - **Stats**: `PlayerStats.msSlowStrength` (0–0.75) and `msSlowRadius` (0 or 100px) computed from `MS_SLOW_TABLE[level]`

2. **Forward Field (`dmg_forward`)** — Damage upgrade that extends the pulse weapon forward in the player's facing direction.
   - **Branch**: Damage (red), depth 2, requires `dmg_core` level 1
   - **1 level**, costs [20] — available early after first damage upgrade
   - **Extends pulse range to 2.5× CONE_RANGE** in the forward 180° arc (uses dot product with player facing direction)
   - **Visual**: 8 directional red-pink particles fire forward on each cone weapon beat
   - **Gameplay**: `isInPulseRange()` helper checks both base circular range AND extended forward range. Used by both `fireConeWeapon()` and `fireDashConeHit()`.
   - **Stats**: `PlayerStats.forwardPulse` (boolean) computed from `dmg_forward` level

**Files created**: `public/assets/upgrade-tree/gravity-well.svg`, `public/assets/upgrade-tree/forward-field.svg`
**Files modified**: `UpgradeTree.ts` (+2 nodes), `UpgradeManager.ts` (+3 stats, +computation), `SpawnSystem.ts` (+applyMothershipSlow), `Game.ts` (+isInPulseRange, +gravity well visual, +forward pulse particles, +applyMothershipSlow call), `UpgradeIcons.ts` (+drawGravityWell, +drawForwardField)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Two new upgrade nodes: Gravity Well + Forward Field.*

---

## TODO — Deferred

- [x] **Interactive tutorial** — ✅ Replaced static 3-page tutorial with playable 3-step interactive `TutorialSystem` (movement → dash → enemies). Replayable from menu and pause menu.

---

### 2026-03-11 — Upgrade Screen: Layout Scale-Up + Ship Navigation

Complete overhaul of the upgrade screen from a click-to-purchase tree to an explorable constellation map with flyable ship navigation.

**Part 1: Neon Canvas-Drawn Icons** (previously completed)
- Created `src/ui/UpgradeIcons.ts` — 24 canvas-drawn neon-geometric icons replacing SVG images
- Each icon is stroke-only with branch-colored glow (`shadowBlur: 4`)
- Icons scale automatically with node size via `u = size / 10` unit system

**Part 2A: Layout Scale-Up**
- `DEPTH_SPACING`: 120 → 240 (2× wider tree, room to fly between nodes)
- `NODE_RADIUS`: 22 → 32 (~45% bigger nodes, better tap targets)
- `BRANCH_SPREAD`: 0.3 → 0.45 (wider fan angle between branches)
- All proportional elements scaled: fonts (7→9px badges, 12→14px tooltip names), connection lines (2→3px), tooltip panels (300×72→340×84), header (16→18px), currency chips (10→11px), bob amplitudes (1.5→2.0, 2.5→3.5), sparkle sizes

**Part 2B: Ship Navigation**
- Player ship (pulse-player.svg) rendered in world-space on the upgrade map
- WASD/arrow keys move ship at 280px/sec
- Ship facing angle tracks movement direction
- Camera lerps toward ship position (`CAMERA_LERP = 0.08`), replacing manual pan
- Engine trail particles spawn behind ship while moving (cyan glow, 0.3–0.5s lifetime)
- Ship glow intensifies while moving (shadowBlur 14→20)

**Part 2C: Ship-Node Collision + Purchase**
- Ship-to-node collision: `SHIP_RADIUS(12) + NODE_RADIUS(32)` squared-distance check
- Overlapping a node shows bright white aura + pulsing highlight ring
- Space/Enter fires to purchase while overlapping (0.4s cooldown)
- "SPACE TO BUY" / "TAP RIGHT SIDE TO BUY" prompt appears when overlapping
- Tooltip shows "Fire to buy" when ship-overlapping, "Fly here to buy" otherwise
- Mouse click on nodes still works as fallback for desktop users

**Part 2D: Purchase Shockwave**
- Branch-colored expanding ring (0.35s duration) with inner ring at 50% radius
- 16-particle sparkle burst (was 12) with larger size range
- Both rendered in world-space inside pan-translated context

**Part 2E: Touch Support**
- Left/center screen touch → joystick-style ship control (CSS-pixel based, 80px radius)
- Right 30% of screen → fire zone (sets `touchFireRequested`)
- Visual joystick indicator (base ring + thumb dot) in screen-space
- Touch-end fires node click as fallback

**Part 2F: Root Node Changes**
- Root node now shows "HOME" label instead of player sprite (ship is now the moving entity)
- Root radius bonus increased +6→+8 (40px total)
- Ship initializes at root position on every `refresh()`

**Files modified**: `src/ui/UpgradeScreen.ts` (complete rewrite), `src/ui/UpgradeIcons.ts` (Part 1)
**Files created**: `docs/plans/2026-03-11-upgrade-screen-ship-nav.md`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Upgrade screen layout scale-up + ship navigation.*

---

### 2026-03-11 — Upgrade Screen UX: Ship Orientation, Interaction Cleanup, View Zone

1. **Fixed player ship upside down** — `renderShip()` rotation was `shipAngle - π/2` which produced a 180° flip when `shipAngle = -π/2` (facing up). Changed to `shipAngle + π/2` so the sprite correctly points in the movement direction.

2. **Removed click/tap-to-purchase on nodes** — Stripped the "World-space node click (fallback for mouse users)" from `handleClick()` and the "Tap-on-node fallback" from the `touchend` handler. Upgrade nodes can now **only** be purchased by flying the ship into them and pressing Space/Enter (keyboard) or tapping the right fire zone (touch). Bottom bar buttons (Start Run, Menu, Prestige, Reset) still respond to click/tap normally.

3. **Expanded tooltip hover zone** — Mouse hover tooltip detection radius increased from `NODE_RADIUS * 2.5` (80px) to `NODE_RADIUS * 5` (160px). Players can now read upgrade descriptions from a comfortable distance without accidentally entering the buy zone (ship collision at 44px). This creates a clear two-zone system:
   - **View zone** (160px): Mouse hover → tooltip appears showing name, description, cost, status
   - **Buy zone** (44px): Ship overlap + fire key → purchase

*Last updated by agent — 2026-03-11. Upgrade screen UX: ship orientation, interaction cleanup, view zone.*

---

### 2026-03-11 — Mobile View Improvements, Debris Visibility, Rock Glow

1. **Mobile camera zoom increased** — `MOBILE_CAMERA_ZOOM` bumped from 1.5 → 1.75 in Constants.ts. Mobile players now see ~685×457 of the world (was ~800×533), making everything larger and more readable on small screens.

2. **Upgrade screen mobile scale-up** — On touch devices:
   - Bottom bar buttons: height 44→58px, START RUN width 260→340px, Y position shifted down 12px
   - Title: 18→24px font
   - Interact prompt ("TAP RIGHT SIDE TO BUY"): 11→16px font, positioned higher
   - Desktop rendering unchanged

3. **Debris asteroids more visible** — Size range 2–5 → 3–6px, draw scale 1.6–2.4× → 1.8–2.6×, opacity 0.12–0.3 → 0.15–0.35. Background debris is now more visible without being distracting.

4. **Damaging rocks glow more red** — Rock red glow halo intensity doubled: color `rgba(255,40,40,0.6)` → `rgba(255,20,20,0.9)`, gradient inner radius `0.3` → `0.2` (tighter center), outer radius `2.0` → `2.5` (wider spread). Dangerous rocks now have a prominent red danger halo.

*Last updated by agent — 2026-03-11. Mobile view improvements, debris visibility, rock glow.*

---

### 2026-03-11 — Interactive Tutorial System

Replaced the static 3-page tutorial overlay with a playable 3-step interactive tutorial that runs on the game canvas using real controls (joystick/mouse + dash). Works on both mobile and desktop.

1. **New `TutorialSystem` class** (`src/game/TutorialSystem.ts`) — Self-contained state machine with 3 steps:
   - **Step 1: Movement** — Ghost ship demos flying to a waypoint marker, then "YOUR TURN!" prompt. Player must move to the pulsing cyan waypoint ring using real controls (joystick or mouse).
   - **Step 2: Dash** — Ghost ship demos a dash teleport, then "YOUR TURN!" prompt. Player must press Shift (desktop) or tap the dash button (mobile). On mobile, an animated arrow points to the dash button.
   - **Step 3: Enemies** — Three sub-phases: (A) Watch a harmless grey rock pass through the mothership safely. (B) Watch a red-glowing rock hit the mothership and deal damage. (C) Player must fly close to a red rock to destroy it with auto-fire.
   - Each step has intro → ghost_demo → player_turn → success phases with timer-based transitions.

2. **Ghost ship rendering** — Semi-transparent player sprite (alpha 0.2–0.4, breathing) with faint trailing path line. "DEMO" label above. Fades out during player's turn.

3. **`"tutorial"` game state added** — `GameState` type extended with `"tutorial"`. `Game.update()` and `Game.render()` delegate to `TutorialSystem` when in this state. Tutorial has its own render pipeline (calls beginFrame/endFrame internally) with camera follow, debris, particles, and mobile controls.

4. **`startTutorial(returnTo)` method on Game** — Accepts `"menu"` (tutorial → start first run) or `"playing"` (tutorial → resume current run). Creates a `TutorialSystem` instance with a completion callback that sets `tutorialSeen = true`, saves, and transitions appropriately.

5. **`startTutorial()` on ScreenManager** — Public method that initializes audio, shows the game canvas, and delegates to `Game.startTutorial()`. Called by MenuScreen and PauseMenu.

6. **Tutorial button on main menu** — "📖 TUTORIAL" button below the start button. First-time players (tutorialSeen=false) auto-launch the tutorial on any click. Returning players can click the tutorial button to replay.

7. **Tutorial button in pause menu** — "📖 TUTORIAL" button between Resume and Forfeit. Clicking it stops the cone track, switches to tutorial state (returnTo="playing"), and resumes gameplay after tutorial completion.

8. **Skip tutorial** — ESC key (desktop) or hint text at bottom. Calls `tutorial.skip()` which fires the completion callback immediately.

9. **MenuScreen cleaned up** — Removed all old static tutorial code (~500 lines of renderTutorialPage1/2/3, drawPageDots, drawContinueButton, drawOverlay, drawSpriteShowcase, drawStepPanel). File reduced from ~650 lines to ~200 lines.

**Files created**: `src/game/TutorialSystem.ts` (580 lines)
**Files modified**: `Game.ts` (+tutorial state, startTutorial, update/render wiring, ESC skip, pause menu handler), `ScreenManager.ts` (+startTutorial method), `MenuScreen.ts` (complete rewrite — tutorial button, removed static pages), `PauseMenu.ts` (+tutorial layout/click/render), `ARCHITECTURE.md`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Interactive tutorial system.*

---

### 2026-03-11 — Algorithmic Art System (Sacred Geometry + Geometric Bursts + Formation Spawning)

Added three interconnected algorithmic art systems to enhance the visual and gameplay experience:

1. **Sacred Geometry Background** (`src/systems/AlgoArt.ts` → `SacredGeometryBg`)
   - Rotating flower-of-life mandala rendered behind all entities in world-space
   - 5 concentric rings with different rotation speeds creating moiré interference patterns
   - Golden spiral (Fibonacci-based logarithmic spiral) slowly rotating
   - 6-petal flower-of-life overlay at center
   - Connections between adjacent ring dots forming a web of sacred geometry
   - All elements very faint (3–8% opacity) so they don't distract from gameplay
   - Breathing animation (6% radius oscillation) gives organic feel

2. **Geometric Particle Death Bursts** — Replaced uniform `emit()` calls on enemy death with 4 cycling mathematical patterns:
   - **Fibonacci sunflower spiral**: Particles placed at golden-angle offsets with √i radius distribution (phyllotaxis)
   - **Spirograph (hypotrochoid)**: Intricate looping petal curves from parametric equations
   - **Pentagonal symmetric star**: 5-fold rotational symmetry with inner/outer arms
   - **Golden ratio concentric rings**: Rings at PHI^n spacing, each offset by the golden angle
   - **Boss/elite enemies** get dramatic double-pattern: spirograph + golden rings
   - Pattern cycles with `algoKillCounter` so every 4th kill repeats

3. **Formation Spawning** — Enemies spawn in mathematical patterns (level 2+):
   - **Lissajous curves**: Figure-8s and pretzel shapes from parametric `sin(at + δ), sin(bt)` equations
   - **Phyllotaxis spirals**: Sunflower arrangements using the golden angle
   - **Sine waves**: Wavy horizontal lines
   - **Ring formations**: Perfect circles with optional center enemy
   - **Cardioid curves**: Heart-shaped enemy arrangements
   - Formations arrive every 8–15 seconds with a 2-second ghostly preview (dashed lines + dots)
   - Formation type is randomly selected, enemy count scales with level (7–14)
   - Preview fades out as enemies begin stagger-spawning at their calculated positions

**Files created**: `src/systems/AlgoArt.ts` (470 lines — all 3 subsystems + formation generators + preview renderer)
**Files modified**: `src/game/Game.ts` (+imports, +state fields, +updateFormations method, +sacred geometry in render pipeline, +geometric bursts in onEnemyKilled, +formation preview in renderPlaying, +reset in startRun)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Algorithmic art system.*

---

### 2026-03-11 — Shooting Star Performance Fix

1. **Removed `shadowBlur` from shooting stars** — Each star was setting `drawingContext.shadowBlur = 10 * s.life` and `shadowColor` every frame. Canvas shadow operations are extremely expensive GPU ops (already stripped from all gameplay entities for this reason). Replaced with a wider colored stroke line that gives a similar glow appearance at zero GPU shadow cost.

2. **Shortened tail length** — Max tail length reduced from 250px → 100px, min from 60px → 30px. Long tails with two `line()` calls per star were disproportionately expensive. Shorter tails look snappier and more natural.

3. **Pre-computed normalized direction** — `sqrt(vx² + vy²)` was computed twice per star per frame for the tail direction. Now computed once at spawn time and stored as `nx`/`ny` on the star object.

4. **Faster life decay** — `life -= 0.038` → `life -= 0.05` so stars fade out ~30% faster, spending less total time being rendered.

5. **Replaced `splice()` with compact-alive pattern** — Array removal changed from `splice(i, 1)` (O(n) per removal, causes array reallocation) to the same `writeIdx` compaction pattern used by `ParticleSystem` — write live entries forward, then truncate with `.length = writeIdx`. O(n) total instead of O(n²) worst case.

*Last updated by agent — 2026-03-11. Shooting star performance fix.*

---

### 2026-03-11 — Rendering Cache: Fonts + Glow Halos

Added two caching systems to `Renderer.ts` that eliminate repeated per-frame allocations across the entire render pipeline:

1. **Font string cache (`getFont()`)** — New `Renderer.getFont(size, bold?)` method returns cached font strings from a `Map<string, string>`. Eliminates 30+ template-literal allocations per frame (`` `${size}px Tektur` `` or `` `bold ${size}px Tektur` ``). Wired into:
   - **Renderer.ts**: `drawText()`, `drawTextOutline()`, `measureText()`, `drawTitleText()`, `drawTitleTextOutline()`, `drawButton()` label
   - **HUD.ts**: All 6 `ctx.font` assignments (timer, coins, bonus, streak, HP label, kills, mobile hint)
   - **Mothership.ts**: HP text font
   - **Game.ts**: Damage number font, ability label font

2. **Glow halo texture cache (`getGlowHalo()`)** — New `Renderer.getGlowHalo(color, innerR, outerR, midColor?)` method returns a cached offscreen canvas with a pre-rendered radial gradient circle. Eliminates `createRadialGradient()` + `arc()` + `fill()` on every entity every frame. Radii are quantized to integers to keep the cache small. Wired into:
   - **Rock.ts**: Red/green/gold danger glow halo (was `createRadialGradient` per rock per frame)
   - **EnemyShip.ts**: Variant-colored glow halo (was `createRadialGradient` per ship per frame)

   With 20 rocks + 10 enemy ships on screen, this eliminates ~30 gradient object allocations + 30 arc draws per frame, replacing them with cached `drawImage` calls.

**Performance impact**: P7 (font cache) fully resolved. P5/P6 partially addressed — entity glow halos (the most frequent per-frame gradient) are now cached offscreen textures. HUD gradients (`drawGradientBar`, `drawPanel`) still create gradients per call but are called only 2-4× per frame (low priority).

**Files modified**: `Renderer.ts` (+fontCache, +glowCache, +getFont(), +getGlowHalo()), `Rock.ts`, `EnemyShip.ts`, `HUD.ts`, `Mothership.ts`, `Game.ts`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Rendering cache: fonts + glow halos.*

---

### 2026-03-11 — Algo Art Toggle in Pause Menu

Added a persisted "ALGO ART: ON/OFF" toggle to the pause menu that controls all three algorithmic art subsystems:

1. **`algoArtEnabled` in SaveData** — New boolean field (default: `true`), persisted to localStorage. Migrates cleanly from old saves via `getDefaultSave()` spread.

2. **Pause menu toggle button** — Purple-themed "✦ ALGO ART: ON" button between volume bar and resume button. Toggles to dim gray "✦ ALGO ART: OFF" on click. Panel height expanded 480→530px; all buttons below shifted down.

3. **Game.ts guards** — Five sites wrapped in `save.algoArtEnabled` checks:
   - Sacred geometry `update(dt)` — skipped when off (no CPU cost)
   - Sacred geometry `render()` — skipped when off
   - Formation preview `renderFormationPreview()` — hidden when off
   - Geometric death bursts — falls back to simple `particles.emit()` when off
   - `algoKillCounter` increment — only ticks when algo art is on

**Files modified**: `SaveManager.ts` (+1 field + default), `PauseMenu.ts` (+layout, +click handler, +render), `Game.ts` (+5 guards)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Algo art toggle in pause menu.*

---

### 2026-03-11 — Sacred Geometry Beat-Sync Pulse

Made the sacred geometry background pulse to the music beat, creating a unified "everything throbs to the rhythm" visual effect.

1. **Beat pulse system in `SacredGeometryBg`** — New `beatPulse` field (0–1) with fast exponential decay (`1 - dt * 8`, ~0.12s half-life). `pulse()` method sets it to 1.

2. **Visual amplification on beat** — All sacred geometry elements respond to the pulse:
   - **Alpha boost**: All elements get `alphaBoost = 1 + bp * 4` (up to 5× brighter on beat)
   - **Radius expansion**: Breath multiplier gains `+bp * 0.15` (15% radius throb)
   - **Line thickness**: Connections 0.5→1.0px, ring circles 0.4→1.2px, spiral 0.8→2.3px on beat
   - **Expanding pulse ring**: Cyan circle radiates from mandala center (0→400px) on each beat, fading with pulse intensity

3. **Wired to every music beat** — `Game.onBeat()` calls `sacredGeometry.pulse()` on every beat (not just cone fire beats), so the background pulses at the full BPM. Respects `algoArtEnabled` toggle.

**Files modified**: `AlgoArt.ts` (+beatPulse field, +pulse() method, +alphaBoost/breath in render), `Game.ts` (+pulse call in onBeat)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Sacred geometry beat-sync pulse.*

---

### 2026-03-11 — Tutorial UX: Instant Control + Debris Overhaul

1. **Instant player control in tutorial** — Removed the "intro" delay phase from all tutorial steps. The player can now move from the very first frame of each step, even while the ghost ship is demonstrating. No more waiting — you have control immediately.

2. **Player auto-faces ghost during demo** — When the ghost ship is visible and the player isn't actively moving, the player's ship angle automatically rotates to point toward the ghost. This ensures the player sees the demo and naturally faces the right direction when the ghost finishes.

3. **Ghost spawns in player's direction** — In step 2 (dash), the ghost's waypoint is calculated from the player's current facing angle, so the ghost dashes in the direction the player is already looking.

4. **Debris flies straight over mothership** — Complete rewrite of `Debris.ts`. Debris asteroids now:
   - Fly in a perfectly straight line (direction computed once at spawn, never changes)
   - Pass directly through/over the mothership area and off the bottom of screen
   - Are fully visible (opacity 1.0 instead of 0.15–0.35)
   - Are slightly larger (size 4–7, drawScale 2.2–3.0×)
   - Move faster (60–120 px/s instead of 18–45)
   - Removed all veer/flee logic — no more computing perpendicular deflection directions
   - No `targetPos`, `fleeRadius`, or `fleeDir` fields — just `dirX`/`dirY` set once

5. **Fixed step 2 dash arrow** — Replaced the weird dashed-line arrow pointing at the dash button with a clean animated pulsing dashed circle around the dash button area + "TAP HERE!" label. Animated `lineDashOffset` for spinning effect.

6. **Centralized dash handling in tutorial** — All dash input is now handled once in the top-level `update()` method instead of being duplicated in `updateStep2` and `updateStep3`. Cleaner, no double-consume risk.

**Files modified**: `src/entities/Debris.ts` (complete rewrite), `src/game/TutorialSystem.ts` (major restructure)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Tutorial UX: instant control + debris overhaul.*

---

### 2026-03-11 — Killable Debris with Coin Drops

1. **Debris asteroids are now killable** — `Debris.ts` gained `hp: 1` and `takeDamage()` method. Player bullets destroy debris in one hit (any damage kills).

2. **50% coin drop chance** — When debris is killed, there's a 50% chance to drop 1 coin at the debris position. Coins get the player's `coinMagnetRange` for auto-attraction. This gives players a secondary income stream from shooting the ambient background rocks.

3. **Bullets pierce through debris** — Player bullets are NOT consumed when hitting debris, so they continue to their intended enemy targets. One debris per bullet per frame to avoid redundant checks.

4. **New `checkBulletDebrisCollisions()` in CollisionSystem** — Circle-circle collision between player bullets and debris array. Called in `updatePlaying()` right after `checkBulletEnemyCollisions()`.

5. **`IGame` interface updated** — Added `debris: Debris[]` field so `CollisionSystem` can access the debris array through the typed interface.

6. **Fixed pre-existing build error** — `TutorialSystem.ts` was missing `import { Rock }` — added the import to fix compilation.

**Files modified**: `Debris.ts` (+hp, +takeDamage), `CollisionSystem.ts` (+checkBulletDebrisCollisions, +Coin import), `GameInterface.ts` (+debris field, +Debris import), `Game.ts` (+collision call), `TutorialSystem.ts` (+Rock import fix)

*Last updated by agent — 2026-03-11. Killable debris with coin drops.*

---

### 2026-03-11 — Boss Hitbox Fix, Pulse Weapon Visuals, Mothership Death Cleanup

1. **Fixed pulse weapon not hitting large enemies** — The cone/pulse weapon's hit check used `dist > CONE_RANGE` (center-to-center distance), meaning you had to get within 18px of an enemy's CENTER to hit it. For the mega rock boss (radius 45), you'd have to fly deep inside its body. Changed all 3 hit-check sites (`fireConeWeapon`, `fireDashConeHit`) to `dist - enemy.radius > CONE_RANGE` — now the pulse hits any enemy whose EDGE is within range. This massively improves boss and large rock hittability.

2. **Upgraded pulse weapon particle visuals** — Replaced the old 16-particle ring burst with a more dramatic "death pulse" effect:
   - **Inner ring**: 20 cyan particles expanding outward from player center at 120px/s (was 16 at 70px/s)
   - **Outer ring**: 12 light-blue particles at 160px/s with tighter spread, creating a two-wave shockwave
   - **Core flash**: 8 white particles (was 6) at larger size for a brighter impact center
   - Overall effect is a much more visible and satisfying beat-synced pulse

3. **Fixed mothership death leaving a "cloud of shit"** — When the mothership was destroyed, the massive 100-particle explosion (50 red + 30 orange + 20 white, sizes up to 6px, lasting 0.8s) would persist into the gameover state and keep rendering behind the gameover UI panel as a lingering cloud of colored dots. Added `particles.clear()` in `endRound()` right before transitioning to `"gameover"` state, so the explosion plays during the 1.2s death delay but is cleaned up before the gameover screen renders.

**Files modified**: `src/game/Game.ts` (hitbox fix × 3 sites, particle upgrade, particle clear)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Boss hitbox fix, pulse visuals, mothership death cleanup.*

---

### 2026-03-11 — Upgrade Screen: Thruster Trail, Node Spread, HOME Removal

1. **Removed "HOME" text from root node** — The center root node in the upgrade screen no longer displays the word "HOME". The dark backdrop + rotating cyan ring segments remain as the visual identity.

2. **Engine thruster trail in regular gameplay** — Player ship now emits cyan engine glow particles (~20/sec) and occasional white core particles (~8/sec) behind it while moving (not during dash). Particles spawn at the back of the ship (opposite of facing angle) with slight spread, creating a subtle thruster flame trail matching the upgrade screen's ship trail visual. Uses existing `ParticleSystem.emitDirectional()` — no new allocations.

3. **Spread out overlapping upgrade nodes** — Widened `BRANCH_ANGLES` in `UpgradeTree.ts` so branches no longer overlap:
   - `guns`: 120° → 100° (upper-left, wider from dmg)
   - `health`: 210° → 260° (lower-left, wider from dmg)
   - `movement`: 255° → 270° (straight down)
   - `economy`: 0° → 15° (slight upper-right)
   - `mothership`: -30° → -60° (wider upper-right)
   - `dmg` unchanged at 180°

**Files modified**: `UpgradeScreen.ts` (removed HOME label), `Game.ts` (thruster trail particles in updatePlaying), `UpgradeTree.ts` (BRANCH_ANGLES spread)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Upgrade screen: thruster trail, node spread, HOME removal.*

---

### 2026-03-11 — Upgrade Screen Dash Key + Tutorial Step 2 Fix

1. **Upgrade screen: purchase key changed from Space to Shift (Dash)** — The upgrade screen's ship-to-node purchase interaction now uses Shift (the game's dash key) instead of Space. All UI text updated: prompt says "DASH TO BUY" (was "SPACE TO BUY"), tooltip says "Dash to buy" (was "Fire to buy"). Enter key and mobile right-side tap still work as alternatives.

2. **Tutorial step 2: fixed auto-dash during ghost demo** — Dash input is now only executed during `player_turn` and `destroy_red` phases. Previously, `dashEnabled = true` was set at the start of step 2 (during `ghost_demo` phase), so a held Shift key or stale `dashRequested` would trigger an immediate auto-dash before the player was supposed to act. The `consumeDash()` call still drains stale requests in all phases, but `tryDash()` is only called when the player should actually be dashing.

**Files modified**: `src/ui/UpgradeScreen.ts` (shift key, prompt/tooltip text), `src/game/TutorialSystem.ts` (phase-gated dash execution)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Upgrade screen dash key + tutorial step 2 fix.*

---

### 2026-03-11 — Favicon Redesign (Algo Art Style)

1. **New sacred geometry favicon** — Replaced the simple flat spaceship favicon with a detailed SVG that combines the player ship with the game's algorithmic art visual language:
   - **Player ship** in neon stroke style matching `pulse-player.svg` — dark fill, cyan `#00d4ff` hull stroke, cockpit, engine thruster with bloom glow
   - **Sacred geometry mandala** behind the ship — 4 concentric rings (cyan/blue/purple), flower of life (6 overlapping circles + center), golden spiral hint, radial connection lines
   - **Ring dots** at golden-angle positions in two rings (inner 6, outer 6) using the game's 3 palette colors
   - **Fibonacci sparkle particles** scattered at golden-angle distributed positions
   - SVG filters: `bloom` (double gaussian blur merge) for neon glow, `softglow` for geometry, `shipglow` for hull edge
   - Dark background `#060612` with rounded corners (rx=16)
   - 128×128 viewBox for crisp rendering at all favicon sizes

2. **Fixed pre-existing UpgradeIcons.ts build errors** — `drawGravityWell` and `drawForwardField` were defined after the `ICON_MAP` that referenced them (and duplicated at the bottom). Moved definitions before the lookup table and removed duplicates. Build now passes cleanly.

*Last updated by agent — 2026-03-11. Favicon redesign + UpgradeIcons build fix.*

---

### 2026-03-11 — Player Pulse Visual: Purchase-Style Shockwave

1. **Replaced pulse weapon firing visual with exact upgrade-screen purchase shockwave** — The old cone weapon visual (expanding ring + splash gradient + spike lines driven by `coneFlashTimer`) was completely replaced with the same array-based `PulseShockwave` system used in UpgradeScreen.ts:
   - **New `PulseShockwave` interface**: `{ x, y, timer, maxTimer, color }` — identical to upgrade screen's `PurchaseShockwave`
   - **`pulseShockwaves: PulseShockwave[]`** array on Game class — pushed on every `fireConeWeapon()` call with `timer: 0.35`, `color: COLORS.player`
   - **Timer update** in `updatePlaying()` — countdown + splice when expired (same pattern as upgrade screen)
   - **Render** is a character-for-character copy of `UpgradeScreen.renderShockwaves()`: outer ring with `shadowBlur: 10` + glow, inner ring at 50% radius, both fading with `1 - progress` alpha, line width thinning as `3 * (1 - progress)`
   - Base radius uses `CONE_RANGE` (18px) scaled by `1 + progress * 2.5` (same `NODE_RADIUS * (1 + progress * 2.5)` formula)
   - Old `isFiring`/`flashPower` render block removed (was driving spike lines + splash gradient)
   - Loader ring and pre-fire ambient glow unchanged

**Files modified**: `src/game/Game.ts` (+PulseShockwave interface, +array field, +push in fireConeWeapon, +timer update in updatePlaying, +render in renderPlaying, -old isFiring block)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Player pulse visual: purchase-style shockwave.*

---

### 2026-03-11 — Tutorial Step 3: Enemy Ship Kill + Mothership Explosion

Replaced the old 3-sub-phase rock tutorial (watch harmless → watch dangerous → destroy rock) with a cleaner 2-phase enemy ship + mothership explosion flow:

1. **`destroy_ship` phase** — A pulse-variant `EnemyShip` spawns ~100px from the player (1 HP, stationary, no shooting). Player flies close and their auto-fire pulse instantly kills it. Pulsing red dashed target ring draws attention to the enemy. Big 3-layer explosion particles + screen shake on kill.

2. **`mothership_explode` phase** — After 1.2s pause, mothership dramatically explodes (50 red + 30 orange + 20 white particles, heavy screen shake 10). "OH NO..." header turns red, then after explosion settles: "DEFEND THE MOTHERSHIP!" / "Don't let enemies reach it" → "GOT IT — LET'S GO!" success text → tutorial ends.

3. **Removed all rock-based tutorial code** — Deleted `Rock` import, `tutorialRocks[]` array, `harmlessRockDone`/`dangerousRockHit`/`playerRockKilled` flags, `spawnHarmlessDebris()`, `updateHarmlessRock()`, `spawnDangerousRock()`, `updateDangerousRock()`, `transitionToPlayerDestroy()`, and the old `watch_harmless`/`watch_dangerous`/`destroy_red` phase types.

4. **Updated `StepPhase` type** — Replaced `"watch_harmless" | "watch_dangerous" | "destroy_red"` with `"destroy_ship" | "mothership_explode"`.

**Files modified**: `src/game/TutorialSystem.ts`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-11. Tutorial step 3: enemy ship kill + mothership explosion.*

---

### 2026-03-11 — QA Testing Report (Desktop + Mobile Notes)

**Automated browser testing** performed via Puppeteer (900×600 viewport, desktop mode). Mobile testing limited due to Puppeteer's inability to emit real touch events (game detects mobile via `ontouchstart`/`maxTouchPoints`).

#### Fixes Applied During Testing

1. **`bgDrawScanlines` reference error (index.html)** — `draw()` in the p5.js background sketch called `bgDrawScanlines()` which was never defined. Removed the call. The `scanlineOpacity` param in `bgParams` is now unused dead config.

#### Desktop Test Results — All Screens Functional ✅

| Screen | Status | Notes |
|---|---|---|
| **Menu** | ✅ | Title, subtitle, Level/Stars/Coins display, TAP TO START + TUTORIAL buttons, control hints, volume slider all render correctly. Animated cosmic background visible. |
| **Tutorial** | ✅ | 3-step interactive tutorial (move → dash → destroy ship) works. Step indicators at bottom. ESC skip works. Ghost demo + "YOUR TURN!" prompts display correctly. |
| **Gameplay** | ✅ | HUD (LV, timer bar, coins, HP hearts, kills), enemies (rocks with red glow, enemy ships), debris, mothership HP bar, ability label ("DASH BOMB"), pause button (‖) all render and function. Beat-synced pulse weapon fires visually. Sacred geometry mandala visible behind entities. |
| **Pause Menu** | ✅ | Music track selector (Fire/Chill🔒/Trap🔒), volume bar at 7%, Algo Art toggle, Resume, Tutorial, Back to Upgrades buttons all present and clickable. P key toggle works. |
| **Game Over** | ✅ | Death cause theming works ("MOTHERSHIP DESTROYED" red theme on K-forfeit). Stats panel shows Coins Earned, Enemies Defeated, Total Coins. CONTINUE button navigates to upgrade screen. |
| **Upgrade Screen** | ✅ | Constellation map with ship navigation. Ship follows mouse on desktop. Nodes display with correct icons (canvas-drawn neon geometric), branch colors, costs, progress arcs. Tooltip on hover shows name/description/cost. START RUN, MENU, RESET, PRESTIGE buttons present. |

#### Bugs Found During Testing

| # | Severity | Description | Location |
|---|---|---|---|
| 31 | 🟡 **Medium** | **Upgrade screen: ship follows mouse to bottom bar buttons, making them hard to click** — On desktop, the ship-follow-mouse system moves the ship toward the cursor even when hovering over bottom bar buttons (START RUN, MENU). The click handler does fire `handleClick()` and check `clickables`, but the ship's movement toward the cursor makes precise clicking feel unreliable. Buttons DO work when clicked precisely (tested: START RUN at correct Y coordinate, RESET in top-right), but the ship drifting toward the button area during the click is confusing UX. **Fix**: Add a dead zone or disable mouse-follow when cursor is in the bottom bar Y region (below `GAME_HEIGHT - 160`). |
| 32 | 🟡 **Medium** | **K-key forfeit shows "MOTHERSHIP DESTROYED" instead of a neutral forfeit message** — Pressing K during gameplay immediately ends the round with `deathCause: "mothership"`, showing the dramatic red "MOTHERSHIP DESTROYED" screen. Should show something like "ROUND FORFEITED" or "BACK TO UPGRADES" since the mothership wasn't actually destroyed. |
| 33 | 🟢 **Low** | **`bgDrawScanlines` was called but never defined** — ✅ **FIXED** — Removed the call from `draw()` in `index.html`. `scanlineOpacity` param in `bgParams` is now dead config that could be cleaned up. |
| 34 | 🟢 **Low** | **`drawGravityWell` and `drawForwardField` previously duplicated in UpgradeIcons.ts** — Two const declarations each appeared twice (before and after ICON_MAP). esbuild/Vite caught this at dev-server transform time but `tsc` did not flag it (since the file has different module semantics). Appears to have been fixed in a recent commit. |

#### Mobile Testing Limitations

- **Puppeteer cannot emulate `ontouchstart` in window** — The game detects mobile via `'ontouchstart' in window || navigator.maxTouchPoints > 0`. Puppeteer's mouse events are treated as desktop mouse input, so all mobile-specific code paths (joystick, dash button, `MOBILE_SPRITE_SCALE`, `MOBILE_CAMERA_ZOOM`, mobile button sizing) cannot be exercised through automated browser testing.
- **Recommendation**: For mobile QA, use a real device or Chrome DevTools with "Toggle device toolbar" + "Emulate touch" enabled. Key areas to verify on mobile:
  - Touch joystick (left side) + dash button (bottom-right) responsiveness
  - Mobile camera zoom (1.75×) centering and clamping
  - Pause menu touch targets (track buttons, volume drag, resume, forfeit)
  - Upgrade screen touch joystick + right-side fire zone for purchases
  - Tutorial dash button animation ("TAP HERE!" pulsing circle)
  - Bottom bar buttons on upgrade screen at larger mobile sizes

*Last updated by agent — 2026-03-11. QA testing report.*

---

### 2026-03-12 — Dash Input: Click, Space, and Common Keys

Expanded dash triggers so players can use virtually any common action key (or just click) to dash. Firing is fully beat-synced/automatic, so there's no conflict.

1. **New dash triggers** — Left click, Space, Shift, Enter, Z, X, J all trigger dash via `InputManager.dashRequested`. Touch dash zone unchanged.

2. **Removed Space from pause toggle** — Space was previously both "fire" and "pause toggle" (Bug #7). Now it's exclusively dash. Pause is P or Escape only.

3. **Removed Space/click from `isFiring`** — `isFiring` now returns `true` only on touch devices (auto-fire). Desktop firing is entirely beat-synced via `onBeat()` callback — no manual fire input needed.

4. **Removed redundant direct Shift handler** — Game.ts had a separate `keydown` handler for Shift that called `handleDash()` directly, bypassing `consumeDash()`. Removed to prevent double-dash attempts. All dash input now flows through `InputManager.consumeDash()` in `updatePlaying()`.

5. **K key excluded from dash** — K is already used for the forfeit shortcut, so it's not a dash trigger. It remains in `GAME_KEYS` for `preventDefault` but doesn't set `dashRequested`.

6. **Updated UI hint text** — Menu screen: "Click / Space to dash". Tutorial step 2: "CLICK TO DASH" header, "Click or press Space to dash" subtitle. Upgrade screen prompt unchanged ("DASH TO BUY" — already generic).

**Files modified**: `InputManager.ts` (dash keys, GAME_KEYS, isFiring, mouseDown→dash), `Game.ts` (removed Space from pause, removed Shift handler), `MenuScreen.ts` (control hint text), `TutorialSystem.ts` (step 2 instruction text), `ARCHITECTURE.md` (input table + changelog)
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-12. Dash input: click, space, and common keys.*

---

### 2026-03-12 — Quick Bug Fix Batch (5 Fixes)

1. **Bug #21 fix: Coin pickup particle colors now match coin visuals** — `CollisionSystem.checkCoinCollections()` had `isRare = coin.value >= 5` which gave purple particles to coins worth 5–49, but `Coin.render()` only turns purple at value ≥ 50 (5–49 renders gold). Fixed by splitting into `isPurple` (≥50 → `COLORS.coinRare`) and `isGold` (≥5 → `#ffaa00`). Pickup particles now match the in-world coin color.

2. **Bug #23 fix: Added `paused` field to `IGame` interface** — Subsystems can now check `game.paused` through the typed interface. Also added `"forfeit"` to the `deathCause` union type.

3. **Bug #31 fix: Upgrade screen ship stops following mouse near bottom bar** — Added a dead zone check (`mouseInBottomBar = this.mouseY > GAME_HEIGHT - 160`) that disables the mouse-follow ship behavior when the cursor is over the bottom bar buttons (START RUN, MENU, PRESTIGE). Keyboard and touch joystick ship control unaffected.

4. **Bug #32 fix: K-key forfeit shows "ROUND FORFEITED" instead of "MOTHERSHIP DESTROYED"** — Extracted a `forfeitRound()` method that sets `deathCause = "forfeit"` and transitions to the gameover screen. Both the K-key handler and the pause menu "BACK TO UPGRADES" button now call `forfeitRound()` instead of skipping directly to the upgrade screen. New `"forfeit"` case in `GameOverScreen` renders with grey theme: title "ROUND FORFEITED", subtitle "Returning to upgrades...".

5. **Bug #22 verified: `ms_turret` canvas icon already working** — `UpgradeIcons.ts` has `ms_turret: drawCrosshair` in `ICON_MAP` — the crosshair reticle icon renders correctly. The node's `icon: "◉"` field is only a fallback for when the ICON_MAP doesn't have an entry, which it does. No code change needed.

   **Also verified:**
   - **Bug #2**: Menu blink already works — `blink` toggles between two bg shades (`rgba(0,50,110,0.9)` vs `rgba(0,30,70,0.8)`), creating a subtle pulse effect.
   - **Bug #6**: Timer check already has early return — `if (this.roundTimer <= 0) { this.endRound(false); this.roundTimer = 0; return; }` prevents collision checks from running after `endRound`.

**Files modified**: `CollisionSystem.ts`, `GameInterface.ts`, `GameOverScreen.ts`, `Game.ts`, `UpgradeScreen.ts`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-12. Quick bug fix batch.*

---

### 2026-03-13 — Dead Code Cleanup + Build Config Modernization

Batch cleanup of all remaining dead code fields, unused exports, and build configuration improvements. Zero functional changes — purely codebase hygiene.

1. **Removed `screenFlashColor`** — Dead field deleted from `Game.ts` and `GameInterface.ts`. Was declared and never read or written.

2. **Removed `streakBonus` / `streakCoinBonus`** — `streakBonus` was hardcoded to `1` in Game.ts (kill streak bonus was removed). `streakCoinBonus` field deleted from `HUDData` interface. HUD streak display no longer renders the multiplier string (was always empty since bonus was never > 1).

3. **Removed `getUpgradeEffect()` + `effectPerLevel`** — Deleted the unused `getUpgradeEffect()` export from `UpgradeTree.ts`. Removed `effectPerLevel` from both `UpgradeNode` and `StarUpgrade` interfaces and all ~32 node/star-upgrade object literals. `computeStats()` uses its own hardcoded math and never read these values.

4. **Removed 10 unused `PlayerStats` compat stubs** — Deleted fields that were set to defaults and never read by any subsystem: `bulletSpeed`, `evasionChance`, `dashInvincibility`, `counterDmgMult`, `playerHp`, `playerShields`, `shieldRegenInterval`, `armorReduction`, `reflectFraction`, `lifestealChance`. Kept 9 fields that ARE read by `Player.ts`, `SpawnSystem.ts`, or `CollisionSystem.ts` (`timePenaltyPerHit`, `extraProjectiles`, `spreadAngle`, `dashDistMult`, `slowAuraRange`, `slowAuraFactor`, `msRegenInterval`, `turretDamageMult`, `overtimeBonus`). Removed unused `BULLET_SPEED` import from `UpgradeManager.ts`.

5. **Removed lifesteal from JSDoc** — `CollisionSystem.checkBulletEnemyCollisions` JSDoc listed "lifesteal" as a feature but no lifesteal logic existed. Removed the word from the doc comment.

6. **Bumped tsconfig target ES2020 → ES2022** — `target` and `lib` updated to `ES2022`. Enables native `Object.hasOwn`, `Array.at()`, `Error.cause`, and other modern features that minify better.

7. **Added `build.target: "esnext"` to Vite config** — Enables maximum minification and modern syntax output. Was previously using Vite's default (implicit ES module target).

**Files modified**: `Game.ts`, `GameInterface.ts`, `HUD.ts`, `UpgradeTree.ts`, `UpgradeManager.ts`, `CollisionSystem.ts`, `tsconfig.json`, `vite.config.ts`
**Build**: `pnpm finish` passes (tsc, eslint, prettier — zero errors)

*Last updated by agent — 2026-03-13. Dead code cleanup + build config modernization.*


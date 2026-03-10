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

18. **`highestLevel` saved BEFORE being updated (Game.ts)**
    - `saveGame()` is called on line ~995, then `highestLevel` is updated on line ~999. The new highest level is never persisted until the next unrelated `saveGame()` call. Data-loss bug.

19. **`lifetimeKills` double-counted on boss kill**
    - `onEnemyKilled()` adds to `lifetimeKills`, but `endRound()` also adds `roundKills` to it, and forfeit paths do too. If a boss kill triggers `onEnemyKilled` + `endRound`, kills are counted twice.

20. **Splash + chain can still double-kill same enemy**
    - In `checkBulletEnemyCollisions`, splash damage may kill an enemy, then chain lightning also processes `game.enemies`. The `onEnemyKilled` guard (`if (!enemy.alive) return`) prevents double rewards, but the dead enemy still receives chain damage and triggers particles redundantly.

21. **`coinRare` color particle mismatch**
    - `checkCoinCollections` uses `coin.value >= 5` as the `isRare` threshold for purple particle bursts, but coin entities themselves render gold until value ≥ 50. Coins worth 5–49 get purple pickup particles but appear gold in-world.

22. **Missing `iconPath` on `ms_turret` upgrade node**
    - `ms_turret` ("Sentinel Eye") is the only UPGRADE_TREE node without an `iconPath`. Falls back to Unicode "◉" character instead of SVG icon.

23. **Missing `paused` field in `IGame` interface**
    - `Game.ts` declares `paused: boolean` but `IGame` in `GameInterface.ts` doesn't include it. Subsystems that access game through the interface can't check pause state.

### 🟡 Potential Issues

24. **`getUpgradeEffect()` and `effectPerLevel` are dead code**
    - `getUpgradeEffect()` is exported from `UpgradeTree.ts` but never called. All stats in `computeStats()` use hardcoded multipliers instead of `node.effectPerLevel`. The `effectPerLevel` values on nodes are documentation-only and can silently drift from actual behavior.

25. **`screenFlashColor` declared but never read**
    - Dead field in `Game.ts` (line ~170) and `GameInterface.ts` (line ~50). Never written to or consumed.

26. **`streakBonus` is always 1 (dead code path)**
    - `streakBonus` in Game.ts is always `1` with comment "kill streak bonus removed." HUD receives it as `streakCoinBonus` but only displays when `> 1.0`, so the entire prop chain is unused.

27. **Lifesteal mentioned in JSDoc but never implemented**
    - `CollisionSystem.checkBulletEnemyCollisions` JSDoc documents "lifesteal" but no lifesteal logic exists. `game.stats.lifestealChance` exists in UpgradeManager but is never read in CollisionSystem.

28. **`resetHp` always uses `PLAYER_BASE_HP` instead of upgraded HP**
    - `startRun()` calls `player.resetHp(PLAYER_BASE_HP)` (always 3). `PlayerStats.playerHp` exists as a compat stub always set to 1. If a future upgrade increases HP, the call won't use it.

29. **Event listeners still leak on Game/ScreenManager re-instantiation (Bug #16 persists)**
    - `Game` constructor registers anonymous click/touch/key listeners with no cleanup. `ScreenManager` registers resize/mousemove with no `destroy()`. Listeners accumulate on re-instantiation.

30. **`type SaveData` imported but unused in Game.ts**
    - Stale import that should be removed.

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

## TODO — Deferred

- [ ] **Interactive tutorial demo** — Let the user practice movement with the real joystick and dash on a safe target before starting. Lower priority now that the visual tutorial shows the actual controls layout.

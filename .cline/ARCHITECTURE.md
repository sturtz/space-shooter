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
│   ├── UpgradeScreen.ts     # Between-round upgrade tree rendered on canvas
│   ├── BossRewardScreen.ts  # Boss reward card display + selection
│   ├── GameOverScreen.ts    # Death screen with cause-of-death theming
│   ├── MobileControls.ts    # Joystick + dash button rendering
│   ├── PauseMenu.ts         # Settings panel (music, volume, algo art toggle)
│   └── UpgradeIcons.ts      # 24 canvas-drawn neon-geometric upgrade icons
├── upgrades/
│   ├── UpgradeManager.ts    # Reads upgrade tree → computes PlayerStats each round
│   └── UpgradeTree.ts       # Defines all upgrade nodes, costs, tiers, dependencies
└── utils/
    ├── Array.ts             # compactAlive<T>() helper
    ├── Assets.ts            # Preloads images (ships, items, upgrade icons)
    ├── Constants.ts         # All magic numbers: sizes, speeds, colors, base stats
    ├── Math.ts              # Vec2 helpers, lerp, clamp, distance, angle, random range, hitTestRect
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
├── Debris        — ambient killable asteroids; 50% coin drop, bullets pierce through
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
`damage`, `critChance`, `critMultiplier`, `splashRadius`, `pierceCount`, `chainTargets`, `missileLevel`, `poisonDps`, `slowOnHit`, `moveSpeed`, `flashbangRadius`, `mineOnDash`, `magnetRange`, `shieldHP`, `coinMultiplier`, `roundDuration`, `mothershipHP`, `mothershipRegen`, `turretFireRate`, `turretDamage`, `barrierHP`, `slowAuraRadius`, `slowAuraStrength`, `overtimeBonus`, `fireRate`, `forwardPulse`, `msSlowStrength`, `msSlowRadius`, `luckyChance`

---

## Collision System

Handled in `CollisionSystem.ts` with squared-distance circle checks (no sqrt):

1. **Bullet → Enemy**: Damage, pierce, splash (AoE), chain lightning, poison, slow, crit rolls, damage numbers via particles.
2. **Bullet → Debris**: Bullets pierce through debris; 50% coin drop on kill.
3. **Enemy → Mothership**: Enemies/enemy bullets that reach the mothership deal damage (barrier absorbs first).
4. **Enemy Bullet → Player**: Deals 1 HP damage with i-frames.
5. **Coin → Player**: Magnet-attracts within range; collected for coin currency.
6. **Overtime bonus**: Extra coins for enemies killed after the round timer expires.

---

## Spawning (`SpawnSystem.ts`)

- **Rocks**: Spawn from top of screen in 3 sizes (small/medium/large) + mega rocks; frequency scales with round number.
- **Enemy Ships**: Spawn with increasing frequency; elite variants have 2× HP + different colors. Pulse variants (level 3+) are fast, fragile, melee-only.
- **Boss Variants**: Level 1 = mega asteroid, Level 2 = bee (fast), Level 3 = butterfly (tanky), Level 4+ = alternating with scaling.
- **Formation Spawning**: Level 2+ enemies spawn in mathematical patterns (Lissajous, phyllotaxis, sine wave, ring, cardioid) with ghostly previews.
- **Mothership Turret**: Auto-fires at nearest enemy within range.
- **Mothership Regen**: Passive HP regeneration each frame.
- **Energy Barrier**: Shield ring around mothership that absorbs hits.
- **Gravity Well**: Slow aura around mothership (upgrade-gated).

---

## Rendering

`Renderer.ts` wraps `CanvasRenderingContext2D` with:
- **Hi-DPI support**: Scales canvas by `devicePixelRatio`.
- **Screen shake**: Offset applied during trauma events (hits, explosions).
- **Camera system**: Mobile devices use `MOBILE_CAMERA_ZOOM` (1.75×) centered on player. `pushScreenSpace()` / `popScreenSpace()` for UI elements.
- **Glow halo cache**: `getGlowHalo()` returns cached offscreen canvas textures for entity glows.
- **Font cache**: `getFont()` caches font string by size.
- **Drawing helpers**: `drawCircle`, `drawRect`, `drawLine`, `drawText`, `drawRoundedRect`, `drawGradientBar`, `drawGlowCircle`, `drawPanel`, `drawButton`, `screenToGame()`.
- All text uses the **"Tektur"** font family.
- **No `ctx.filter` or per-entity `shadowBlur`** — replaced with offscreen canvas compositing and cached glow halos for performance.

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
- **Background tracks**: `chill.mp3`, `trap.mp3`, `fire.mp3` — switchable from pause menu.
- **Track locking**: Chill requires Scythe upgrade, Trap requires first prestige.
- **Beat-sync**: BPM per track (fire=100, chill=100, trap=140), beat callback drives cone weapon + missiles.
- **SFX**: Procedural Web Audio (cone blast, explosions, etc.) with cached noise buffer and throttled playback.
- **Persistent preferences**: Track choice + volume saved to localStorage.

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
  musicTrack: MusicTrack;
  musicVolume: number;
  algoArtEnabled: boolean;
  tutorialSeen: boolean;
  appVersion: string;
}
```

---

## Constants (`Constants.ts`)

All tuning values live here — base stats, sizes, speeds, colors, etc. Key ones:
- `GAME_WIDTH = 1200`, `GAME_HEIGHT = 800`
- `PLAYER_BASE_SPEED = 300`, `PLAYER_BASE_FIRE_RATE = 4`, `PLAYER_BASE_DAMAGE = 10`
- `PLAYER_BASE_HP = 3`, `PLAYER_HIT_INVULN = 1.0`
- `MOTHERSHIP_BASE_HP = 100`, `MOTHERSHIP_COLLISION_RADIUS = 12`
- `BASE_ROUND_DURATION = 30` (seconds)
- `MOBILE_CAMERA_ZOOM = 1.75`, `MOBILE_SPRITE_SCALE = 1.75`
- `BOSS_MOTHERSHIP_DAMAGE = 3`, `BOSS_BULLET_DAMAGE = 2`
- Weapon constants: `CONE_RANGE`, `CONE_FIRE_EVERY`, `MISSILE_SPEED`, `BOMB_FUSE`, etc.
- `COLORS` object with themed hex values (pulse-cyan, magenta, gold, etc.)
- `APP_VERSION` injected from `package.json` at build time via Vite `define`

---

## Assets

### Images (preloaded in `Assets.ts`)
- **Ships**: `pulse-player.svg`, `pulse-enemy-ship.svg`, `pulse-mothership.svg`, `enemy-bee.svg`, `enemy-butterfly.svg`, `enemy-boss.svg`, death GIFs
- **Items**: `coin1.png`, `bomb.gif`, `orb-*.png`, `pulse-asteroid*.svg`, volume icons
- **Backgrounds**: `stars.png`, `pink-parallax-space-stars.png`
- **Upgrade tree icons**: ~25 SVGs in `public/assets/upgrade-tree/`

### Sounds
- Music: `chill.mp3`, `trap.mp3`, `fire.mp3`
- SFX: Procedural Web Audio (no more static SFX files for main effects)

---

## Algorithmic Art System

Three interconnected systems (togglable via pause menu):

1. **Sacred Geometry Background** (`AlgoArt.ts` → `SacredGeometryBg`) — Rotating flower-of-life mandala, golden spiral, concentric rings. Very faint (3–8% opacity). Beat-syncs to music (pulses on every beat).

2. **Geometric Death Bursts** — 4 cycling mathematical particle patterns on enemy death: Fibonacci sunflower, spirograph, pentagonal star, golden ratio rings. Boss/elite get double-pattern.

3. **Formation Spawning** — Level 2+ enemies arrive in Lissajous, phyllotaxis, sine wave, ring, or cardioid patterns with ghostly preview.

---

## Common Patterns for Agents

### Adding a new entity type
1. Create `src/entities/NewEntity.ts` extending `Entity`.
2. Add it to the entity arrays in `Game.ts` (e.g., `this.newEntities: NewEntity[] = []`).
3. Update `SpawnSystem.ts` for spawning logic.
4. Update `CollisionSystem.ts` for interaction rules.
5. Update `IGame` interface in `GameInterface.ts`.
6. Add rendering in `Game.ts` → `render()` or a dedicated render method.

### Adding a new upgrade
1. Add a new `UpgradeNode` entry in `UpgradeTree.ts` with unique `id`, tier, cost curve, and dependencies.
2. Add the corresponding stat field to `PlayerStats` in `UpgradeManager.ts`.
3. Wire the stat into gameplay logic (e.g., `Player.ts`, `CollisionSystem.ts`, `SpawnSystem.ts`).
4. Add a canvas-drawn icon function in `UpgradeIcons.ts` and register in `ICON_MAP`.

### Adding a new UI module
1. Create `src/ui/NewUI.ts` with a class that takes `(renderer, data)`.
2. Expose `render()` and `handleClick(mx, my)` methods.
3. Wire into `Game.ts` — delegate render/click from the appropriate state.

### Modifying game balance
- Tweak values in `src/utils/Constants.ts` for base stats.
- Tweak `costBase`/`costGrowth` in `UpgradeTree.ts` for economy.
- Spawn rates and scaling are in `SpawnSystem.ts`.

### Debugging tips
- `pnpm dev` for hot-reload dev server.
- Canvas is fixed logical resolution — coordinates are always in 1200×800 space.
- `SaveManager.clear()` or delete `localStorage["space-shooter-save"]` to reset progress.
- Max `dt` cap means pausing/tabbing won't cause physics explosions.
- Bump `version` in `package.json` (`npm version patch`) to force save wipe on next load.

---

## Known Architecture Notes / Future Considerations

- **No ECS**: Uses class-based entity hierarchy rather than a formal Entity-Component-System. Fine at current scale.
- **Collision is O(n²)**: Brute-force squared-distance checks. Fine for current entity counts (<200), but spatial partitioning (grid/quadtree) may be needed if scale increases.
- **No unit tests**: All testing is manual/visual.
- **Upgrade tree UI**: Constellation map with flyable ship navigation on canvas.
- **Touch controls**: Virtual joystick on left half, dash button (bottom-right), pause button (top-right).
- **3 stacked canvases**: Always in DOM, only one visible. Each ~7.3MB at DPR=2.
- **p5.js**: Full library loaded via CDN for background animation only. Long-term candidate for rewrite to raw Canvas2D.
- **Event listeners**: Registered in constructors, never cleaned up (Bug #16/#29). Would leak on re-instantiation.


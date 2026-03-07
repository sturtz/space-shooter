# Space Shooter — Architecture & Design Reference

> Written for future-me or any agent picking this up cold.  
> Last updated: March 2026 — Hi-DPI + centering pass (see bottom for change log)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Build Setup](#2-tech-stack--build-setup)
3. [Directory Structure](#3-directory-structure)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Game Loop & State Machine](#5-game-loop--state-machine)
6. [Module Breakdown](#6-module-breakdown)
   - [Entry Point](#61-entry-point--indexhtml--srcmaints)
   - [Game (Coordinator)](#62-game--srcgamegamets)
   - [IGame Interface](#63-igame-interface--srcgamegameinterfacets)
   - [Entity System](#64-entity-system--srcentities)
   - [Systems](#65-systems--srcsystems)
   - [Rendering](#66-rendering--srcrenderingrenderersts)
   - [Input](#67-input--srcinputinputmanagerts)
   - [Audio](#68-audio--srcaudioaudiomanagerts)
   - [UI](#69-ui--srcui)
   - [Upgrades](#610-upgrades--srcupgrades)
   - [Utils](#611-utils--srcutils)
7. [Weapons Design](#7-weapons-design)
8. [Upgrade & Economy System](#8-upgrade--economy-system)
9. [Persistence (Save System)](#9-persistence-save-system)
10. [Rendering Pipeline](#10-rendering-pipeline)
11. [Key Design Decisions & Rationale](#11-key-design-decisions--rationale)
12. [Data Flow Diagram](#12-data-flow-diagram)
13. [Known Patterns & Conventions](#13-known-patterns--conventions)

---

## 1. Project Overview

An incremental / roguelite space shooter. The player defends a **Mothership** against waves of asteroids and enemy ships, earns coins, and spends them on a persistent upgrade tree between runs.

**Core loop:**  
`Menu → Start Run → Survive wave (kill boss) → Round End → Upgrade Screen → repeat`

The game runs entirely in the browser on a single `<canvas>` element using Canvas 2D. No external game framework — everything is hand-rolled TypeScript.

---

## 2. Tech Stack & Build Setup

| Tool           | Version | Why                                          |
| -------------- | ------- | -------------------------------------------- |
| **Vite**       | ^5.0    | Fast HMR dev server, zero-config TS bundling |
| **TypeScript** | ^5.3    | Strict mode, path aliases (`@/` → `src/`)    |
| Node types     | ^25     | Only needed for Vite config (`path.resolve`) |

**`tsconfig.json` key settings:**

- `target: ES2020` — async/await, optional chaining, nullish coalescing
- `moduleResolution: bundler` — Vite handles all resolution, no need for `.js` extensions
- `strict: true` — full strictness; `noEmit: true` because Vite transpiles independently
- `paths: { "@/*": ["src/*"] }` — clean absolute imports everywhere

**`vite.config.ts` key settings:**

- `base: "./"` — relative base so the built site works when hosted under a sub-path (e.g. GitHub Pages at `/repo-name/`)
- `resolve.alias: { "@": "src" }` — mirrors tsconfig paths for Vite's bundler
- Dev server on port 3000

**Build pipeline:**  
`tsc` (type-check only, no emit) → `vite build` (bundles + emits to `dist/`)

---

## 3. Directory Structure

```
space-shooter/
├── index.html              # Shell — single <canvas id="gameCanvas">, imports main.ts
├── style.css               # Global CSS — full-screen canvas centering, font load
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.ts             # Entry: creates canvas, Game instance, starts RAF loop
    ├── audio/
    │   └── AudioManager.ts # Web Audio API — procedural SFX + music beat track
    ├── entities/
    │   ├── Entity.ts       # Abstract base class: pos, vel, radius, alive, update, render
    │   ├── Player.ts       # Player ship — movement, dash, shields, stats sync
    │   ├── Enemy.ts        # Abstract enemy base — hp, takeDamage, coinValue
    │   ├── Rock.ts         # Asteroid enemy — moves toward mothership, boss variant
    │   ├── EnemyShip.ts    # Shooting enemy — aims and fires at player
    │   ├── Bullet.ts       # Projectile — player bullets and enemy bullets
    │   ├── Missile.ts      # Homing missile — extends Bullet, tracks nearest enemy
    │   ├── Mothership.ts   # Friendly base — HP bar, auto-turret, energy barrier
    │   └── Coin.ts         # Pickup — attracted to player, carries coin value
    ├── game/
    │   ├── Game.ts         # Central coordinator — owns all state, update(), render()
    │   └── GameInterface.ts # IGame interface — used by systems/UI to avoid `any`
    ├── input/
    │   └── InputManager.ts # Keyboard + mouse + touch input abstraction
    ├── rendering/
    │   └── Renderer.ts     # Canvas 2D wrapper — screen shake, drawing primitives
    ├── systems/
    │   ├── CollisionSystem.ts  # All collision detection & resolution
    │   ├── ParticleSystem.ts   # Pooled particle emitter
    │   └── SpawnSystem.ts      # Enemy spawning, AI shooting, mothership systems
    ├── ui/
    │   ├── HUD.ts          # In-game overlay — timers, HP bars, streak, dash indicator
    │   └── UpgradeScreen.ts # Between-run upgrade purchase screen
    ├── upgrades/
    │   ├── UpgradeTree.ts  # Static data — all upgrade definitions and their trees
    │   └── UpgradeManager.ts # Runtime upgrade state, coin spending, stat computation
    └── utils/
        ├── Constants.ts    # GAME_WIDTH, GAME_HEIGHT, colors, tuning constants
        ├── Math.ts         # Vec2 type + all vector math helpers
        ├── SaveManager.ts  # localStorage load/save, SaveData shape, defaults
        └── Assets.ts       # Background image preloading helpers
```

---

## 4. High-Level Architecture

```
main.ts
  └── new Game(canvas)
        ├── Renderer          (draw calls)
        ├── InputManager      (raw input)
        ├── ParticleSystem    (VFX)
        ├── CollisionSystem   (queries Game state, mutates entities)
        ├── SpawnSystem       (spawns enemies, runs AI, runs mothership systems)
        ├── UpgradeManager    (upgrade state + stat computation)
        ├── SaveManager       (localStorage r/w)
        ├── AudioManager      (Web Audio SFX + beat-sync)
        ├── HUD               (reads Game state, draws overlay)
        └── UpgradeScreen     (reads UpgradeManager, handles clicks via IGame)

        Entities (owned by Game as arrays):
        ├── Player
        ├── Mothership
        ├── enemies[]    (Rock | EnemyShip)
        ├── bullets[]    (Bullet | Missile)   ← player projectiles
        ├── enemyBullets[] (Bullet)            ← enemy projectiles
        └── coins[]      (Coin)
```

**The `Game` class is the single source of truth.** It owns all entity arrays, the save data reference, and all subsystem instances. Systems receive `game: IGame` and operate on it — they do not own state themselves.

---

## 5. Game Loop & State Machine

**RAF loop in `main.ts`:**

```
requestAnimationFrame(loop)
  → compute dt (capped at 0.05s to prevent death spirals)
  → game.update(dt)
  → game.render()
```

**State machine (`GameState`):**

```
"menu"
  → click → "playing"

"playing"
  → boss defeated → endRound() → "gameover"
  → mothership destroyed → endRound() → "gameover"
  → P / ESC → toggle paused

"gameover"
  → click → "upgradeScreen"

"upgradeScreen"
  → "Start Run" button → "playing"  (via upgradeScreen.handleClick → game.startRun)
```

**`update(dt)`** dispatches by state. Only `"playing"` calls `updatePlaying(dt)`, which runs:

1. Timers (round, streak, cone flash, dash rings)
2. Player movement & update
3. Mobile auto-aim
4. Mobile dash check
5. Entity updates (mothership, bullets, enemies, coins, particles)
6. Boss spawn check (at 15s elapsed)
7. Dynamic spawn rate ramp (speeds up toward end of round)
8. SpawnSystem: `spawnEnemy`, `applySlowAura`, `updateTurret`, `updateMothershipRegen`, `updateMothershipBarrier`
9. CollisionSystem: bullets↔enemies, enemies↔mothership, enemy bullets↔player, coins↔player
10. SpawnSystem: `handleEnemyShooting`
11. Dead entity cleanup (filter by `.alive`)

---

## 6. Module Breakdown

### 6.1 Entry Point — `index.html` + `src/main.ts`

`index.html` is a minimal shell:

- Loads `Orbitron` font from Google Fonts
- Creates `<canvas id="gameCanvas">` sized to `GAME_WIDTH × GAME_HEIGHT` (600 × 800)
- Imports `src/main.ts` as a module

`main.ts`:

- Gets the canvas, creates `new Game(canvas)`
- Starts the RAF loop with delta-time capped at 50ms
- Calls `game.update(dt)` then `game.render()` each frame

---

### 6.2 Game — `src/game/Game.ts`

The central coordinator. ~900 lines. Owns:

| Field            | Type                  | Purpose                                         |
| ---------------- | --------------------- | ----------------------------------------------- |
| `renderer`       | `Renderer`            | All draw calls                                  |
| `input`          | `InputManager`        | Raw input state                                 |
| `particles`      | `ParticleSystem`      | VFX                                             |
| `collisions`     | `CollisionSystem`     | Collision checks                                |
| `spawner`        | `SpawnSystem`         | Enemy AI + spawning                             |
| `upgrades`       | `UpgradeManager`      | Upgrade tree state                              |
| `save`           | `SaveData`            | Persistent data (reference, saved on round end) |
| `stats`          | `PlayerStats`         | Computed stats from upgrade tree                |
| `hud`            | `HUD`                 | In-game overlay                                 |
| `upgradeScreen`  | `UpgradeScreen`       | Between-run screen                              |
| `audio`          | `AudioManager`        | SFX + music                                     |
| `state`          | `GameState`           | Current game state                              |
| `player`         | `Player`              | The player entity                               |
| `mothership`     | `Mothership`          | The mothership entity                           |
| `bullets[]`      | `Bullet[]`            | Player projectiles (incl. missiles)             |
| `enemies[]`      | `(Rock\|EnemyShip)[]` | All active enemies                              |
| `coins[]`        | `Coin[]`              | Uncollected coins                               |
| `enemyBullets[]` | `Bullet[]`            | Enemy projectiles                               |

**Key methods:**

- `startRun()` — resets all state, spawns initial rocks, starts audio beat track
- `update(dt)` / `updatePlaying(dt)` — game loop tick
- `render()` / `renderPlaying()` — draw everything for current state
- `fireConeWeapon()` — AoE circle attack, called on each music beat
- `fireMissile()` — homing missile, called every 2nd beat
- `handleDash()` — dash + EMP ring, clears nearby bullets + damages enemies
- `onEnemyKilled(enemy)` — particles, streak, coin drop, boss check
- `endRound(mothershipDestroyed)` — save, level up, state transition
- `spawnDamageNumber()` — floating damage text

---

### 6.3 IGame Interface — `src/game/GameInterface.ts`

An explicit TypeScript interface that mirrors the public API of `Game`.  
**Why it exists:** Systems (`CollisionSystem`, `SpawnSystem`) and UI (`UpgradeScreen`) all need to read and mutate game state. Without this interface they'd have to import `Game` directly (circular dependency risk) or type everything as `any`. `IGame` gives them a typed contract with no coupling to the concrete class.

Any system that takes `game: IGame` can be tested or replaced without touching `Game.ts`.

---

### 6.4 Entity System — `src/entities/`

**Inheritance hierarchy:**

```
Entity (abstract)
├── Player
├── Enemy (abstract)
│   ├── Rock
│   └── EnemyShip
├── Bullet
│   └── Missile
├── Mothership
└── Coin
```

**`Entity` (abstract base):**

- `pos: Vec2`, `vel: Vec2`, `radius: number`, `alive: boolean`, `angle: number`
- Abstract `update(dt)` and `render(renderer)`
- `destroy()` sets `alive = false` — entities are filtered out of arrays at end of frame

**`Player`:**

- Mouse-follow movement (lerps toward `input.mousePos`)
- WASD/arrow key movement on desktop, touch-follow on mobile
- `tryDash()` → returns `DashResult` (dashed + flashbang radius)
- `dashReady`, `dashCooldownRatio` — exposed for HUD
- `shields`, `maxShields` — regenerating HP, synced from `PlayerStats`
- `updateStats(stats)` — called on `startRun()` to apply upgrade tree values
- `isDead` flag — used by game-over screen to differentiate death vs. boss kill

**`Enemy` (abstract):**

- `hp`, `maxHp`, `coinValue`
- `takeDamage(dmg)` — handles status effects (poison, slow)
- Subclasses implement movement + rendering

**`Rock`:**

- Moves toward the mothership position (straight line)
- `isBoss` flag — larger radius, more HP, red tint
- `sizeScale` — fractional scale for smaller spawn variants
- Takes `slowFactor` for the SpawnSystem's slow-aura upgrade

**`EnemyShip`:**

- Orbits around the arena edge
- Has a `shootCooldown` — fires managed by `SpawnSystem.handleEnemyShooting()`
- More complex rendering (ship silhouette + engine glow)

**`Bullet`:**

- Straight-line projectile, self-destroys when off-screen or `maxRange` exceeded
- Carries `damage`, `pierce` (hits multiple), `splashRadius`, `chainCount`, `poisonDamage`, `slowAmount`, `lifesteal`
- All special-effect properties are set by `CollisionSystem` based on `PlayerStats`

**`Missile`:**

- Extends `Bullet` — adds `target: Enemy | null`, `turnSpeed`
- Each frame steers toward `target.pos` using angular lerp
- Falls back to straight flight if target is dead

**`Mothership`:**

- Stationary center entity
- `hp`, `maxHp`, `barrierActive`, `barrierHp`
- Has a turret (`turretAngle`) auto-aimed and fired by `SpawnSystem.updateTurret()`
- `updateMothershipRegen()` heals HP over time (upgrade-based)
- `renderBarrier()` — glowing energy shield ring

**`Coin`:**

- Spawned at enemy death position, drifts outward then slows
- `attractTo(playerPos, magnetRange)` — accelerates toward player if in magnet range (upgrade-based)
- Collected in `CollisionSystem.checkCoinCollections()`

---

### 6.5 Systems — `src/systems/`

Systems are **stateless coordinators** — they hold no game state themselves, they operate on the `IGame` context passed in each call.

**`CollisionSystem`:**

| Method                                   | What it does                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `checkBulletEnemyCollisions(game)`       | Player bullets vs enemies. Handles pierce (multi-hit), splash AoE, chain lightning, poison DoT, slow, lifesteal       |
| `checkEnemyMothershipCollisions(game)`   | Enemies reaching the mothership — deals HP damage, destroys enemy, triggers screen shake. Returns `true` if game over |
| `checkEnemyBulletPlayerCollisions(game)` | Enemy bullets vs player — respects evasion chance, reflect (bullet bounces back), counter-strike                      |
| `checkCoinCollections(game)`             | Coins touching player → add to `save.coins` + `roundCoins`                                                            |

Collision detection is **circle vs circle** using `circleCollision(a, b)` from `Math.ts`.

**`ParticleSystem`:**

- Maintains a pool of `Particle` objects (`pos`, `vel`, `color`, `life`, `maxLife`, `radius`)
- `emit(pos, count, color, speed, life, radius)` — omnidirectional burst
- `emitDirectional(pos, angle, spread, count, ...)` — cone burst in a direction
- `update(dt)` — move, decay
- `render(renderer)` — draw fading circles
- Dead particles are recycled from a pool (no allocation per frame once warmed up)
- `clear()` — called on `startRun()` to reset between rounds

**`SpawnSystem`:**

| Method                              | What it does                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `spawnEnemy(game)`                  | Spawns `Rock` or `EnemyShip` based on level/probability. Includes elite variants (higher HP, bigger) |
| `handleEnemyShooting(game)`         | Iterates `EnemyShip` enemies, decrements cooldowns, fires `Bullet` into `game.enemyBullets`          |
| `applySlowAura(game)`               | Applies `slowFactor` to enemies near mothership (upgrade: `def_slow`)                                |
| `updateTurret(game, dt)`            | Rotates turret to track nearest enemy, fires bullets at rate set by upgrade                          |
| `updateMothershipRegen(game, dt)`   | Heals mothership HP over time (upgrade: `def_regen`)                                                 |
| `updateMothershipBarrier(game, dt)` | Manages barrier HP and recharge timer (upgrade: `def_barrier`)                                       |
| `reset(game)`                       | Clears internal timers on `startRun()`                                                               |

---

### 6.6 Rendering — `src/rendering/Renderer.ts`

Wraps `CanvasRenderingContext2D` with:

- **Screen shake** — random offset applied at start of each frame, decays over time. `shake(intensity)` to trigger
- **`beginFrame(dt)`** — clears canvas, applies shake offset
- **`endFrame()`** — resets the transform

**Drawing primitives:**

- `drawCircle(pos, radius, color)`
- `drawRect(x, y, w, h, color)`
- `drawLine(a, b, color, width)`
- `drawText(text, x, y, color, size, align, baseline)`
- `drawTextOutline(...)` — text with stroke for readability
- `drawTitleText(...)` / `drawTitleTextOutline(...)` — Orbitron font
- `drawGlowCircle(pos, radius, color, glowRadius)` — radial gradient glow
- `drawGradientBar(x, y, w, h, fillRatio, colorFull, colorEmpty, bg)` — HP/shield bars
- `drawPanel(x, y, w, h, opts)` — rounded-rect panel with optional glow
- `drawButton(x, y, w, h, label, opts)` — styled button

The renderer does **not** know about game entities — it only provides drawing tools. Each entity calls the renderer in its own `render(renderer)` method.

---

### 6.7 Input — `src/input/InputManager.ts`

Handles three input modes transparently:

| Input    | Desktop                                                          | Mobile                          |
| -------- | ---------------------------------------------------------------- | ------------------------------- |
| Movement | WASD / Arrow keys                                                | Touch drag (left 88% of screen) |
| Aim      | Mouse position                                                   | Auto-aim toward nearest enemy   |
| Fire     | `isFiring` (mouse held) — _currently unused, cone fires on beat_ | Same                            |
| Dash     | Shift key                                                        | Tap right 12% of screen         |

Key fields:

- `mousePos: Vec2` — cursor position in game-space (accounts for canvas scaling)
- `isFiring: boolean`
- `isTouchDevice: boolean` — auto-detected
- `touchTargetActive: boolean` — for rendering the touch target indicator
- `consumeDash(): boolean` — one-shot flag consumption (clears after read)

Canvas coordinate → game coordinate conversion uses `getBoundingClientRect()` + scale factors so the game works at any display size with CSS scaling.

---

### 6.8 Audio — `src/audio/AudioManager.ts`

Uses the **Web Audio API** — no audio files, all sounds are synthesized procedurally.

**Why procedural?** No asset loading, no CORS issues, works offline, zero bundle size cost.

**SFX methods:**

- `playShoot()` — short high-pitched burst
- `playExplosion()` — noise burst with envelope
- `playFlashbang()` — sweeping tone for EMP ring
- `playDash()` — whoosh
- `playCoinCollect()` — ascending chime
- `playMothershipHit()` — low thud

**Beat track (`startConeTrack(onBeat)`):**

- Schedules a repeating beat at ~140 BPM using `AudioContext.currentTime` scheduling (sample-accurate, not `setInterval`)
- Calls the provided `onBeat` callback on each beat — `Game` uses this to fire the cone weapon and missiles
- `stopConeTrack()` — cancels scheduled beats, called on round end

**`init()`** — must be called from a user gesture (click) to unlock `AudioContext` on browsers that block auto-play.

---

### 6.9 UI — `src/ui/`

**`HUD`:**  
Stateless renderer — takes a `HUDData` object each frame and draws:

- Top-left: Round timer bar + level
- Top-right: Coins
- Bottom-left: Mothership HP bar
- Bottom-right: Player shields, dash cooldown arc
- Center top: Kill streak display
- Boss health bar when boss is alive

**`UpgradeScreen`:**

- Renders the upgrade tree visually (nodes with connector lines)
- `handleClick(mx, my)` — hit-tests upgrade nodes and "Start Run" button
- Reads `UpgradeManager` for current levels, coin costs, locked/unlocked state
- Calls `game.startRun()` when "Start Run" is pressed
- `refresh()` — called when entering upgrade screen to rebuild layout

---

### 6.10 Upgrades — `src/upgrades/`

**`UpgradeTree.ts` — Static data:**

All upgrades are defined as `UpgradeNode` objects in three trees:

| Tree     | IDs                                                                                           | Focus     |
| -------- | --------------------------------------------------------------------------------------------- | --------- |
| `dmg_*`  | `dmg_power`, `dmg_crit`, `dmg_pierce`, `dmg_splash`, `dmg_missile`, `dmg_chain`, `dmg_poison` | Offensive |
| `def_*`  | `def_shields`, `def_regen`, `def_barrier`, `def_slow`, `def_turret`, `def_emp`                | Defensive |
| `econ_*` | `econ_coins`, `econ_magnet`, `econ_combo`, `econ_lucky`, `econ_duration`                      | Economy   |

Each node has: `id`, `label`, `description`, `maxLevel`, `baseCost`, `costMultiplier`, `requires` (prerequisite IDs), and per-level stat delta functions.

**`UpgradeManager.ts` — Runtime state:**

- Loads levels from `SaveData.upgrades` (record of `id → level`)
- `getLevel(id): number` — current level of an upgrade
- `canAfford(id): boolean`, `buy(id): boolean` — purchase logic, deducts coins from save
- `computeStats(): PlayerStats` — **aggregates all upgrade levels into a single flat stats object** used by `Game`, `Player`, `CollisionSystem`, and `SpawnSystem`

`PlayerStats` shape (key fields):

```typescript
{
  damage: number; // base circle-weapon damage
  critChance: number; // 0-1
  critMultiplier: number;
  pierceCount: number; // bullet pierce (unused for cone, used for missile/turret)
  splashRadius: number;
  missileLevel: number; // 0 = locked, 1-3 = active
  chainCount: number; // chain lightning jumps
  poisonDamage: number;
  slowAmount: number;
  lifesteal: number;
  playerShields: number;
  shieldRegen: number;
  mothershipHP: number;
  mothershipRegen: number;
  barrierHP: number;
  turretLevel: number;
  empRadius: number;
  coinDropMultiplier: number;
  coinMagnetRange: number;
  roundDuration: number;
  enemySpawnMultiplier: number;
  dashCooldown: number;
}
```

---

### 6.11 Utils — `src/utils/`

**`Constants.ts`:**

- `GAME_WIDTH = 600`, `GAME_HEIGHT = 800` — fixed logical resolution
- `SPAWN_RATE_BASE`, `ROCK_BASE_HP`, `ROCK_BASE_SPEED` — gameplay tuning
- `COLORS` — named color palette used everywhere (avoids magic strings)

**`Math.ts`:**

- `Vec2 = { x: number; y: number }` — simple value type (not a class, so no heap allocation)
- `vec2(x, y)` — constructor
- `vecAdd`, `vecSub`, `vecScale`, `vecNormalize`, `vecDot`, `vecDist`, `vecLen`
- `vecAngle(v)` — atan2
- `vecFromAngle(a)` — unit vector from angle
- `randomAngle()`, `randomRange(min, max)`
- `circleCollision(a, b)` — checks if two circles with `pos` and `radius` overlap

**`SaveManager.ts`:**

- `SaveData` interface — all persistent fields
- `loadGame()` — reads `localStorage["spaceShooterSave"]`, merges with defaults
- `saveGame(data)` — writes to `localStorage`
- `getDefaultSave()` — fresh-start values (level 1, 0 coins, empty upgrades)

**`Assets.ts`:**

- Preloads background images (`parallax.png`, `stars.png`) as `HTMLImageElement`
- `imageReady(img)` — checks `img.complete && img.naturalWidth > 0` so renderer can fall back gracefully while loading

---

## 7. Weapons Design

### Circle AoE Weapon (default)

- Fires automatically every **music beat** (~140 BPM, ~428ms)
- Damages all enemies within `CONE_RANGE = 45px` radius of player
- Crits apply based on `stats.critChance`
- Beat timing is **sample-accurate** (Web Audio API scheduled, not `setInterval`)
- A visual loader arc fills between beats (like a cooldown spinner), bursts white on fire
- `coneMeasuredInterval` tracks actual interval between beats to keep loader in sync

### Missile Weapon (upgrade: `dmg_missile`)

- Fires every **2nd beat**
- Homes toward nearest enemy using angular steering
- Up to 3 missiles simultaneously at level 3
- Half base damage per missile, but consistent homing delivery

### Dash / EMP Ring (Shift key or right-side mobile tap)

- Dash: teleports player a short distance in movement direction
- EMP ring: expanding visual ring clears enemy bullets + damages enemies in radius
- Ring radius = `60 + empRadius` (from `def_emp` upgrade)
- Cooldown visible as arc on mobile dash button

### Mothership Turret (upgrade: `def_turret`)

- Auto-aims at nearest enemy
- Fires bullets at rate set by `turretLevel`
- Managed entirely by `SpawnSystem.updateTurret()`

---

## 8. Upgrade & Economy System

**Coins** are earned by killing enemies. Base flow:

1. Enemy dies → `onEnemyKilled()` → compute coin value
2. Value = `enemy.coinValue × coinDropMultiplier × streakBonus × luckyRoll`
3. A `Coin` entity is spawned at death position
4. Player collects coin (magnet range pulls them in) → `save.coins += value`
5. After round, spend coins in `UpgradeScreen`

**Kill Streak** multiplier (`econ_combo` upgrade):  
Each kill within 1.5s adds +10% per combo level to the next coin drop. Resets on timeout.

**Lucky Drop** (`econ_lucky` upgrade):  
4% chance per level to 5× a coin drop value.

**Star Coins:** Awarded on boss-kill (round completion). Currently tracked but intended for meta-progression (not yet consumed).

**Upgrade prerequisites** enforce a tech-tree order. E.g., `dmg_chain` requires `dmg_pierce` to be bought first.

---

## 9. Persistence (Save System)

All persistence is via `localStorage`. The save key is `"spaceShooterSave"`.

`SaveData` fields:

```typescript
{
  currentLevel: number; // resets to 1 on... actually never resets, always increments
  highestLevel: number;
  coins: number; // spendable currency
  starCoins: number; // meta currency (boss kills)
  lifetimeKills: number; // stat tracking
  upgrades: Record<string, number>; // upgradeId → level
}
```

`loadGame()` merges loaded data with `getDefaultSave()` so new fields added in future versions get their defaults without breaking old saves.

`saveGame()` is called at the end of every round (in `endRound()`).

---

## 10. Rendering Pipeline

Each frame, render order is:

```
1. renderStarfield()
   a. Cached procedural background (offscreen canvas at native 900×600)
      — nebula gradients, dust, multi-layer stars with glow
   b. Animated twinkle dots (procedural, on top of static cache)

2. State-specific render:
   "playing":
     a. Mothership
     b. Coins
     c. Enemies
     d. Enemy bullets
     e. Player bullets (incl. missiles)
     f. Player
     g. Circle weapon loader arc + flash ring (Canvas2D direct, not via Renderer)
     h. Particles
     i. Dash explosion rings
     j. Damage numbers (floating text)
     k. Screen flash overlay (rect with color/alpha)
     l. HUD
     m. Mobile controls overlay (if touch device)

   "upgradeScreen":  UpgradeScreen.render()
   "gameover":       particles + game-over panel
   "menu":           menu panel + title + start button
```

All entities call `renderer.drawXxx()` helpers in their own `render()` method — the renderer doesn't know about entity types.

Screen shake is implemented by translating the canvas by a random small offset at `beginFrame()`, then resetting with `endFrame()`. The offset decays exponentially each frame.

---

## 11. Key Design Decisions & Rationale

### No game framework

Raw Canvas 2D + TypeScript. Rationale: full control, no dependency overhead, learning exercise, easy to host anywhere.

### Fixed logical resolution (600×800)

The canvas is always `600×800` in game-space. CSS scales it to fit the viewport. This means all game math uses fixed coordinates — no need to account for display scaling in gameplay code. `InputManager` handles the inverse scale when converting mouse/touch coordinates.

### ECS-lite (not full ECS)

Entities inherit from `Entity` base class rather than using pure composition/components. This is simpler for a project this size and avoids the boilerplate of a full ECS. Systems are separate classes (`CollisionSystem` etc.) operating on typed arrays, which gives most of the separation benefits.

### `IGame` interface for dependency injection

Systems don't import `Game` directly. They take `IGame`, which is a subset interface. This prevents circular imports (`Game` imports `CollisionSystem`, `CollisionSystem` imports `Game` would be circular). It also makes the contract explicit.

### Beat-synced weapons

The circle weapon fires on audio beats (not on frame ticks or timers). This creates a rhythmic feel and ties gameplay to audio. The `AudioManager` uses `AudioContext.currentTime` scheduling so beats are sample-accurate regardless of frame rate.

### Procedural audio

No audio assets to load or manage. All SFX are synthesized via Web Audio oscillators + noise generators. Keeps the project self-contained.

### Relative Vite base (`./`)

Using `base: "./"` means the built `dist/` folder can be dropped anywhere — served from root, a sub-directory, or opened as a local file — without broken asset paths. Critical for GitHub Pages hosting under `/repo-name/`.

### Coins as entities (not instant pickup)

Coins spawn as `Coin` entities that drift and are attracted to the player. This creates a "chase the reward" feel and makes the magnet upgrade satisfying. They're cleaned up by `CollisionSystem` on overlap with player.

### Damage numbers

Floating damage text (`spawnDamageNumber`) gives immediate feedback for crits and special effects (DODGE text for evade). They're stored as plain objects in `game.damageNumbers[]` and rendered directly in `renderPlaying()` — no entity needed since they have no physics.

---

## 12. Data Flow Diagram

```
User Input
    │
    ▼
InputManager.mousePos / keys / touchPos
    │
    ▼
Game.updatePlaying(dt)
    │
    ├──▶ Player.move(input, dt) ──▶ Player.pos updated
    │
    ├──▶ SpawnSystem.spawnEnemy(game) ──▶ enemies[] grows
    │
    ├──▶ AudioManager beat callback
    │       └──▶ Game.fireConeWeapon() ──▶ enemies.takeDamage()
    │       └──▶ Game.fireMissile() ──▶ bullets[] grows
    │
    ├──▶ CollisionSystem.checkBulletEnemyCollisions(game)
    │       └──▶ enemy.takeDamage() ──▶ enemy.alive = false
    │       └──▶ game.onEnemyKilled() ──▶ coins[] grows
    │
    ├──▶ CollisionSystem.checkCoinCollections(game)
    │       └──▶ save.coins += value ──▶ coin.alive = false
    │
    ├──▶ CollisionSystem.checkEnemyMothershipCollisions(game)
    │       └──▶ mothership.hp -= damage ──▶ [endRound if hp ≤ 0]
    │
    └──▶ Dead entity filter (bullets, enemies, coins)

Game.endRound()
    └──▶ saveGame(save) ──▶ localStorage
    └──▶ state = "gameover"

User click on "TAP TO CONTINUE"
    └──▶ state = "upgradeScreen"

User buys upgrade
    └──▶ UpgradeManager.buy(id)
    └──▶ save.coins -= cost
    └──▶ save.upgrades[id]++

User clicks "Start Run"
    └──▶ game.startRun()
    └──▶ stats = upgrades.computeStats()
    └──▶ Player.updateStats(stats)
    └──▶ state = "playing"
```

---

## 13. Known Patterns & Conventions

- **`alive` flag + end-of-frame filter:** Entities are never removed from arrays mid-loop. They set `alive = false` via `destroy()`. The game filters arrays at the end of `updatePlaying()`. Safe iteration.

- **`Vec2` is a plain object:** `{ x, y }`, not a class. Math helpers take `Vec2` arguments. No `this`, no prototype chain. Fast and simple.

- **`COLORS` object in Constants.ts:** All color strings go here. Avoids magic strings scattered through rendering code. Easy to reskin.

- **`computeStats()` is pure:** `UpgradeManager.computeStats()` reads upgrade levels and returns a fresh `PlayerStats` object. No side effects. Called once per `startRun()` — not every frame.

- **Systems are stateless (almost):** `CollisionSystem` and `ParticleSystem` have no persistent state. `SpawnSystem` has internal timers (`turretTimer`, `barrierTimer`) but these are reset on `startRun()` via `spawner.reset(game)`.

- **Canvas coordinate system:** Origin is top-left. `GAME_WIDTH = 600`, `GAME_HEIGHT = 800`. The mothership is at center `(300, 400)`.

- **No external state management:** No Redux, no signals, no observer pattern. Everything flows through `Game` which is the single mutable store. For this scale, that's simpler than introducing a reactive layer.

---

## 14. Change Log

### March 2026 — Hi-DPI + Mobile Centering Pass

**Problem:** The game had broken global CSS (`* { max-width: 1440px; max-height: 1024px }` in the inline `<style>` block) that capped and misaligned every element. The canvas was stretched to `window.innerWidth × window.innerHeight` without maintaining the 900×600 aspect ratio, and there was no device pixel ratio support — text and sprites were blurry on Retina/OLED screens.

**Files changed:**

- **`index.html`**
  - Removed the broken inline `<style>` block with its global `*` rules
  - Added `viewport-fit=cover`, `maximum-scale=1`, `user-scalable=no` to viewport meta
  - Added PWA / iOS-standalone meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`)
  - Added Google Fonts preconnect + Orbitron `<link>` (font was referenced in canvas draw calls but never loaded in HTML)
  - Wrapped `<canvas>` in `<div id="game-container">` for flex centering
  - Moved styles to external `style.css` via `<link rel="stylesheet">`

- **`style.css`**
  - Full rewrite — mobile-first, hi-DPI ready
  - `#game-container`: `position: fixed; inset: 0; display: flex; align-items/justify-content: center` — letterboxes the canvas at any screen size
  - Canvas: `max-width/max-height: 100%` — shrinks to fit without distorting; JS controls exact pixel dimensions
  - Safe-area insets: `env(safe-area-inset-*)` padding on `#game-container` — handles notched/Dynamic Island iPhones
  - `body`: `position: fixed` prevents iOS rubber-band bounce scroll
  - Removed `image-rendering: pixelated` as a universal rule (kept only on canvas)

- **`Renderer.ts`** — `resize()` method overhauled:
  - Reads `window.devicePixelRatio` (capped at 3× to avoid VRAM pressure)
  - Computes the largest letterboxed display size that fits `container.clientWidth × clientHeight` while preserving 900:600 aspect ratio
  - Sets `canvas.width/height = displaySize × dpr` for a physically sharp pixel buffer
  - Sets `canvas.style.width/height` to the CSS display size (flex parent centers it)
  - Uses `ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)` so all game-coordinate drawing (0→`GAME_WIDTH`, 0→`GAME_HEIGHT`) maps cleanly onto the hi-res buffer — **no changes required in any game, entity, or UI code**
  - `InputManager` coordinate conversion via `getBoundingClientRect()` continues to work correctly because it operates on CSS coordinates

**Result:** Canvas is perfectly centered (letterboxed with dark bg bars when aspect doesn't match), crisp on Retina, and touch-safe on mobile. No game logic changes needed.

### March 2026 — Procedural Hi-Res Background

**Problem:** Background images (`pink-parallax-space-stars.png`, `stars.png`) were only 272×160 pixels, being stretched to fill the 900×600 game canvas. This caused severe blurriness and the dark source images made the overall scene too dark and muddy.

**Files changed:**

- **`Game.ts`**
  - Added `buildBgCache()` — procedurally generates a rich space background on an offscreen `<canvas>` at native 900×600 resolution. Includes:
    - Brighter base fill (`#0c0c22` vs old `#0a0a1a`)
    - 6 nebula cloud gradients (purple, blue, magenta, teal, deep purple, pink) for color depth
    - 600 fine dust particles for texture
    - 350 tiny dim stars + 80 medium stars + 20 bright stars with radial glow halos
    - Subtle edge vignette
  - Added `bgCache: HTMLCanvasElement | null` field — built lazily on first render, reused every frame
  - Replaced `renderStarfield()` — now draws the cached offscreen canvas (1 `drawImage` call) instead of stretching two tiny PNGs. Animated twinkle dots still drawn on top with higher opacity (0.6 vs old 0.4)
  - Removed `BgImages` / `imageReady` imports (no longer needed)

**Result:** Background is sharp at any display size (rendered at native game resolution, no upscaling), visibly brighter with colorful nebula depth, and zero additional asset loading. The offscreen cache means the complex generation runs once — runtime cost is a single `drawImage` per frame.

### March 2026 — Player Ship → ship-glider.svg

**Change:** Replaced the old `player-still.png` / `player-moving.png` raster sprites with `ship-glider.svg` (Spaceship Glider, public domain via openclipart.org). The SVG is a detailed yellow-and-red glider design with a natural nose-up orientation.

**Files changed:**

- **`src/utils/Assets.ts`**
  - Added `glider: img("/assets/ships/ship-glider.svg")` to `PlayerImages`. The existing `still` and `moving` entries are retained for reference but no longer used by `Player.ts`.

- **`src/entities/Player.ts`** — `render()` overhauled:
  - `SPRITE_SIZE` bumped from 22 → 36 game-pixels to better showcase the SVG detail.
  - All three render paths (normal, dash-flash, fallback) now reference `PlayerImages.glider`.
  - The `glider` SVG has its nose pointing north (−Y) in SVG coordinate space; the existing `ctx.rotate(this.angle + Math.PI/2)` rotation is correct for this orientation — no change to rotation math needed.
  - Added a subtle `shadowColor: "#ffcc00"` / `shadowBlur: 10` engine-glow effect when `isMoving` is true, giving visual feedback for movement.
  - Canvas fallback (drawn if SVG hasn't loaded yet) uses matching gold `#FFDB78` fill and red `#ED1C24` stroke to echo the SVG color scheme.

**Result:** Player ship now displays as the glider SVG at all times (still, moving, dashing). Dash cyan-tint overlay and invincibility blink work unchanged. Shield ring and dash cooldown arcs render on top as before.

### March 2026 — Round Timer Now Ends the Round

**Bug:** The round countdown reached zero but the round never ended — you had to kill the boss to advance. The `updatePlaying()` timer block only clamped `roundTimer` to `0` without calling `endRound()`.

**File changed:**

- **`src/game/Game.ts`** — `updatePlaying()` timer block:
  - **Before:** `if (this.roundTimer < 0) this.roundTimer = 0;` (clamps only)
  - **After:** `if (this.roundTimer <= 0) { this.roundTimer = 0; this.endRound(false); return; }` — calls `endRound(false)` (the "survived" path: levels up, awards a star coin) and returns immediately to stop further update work that frame.

**Result:** When the round timer hits zero the round ends as a win (ROUND COMPLETE screen, level incremented, star coin awarded) whether or not the boss has been killed.

### March 2026 — Galaga-Inspired Ship SVG Redesign

**Change:** Replaced the repurposed `ship-glider.svg` (originally a generic open-source glider with red/white Galaga colors applied) with a purpose-built Galaga-style fighter drawn from scratch in SVG.

**Design:**
- ViewBox `0 0 100 110` (nose pointing up, −Y, matches existing `rotate(angle + Math.PI/2)` convention)
- Navy blue fuselage (`#1e3db5`) with a lighter center highlight stripe (`#2a52d4`)
- Swept-back wings (`#1a3aaa`) with subtle white outline
- Red wing cannons (`#cc2222`) with bright tip highlights (`#ff4444`)
- Yellow cockpit dome (`#ffcc00`) with a glint highlight
- Dual orange engine nozzles at the tail
- Yellow wing-tip accent dots (like classic Galaga's nav lights)
- Drop shadow layer for depth
- Dark navy outline (`#0a1a44`) throughout

**Files changed:**

- **`public/assets/ships/ship-glider.svg`** — fully rewritten with the new Galaga fighter design
- **`src/entities/Player.ts`** — updated `render()`:
  - Replaced single `SPRITE_SIZE = 24` (square) with `SPRITE_W = 26` / `SPRITE_H = 29` to preserve the 100:110 aspect ratio of the new viewBox
  - All three `drawImage()` calls (normal, dash-flash, fallback paths) updated to use `SPRITE_W`/`SPRITE_H`
  - Engine-glow `shadowColor: "#ffcc00"` now matches the yellow cockpit and nozzles

### March 2026 — Removed Ship HP and Player Collision

**Change:** The player ship no longer has HP, shields, or any collision with enemy bullets. The player is invincible — enemy fire passes through harmlessly.

**Rationale:** The game design focuses on protecting the Mothership, not the player. Removing player HP/collision simplifies the core loop, removes frustration from enemy bullet spam, and keeps the focus on positioning and offense.

**Files changed:**

- **`src/entities/Player.ts`**
  - Removed `shields`, `maxShields`, `shieldRegenTimer`, `invincibleTimer` fields
  - Removed `DASH_BASE_INVINCIBILITY` constant
  - Removed `updateStats()` lines that set shield values
  - Removed shield regen block from `update()`
  - Removed i-frame assignment from `tryDash()`
  - Removed `takeDamage()` method entirely
  - Removed `healShield()` method entirely
  - Removed `isDead` getter entirely
  - Removed invincibility blink from `render()`
  - Removed shield arc ring from `render()`

- **`src/systems/CollisionSystem.ts`**
  - Removed `checkEnemyBulletPlayerCollisions()` method entirely (enemy bullets vs player)
  - Removed lifesteal `healShield()` call from `checkBulletEnemyCollisions()`
  - Cleaned up unused imports (`Rock`, `EnemyShip`, `Bullet`, `vecSub`, `vecNormalize`, `vecScale`, `vecFromAngle`)

- **`src/game/Game.ts`**
  - Removed `checkEnemyBulletPlayerCollisions(this)` call from `updatePlaying()`
  - Removed `playerShields` / `playerMaxShields` from HUD data object
  - Simplified `renderGameOver()` — removed `playerDied` branch, always shows "ROUND COMPLETE"

- **`src/ui/HUD.ts`**
  - Removed `playerShields` / `playerMaxShields` from `HUDData` interface
  - Removed shield bar from left panel render
  - Left panel height is now always fixed at 30px (dash indicator only)

**Result:** Enemy bullets still spawn and fly toward the player (for visual interest and the dash EMP mechanic), but hitting the player has no effect. The only loss condition remains Mothership HP reaching zero.

### March 2026 — Ship Switched to spaceship.svg + Non-Cartoony Recolor + Pink Background

**Changes:**

1. **Player ship** — switched from hand-drawn `ship-glider.svg` to `public/assets/ships/spaceship.svg` (a detailed SVG Repo spaceship silhouette). Recolored for a realistic, non-cartoony look:
   - Hull: horizontal metallic gradient `#0e1f4a → #243d88 → #0e1f4a` (deep navy, not flat)
   - Cockpit: dark tinted radial gradient (`#4a6fa0 → #0a1a2e`) — looks like glass, not a yellow cartoon dome
   - Nav lights: dim dark-red (`#7a1010`, 85% opacity) — subtle, not bright arcade dots
   - Outline: near-black `#050d1e`
   - ViewBox is square `572×572` — `Player.ts` updated to `SPRITE_W = SPRITE_H = 28`

2. **Background** — shifted nebula palette from blue/purple to pink/rose/lavender:
   - Base fill: `#160a18` (dark rose-purple, replaces `#10102c`)
   - 7 nebula clouds now use rose (`200,80,140`), lavender (`155,70,175`), coral pink (`215,90,130`), purple-rose, deep rose, bright pastel pink, and soft mauve — replacing the previous blue/teal/purple set

**Files changed:**
- `public/assets/ships/spaceship.svg` — new recolored ship with gradients and tinted glass
- `src/utils/Assets.ts` — `PlayerImages.glider` now loads `spaceship.svg`
- `src/entities/Player.ts` — `SPRITE_W = SPRITE_H = 28` (square viewBox)
- `src/game/Game.ts` — `buildBgCache()` base fill + nebula palette shifted to pinks/roses

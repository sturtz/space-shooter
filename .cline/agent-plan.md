# Space Shooter — Agent Improvement Plan

## 5 Tasks, Code Findings, and Exact Change Instructions

---

## 1. Slow Down Fire Rate, Bullet Velocity, and Bullet Size

### Current Values (`src/utils/Constants.ts`)
| Constant | Line | Current | Notes |
|---|---|---|---|
| `PLAYER_BASE_FIRE_RATE` | 26 | `0.4` | Seconds between shots — lower = faster |
| `BULLET_SPEED` | 42 | `400` | Pixels/sec |
| `BULLET_SIZE` | 43 | `4` | Collision radius (also visual size) |
| `BULLET_LIFETIME` | 44 | `2` | Seconds before self-destruct |

### How Bullets Work
- `src/entities/Bullet.ts:33` — collision radius set via `super(x, y, BULLET_SIZE)`
- Speed is passed from caller (Game.ts) using `BULLET_SPEED` constant
- `Bullet.update(dt)` moves bullet by `direction * speed * dt` each frame
- Visual rendering in `Renderer.ts` draws bullets as small circles/rects at `BULLET_SIZE`

### Recommended Changes
**File: `src/utils/Constants.ts`**
- `PLAYER_BASE_FIRE_RATE`: `0.4` → `0.6` (50% slower fire rate)
- `BULLET_SPEED`: `400` → `250` (37.5% slower bullets — more readable)
- `BULLET_SIZE`: `4` → `3` (smaller, sleeker projectiles)
- Consider also reducing `BULLET_LIFETIME` from `2` to `1.5` since slower bullets travel less distance

**Also check:** Enemy bullet speed is hardcoded at `200` in `SpawnSystem.ts:115`:
```ts
const bullet = new Bullet(enemy.pos.x, enemy.pos.y, dir, 200, 1, false, 0, true);
```
May want to slow this proportionally too (e.g. `200` → `150`).

---

## 2. Make All Three Upgrade Nodes (Identify Missing/Broken Nodes)

### Current Tree Structure
The tree has **6 branches** radiating from root, with **~35 total nodes** across depths 0–5:
- **dmg** (red): dmg_core → dmg_forward, dmg_range, dmg_crit → dmg_overclock, dmg_execute → dmg_overcharge
- **guns** (yellow): guns_missile, guns_bolt → guns_chain, guns_barrage, guns_multishot → guns_orbital
- **economy** (orange): econ_duration → econ_value, econ_magnet, econ_bounty → econ_combo, econ_lucky, econ_interest + econ_swarm (standalone)
- **movement** (teal): move_speed → move_afterimage, move_emp, move_mine → move_trap, move_warp
- **health/effects** (purple): hp_boost → hp_regen, hp_shield + eff_poison → eff_slow, eff_bomb, eff_bleed → eff_freeze
- **mothership** (blue): ms_hull, ms_slow → ms_turret, ms_barrier, ms_repair → ms_mech, ms_fortress → ms_overdrive

### Nodes That May Be Incomplete/Non-functional
Search for `hidden?: boolean` — any nodes with `hidden: true` are defined but not wired into gameplay. Currently **none** are marked hidden, but verify these Phase 2 nodes are actually wired into `UpgradeManager.ts` stat computation:
- `dmg_execute` (Executioner — instant-kill <15% HP)
- `dmg_overcharge` (Death Nova — death explosions)
- `guns_multishot` (Spread Shot)
- `guns_orbital` (Orbital Drones)
- `move_afterimage` (Afterburn — damage trail)
- `move_warp` (Phase Rift — portal dash)
- `eff_freeze` (Flash Freeze)
- `eff_bleed` (Hemorrhage)
- `ms_repair`, `ms_mech`, `ms_overdrive`, `ms_fortress`

**Action:** Check `UpgradeManager.ts` `computeStats()` method and `Game.ts` gameplay logic to confirm each Phase 2 node actually does something. Any node that computes a stat but has no corresponding gameplay code in `Game.ts` needs implementation.

### User Likely Means
"Make all three upgrade nodes" probably refers to ensuring 3 specific upgrade paths (likely the main T1 branches visible from root) are all functional and purchasable. The root connects to: `dmg_core`, `econ_duration`, `move_speed`, `hp_boost`, and `econ_swarm`. Clarify with user which 3 they mean — or ensure ALL nodes are fully wired.

---

## 3. Upgrade Nodes Overlapping / Too Close

### Layout Algorithm (`src/ui/UpgradeScreen.ts:332-346`)
```
Position = (CX + cos(branchAngle + angleOffset × BRANCH_SPREAD) × (depth × DEPTH_SPACING),
            CY + sin(branchAngle + angleOffset × BRANCH_SPREAD) × (depth × DEPTH_SPACING))
```

### Key Layout Constants (`UpgradeScreen.ts:84-89`)
| Constant | Value | Purpose |
|---|---|---|
| `DEPTH_SPACING` | `240` | Pixels between depth tiers |
| `NODE_RADIUS` | `32` | Visual/interaction radius |
| `BRANCH_SPREAD` | `0.45` | Angular spread multiplier |

### Branch Angles (`UpgradeTree.ts:824-833`)
| Branch | Angle | Degrees |
|---|---|---|
| dmg | π | 180° |
| guns | 5π/9 | 100° |
| health | 13π/9 | 260° |
| movement | 3π/2 | 270° |
| economy | π/12 | 15° |
| mothership | -π/3 | -60° (= 300°) |

### Overlap Hotspots
1. **health (260°) vs movement (270°)** — only **10° apart**. At depth 2+ (480px+ from center), nodes with opposite angleOffsets could be very close. E.g. `hp_shield` (health, depth 2, offset +0.5) at ~282.5° vs `move_speed` children at ~270° area.

2. **`econ_swarm` has `angleOffset: 4`** — this is an outlier. With `BRANCH_SPREAD = 0.45`, final angle = 15° + 4×0.45 = 15° + 1.8rad ≈ 15° + 103° = 118°. At depth 1 (240px), this places it near the **guns** branch (100°). Likely overlaps with `guns` T1 area.

3. **Shared-branch crowding (health):** The health branch contains BOTH hp_* nodes AND eff_* nodes. At depth 2–3, multiple nodes fan out with small angleOffset differences (±0.35, ±0.5, 0). Six nodes at depths 2–3 on a single branch angle creates dense clustering.

4. **dmg/guns at depth 2:** dmg branch (180°) and guns branch (100°) share `dmg_core` as a requirement — `guns_missile` and `guns_bolt` both require `dmg_core`. But they're on different branch angles so this is a visual tree question. The nodes `dmg_forward` (offset -0.7) pushes toward guns territory.

### Recommended Fixes
**File: `src/ui/UpgradeScreen.ts`**
- Increase `BRANCH_SPREAD` from `0.45` to `0.55` or `0.6` — gives more angular separation between sibling nodes
- Increase `DEPTH_SPACING` from `240` to `280` — more radial breathing room

**File: `src/upgrades/UpgradeTree.ts`**
- Fix `econ_swarm` `angleOffset: 4` — this is way too high. Should be something like `0.7` or `1.0` to place it between economy and an adjacent branch without colliding
- Widen `health` vs `movement` by adjusting `BRANCH_ANGLES`: push `health` to ~240° (from 260°) or `movement` to ~285° 
- Split the health branch: consider moving eff_* nodes to their own branch angle, or give them larger angleOffsets (±0.7 instead of ±0.35)

**Alternative:** Add collision detection in `computeNodePositions()` — after computing all positions, check pairwise distances and nudge overlapping nodes apart.

---

## 4. Make Pulse/Beat Attack More Visually Prominent

### Current Pulse Weapon Mechanics (`src/game/Game.ts`)
- Fires every beat via `onBeat()` callback (100 BPM from AudioManager)
- `CONE_RANGE = 18` — base AoE radius (tiny!)
- `coneFlashTimer = 0.18s` — brief screen flash on fire
- `CONE_FIRE_EVERY = 1` — fires every single beat

### Current Visual Effects on Pulse Fire
1. **PulseShockwave** (expanding ring):
   - Duration: `0.35s`
   - Outer ring: alpha 0.8 → 0, lineWidth 3 → 0, expands to `CONE_RANGE × 3.5` (≈63px)
   - Inner ring: alpha 0.4, half radius
   - Color: `COLORS.player` (#00d4ff cyan)
   - Shadow blur: 10

2. **Particle burst** (on each pulse):
   - 6 particles, random angles
   - Speed: 40–80 px/s
   - Size: 1.5–3px
   - Life: 0.2–0.35s
   - Color: `COLORS.player`

3. **Sacred geometry pulse**: `sacredGeometry.pulse()` on every beat — subtle background animation

### Why It's Not Prominent Enough
- `CONE_RANGE = 18` is very small — visual explosion barely covers the player sprite
- Shockwave maxes at ~63px (CONE_RANGE × 3.5) — still small on 1200×800 canvas
- Only 6 particles with 0.2–0.35s life — blink and miss it
- lineWidth 3 → 0 is thin
- No screen shake on pulse
- No glow/bloom effect beyond shadow blur 10

### Recommended Changes (Keep Cyan Theme Consistent)
**File: `src/utils/Constants.ts`**
- `CONE_RANGE`: `18` → `28` (bigger base AoE, more impactful visual)
- `CONE_FLASH_DURATION`: `0.12` → `0.18` (slightly longer flash)

**File: `src/game/Game.ts` — `fireConeWeapon()`**
- Increase shockwave max radius multiplier: `CONE_RANGE * 3.5` → `CONE_RANGE * 5` (140px visual ring)
- Increase outer ring starting lineWidth: `3` → `5`
- Increase shadow blur: `10` → `20`
- Add initial alpha boost: `0.8` → `1.0`
- Increase particle count: `6` → `12`
- Increase particle speed range: `40–80` → `60–120`
- Increase particle life: `0.2–0.35s` → `0.3–0.5s`
- Increase particle size: `1.5–3` → `2–4`
- Add a subtle screen shake on pulse: `this.renderer.shake(1.5, 0.1)` (tiny, rhythmic shake)
- Add a second, slower-expanding outer ring at lower alpha for "echo" effect

**Color should stay `COLORS.player` (#00d4ff)** — consistent with player theme. Can add slight white inner flash for pop.

---

## 5. Too Many Shooting Enemies at Beginning of Game

### Current Spawn Logic (`src/systems/SpawnSystem.ts:36-104`)

**Enemy Type Selection:**
```
effectiveRound = roundNumber + bossesKilledThisRun
```
- **effectiveRound ≤ 3**: 100% rocks (good — no ships at all)
- **effectiveRound 4+**: Ships phase in. Rock chance = `max(0.3, 0.9 - (effectiveRound - 3) × 0.08)`
- **Shooting ships** gated at: `canShoot = effectiveRound >= 6`
- **Pulse ships** (non-shooting fast chasers): `effectiveRound >= 5 && random < 0.35`

**The Problem:**
- `effectiveRound = roundNumber + bossesKilledThisRun`
- Boss kills accelerate difficulty. If player kills 2 bosses in round 3 → effectiveRound = 5. By round 4, effectiveRound = 6+, enabling shooting enemies.
- Once `effectiveRound >= 6`, ALL non-pulse ships can shoot. There's no gradual introduction — it's a binary flip.
- At effectiveRound 6, rock chance is `0.9 - 3×0.08 = 0.66`, so 34% are ships, and ALL of those ships can shoot.
- This means ~34% of spawns are suddenly shooting enemies — feels overwhelming.

**Spawn Rate Context:**
- Base spawn interval: `SPAWN_RATE_BASE = 4.0s` 
- Ramps down to `SPAWN_RATE_MIN = 1.5s` within a round
- Cross-round multiplier: `(1 - min(0.5, (roundNumber-1) × 0.04))`
- Boss kills also shave `0.3s` off rate per boss

**Enemy Shooting Mechanics (`EnemyShip`):**
- `shouldShoot()` returns true when internal cooldown expires
- Shoots at player (not mothership), bullet speed 200

### Recommended Changes

**File: `src/systems/SpawnSystem.ts`**
1. **Increase shooting gate**: `effectiveRound >= 6` → `effectiveRound >= 8` (shooting ships appear later)
2. **Add gradual shoot chance**: Instead of binary `canShoot`, use probability:
   ```ts
   const shootChance = effectiveRound >= 8 
     ? Math.min(0.8, (effectiveRound - 8) * 0.15) 
     : 0;
   const canShoot = Math.random() < shootChance;
   ```
   This ramps: round 8 = 15%, round 9 = 30%, round 10 = 45%... caps at 80%.
3. **Cap bossesKilledThisRun contribution**: `effectiveRound = round + Math.min(2, bossesKilled)` — prevent boss kills from turbo-accelerating into shooting enemy territory.

**File: `src/utils/Constants.ts`**
4. Consider adding new constants:
   ```ts
   export const SHOOTING_ENEMY_MIN_ROUND = 8;
   export const SHOOTING_ENEMY_RAMP = 0.15; // chance increase per round past gate
   ```

---

## Summary of Files to Modify

| File | Changes |
|---|---|
| `src/utils/Constants.ts` | Fire rate, bullet speed/size, cone range, new shooting enemy constants |
| `src/entities/Bullet.ts` | No changes needed (reads from Constants) |
| `src/game/Game.ts` | Pulse visual effects (shockwave size, particles, screen shake) |
| `src/systems/SpawnSystem.ts` | Shooting enemy gating, gradual ramp, effectiveRound cap |
| `src/upgrades/UpgradeTree.ts` | Fix econ_swarm angleOffset, widen health/movement angles |
| `src/ui/UpgradeScreen.ts` | Increase BRANCH_SPREAD and/or DEPTH_SPACING |
| `src/upgrades/UpgradeManager.ts` | Verify Phase 2 nodes compute stats (audit only) |

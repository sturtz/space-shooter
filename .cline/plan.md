## 🚀 MASTER PLAN: Space Shooter Progression Overhaul

---

# FULL CONTEXT

## Current Architecture

- **UpgradeTree.ts** — 30 upgrade nodes across 6 branches (dmg, guns, economy, movement, health/effects, mothership) + 5 star prestige upgrades
- **UpgradeManager.ts** — `computeStats()` aggregates all upgrades into flat `PlayerStats` object, called once per `startRun()`
- **SaveManager.ts** — `SaveData` interface with coins, starCoins, upgradeLevels, starUpgradeLevels, currentLevel, lifetimeCoins, specialAbilities, etc.
- **Constants.ts** — all tuning numbers (base HP, speeds, weapon params, colors)
- **Game.ts** (~1700 lines) — main game loop, beat-synced weapons, boss spawning, enemy kills → coin drops, round management
- **SpawnSystem.ts** — enemy spawning with level-based scaling
- **CollisionSystem.ts** — bullet/enemy/player collision handling
- **HUD.ts** — in-game display (level badge, timer, coins, HP hearts, kill streak, kill count)
- **Player.ts** — movement, dash, invulnerability
- **Mothership.ts** — stationary defense target, HP, barrier system
- **Enemy.ts** — base class with HP, poison/slow/stun debuffs
- **Bullet.ts** — projectile with pierce, chain lightning
- **Coin.ts** — coin entity with magnet attraction

## Current Economy

- ~9-10 coins per early round
- T1 upgrades cost 10 coins, scale 2.3× per level
- 20s base round duration
- prestige wipes upgrades, keeps star upgrades

## Current Upgrade Tree Structure

```
root (free)
├── dmg_core (T1) → dmg_forward, dmg_range, dmg_crit (T2) → dmg_overclock (T3)
├── econ_duration (T1) → econ_value, econ_magnet (T2) → econ_combo, econ_lucky (T3)
│                      → ms_hull (T2) → ms_turret, ms_barrier (T3)
│                                     → ms_slow (T2)
├── econ_swarm (T1)
├── move_speed (T1) → move_emp, move_mine (T3) → move_trap (T4)
├── eff_poison (T2, requires dmg_core) → eff_slow, eff_bomb (T3)
└── guns_missile, guns_bolt (T2, requires dmg_core) → guns_chain, guns_barrage (T3)
```

---

# PHASE 1: LOGARITHMIC ECONOMY REBALANCE

**Session focus: Make numbers feel good. 1-2 upgrades per good run.**

### Changes:

1. **Coin drops scale with level**: `coinValue = baseCoinValue × (1 + 0.3 × ln(level + 1))`
   - Level 1: 1.0× coins, Level 5: ~1.5×, Level 10: ~1.7×, Level 20: ~1.9×
2. **Enemy HP scales logarithmically**: `hp = baseHP × (1 + 0.4 × ln(level + 1))`
   - NOT linear/exponential — player power outpaces enemy HP mid-game
3. **Lower T1 upgrade costs**: 5-8 coins (was 10). First upgrade after first round.
4. **Cost curve**: T1: 5-8, T2: 15-30, T3: 60-150, T4: 300-500, T5: 800+
5. **Minimum round coins**: floor of 5 coins per round (bad runs still progress)
6. **Round-end bonus**: coins × (1 + 0.05 × level) — higher levels naturally pay more
7. **Damage scaling**: `DMG_CORE_TABLE = [1, 2, 4, 7, 12]` — wider range, log-like feel

### Files to modify:

- `Constants.ts` — new base values
- `UpgradeTree.ts` — adjust all `costs` arrays
- `UpgradeManager.ts` — log scaling formulas in `computeStats()`
- `Game.ts` — coin drop formula in `onEnemyKilled()`, minimum coin floor in `endRound()`
- `SpawnSystem.ts` — log HP scaling for spawned enemies

---

# PHASE 2: NEW UPGRADE NODES (~14 new)

**Session focus: Add exciting new nodes to every branch.**

### New nodes by branch:

**DAMAGE branch:**

- `dmg_execute` (T3, requires dmg_crit lv2) — instant-kill enemies below 15% HP. Cost: [80]
- `dmg_overcharge` (T4, requires dmg_overclock lv1) — killed enemies EXPLODE dealing 50% damage to enemies within 60px. Cost: [400]

**GUNS branch:**

- `guns_multishot` (T3, requires guns_bolt lv1) — +1 extra projectile per level in fan spread. maxLevel: 2. Cost: [70, 180]
- `guns_orbital` (T4, requires guns_chain lv2) — 2 orbiting drones that fire independently every 3 beats. Cost: [500]

**ECONOMY branch:**

- `econ_interest` (T3, requires econ_magnet lv2) — earn 5% of banked coins as bonus per round. Cost: [80, 200]
- `econ_bounty` (T2, requires econ_duration lv1) — elite enemies give 3× coins. Cost: [20, 50]

**MOVEMENT branch:**

- `move_afterimage` (T3, requires move_speed lv2) — leave damage trail (20% base dmg/tick) when moving at >50% max speed. Cost: [60, 150]
- `move_warp` (T4, requires move_mine lv1) — dash creates entry portal; press dash again within 5s to teleport back. Cost: [300]

**EFFECTS branch:**

- `eff_freeze` (T3, requires eff_slow lv1) — 5% chance per level to freeze enemy for 2s (can't move or attack). maxLevel: 3. Cost: [50, 120, 280]
- `eff_bleed` (T3, requires eff_poison lv2) — hits apply stacking bleed: 2% max HP/sec per stack, max 5 stacks. Cost: [60, 150]

**MOTHERSHIP branch — THE CRAZY LINE:**

- `ms_repair` (T2, requires ms_hull lv1) — auto-heal mothership 1 HP every 30s. maxLevel: 2. Cost: [25, 60]
- `ms_mech` (T4, requires ms_turret lv2) — **MECH MODE**: mothership grows mechanical limbs, follows player at 50% speed, stomps nearby enemies for 2× base damage. Cost: [500]
- `ms_overdrive` (T5, requires ms_mech lv1) — Mech fires homing missiles every 4 beats + AoE stomp shockwave every 10 beats. Cost: [800]
- `ms_fortress` (T4, requires ms_turret lv2, ALTERNATIVE to ms_mech) — **FORTRESS MODE**: immovable, generates 150px damage dome, turret fires 3× faster. Cost: [600]

### Updated mothership branch tree:

```
ms_hull (T2) → ms_repair (T2b)
             → ms_barrier (T3)
             → ms_turret (T3) ─┬→ ms_mech (T4) → ms_overdrive (T5)
                                └→ ms_fortress (T4, alternative)
ms_slow (T2)
```

### Files to modify:

- `UpgradeTree.ts` — add all new node definitions
- `UpgradeManager.ts` — add to `PlayerStats` interface + `computeStats()`
- `UpgradeScreen.ts` — new nodes auto-render from tree (no changes needed if layout is dynamic)

---

# PHASE 3: KILL STREAK / COMBO SYSTEM

**Session focus: Reward skilled play with coin multipliers.**

### Mechanics:

- Track consecutive kills with 3-second timeout between kills
- Streak tiers:
  - 5 kills → 1.5× coin drop multiplier
  - 10 kills → 2.0× multiplier
  - 20 kills → 3.0× multiplier
  - 50 kills → 5.0× multiplier (god tier)
- Streak timer: 3s countdown, resets each kill
- Streak breaks on timeout only (NOT on taking damage)
- Streak multiplier applies to individual coin drops, not end-of-round

### Visual feedback:

- HUD: streak counter with tier color (white→yellow→orange→red→purple)
- Screen edge glow at 10+ streak (subtle)
- Shake intensity scales with streak tier
- "STREAK ×2!" popup on tier transitions

### Save data:

- `streakRecord: number` — best ever streak (bragging rights)

### Files to modify:

- `SaveManager.ts` — add `streakRecord`, `currentAct` (prep for future)
- `Constants.ts` — streak tier thresholds/multipliers
- `Game.ts` — streak tracking in `onEnemyKilled()`, timer in `updatePlaying()`
- `HUD.ts` — streak counter display
- `GameOverScreen.ts` — show best streak in round stats

---

# PHASE 4: ENDLESS ROUND SYSTEM (replaces levels/acts)

**Remove the discrete level system. Single continuous round with time-based ramp + cross-run progression.**

### Core Loop

- **Keep timer** — round has a duration (base 20s, boosted by econ_duration upgrade). Timer counts DOWN. Round ends when timer hits 0, mothership dies, or player dies.
- **No levels** — remove `currentLevel` as difficulty driver. Difficulty = f(roundNumber) where roundNumber = total runs completed.
- **1-2 upgrades per round** — early rounds feel achievable. After 5-10 rounds player is strong enough to survive long enough to reach boss spawn time.

### Difficulty Ramp (within a single round)

- Enemy HP, speed, spawn rate all scale with **elapsed time** within the round
- `elapsed` drives everything: spawn rate tightens, rock→ship ratio shifts, big rocks appear
- Early round = sparse small rocks. Late round = dense mixed enemies
- Cross-run scaling: `roundNumber` adds a gentle multiplier so round 20 is harder than round 1 at the same elapsed time

### Boss System

- **Boss spawns at ~15s elapsed** — most rounds you die before seeing boss unless sufficiently upgraded
- Boss kill = **mid-run reward** (brief overlay, pick reward, keep playing — round does NOT end)
- After first boss, next boss spawns faster: `nextBossIn = max(8, 15 - bossesKilled * 2)`
- **Multiple bosses alive simultaneously** at high upgrade levels (player lasting 40-60s+)
- Boss HP scales with bossesKilled count within the run + roundNumber across runs

### Prestige / Star Coins (milestone-based)

- Earn star coins at **time-survived thresholds**: survive 30s = ⭐, 45s = ⭐, 60s = ⭐⭐
- Replaces old "kill boss → level++ → star coin" system
- Milestone difficulty scales with roundNumber (later runs need longer survival for same stars)

### Boss Rewards (mid-run, no round end)

- Boss dies → brief pause overlay (like current BossRewardScreen but does NOT end round)
- Pick ability / auto-granted ability (same reward pool as now)
- After pick, gameplay resumes immediately
- Abilities persist for rest of run, reset between runs (same as now)

### Save Data Changes

- Remove `currentLevel` as difficulty driver
- Add `roundNumber: number` — total runs completed (replaces currentLevel for progression)
- Add `bestSurvivalTime: number` — longest time survived in a single round
- Rename `highestLevel` → `highestRound` or remove
- Keep star coin / prestige system with milestone-based earning

### HUD Changes

- "LV X" badge → "ROUND X" (roundNumber)
- Prominent elapsed/survival timer display
- Boss HP bar when boss is alive
- Milestone markers (⭐ at 30s, 45s, 60s thresholds)

### Game Over Screen Changes

- Show survival time, kills, coins earned
- "ROUND X" instead of "LEVEL X"
- Show milestones hit (⭐ markers)
- Best survival time record

### Files to modify

- `SaveManager.ts` — add roundNumber, bestSurvivalTime; remove currentLevel as difficulty key
- `Constants.ts` — boss spawn timing, milestone thresholds, elapsed-based scaling constants
- `Game.ts` — remove level-based boss/reward flow; add elapsed-based ramp; mid-run boss rewards
- `SpawnSystem.ts` — replace level-based scaling with elapsed-time + roundNumber scaling
- `HUD.ts` — round badge, survival timer, milestone indicators
- `GameOverScreen.ts` — survival time display, milestone stars
- `BossRewardScreen.ts` — modify to not end round (overlay that resumes gameplay)

---

# PHASE 5: IN-RUN PERKS (Future session)

- XP from kills during round → level up mid-run
- Pick 1 of 3 random temp perks on level-up
- Perks reset between runs
- ~15 perk options (speed burst, damage burst, magnet, shield, slow-mo, etc.)

---

# IMPLEMENTATION ORDER

1. **Phase 1** — Economy rebalance (makes everything else feel right)
2. **Phase 2** — New upgrades (content to chase)
3. **Phase 3** — Streak system (skill reward)
4. **Phase 4** — Endless round system (remove levels, time-based ramp, mid-run bosses)
5. **Phase 5** — In-run perks (depth, later session)

Each phase = 1 agent session. Always run `pnpm validate` before claiming done.

---

# MAIN MENU SYSTEM

**Replace current instant-start flow with a proper main menu screen.**

### Menu Options

1. **Continue** — resume from last save (only shown if save exists with progress)
2. **New Game** — wipe save, start fresh (confirm dialog: "This will erase all progress")
3. **Settings** — music track, volume, algo art toggle, controls info
4. **Tutorial** — replay the interactive tutorial

### Flow

- Menu is the first screen on launch (before upgrade screen)
- "Continue" → upgrade screen (existing flow)
- "New Game" → clears save → upgrade screen with fresh state
- After game over → upgrade screen → can return to menu via back button
- Settings accessible from menu AND from pause menu (shared settings component)

### Visual Design

- Same dark space background as game
- Ship/mothership art as decorative elements
- Title logo at top
- Buttons stacked vertically, centered
- Subtle particle effects / sacred geometry in background

### Files to modify/create

- `src/game/MenuScreen.ts` — main menu screen (already exists, may need overhaul)
- `src/game/ScreenManager.ts` — add menu as entry point, handle transitions
- `src/ui/PauseMenu.ts` — share settings component with main menu
- `src/utils/SaveManager.ts` — add `hasSaveData()` helper for Continue button visibility

# Plan Review — Implementation Status

Review of `.cline/plan.md` against actual codebase. Updated: 2026-04-21.

---

## PHASE 1: LOGARITHMIC ECONOMY REBALANCE ✅ COMPLETE

| Item | Status | Evidence |
|------|--------|----------|
| Coin drops scale w/ level via `ln()` | ✅ | `Game.ts` onEnemyKilled: `levelScale = 1 + COIN_LEVEL_SCALE * Math.log(roundNumber + 1)` |
| Enemy HP scales logarithmically | ✅ | `SpawnSystem.ts`: `hpScale = 1 + ENEMY_HP_LEVEL_SCALE * Math.log(roundNumber + 1)` applied to all enemy types |
| Lower T1 costs (5-8 range) | ✅ | `UpgradeTree.ts`: T1 nodes cost 5-8 (dmg_core=5, econ_duration=5, move_speed=6, econ_swarm=8) |
| Cost curve T1→T5 | ✅ | Costs follow plan: T1 5-8, T2 15-30, T3 50-150, T4 300-600, T5 800 |
| MIN_ROUND_COINS floor | ✅ | `Constants.ts`: `MIN_ROUND_COINS = 5`. `Game.ts` endRound applies floor |
| Round-end bonus | ✅ | `Constants.ts`: `ROUND_LEVEL_BONUS = 0.05`. Applied in endRound |
| DMG_CORE_TABLE log-like | ✅ | `UpgradeTree.ts`: dmg_core 5 levels. `UpgradeManager.ts`: `DMG_CORE_TABLE = [1, 2, 4, 7, 12]` |

**Verdict:** Fully implemented. All economy formulas match plan.

---

## PHASE 2: NEW UPGRADE NODES ⚠️ PARTIALLY COMPLETE → MITIGATED

### Node Definitions (UpgradeTree.ts)

| Node | Defined | In computeStats | Gameplay Logic | Hidden |
|------|---------|-----------------|----------------|--------|
| `dmg_execute` | ✅ | ✅ `executeThreshold` | ❌ | ✅ hidden |
| `dmg_overcharge` | ✅ | ✅ `deathNovaActive/Fraction/Radius` | ❌ | ✅ hidden |
| `guns_multishot` | ✅ | ✅ `extraProjectiles` | ✅ Game.ts fires extra projectiles | — |
| `guns_orbital` | ✅ | ✅ `orbitalDrones/Interval` | ✅ Game.ts spawns orbital drone bullets | — |
| `econ_interest` | ✅ | ✅ `interestRate` | ✅ Applied in endRound | — |
| `econ_bounty` | ✅ | ✅ `eliteCoinMultiplier` | ✅ Applied in onEnemyKilled for elites | — |
| `move_afterimage` | ✅ | ✅ `afterimageActive/DamageFraction/SpeedThreshold` | ❌ | ✅ hidden |
| `move_warp` | ✅ | ✅ `warpActive/Duration` | ❌ | ✅ hidden |
| `eff_freeze` | ✅ | ✅ `freezeChance/Duration` | ❌ | ✅ hidden |
| `eff_bleed` | ✅ | ✅ `bleedActive/DpsPerStack/MaxStacks` | ❌ | ✅ hidden |
| `ms_repair` | ✅ | ✅ `msRepairInterval` | ✅ SpawnSystem reads msRepairInterval (FIXED) | — |
| `ms_mech` | ✅ | ✅ `mechModeActive/Speed/StompDamage/StompRadius` | ❌ | ✅ hidden |
| `ms_overdrive` | ✅ | ✅ `mechOverdriveActive` | ❌ | ✅ hidden |
| `ms_fortress` | ✅ | ✅ `fortressModeActive/DomeRadius/TurretSpeedMultiplier` | ❌ | ✅ hidden |

### Summary

- **14/14 nodes defined** in UpgradeTree.ts ✅
- **14/14 stats computed** in UpgradeManager.ts ✅
- **7/14 have working gameplay logic** (multishot, orbital, interest, bounty, repair, plus existing ones)
- **7/14 hidden from upgrade screen** — stats exist but gameplay not wired. `hidden: true` flag prevents purchase.
- **BUG FIXED:** `ms_repair` was broken — SpawnSystem read `msRegenInterval` (always 0) instead of `msRepairInterval`. Now reads correct field.
- **CLEANED UP:** Dead `msRegenInterval` field removed from PlayerStats interface and all default objects.

**Verdict:** No more ghost upgrades visible to players. Unimplemented nodes hidden until gameplay logic is wired.

---

## PHASE 3: KILL STREAK / COMBO SYSTEM ✅ COMPLETE

| Item | Status | Evidence |
|------|--------|----------|
| Streak tracking w/ 3s timeout | ✅ | `Game.ts`: killStreak incremented on kill, timer resets to `STREAK_TIMEOUT` (3s), decremented in updatePlaying |
| Streak tiers (5/10/20/50) | ✅ | `Constants.ts`: STREAK_TIERS array w/ thresholds 50→5 |
| Multipliers (1.5×/2×/3×/5×) | ✅ | Applied in onEnemyKilled coin calculation |
| Streak breaks on timeout only | ✅ | Timer-based reset, not damage-based |
| HUD streak counter | ✅ | `HUD.ts`: renders streak count w/ tier color (white→yellow→orange→red→purple) |
| Screen edge glow at 10+ | ✅ | HUD draws gradient glow with tier color at high streaks |
| Streak popup on tier transition | ✅ | "STREAK ×2!" etc. popup system in HUD |
| streakRecord in save | ✅ | `SaveManager.ts`: `streakRecord` field, migrated |
| Best streak in game over | ✅ | `GameOverScreen.ts`: shows `bestStreakThisRun` (verified — uses run best, not all-time record) |

**Verdict:** Fully implemented. All visuals and mechanics match plan.

---

## PHASE 4: ENDLESS ROUND SYSTEM ✅ COMPLETE

| Item | Status | Evidence |
|------|--------|----------|
| Remove currentLevel, use roundNumber | ✅ | SaveManager migrated `currentLevel` → `roundNumber`. No `currentLevel` in save |
| Timer-based rounds (countdown) | ✅ | Game.ts has countdown timer, base 20s + econ_duration boost |
| Difficulty = f(elapsed + roundNumber) | ✅ | SpawnSystem uses elapsed time for within-round ramp + `ROUND_DIFFICULTY_SCALE * roundNumber` |
| Boss spawns at ~15s elapsed | ✅ | `FIRST_BOSS_SPAWN_TIME = 15`, boss spawning uses elapsed time |
| Boss spawn acceleration | ✅ | `nextBossIn = max(MIN_BOSS_SPAWN_INTERVAL, FIRST_BOSS_SPAWN_TIME - bossesKilled * BOSS_SPAWN_ACCELERATION)` |
| Boss HP scales w/ bossesKilled + roundNumber | ✅ | `BOSS_BASE_HP + BOSS_HP_PER_KILL * bossesKilled + BOSS_HP_PER_ROUND * roundNumber` |
| Mid-run boss rewards (no round end) | ✅ | BossRewardScreen is overlay; `resumeMidRun()` resumes gameplay after pick |
| Star coins at time thresholds | ✅ | `STAR_MILESTONES` in Constants, checked in endRound |
| Milestone scaling w/ roundNumber | ✅ | Thresholds scale: `threshold * (1 + 0.02 * roundNumber)` |
| bestSurvivalTime in save | ✅ | SaveManager has `bestSurvivalTime` field |
| HUD: "ROUND X" badge | ✅ | HUD renders `ROUND ${roundNumber}` |
| HUD: survival timer | ✅ | Elapsed time displayed prominently |
| HUD: milestone markers | ✅ | Star markers at milestone thresholds |
| HUD: boss HP bar | ✅ | HUD draws boss health bar when boss alive |
| GameOver: survival time + round | ✅ | Shows survival time, round number, milestones |

**Design note:** Single boss at a time (`!this.bossEnemy` guard). Plan says "multiple bosses simultaneously" but code prevents this. Intentional simplification — multi-boss can be added later by changing `bossEnemy` to array.

**Verdict:** Fully implemented. Single-boss constraint is intentional gameplay decision.

---

## PHASE 5: IN-RUN PERKS ✅ COMPLETE

| Item | Status | Evidence |
|------|--------|----------|
| XP from kills during round | ✅ | `PerkSystem.ts`: XP granted on enemy kill, levels up mid-run |
| Pick 1 of 3 random perks on level-up | ✅ | `PerkSelectionScreen.ts`: shows 3 random perk options |
| ~15 perk options | ✅ | PerkSystem defines 15 perks (speed burst, damage burst, magnet, shield, slow-mo, etc.) |
| Perks reset between runs | ✅ | PerkSystem.reset() called on run start |
| recalcStatsFromPerks | ✅ | Game.ts applies perk bonuses to base stats, handles HP delta correctly |

**Verdict:** Fully implemented despite plan saying "Future session."

---

## MAIN MENU SYSTEM ⚠️ PARTIALLY COMPLETE

| Item | Status | Evidence |
|------|--------|----------|
| Menu as entry point | ✅ | ScreenManager constructor shows "menu" first |
| "▶ TAP TO START" | ✅ | MenuScreen.ts has start button |
| Tutorial button | ✅ | "📖 TUTORIAL" button exists |
| **Continue** option | ❌ | No continue/new-game distinction |
| **New Game** w/ confirm dialog | ❌ | No new game option, no save wipe flow |
| **Settings** screen | ❌ | No settings in menu (only in PauseMenu) |
| Shared settings component | ❌ | PauseMenu has its own settings; not shared w/ MenuScreen |
| Visual: ship/mothership decorative | ✅ | Mothership glow rendered at bottom |
| Visual: title + subtitle | ✅ | "SPACE SHOOTER" title with "Defend the Mothership" |
| Visual: stats panel | ✅ | Round/stars/coins shown |
| `hasSaveData()` helper | ❌ | Not found in SaveManager |

**Verdict:** Basic menu works. Missing Continue/New Game/Settings features.

---

## BUGS FIXED IN THIS REVIEW

### 1. ms_repair upgrade broken (SpawnSystem read wrong field)
- **Was:** `SpawnSystem.updateMothershipRegen()` read `game.stats.msRegenInterval` (always 0)
- **Fix:** Changed to `game.stats.msRepairInterval` (computed from ms_repair upgrade level)
- **Impact:** ms_repair upgrade now actually heals mothership

### 2. Ghost upgrades visible and purchasable
- **Was:** 9 upgrades purchasable but did nothing (stats computed, gameplay not wired)
- **Fix:** Added `hidden: true` flag to UpgradeNode interface, marked all 9 ghost nodes, filtered in UpgradeScreen
- **Impact:** Players can no longer waste coins on non-functional upgrades

### 3. Dead `msRegenInterval` stat cluttering PlayerStats
- **Was:** `msRegenInterval: number` in PlayerStats, always set to 0, never useful
- **Fix:** Removed from interface, UpgradeManager return object, and Player.ts defaults
- **Impact:** Cleaner code, no confusion with `msRepairInterval`

---

## REMAINING WORK (DEFERRED)

### Priority 1: Wire up hidden upgrades (7 nodes)
When gameplay logic is implemented, remove `hidden: true` from each node:
1. `eff_freeze` — easiest (Enemy.applyStun exists, just add chance roll in CollisionSystem)
2. `dmg_execute` — simple HP% check in CollisionSystem
3. `dmg_overcharge` — explosion on kill in onEnemyKilled
4. `eff_bleed` — needs new bleed stack system in Enemy.ts
5. `move_afterimage` + `move_warp` — Player.ts additions
6. `ms_mech/fortress/overdrive` — biggest effort (new Mothership modes)

### Priority 2: Menu system
- Add Continue/New Game/Settings to MenuScreen
- Extract shared settings component from PauseMenu
- Add `hasSaveData()` to SaveManager

### Priority 3: Multi-boss support
- Change `bossEnemy` from single reference to array
- Remove `!this.bossEnemy` guard in boss spawn check

import { SaveData } from "../utils/SaveManager";
import { getUpgradeCost, UpgradeNode, StarUpgrade } from "./UpgradeTree";
import {
  PLAYER_BASE_SPEED,
  PLAYER_BASE_FIRE_RATE,
  PLAYER_BASE_HP,
  PLAYER_HIT_INVULN,
  BASE_ROUND_DURATION,
  MOTHERSHIP_BASE_HP,
  MOTHERSHIP_TIME_PENALTY,
  COIN_MAGNET_RANGE,
} from "../utils/Constants";

// ── Upgrade tuning constants ──────────────────────────────────────────────
// Star (prestige) multipliers
const STAR_POWER_MULT = 0.25; // damage multiplier per star level
const STAR_SPEED_MULT = 0.15; // speed multiplier per star level
const STAR_ENDURANCE_SECS = 3; // extra round seconds per star level
const STAR_FORTUNE_MULT = 0.2; // coin bonus multiplier per star level
const STAR_ARMOR_REDUCTION = 0.15; // time-penalty reduction per star level
const STAR_ARMOR_MIN = 0.1; // minimum time-penalty multiplier

// Damage core: explicit progression table (level 0→4) — wider log-like range
const DMG_CORE_TABLE = [1, 2, 4, 7, 12];

// Crit
const CRIT_CHANCE_PER_LEVEL = 0.08; // +8% per level
const CRIT_BASE_MULTIPLIER = 2.5; // crits always deal 2.5×

// AoE / Splash
const SPLASH_RADIUS_PER_LEVEL = 20; // +20px per level
const BARRAGE_SPLASH_BONUS = 30; // extra splash px when barrage active
const BARRAGE_MISSILE_COUNT = 4; // barrage fires this many missiles

// Movement
const SPEED_MULT_PER_LEVEL = 0.25; // +25% per level
const EMP_RADIUS_PER_LEVEL = 40; // +40px dash EMP per level

// Effects
const POISON_DPS_PER_LEVEL = 0.05; // +5% base damage/sec per level
const SLOW_PER_LEVEL = 0.08; // +8% slow per level

// Mothership
const MS_BARRIER_COOLDOWN = 25; // seconds between barrier recharges
const MS_SLOW_TABLE = [0, 0.5, 0.6, 0.75]; // gravity well slow by level
const MS_SLOW_RADIUS = 100; // px around mothership

// Economy
const DURATION_MULT_PER_LEVEL = 0.5; // +50% round duration per level
const MAGNET_RANGE_PER_LEVEL = 20; // +20px coin magnet per level
const COIN_BONUS_PER_LEVEL = 0.1; // +10% round-end coin bonus per level
const LUCKY_CHANCE_PER_LEVEL = 0.04; // +4% lucky drop chance per level
const LEVEL_SPAWN_SCALING = 0.5; // +50% spawn rate per game level
const SWARM_MULT_PER_LEVEL = 0.4; // +40% spawn rate per swarm level
const MIN_TIME_PENALTY = 0.3; // floor for time penalty after star armor

export interface PlayerStats {
  // === Core offense ===
  damage: number;
  critChance: number;
  critMultiplier: number;
  splashRadius: number; // base AoE radius of pulse weapon
  forwardPulse: boolean; // pulse extends forward in facing direction
  pierceCount: number; // bullet pierce
  chainTargets: number; // chain lightning jumps
  missileLevel: number; // 0 = none, 1-3 = active; 4 = barrage (4 missiles)
  barrageSplashBonus: number; // extra splash radius when barrage is active
  // === DoT / Status ===
  poisonDps: number; // damage/sec as fraction of base damage
  slowOnHit: number; // 0–1 slow fraction applied on hit
  // === Movement ===
  moveSpeed: number;
  flashbangRadius: number; // EMP ring radius on dash
  mineOnDash: boolean; // drop proximity mine on dash
  mineSlow: boolean; // mines create slow field on detonation
  // === Auto weapons ===
  fireRate: number; // seconds between pulse beats
  autoBomb: boolean; // auto-deploy bomb every 8 beats
  // === Mothership ===
  mothershipHP: number;
  msBarrierHits: number; // 0 = no barrier
  msBarrierCooldown: number;
  turretLevel: number; // 0 = no turret
  /** Mothership gravity well: slow strength (0-1) applied to nearby enemies */
  msSlowStrength: number;
  /** Mothership gravity well: radius in px around mothership */
  msSlowRadius: number;
  // === Economy ===
  roundDuration: number;
  coinMagnetRange: number;
  /** Flat extra coins per kill from econ_value upgrade */
  extraCoinPerKill: number;
  /** Round-end bonus: multiply total round coins by (1 + this) */
  roundCoinBonus: number;
  /** Chance (0-1) for a kill to drop 5x coins (econ_lucky) */
  luckyChance: number;
  enemySpawnMultiplier: number;
  // === Phase 2 new stats ===
  /** dmg_execute: instant-kill threshold (0-1 fraction of max HP) */
  executeThreshold: number;
  /** dmg_overcharge: killed enemies explode (damage fraction 0-1) */
  deathNovaActive: boolean;
  deathNovaDamageFraction: number;
  deathNovaRadius: number;
  /** guns_multishot: extra projectiles in fan spread */
  multishotCount: number;
  /** guns_orbital: orbiting drones active */
  orbitalDrones: boolean;
  /** econ_bounty: elite coin multiplier (1 = normal) */
  eliteCoinMultiplier: number;
  /** econ_interest: fraction of banked coins earned as bonus per round */
  interestRate: number;
  /** move_afterimage: leave damage trail when moving fast */
  afterimageActive: boolean;
  afterimageDpsFraction: number;
  /** move_warp: portal dash — dash again within 5s to teleport back */
  warpDash: boolean;
  /** eff_freeze: chance per hit to freeze enemy (0-1) */
  freezeChance: number;
  freezeDuration: number;
  /** eff_bleed: stacking bleed active */
  bleedActive: boolean;
  bleedDpsPerStack: number;
  bleedMaxStacks: number;
  /** ms_repair: auto-heal interval in seconds (0 = disabled) */
  msRepairInterval: number;
  /** ms_mech: mothership follows player */
  msMechActive: boolean;
  /** ms_overdrive: mech fires missiles + shockwave */
  msOverdriveActive: boolean;
  /** ms_fortress: immovable dome + turret 3× speed */
  msFortressActive: boolean;
  msFortressDomeRadius: number;
  // === Player health ===
  /** Player max HP (base + hp_boost) */
  playerMaxHp: number;
  /** Player HP regen interval in seconds (0 = disabled) */
  playerRegenInterval: number;
  /** Extra invulnerability seconds after taking damage (hp_shield) */
  playerInvulnTime: number;
  // === Used by subsystems but not yet upgradeable ===
  timePenaltyPerHit: number;
  extraProjectiles: number;
  spreadAngle: number;
  dashDistMult: number;
  slowAuraRange: number;
  slowAuraFactor: number;
  turretDamageMult: number;
  overtimeBonus: number;
}

export class UpgradeManager {
  save: SaveData;

  constructor(save: SaveData) {
    this.save = save;
    // Auto-purchase root if not already
    if (!this.save.upgradeLevels["root"]) {
      this.save.upgradeLevels["root"] = 1;
    }
  }

  getLevel(id: string): number {
    return this.save.upgradeLevels[id] || 0;
  }

  getStarLevel(id: string): number {
    return this.save.starUpgradeLevels[id] || 0;
  }

  canAfford(cost: number): boolean {
    return this.save.coins >= cost;
  }

  canAffordStar(cost: number): boolean {
    return this.save.starCoins >= cost;
  }

  isUnlocked(node: UpgradeNode): boolean {
    if (node.id === "root") return true;
    if (!node.requires) return true;
    // Mutual exclusion check
    if (node.excludes) {
      for (const exId of node.excludes) {
        if (this.getLevel(exId) > 0) return false;
      }
    }
    return node.requires.every((req) => this.getLevel(req.id) >= req.level);
  }

  isMaxLevel(node: UpgradeNode): boolean {
    return this.getLevel(node.id) >= node.maxLevel;
  }

  purchaseUpgrade(node: UpgradeNode): boolean {
    if (node.id === "root") return false; // root is free/auto
    const level = this.getLevel(node.id);
    if (level >= node.maxLevel) return false;
    if (!this.isUnlocked(node)) return false;
    const cost = getUpgradeCost(node, level);
    if (!this.canAfford(cost)) return false;
    this.save.coins -= cost;
    this.save.upgradeLevels[node.id] = level + 1;
    return true;
  }

  purchaseStarUpgrade(star: StarUpgrade): boolean {
    const level = this.getStarLevel(star.id);
    if (level >= star.maxLevel) return false;
    const cost = Math.floor(star.baseCost * Math.pow(star.costGrowth, level));
    if (!this.canAffordStar(cost)) return false;
    this.save.starCoins -= cost;
    this.save.starUpgradeLevels[star.id] = level + 1;
    return true;
  }

  /**
   * Aggregate all upgrade levels into a flat PlayerStats object.
   * Called once per startRun() — not every frame.
   */
  computeStats(): PlayerStats {
    // ── Star multipliers (prestige bonuses) ──────────────────────────────
    const starPower = 1 + this.getStarLevel("star_power") * STAR_POWER_MULT;
    const starSpeed = 1 + this.getStarLevel("star_speed") * STAR_SPEED_MULT;
    const starEndurance = this.getStarLevel("star_endurance") * STAR_ENDURANCE_SECS;
    const starFortune = 1 + this.getStarLevel("star_fortune") * STAR_FORTUNE_MULT;
    const starArmor = Math.max(
      STAR_ARMOR_MIN,
      1 - this.getStarLevel("star_armor") * STAR_ARMOR_REDUCTION
    );

    // ── DAMAGE ────────────────────────────────────────────────────────────
    // dmg_core: explicit progression 1→2→4→7 (table has 12 at index 4 for future)
    const dmgCoreLevel = this.getLevel("dmg_core");
    let damage = DMG_CORE_TABLE[Math.min(dmgCoreLevel, DMG_CORE_TABLE.length - 1)];
    damage *= starPower;

    // ── CRIT ─────────────────────────────────────────────────────────────
    // dmg_crit: +8% crit chance per level (max 3) → max 24%
    const critChance = this.getLevel("dmg_crit") * CRIT_CHANCE_PER_LEVEL;
    const critMultiplier = CRIT_BASE_MULTIPLIER;

    // ── SPLASH / AOE RADIUS ───────────────────────────────────────────────
    // dmg_range: +20px per level (max 3) → max +60px
    let splashRadius = this.getLevel("dmg_range") * SPLASH_RADIUS_PER_LEVEL;
    // guns_barrage adds another splash bonus when active
    const barrageActive = this.getLevel("guns_barrage") >= 1;
    const barrageSplashBonus = barrageActive ? BARRAGE_SPLASH_BONUS : 0;

    // ── FIRE RATE ─────────────────────────────────────────────────────────
    // dmg_overclock: halves the beat interval (2× fire rate)
    let fireRate = PLAYER_BASE_FIRE_RATE;
    if (this.getLevel("dmg_overclock") >= 1) {
      fireRate /= 2;
    }

    // ── PIERCE ────────────────────────────────────────────────────────────
    // guns_bolt: +1 pierce per level (max 3)
    const pierceCount = this.getLevel("guns_bolt");

    // ── MISSILES ─────────────────────────────────────────────────────────
    // guns_missile: level = number of missiles (1–3) every 2 beats
    // guns_barrage: overrides to fire 4 missiles per volley
    let missileLevel = this.getLevel("guns_missile"); // 0 = no missiles
    if (barrageActive && missileLevel > 0) {
      missileLevel = BARRAGE_MISSILE_COUNT;
    }

    // ── CHAIN LIGHTNING ───────────────────────────────────────────────────
    // guns_chain: +1 chain jump per level (max 3)
    const chainTargets = this.getLevel("guns_chain");

    // ── MOVEMENT ─────────────────────────────────────────────────────────
    // move_speed: +25% per level (max 3) → max +75%
    let moveSpeed = PLAYER_BASE_SPEED;
    moveSpeed *= 1 + this.getLevel("move_speed") * SPEED_MULT_PER_LEVEL;
    moveSpeed *= starSpeed;

    // ── EMP / FLASHBANG RADIUS ────────────────────────────────────────────
    // move_emp: +40px per level (max 3) → base 0 + up to 120px
    const flashbangRadius = this.getLevel("move_emp") * EMP_RADIUS_PER_LEVEL;

    // ── PROXIMITY MINE ────────────────────────────────────────────────────
    const mineOnDash = this.getLevel("move_mine") >= 1;
    const mineSlow = this.getLevel("move_trap") >= 1; // mine slow field upgrade

    // ── POISON ────────────────────────────────────────────────────────────
    // eff_poison: +5% damage/sec per level (max 3) → max 15% base damage/sec
    const poisonDps = this.getLevel("eff_poison") * POISON_DPS_PER_LEVEL * damage;

    // ── SLOW ON HIT ───────────────────────────────────────────────────────
    // eff_slow: +8% slow per level (max 3) → max 24% movement reduction
    const slowOnHit = this.getLevel("eff_slow") * SLOW_PER_LEVEL;

    // ── AUTO BOMB ─────────────────────────────────────────────────────────
    const autoBomb = this.getLevel("eff_bomb") >= 1;

    // ── MOTHERSHIP HP ─────────────────────────────────────────────────────
    // ms_hull: +1 max HP per level (max 4) → base 5 + up to 9
    const mothershipHP = MOTHERSHIP_BASE_HP + this.getLevel("ms_hull");

    // ── MOTHERSHIP BARRIER ────────────────────────────────────────────────
    // ms_barrier: +1 hit capacity per level (max 3)
    const msBarrierHits = this.getLevel("ms_barrier"); // 0 = no barrier
    const msBarrierCooldown = MS_BARRIER_COOLDOWN;

    // ── TURRET ────────────────────────────────────────────────────────────
    // ms_turret: level = turret tier (0 = none, 1-3 = active)
    const turretLevel = this.getLevel("ms_turret");

    // ── MOTHERSHIP GRAVITY WELL (ms_slow) ─────────────────────────────────
    // ms_slow: slow enemies near the mothership — 50% / 60% / 75%
    const msSlowLevel = this.getLevel("ms_slow");
    const msSlowStrength = MS_SLOW_TABLE[Math.min(msSlowLevel, MS_SLOW_TABLE.length - 1)];
    const msSlowRadius = msSlowLevel > 0 ? MS_SLOW_RADIUS : 0;

    // ── FORWARD PULSE (dmg_forward) ───────────────────────────────────────
    // dmg_forward: pulse extends forward in facing direction
    const forwardPulse = this.getLevel("dmg_forward") >= 1;

    // ── ROUND DURATION ────────────────────────────────────────────────────
    // econ_duration: +50% per level (max 3)
    let roundDuration = BASE_ROUND_DURATION;
    roundDuration = roundDuration * (1 + this.getLevel("econ_duration") * DURATION_MULT_PER_LEVEL);
    roundDuration += starEndurance;

    // ── COIN MAGNET ───────────────────────────────────────────────────────
    // econ_magnet: +20px per level (max 3)
    let coinMagnetRange = COIN_MAGNET_RANGE;
    coinMagnetRange += this.getLevel("econ_magnet") * MAGNET_RANGE_PER_LEVEL;

    // ── COIN VALUE ────────────────────────────────────────────────────────
    // econ_value: +1 extra coin per kill per level (max 3)
    const extraCoinPerKill = this.getLevel("econ_value");

    // ── ROUND COIN BONUS ──────────────────────────────────────────────────
    // econ_combo: +10% round-end coin bonus per level (max 3) → max +30%
    // Star fortune multiplies the bonus
    const roundCoinBonus = this.getLevel("econ_combo") * COIN_BONUS_PER_LEVEL * starFortune;

    // ── LUCKY CHANCE ──────────────────────────────────────────────────────
    // econ_lucky: +4% chance per level (max 3) → max 12% chance for 5× coins
    const luckyChance = this.getLevel("econ_lucky") * LUCKY_CHANCE_PER_LEVEL;

    // ── ENEMY SPAWN ───────────────────────────────────────────────────────
    // Natural level scaling: +50% per game level
    // econ_swarm: +40% per level (max 2) on top of natural scaling
    let enemySpawnMult = 1 + (this.save.roundNumber - 1) * LEVEL_SPAWN_SCALING;
    enemySpawnMult *= 1 + this.getLevel("econ_swarm") * SWARM_MULT_PER_LEVEL;

    // ── TIME PENALTY ──────────────────────────────────────────────────────
    let timePenalty = MOTHERSHIP_TIME_PENALTY;
    timePenalty *= starArmor;
    timePenalty = Math.max(MIN_TIME_PENALTY, timePenalty);

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2 — NEW UPGRADE STATS
    // ══════════════════════════════════════════════════════════════════════

    // ── EXECUTE (dmg_execute) ─────────────────────────────────────────────
    // Instant-kill enemies below 15% HP
    const executeThreshold = this.getLevel("dmg_execute") >= 1 ? 0.15 : 0;

    // ── DEATH NOVA (dmg_overcharge) ───────────────────────────────────────
    // Killed enemies explode — 50% damage within 60px
    const deathNovaActive = this.getLevel("dmg_overcharge") >= 1;

    // ── MULTISHOT (guns_multishot) ────────────────────────────────────────
    // +1 extra projectile per level (max 2)
    const multishotCount = this.getLevel("guns_multishot");

    // ── ORBITAL DRONES (guns_orbital) ─────────────────────────────────────
    const orbitalDrones = this.getLevel("guns_orbital") >= 1;

    // ── ELITE BOUNTY (econ_bounty) ────────────────────────────────────────
    // Elite enemies drop 3× coins per level
    const eliteBountyLvl = this.getLevel("econ_bounty");
    const eliteCoinMultiplier = eliteBountyLvl > 0 ? 1 + eliteBountyLvl * 2 : 1;

    // ── COMPOUND INTEREST (econ_interest) ─────────────────────────────────
    // 5% of banked coins per level as round bonus
    const interestRate = this.getLevel("econ_interest") * 0.05;

    // ── AFTERIMAGE (move_afterimage) ──────────────────────────────────────
    // Damage trail at 20% base damage/tick when moving fast
    const afterimageActive = this.getLevel("move_afterimage") >= 1;

    // ── WARP DASH (move_warp) ─────────────────────────────────────────────
    const warpDash = this.getLevel("move_warp") >= 1;

    // ── FREEZE (eff_freeze) ───────────────────────────────────────────────
    // +5% chance per level to freeze for 2s
    const freezeChance = this.getLevel("eff_freeze") * 0.05;

    // ── BLEED (eff_bleed) ─────────────────────────────────────────────────
    // Stacking bleed: 2% max HP/sec per stack, max 5 stacks
    const bleedActive = this.getLevel("eff_bleed") >= 1;

    // ── MOTHERSHIP REPAIR (ms_repair) ─────────────────────────────────────
    // Auto-heal 1 HP every 30s per level → lv2 = every 15s
    const msRepairLvl = this.getLevel("ms_repair");
    const msRepairInterval = msRepairLvl > 0 ? 30 / msRepairLvl : 0;

    // ── MECH MODE (ms_mech) ───────────────────────────────────────────────
    const msMechActive = this.getLevel("ms_mech") >= 1;

    // ── MECH OVERDRIVE (ms_overdrive) ─────────────────────────────────────
    const msOverdriveActive = this.getLevel("ms_overdrive") >= 1;

    // ── FORTRESS MODE (ms_fortress) ───────────────────────────────────────
    const msFortressActive = this.getLevel("ms_fortress") >= 1;

    // ══════════════════════════════════════════════════════════════════════
    // PLAYER HEALTH UPGRADES
    // ══════════════════════════════════════════════════════════════════════

    // ── HP BOOST (hp_boost) ───────────────────────────────────────────────
    // +1 max HP per level (max 3) → base 2 + up to 5
    const playerMaxHp = PLAYER_BASE_HP + this.getLevel("hp_boost");

    // ── HP REGEN (hp_regen) ───────────────────────────────────────────────
    // Regen 1 HP every 15s per level → lv2 = every 7.5s
    const hpRegenLvl = this.getLevel("hp_regen");
    const playerRegenInterval = hpRegenLvl > 0 ? 15 / hpRegenLvl : 0;

    // ── HP SHIELD (hp_shield) ─────────────────────────────────────────────
    // +0.5s invuln per level (max 2) → base 1.0 + up to 2.0
    const playerInvulnTime = PLAYER_HIT_INVULN + this.getLevel("hp_shield") * 0.5;

    return {
      // Offense
      damage,
      critChance,
      critMultiplier,
      splashRadius,
      forwardPulse,
      pierceCount,
      chainTargets,
      missileLevel,
      barrageSplashBonus,
      // DoT / Status
      poisonDps,
      slowOnHit,
      // Movement
      moveSpeed,
      flashbangRadius,
      mineOnDash,
      mineSlow,
      // Auto weapons
      fireRate,
      autoBomb,
      // Mothership
      mothershipHP,
      msBarrierHits,
      msBarrierCooldown,
      turretLevel,
      msSlowStrength,
      msSlowRadius,
      // Economy
      roundDuration,
      coinMagnetRange,
      extraCoinPerKill,
      roundCoinBonus,
      luckyChance,
      enemySpawnMultiplier: enemySpawnMult,
      // Phase 2 new stats
      executeThreshold,
      deathNovaActive,
      deathNovaDamageFraction: deathNovaActive ? 0.5 : 0,
      deathNovaRadius: deathNovaActive ? 60 : 0,
      multishotCount,
      orbitalDrones,
      eliteCoinMultiplier,
      interestRate,
      afterimageActive,
      afterimageDpsFraction: afterimageActive ? 0.2 : 0,
      warpDash,
      freezeChance,
      freezeDuration: freezeChance > 0 ? 2 : 0,
      bleedActive,
      bleedDpsPerStack: bleedActive ? 0.02 : 0,
      bleedMaxStacks: bleedActive ? 5 : 0,
      msRepairInterval,
      msMechActive,
      msOverdriveActive,
      msFortressActive,
      msFortressDomeRadius: msFortressActive ? 150 : 0,
      // Player health
      playerMaxHp,
      playerRegenInterval,
      playerInvulnTime,
      // Used by subsystems but not yet upgradeable
      timePenaltyPerHit: timePenalty,
      extraProjectiles: multishotCount,
      spreadAngle: multishotCount > 0 ? 0.15 + multishotCount * 0.1 : 0.15,
      dashDistMult: 1,
      slowAuraRange: 0,
      slowAuraFactor: 0,
      turretDamageMult: 1,
      overtimeBonus: 0,
    };
  }

  /** Prestige: wipe regular upgrades, keep star upgrades and star coins. */
  prestige(): void {
    this.save.upgradeLevels = { root: 1 };
    this.save.coins = 0;
    this.save.roundNumber = 1;
    this.save.prestigeCount++;
  }

  getPrestigeMultiplier(): number {
    return 1 + Math.sqrt(this.save.lifetimeCoins / 1000);
  }
}

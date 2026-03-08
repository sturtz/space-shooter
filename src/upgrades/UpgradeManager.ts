import { SaveData } from "../utils/SaveManager";
import { getUpgradeCost, UpgradeNode, StarUpgrade } from "./UpgradeTree";
import {
  PLAYER_BASE_SPEED,
  PLAYER_BASE_FIRE_RATE,
  PLAYER_BASE_DAMAGE,
  BASE_ROUND_DURATION,
  MOTHERSHIP_BASE_HP,
  MOTHERSHIP_TIME_PENALTY,
  COIN_MAGNET_RANGE,
  BULLET_SPEED,
} from "../utils/Constants";

export interface PlayerStats {
  // === Core offense ===
  damage: number;
  critChance: number;
  critMultiplier: number;
  splashRadius: number; // base AoE radius of pulse weapon
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
  // === Economy ===
  roundDuration: number;
  coinMagnetRange: number;
  coinValueMultiplier: number;
  coinDropMultiplier: number;
  enemySpawnMultiplier: number;
  // === Kept for compatibility (unused since player is invincible) ===
  bulletSpeed: number;
  timePenaltyPerHit: number;
  extraProjectiles: number;
  spreadAngle: number;
  evasionChance: number;
  dashDistMult: number;
  dashInvincibility: number;
  slowAuraRange: number;
  slowAuraFactor: number;
  counterDmgMult: number;
  playerHp: number;
  playerShields: number;
  shieldRegenInterval: number;
  armorReduction: number;
  reflectFraction: number;
  lifestealChance: number;
  msRegenInterval: number;
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
    const starPower = 1 + this.getStarLevel("star_power") * 0.25;
    const starSpeed = 1 + this.getStarLevel("star_speed") * 0.15;
    const starEndurance = this.getStarLevel("star_endurance") * 3;
    const starFortune = 1 + this.getStarLevel("star_fortune") * 0.2;
    const starArmor = Math.max(0.1, 1 - this.getStarLevel("star_armor") * 0.15);

    // ── DAMAGE ────────────────────────────────────────────────────────────
    // dmg_core: +30% per level (max 3)
    let damage = PLAYER_BASE_DAMAGE;
    damage *= 1 + this.getLevel("dmg_core") * 0.3;
    damage *= starPower;

    // ── CRIT ─────────────────────────────────────────────────────────────
    // dmg_crit: +8% crit chance per level (max 3) → max 24%
    const critChance = this.getLevel("dmg_crit") * 0.08;
    const critMultiplier = 2.5; // crits always deal 2.5× — no upgrade for multiplier

    // ── SPLASH / AOE RADIUS ───────────────────────────────────────────────
    // dmg_range: +20px per level (max 3) → max +60px
    let splashRadius = this.getLevel("dmg_range") * 20;
    // guns_barrage adds another 30px when active
    const barrageActive = this.getLevel("guns_barrage") >= 1;
    const barrageSplashBonus = barrageActive ? 30 : 0;

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
      missileLevel = 4; // barrage always fires 4
    }

    // ── CHAIN LIGHTNING ───────────────────────────────────────────────────
    // guns_chain: +1 chain jump per level (max 3)
    const chainTargets = this.getLevel("guns_chain");

    // ── MOVEMENT ─────────────────────────────────────────────────────────
    // move_speed: +25% per level (max 3) → max +75%
    let moveSpeed = PLAYER_BASE_SPEED;
    moveSpeed *= 1 + this.getLevel("move_speed") * 0.25;
    moveSpeed *= starSpeed;

    // ── EMP / FLASHBANG RADIUS ────────────────────────────────────────────
    // move_emp: +40px per level (max 3) → base 0 + up to 120px
    const flashbangRadius = this.getLevel("move_emp") * 40;

    // ── PROXIMITY MINE ────────────────────────────────────────────────────
    const mineOnDash = this.getLevel("move_mine") >= 1;
    const mineSlow = this.getLevel("move_trap") >= 1; // mine slow field upgrade

    // ── POISON ────────────────────────────────────────────────────────────
    // eff_poison: +5% damage/sec per level (max 3) → max 15% base damage/sec
    const poisonDps = this.getLevel("eff_poison") * 0.05 * damage;

    // ── SLOW ON HIT ───────────────────────────────────────────────────────
    // eff_slow: +8% slow per level (max 3) → max 24% movement reduction
    const slowOnHit = this.getLevel("eff_slow") * 0.08;

    // ── AUTO BOMB ─────────────────────────────────────────────────────────
    const autoBomb = this.getLevel("eff_bomb") >= 1;

    // ── MOTHERSHIP HP ─────────────────────────────────────────────────────
    // ms_hull: +1 max HP per level (max 4) → base 5 + up to 9
    const mothershipHP = MOTHERSHIP_BASE_HP + this.getLevel("ms_hull");

    // ── MOTHERSHIP BARRIER ────────────────────────────────────────────────
    // ms_barrier: +1 hit capacity per level (max 3)
    const msBarrierHits = this.getLevel("ms_barrier"); // 0 = no barrier
    const msBarrierCooldown = 25; // fixed recharge delay in seconds

    // ── TURRET ────────────────────────────────────────────────────────────
    // ms_turret: level = turret tier (0 = none, 1-3 = active)
    const turretLevel = this.getLevel("ms_turret");

    // ── ROUND DURATION ────────────────────────────────────────────────────
    // econ_duration: +50% per level (max 3)
    let roundDuration = BASE_ROUND_DURATION;
    roundDuration = roundDuration * (1 + this.getLevel("econ_duration") * 0.5);
    roundDuration += starEndurance;

    // ── COIN MAGNET ───────────────────────────────────────────────────────
    // econ_magnet: +20px per level (max 3)
    let coinMagnetRange = COIN_MAGNET_RANGE;
    coinMagnetRange += this.getLevel("econ_magnet") * 20;

    // ── COIN VALUE ────────────────────────────────────────────────────────
    // econ_value: +25% per level (max 3) → max +75%
    let coinValueMult = 1 + this.getLevel("econ_value") * 0.25;
    coinValueMult *= starFortune;

    // ── ENEMY SPAWN ───────────────────────────────────────────────────────
    // Natural level scaling: +50% per game level
    // econ_swarm: +40% per level (max 2) on top of natural scaling
    let enemySpawnMult = 1 + (this.save.currentLevel - 1) * 0.5;
    enemySpawnMult *= 1 + this.getLevel("econ_swarm") * 0.4;

    // ── TIME PENALTY ──────────────────────────────────────────────────────
    let timePenalty = MOTHERSHIP_TIME_PENALTY;
    timePenalty *= starArmor;
    timePenalty = Math.max(0.3, timePenalty);

    return {
      // Offense
      damage,
      critChance,
      critMultiplier,
      splashRadius,
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
      // Economy
      roundDuration,
      coinMagnetRange,
      coinValueMultiplier: coinValueMult,
      coinDropMultiplier: coinValueMult,
      enemySpawnMultiplier: enemySpawnMult,
      timePenaltyPerHit: timePenalty,
      // Compat stubs (player is invincible — these are all inactive)
      bulletSpeed: BULLET_SPEED,
      extraProjectiles: 0,
      spreadAngle: 0.15,
      evasionChance: 0,
      dashDistMult: 1,
      dashInvincibility: 0,
      slowAuraRange: 0,
      slowAuraFactor: 0,
      counterDmgMult: 1,
      playerHp: 1,
      playerShields: 0,
      shieldRegenInterval: 0,
      armorReduction: 0,
      reflectFraction: 0,
      lifestealChance: 0,
      msRegenInterval: 0,
      turretDamageMult: 1,
      overtimeBonus: 0,
    };
  }

  /** Prestige: wipe regular upgrades, keep star upgrades and star coins. */
  prestige(): void {
    this.save.upgradeLevels = { root: 1 };
    this.save.coins = 0;
    this.save.currentLevel = 1;
    this.save.prestigeCount++;
  }

  getPrestigeMultiplier(): number {
    return 1 + Math.sqrt(this.save.lifetimeCoins / 1000);
  }
}

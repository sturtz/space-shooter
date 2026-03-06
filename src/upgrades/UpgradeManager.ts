import { SaveData } from "../utils/SaveManager";
import {
  UPGRADE_TREE,
  STAR_UPGRADES,
  getUpgradeCost,
  UpgradeNode,
  UpgradeBranch,
  StarUpgrade,
} from "./UpgradeTree";
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
  damage: number;
  moveSpeed: number;
  fireRate: number; // seconds between shots
  bulletSpeed: number;
  roundDuration: number;
  mothershipHP: number;
  timePenaltyPerHit: number;
  coinMagnetRange: number;
  coinValueMultiplier: number;
  enemySpawnMultiplier: number;
  coinDropMultiplier: number;
  critChance: number;
  critMultiplier: number;
  splashRadius: number;
  extraProjectiles: number;
  spreadAngle: number;
  pierceCount: number;
  // Damage effects
  poisonDps: number;
  slowOnHit: number;
  chainTargets: number;
  // Movement abilities
  evasionChance: number;
  dashDistMult: number;
  dashInvincibility: number;
  slowAuraRange: number;
  slowAuraFactor: number;
  counterDmgMult: number;
  // Player health/shields
  playerHp: number;
  playerShields: number;
  shieldRegenInterval: number; // seconds between regen ticks, 0 = no regen
  armorReduction: number; // fraction of damage reduced
  reflectFraction: number;
  lifestealChance: number;
  flashbangRadius: number;
  // Mothership extras
  msRegenInterval: number;
  msBarrierHits: number;
  msBarrierCooldown: number;
  turretLevel: number;
  turretDamageMult: number;
  // Economy extras
  overtimeBonus: number;
  // Missile weapon (dmg branch 2)
  missileLevel: number;
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

  // Compute all player stats from the upgrade tree
  computeStats(): PlayerStats {
    // Star multipliers
    const starPower = 1 + this.getStarLevel("star_power") * 0.25;
    const starSpeed = 1 + this.getStarLevel("star_speed") * 0.15;
    const starEndurance = this.getStarLevel("star_endurance") * 3;
    const starFortune = 1 + this.getStarLevel("star_fortune") * 0.2;
    const starArmor = 1 - this.getStarLevel("star_armor") * 0.15;

    // === DAMAGE ===
    let damage = PLAYER_BASE_DAMAGE;
    damage *= 1 + this.getLevel("dmg_core") * 0.50;
    damage *= 1 + this.getLevel("guns_caliber") * 0.25;
    damage *= starPower;

    // === MOVEMENT ===
    let moveSpeed = PLAYER_BASE_SPEED;
    moveSpeed *= 1 + this.getLevel("move_core") * 0.50;
    moveSpeed *= starSpeed;

    // === FIRE RATE ===
    let fireRate = PLAYER_BASE_FIRE_RATE;
    const gunsBonus = 1 + this.getLevel("guns_core") * 0.08;
    const caliberPenalty = 1 - this.getLevel("guns_caliber") * 0.05;
    fireRate /= gunsBonus * Math.max(0.5, caliberPenalty);

    // === BULLET SPEED ===
    let bulletSpeed = BULLET_SPEED;
    bulletSpeed *= 1 + this.getLevel("guns_velocity") * 0.12;

    // === DURATION ===
    let roundDuration = BASE_ROUND_DURATION;
    roundDuration += this.getLevel("econ_duration") * 3.0;
    roundDuration += starEndurance;

    // === MOTHERSHIP ===
    const mothershipHP = MOTHERSHIP_BASE_HP + this.getLevel("ms_core");
    let timePenalty = MOTHERSHIP_TIME_PENALTY;
    timePenalty *= 1 - this.getLevel("ms_armor") * 0.08;
    timePenalty *= Math.max(0.1, starArmor);
    timePenalty = Math.max(0.3, timePenalty);

    // === COINS ===
    let coinMagnetRange = COIN_MAGNET_RANGE;
    coinMagnetRange += this.getLevel("econ_core") * 20;

    const econValueLevel = this.getLevel("econ_value");
    let coinValueMult = 1 + 0.1 * econValueLevel * (1 - econValueLevel * 0.015);
    coinValueMult *= starFortune;

    const coinDropMult = coinValueMult;

    // Enemy density scales 50% per game level
    const enemySpawnMult = 1 + (this.save.currentLevel - 1) * 0.50;

    // === CRIT ===
    const critChance = this.getLevel("dmg_crit") * 0.05;
    const critMult = 2 + this.getLevel("dmg_crit_dmg") * 0.5;

    // === SPLASH ===
    const splashRadius = this.getLevel("dmg_splash") * 5;

    // === EXTRA PROJECTILES & SPREAD ===
    const extraProjectiles = this.getLevel("guns_multi");
    const spreadAngle = 0.15 + this.getLevel("guns_spread") * 0.1; // wider per level

    // === PIERCE ===
    const pierceCount = this.getLevel("guns_pierce");

    // === POISON ===
    const poisonDps = this.getLevel("dmg_poison") * 0.05 * damage;

    // === SLOW ===
    const slowOnHit = this.getLevel("dmg_slow") * 0.05;

    // === CHAIN LIGHTNING ===
    const chainTargets = this.getLevel("dmg_chain");

    // === EVASION ===
    const evasionChance = this.getLevel("move_evasion") * 0.03;

    // === DASH / AFTERBURNER ===
    const dashDistMult = 1 + this.getLevel("move_dash") * 0.1;
    const dashInvincibility = this.getLevel("move_phase") * 0.1;

    // === SLOW AURA ===
    const slowAuraLevel = this.getLevel("move_slow_aura");
    const slowAuraRange = slowAuraLevel > 0 ? 80 + slowAuraLevel * 15 : 0;
    const slowAuraFactor = slowAuraLevel * 0.03;

    // === COUNTER STRIKE ===
    const counterDmgMult = 1 + this.getLevel("move_counter") * 0.15;

    // === PLAYER SHIELDS ===
    const playerShields = this.getLevel("health_core");
    const regenLevel = this.getLevel("health_regen");
    const shieldRegenInterval = regenLevel > 0 ? 30 - regenLevel * 2 : 0;

    // === ARMOR & REFLECT ===
    const armorReduction = this.getLevel("health_armor") * 0.1;
    const reflectFraction = this.getLevel("health_reflect") * 0.15;

    // === PLAYER HP ===
    const playerHp = 1; // base 1 HP, shields serve as extra health

    // === FLASHBANG / EMP BURST ===
    const flashbangRadius = this.getLevel("move_emp") * 40;

    // === LIFESTEAL ===
    const lifestealChance = this.getLevel("health_lifesteal") * 0.02;

    // === MOTHERSHIP REGEN ===
    const msRegenLevel = this.getLevel("ms_regen");
    const msRegenInterval = msRegenLevel > 0 ? 30 - msRegenLevel * 1.5 : 0;

    // === MOTHERSHIP BARRIER ===
    const msBarrierLevel = this.getLevel("ms_barrier");
    const msBarrierHits =
      msBarrierLevel > 0 ? 1 + Math.floor(msBarrierLevel / 3) : 0;
    const msBarrierCooldown = 25;

    // === TURRET ===
    const turretLevel = this.getLevel("ms_turret");
    const turretDamageMult = 1 + this.getLevel("ms_turret_dmg") * 0.2;

    // === OVERTIME ===
    const overtimeBonus = this.getLevel("econ_overtime") * 0.15;

    // === MISSILE ===
    const missileLevel = this.getLevel("dmg_missile");

    return {
      damage,
      moveSpeed,
      fireRate,
      bulletSpeed,
      roundDuration,
      mothershipHP,
      timePenaltyPerHit: timePenalty,
      coinMagnetRange,
      coinValueMultiplier: coinValueMult,
      enemySpawnMultiplier: enemySpawnMult,
      coinDropMultiplier: coinDropMult,
      critChance,
      critMultiplier: critMult,
      splashRadius,
      extraProjectiles,
      spreadAngle,
      pierceCount,
      poisonDps,
      slowOnHit,
      chainTargets,
      evasionChance,
      dashDistMult,
      dashInvincibility,
      slowAuraRange,
      slowAuraFactor,
      counterDmgMult,
      playerHp,
      playerShields,
      shieldRegenInterval,
      armorReduction,
      reflectFraction,
      lifestealChance,
      flashbangRadius,
      msRegenInterval,
      msBarrierHits,
      msBarrierCooldown,
      turretLevel,
      turretDamageMult,
      overtimeBonus,
      missileLevel,
    };
  }

  // Prestige: reset regular upgrades, keep star upgrades
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

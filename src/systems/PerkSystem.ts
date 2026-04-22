import { PlayerStats } from "../upgrades/UpgradeManager";
import { PERK_BASE_XP, PERK_XP_GROWTH, PERK_CHOICES } from "../utils/Constants";

// ── Perk Definitions ────────────────────────────────────────────────────

export interface PerkDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Max times this perk can be picked in a single run */
  maxStacks: number;
}

/** All available in-run perks (~15). Each modifies stats when selected. */
export const PERK_POOL: PerkDef[] = [
  {
    id: "speed_burst",
    name: "Afterburner",
    description: "+20% move speed",
    icon: "💨",
    color: "#00aaff",
    maxStacks: 3,
  },
  {
    id: "damage_up",
    name: "Overcharge",
    description: "+25% damage",
    icon: "⚔️",
    color: "#ff4466",
    maxStacks: 3,
  },
  {
    id: "rapid_fire",
    name: "Rapid Fire",
    description: "+15% fire rate",
    icon: "🔥",
    color: "#ff8800",
    maxStacks: 3,
  },
  {
    id: "big_magnet",
    name: "Tractor Beam",
    description: "+50px coin magnet",
    icon: "🧲",
    color: "#ffdd00",
    maxStacks: 3,
  },
  {
    id: "extra_hp",
    name: "Hull Plating",
    description: "+1 max HP (heals too)",
    icon: "❤️",
    color: "#ff4444",
    maxStacks: 3,
  },
  {
    id: "shield_regen",
    name: "Auto-Repair",
    description: "Regen 1 HP every 10s",
    icon: "🛡️",
    color: "#44ff44",
    maxStacks: 2,
  },
  {
    id: "crit_surge",
    name: "Precision Core",
    description: "+10% crit chance",
    icon: "🎯",
    color: "#ff44ff",
    maxStacks: 3,
  },
  {
    id: "splash_zone",
    name: "Blast Radius",
    description: "+15px pulse range",
    icon: "💥",
    color: "#ff6600",
    maxStacks: 3,
  },
  {
    id: "missile_barrage",
    name: "Extra Payload",
    description: "+1 missile per volley",
    icon: "🚀",
    color: "#ff4466",
    maxStacks: 2,
  },
  {
    id: "coin_boost",
    name: "Prospector",
    description: "+30% coin value",
    icon: "💰",
    color: "#ffdd00",
    maxStacks: 3,
  },
  {
    id: "streak_keeper",
    name: "Momentum",
    description: "+1.5s streak timeout",
    icon: "⏱️",
    color: "#ffaa00",
    maxStacks: 2,
  },
  {
    id: "thick_skin",
    name: "Thick Skin",
    description: "+0.5s invuln after hit",
    icon: "🛡️",
    color: "#4488ff",
    maxStacks: 2,
  },
  {
    id: "poison_touch",
    name: "Toxic Rounds",
    description: "+3% poison DPS",
    icon: "☠️",
    color: "#44ff44",
    maxStacks: 3,
  },
  {
    id: "time_warp",
    name: "Time Dilation",
    description: "+3s round duration",
    icon: "⏰",
    color: "#4488ff",
    maxStacks: 3,
  },
  {
    id: "glass_cannon",
    name: "Glass Cannon",
    description: "+50% damage, −1 max HP",
    icon: "💀",
    color: "#ff2222",
    maxStacks: 1,
  },
];

// ── Active Perk Instance ────────────────────────────────────────────────

export interface ActivePerk {
  def: PerkDef;
  stacks: number;
}

// ── Perk System ─────────────────────────────────────────────────────────

export class PerkSystem {
  xp: number = 0;
  level: number = 0;
  activePerks: Map<string, ActivePerk> = new Map();

  /** Set when level-up occurs — Game reads this to pause for selection */
  pendingLevelUp: boolean = false;
  /** Rolled choices for current level-up (3 perks) */
  pendingChoices: PerkDef[] = [];

  /** XP needed to reach the next level */
  xpForNextLevel(): number {
    return PERK_BASE_XP + this.level * PERK_XP_GROWTH;
  }

  /** XP progress as 0-1 ratio toward next level */
  xpProgress(): number {
    const needed = this.xpForNextLevel();
    return needed > 0 ? Math.min(1, this.xp / needed) : 0;
  }

  /** Award XP. Returns true if level-up triggered. */
  addXP(amount: number): boolean {
    if (this.pendingLevelUp) return false; // don't accumulate during selection
    this.xp += amount;
    const needed = this.xpForNextLevel();
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      this.pendingLevelUp = true;
      this.pendingChoices = this.rollPerks(PERK_CHOICES);
      return true;
    }
    return false;
  }

  /** Roll N random perks from pool, excluding maxed-out perks */
  private rollPerks(count: number): PerkDef[] {
    const available = PERK_POOL.filter((p) => {
      const active = this.activePerks.get(p.id);
      return !active || active.stacks < p.maxStacks;
    });

    // Shuffle and pick
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /** Select a perk from pending choices */
  selectPerk(perkId: string): void {
    const def = this.pendingChoices.find((p) => p.id === perkId);
    if (!def) return;

    const existing = this.activePerks.get(perkId);
    if (existing) {
      existing.stacks = Math.min(existing.stacks + 1, def.maxStacks);
    } else {
      this.activePerks.set(perkId, { def, stacks: 1 });
    }

    this.pendingLevelUp = false;
    this.pendingChoices = [];
  }

  /** Get stacks of a specific perk (0 if not active) */
  getStacks(perkId: string): number {
    return this.activePerks.get(perkId)?.stacks ?? 0;
  }

  /**
   * Apply perk bonuses to base stats, returning a new modified PlayerStats.
   * Does NOT mutate the input.
   */
  applyToStats(base: PlayerStats): PlayerStats {
    const s = { ...base };

    // speed_burst: +20% per stack
    s.moveSpeed *= 1 + this.getStacks("speed_burst") * 0.2;

    // damage_up: +25% per stack
    s.damage *= 1 + this.getStacks("damage_up") * 0.25;

    // rapid_fire: reduce fire interval by 15% per stack (multiplicative)
    const rapidStacks = this.getStacks("rapid_fire");
    if (rapidStacks > 0) {
      s.fireRate *= Math.pow(0.85, rapidStacks);
    }

    // big_magnet: +50px per stack
    s.coinMagnetRange += this.getStacks("big_magnet") * 50;

    // extra_hp: +1 per stack
    s.playerMaxHp += this.getStacks("extra_hp");

    // shield_regen: set regen interval (10s / stacks), take best of upgrade + perk
    const regenStacks = this.getStacks("shield_regen");
    if (regenStacks > 0) {
      const perkInterval = 10 / regenStacks;
      if (s.playerRegenInterval <= 0 || perkInterval < s.playerRegenInterval) {
        s.playerRegenInterval = perkInterval;
      }
    }

    // crit_surge: +10% per stack
    s.critChance += this.getStacks("crit_surge") * 0.1;

    // splash_zone: +15px per stack
    s.splashRadius += this.getStacks("splash_zone") * 15;

    // missile_barrage: +1 missile per stack
    const missilePerkStacks = this.getStacks("missile_barrage");
    if (missilePerkStacks > 0 && s.missileLevel > 0) {
      s.missileLevel += missilePerkStacks;
    }

    // coin_boost: +30% per stack (expressed as extra coins per kill)
    s.extraCoinPerKill += this.getStacks("coin_boost");

    // thick_skin: +0.5s invuln per stack
    s.playerInvulnTime += this.getStacks("thick_skin") * 0.5;

    // poison_touch: +3% poison DPS per stack (fraction of base damage)
    s.poisonDps += this.getStacks("poison_touch") * 0.03 * s.damage;

    // time_warp: +3s per stack
    s.roundDuration += this.getStacks("time_warp") * 3;

    // glass_cannon: +50% damage, -1 max HP per stack
    const glassStacks = this.getStacks("glass_cannon");
    if (glassStacks > 0) {
      s.damage *= 1 + glassStacks * 0.5;
      s.playerMaxHp = Math.max(1, s.playerMaxHp - glassStacks);
    }

    return s;
  }

  /** Extra streak timeout from perks (seconds) */
  getStreakTimeoutBonus(): number {
    return this.getStacks("streak_keeper") * 1.5;
  }

  /** Reset all perk state for a new run */
  reset(): void {
    this.xp = 0;
    this.level = 0;
    this.activePerks.clear();
    this.pendingLevelUp = false;
    this.pendingChoices = [];
  }
}

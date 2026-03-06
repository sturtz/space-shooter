import { UPGRADE_BASE_COST, UPGRADE_COST_GROWTH } from "../utils/Constants";

export type UpgradeBranch =
  | "dmg"
  | "guns"
  | "movement"
  | "health"
  | "mothership"
  | "economy";

export interface UpgradeNode {
  id: string;
  name: string;
  description: string;
  branch: UpgradeBranch;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  effectPerLevel: number;
  requires?: { id: string; level: number }[];
  icon: string;
  // depth: 0=root, 1=core, 2=mid, 3=deep
  depth: number;
  // angleOffset: spread within branch (-1..1), 0=centered
  angleOffset: number;
}

export function getUpgradeCost(
  node: UpgradeNode,
  currentLevel: number,
): number {
  return Math.floor(node.baseCost * Math.pow(node.costGrowth, currentLevel));
}

export function getUpgradeEffect(node: UpgradeNode, level: number): number {
  return node.effectPerLevel * level;
}

// ======= SPIDER-WEB UPGRADE TREE =======
// 1 root → 6 branches → sub-nodes branching deeper

export const UPGRADE_TREE: UpgradeNode[] = [
  // ============ ROOT ============
  {
    id: "root",
    name: "Sentinel Core",
    description: "The heart of your ship. Unlocks all upgrade paths.",
    branch: "dmg", // doesn't matter, root is special
    maxLevel: 1,
    baseCost: 0,
    costGrowth: 1,
    effectPerLevel: 0,
    icon: "⬡",
    depth: 0,
    angleOffset: 0,
  },

  // ============ DMG BRANCH (red) ============
  {
    id: "dmg_core",
    name: "Weapon Power",
    description: "+15% damage per level",
    branch: "dmg",
    maxLevel: 25,
    baseCost: UPGRADE_BASE_COST,
    costGrowth: UPGRADE_COST_GROWTH,
    effectPerLevel: 0.15,
    requires: [{ id: "root", level: 1 }],
    icon: "⚔",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "dmg_crit",
    name: "Critical Strike",
    description: "+5% crit chance per level",
    branch: "dmg",
    maxLevel: 10,
    baseCost: 30,
    costGrowth: 1.22,
    effectPerLevel: 0.05,
    requires: [{ id: "dmg_core", level: 3 }],
    icon: "✦",
    depth: 2,
    angleOffset: -0.5,
  },
  {
    id: "dmg_crit_dmg",
    name: "Deadly Precision",
    description: "+0.5× crit multiplier per level",
    branch: "dmg",
    maxLevel: 8,
    baseCost: 80,
    costGrowth: 1.28,
    effectPerLevel: 0.5,
    requires: [{ id: "dmg_crit", level: 3 }],
    icon: "☠",
    depth: 3,
    angleOffset: -0.6,
  },
  {
    id: "dmg_splash",
    name: "Explosive Rounds",
    description: "+5px splash radius per level",
    branch: "dmg",
    maxLevel: 15,
    baseCost: 25,
    costGrowth: 1.2,
    effectPerLevel: 5,
    requires: [{ id: "dmg_core", level: 3 }],
    icon: "💥",
    depth: 2,
    angleOffset: 0.5,
  },
  {
    id: "dmg_chain",
    name: "Chain Lightning",
    description: "Kill explosions bounce to +1 target",
    branch: "dmg",
    maxLevel: 6,
    baseCost: 100,
    costGrowth: 1.3,
    effectPerLevel: 1,
    requires: [{ id: "dmg_splash", level: 4 }],
    icon: "⚡",
    depth: 3,
    angleOffset: 0.4,
  },
  {
    id: "dmg_poison",
    name: "Venom Rounds",
    description: "Shots apply DoT: 5% dmg/sec for 3s",
    branch: "dmg",
    maxLevel: 10,
    baseCost: 40,
    costGrowth: 1.22,
    effectPerLevel: 0.05,
    requires: [{ id: "dmg_core", level: 5 }],
    icon: "☣",
    depth: 2,
    angleOffset: 0,
  },
  {
    id: "dmg_slow",
    name: "Cryo Rounds",
    description: "Slow enemies 5% per level on hit",
    branch: "dmg",
    maxLevel: 8,
    baseCost: 80,
    costGrowth: 1.25,
    effectPerLevel: 0.05,
    requires: [{ id: "dmg_poison", level: 3 }],
    icon: "❄",
    depth: 3,
    angleOffset: 0,
  },

  // ============ GUNS BRANCH (yellow) ============
  {
    id: "guns_core",
    name: "Rapid Fire",
    description: "+8% fire rate per level",
    branch: "guns",
    maxLevel: 25,
    baseCost: UPGRADE_BASE_COST,
    costGrowth: UPGRADE_COST_GROWTH,
    effectPerLevel: 0.08,
    requires: [{ id: "root", level: 1 }],
    icon: "🔫",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "guns_multi",
    name: "Multi-Shot",
    description: "+1 extra projectile per level",
    branch: "guns",
    maxLevel: 5,
    baseCost: 50,
    costGrowth: 1.4,
    effectPerLevel: 1,
    requires: [{ id: "guns_core", level: 3 }],
    icon: "⋮",
    depth: 2,
    angleOffset: -0.5,
  },
  {
    id: "guns_spread",
    name: "Wide Spread",
    description: "Wider angle for multi-shot projectiles",
    branch: "guns",
    maxLevel: 5,
    baseCost: 60,
    costGrowth: 1.3,
    effectPerLevel: 0.1,
    requires: [{ id: "guns_multi", level: 2 }],
    icon: "⟐",
    depth: 3,
    angleOffset: -0.6,
  },
  {
    id: "guns_velocity",
    name: "Bullet Velocity",
    description: "+12% projectile speed per level",
    branch: "guns",
    maxLevel: 15,
    baseCost: 20,
    costGrowth: 1.2,
    effectPerLevel: 0.12,
    requires: [{ id: "guns_core", level: 3 }],
    icon: "→",
    depth: 2,
    angleOffset: 0.5,
  },
  {
    id: "guns_pierce",
    name: "Piercing Rounds",
    description: "Bullets pierce through +1 enemy",
    branch: "guns",
    maxLevel: 5,
    baseCost: 90,
    costGrowth: 1.35,
    effectPerLevel: 1,
    requires: [{ id: "guns_velocity", level: 4 }],
    icon: "⟫",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "guns_caliber",
    name: "Heavy Caliber",
    description: "+25% dmg, -5% fire rate per level",
    branch: "guns",
    maxLevel: 8,
    baseCost: 60,
    costGrowth: 1.25,
    effectPerLevel: 0.25,
    requires: [{ id: "guns_core", level: 5 }],
    icon: "◉",
    depth: 2,
    angleOffset: 0,
  },

  // ============ MOVEMENT BRANCH (cyan) ============
  {
    id: "move_core",
    name: "Thruster Power",
    description: "+10% movement speed per level",
    branch: "movement",
    maxLevel: 20,
    baseCost: UPGRADE_BASE_COST,
    costGrowth: UPGRADE_COST_GROWTH,
    effectPerLevel: 0.1,
    requires: [{ id: "root", level: 1 }],
    icon: "🚀",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "move_evasion",
    name: "Evasion",
    description: "+3% chance to dodge damage per level",
    branch: "movement",
    maxLevel: 10,
    baseCost: 30,
    costGrowth: 1.22,
    effectPerLevel: 0.03,
    requires: [{ id: "move_core", level: 3 }],
    icon: "✧",
    depth: 2,
    angleOffset: -0.5,
  },
  {
    id: "move_counter",
    name: "Counter Strike",
    description: "On dodge, fire a counter shot (+15% dmg/lv)",
    branch: "movement",
    maxLevel: 5,
    baseCost: 80,
    costGrowth: 1.3,
    effectPerLevel: 0.15,
    requires: [{ id: "move_evasion", level: 3 }],
    icon: "↩",
    depth: 3,
    angleOffset: -0.5,
  },
  {
    id: "move_dash",
    name: "Afterburner",
    description: "Dash ability (+10% distance/lv)",
    branch: "movement",
    maxLevel: 8,
    baseCost: 35,
    costGrowth: 1.22,
    effectPerLevel: 0.1,
    requires: [{ id: "move_core", level: 3 }],
    icon: "⟿",
    depth: 2,
    angleOffset: 0.5,
  },
  {
    id: "move_phase",
    name: "Phase Shift",
    description: "+0.1s invincibility on dash per level",
    branch: "movement",
    maxLevel: 5,
    baseCost: 80,
    costGrowth: 1.3,
    effectPerLevel: 0.1,
    requires: [{ id: "move_dash", level: 3 }],
    icon: "◌",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "move_slow_aura",
    name: "Time Dilation",
    description: "Nearby enemies slowed 3% per level",
    branch: "movement",
    maxLevel: 8,
    baseCost: 50,
    costGrowth: 1.25,
    effectPerLevel: 0.03,
    requires: [{ id: "move_core", level: 5 }],
    icon: "⏳",
    depth: 2,
    angleOffset: 0,
  },

  // ============ HEALTH BRANCH (green) ============
  {
    id: "health_core",
    name: "Vitality",
    description: "+1 player shield point per level",
    branch: "health",
    maxLevel: 10,
    baseCost: 15,
    costGrowth: 1.22,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "♥",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "health_regen",
    name: "Regeneration",
    description: "Regen 1 shield every (30-2×lv) seconds",
    branch: "health",
    maxLevel: 8,
    baseCost: 40,
    costGrowth: 1.25,
    effectPerLevel: 2,
    requires: [{ id: "health_core", level: 3 }],
    icon: "✚",
    depth: 2,
    angleOffset: -0.5,
  },
  {
    id: "health_armor",
    name: "Hull Plating",
    description: "-10% damage taken per level",
    branch: "health",
    maxLevel: 8,
    baseCost: 35,
    costGrowth: 1.22,
    effectPerLevel: 0.1,
    requires: [{ id: "health_core", level: 3 }],
    icon: "◈",
    depth: 2,
    angleOffset: 0.5,
  },
  {
    id: "health_reflect",
    name: "Damage Reflect",
    description: "Reflect 15% dmg back to attacker",
    branch: "health",
    maxLevel: 5,
    baseCost: 80,
    costGrowth: 1.3,
    effectPerLevel: 0.15,
    requires: [{ id: "health_armor", level: 3 }],
    icon: "⟡",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "health_lifesteal",
    name: "Life Steal",
    description: "+2% chance to heal on kill",
    branch: "health",
    maxLevel: 6,
    baseCost: 50,
    costGrowth: 1.28,
    effectPerLevel: 0.02,
    requires: [{ id: "health_core", level: 5 }],
    icon: "♣",
    depth: 2,
    angleOffset: 0,
  },

  // ============ MOTHERSHIP BRANCH (blue) ============
  {
    id: "ms_core",
    name: "Mothership Hull",
    description: "+1 mothership HP per level",
    branch: "mothership",
    maxLevel: 15,
    baseCost: UPGRADE_BASE_COST,
    costGrowth: UPGRADE_COST_GROWTH,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "⬡",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "ms_regen",
    name: "Auto Repair",
    description: "Regen 1 HP every (30-1.5×lv) seconds",
    branch: "mothership",
    maxLevel: 10,
    baseCost: 30,
    costGrowth: 1.22,
    effectPerLevel: 1.5,
    requires: [{ id: "ms_core", level: 3 }],
    icon: "⟐",
    depth: 2,
    angleOffset: -0.6,
  },
  {
    id: "ms_armor",
    name: "Damage Reduction",
    description: "-8% time penalty per hit per level",
    branch: "mothership",
    maxLevel: 10,
    baseCost: 30,
    costGrowth: 1.22,
    effectPerLevel: 0.08,
    requires: [{ id: "ms_core", level: 3 }],
    icon: "◇",
    depth: 2,
    angleOffset: -0.2,
  },
  {
    id: "ms_barrier",
    name: "Energy Shield",
    description: "Temp barrier absorbs 1+lv/3 hits every 25s",
    branch: "mothership",
    maxLevel: 6,
    baseCost: 80,
    costGrowth: 1.3,
    effectPerLevel: 0.33,
    requires: [{ id: "ms_armor", level: 3 }],
    icon: "◎",
    depth: 3,
    angleOffset: -0.3,
  },
  {
    id: "ms_turret",
    name: "Defense Turret",
    description: "Mothership auto-fires at enemies",
    branch: "mothership",
    maxLevel: 8,
    baseCost: 50,
    costGrowth: 1.25,
    effectPerLevel: 1,
    requires: [{ id: "ms_core", level: 5 }],
    icon: "⊕",
    depth: 2,
    angleOffset: 0.4,
  },
  {
    id: "ms_turret_dmg",
    name: "Turret Power",
    description: "+20% turret damage per level",
    branch: "mothership",
    maxLevel: 6,
    baseCost: 80,
    costGrowth: 1.28,
    effectPerLevel: 0.2,
    requires: [{ id: "ms_turret", level: 3 }],
    icon: "⊛",
    depth: 3,
    angleOffset: 0.5,
  },

  // ============ ECONOMY BRANCH (gold) ============
  {
    id: "econ_core",
    name: "Coin Magnet",
    description: "+20px auto-collect radius per level",
    branch: "economy",
    maxLevel: 15,
    baseCost: UPGRADE_BASE_COST,
    costGrowth: UPGRADE_COST_GROWTH,
    effectPerLevel: 20,
    requires: [{ id: "root", level: 1 }],
    icon: "⊙",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "econ_value",
    name: "Coin Value",
    description: "+10% coin value per level",
    branch: "economy",
    maxLevel: 20,
    baseCost: 20,
    costGrowth: 1.2,
    effectPerLevel: 0.1,
    requires: [{ id: "econ_core", level: 3 }],
    icon: "◆",
    depth: 2,
    angleOffset: -0.5,
  },
  {
    id: "econ_lucky",
    name: "Lucky Drops",
    description: "+4% chance for 5× value coin",
    branch: "economy",
    maxLevel: 8,
    baseCost: 80,
    costGrowth: 1.28,
    effectPerLevel: 0.04,
    requires: [{ id: "econ_value", level: 4 }],
    icon: "★",
    depth: 3,
    angleOffset: -0.5,
  },
  {
    id: "econ_duration",
    name: "Extended Ops",
    description: "+1.5s round time per level",
    branch: "economy",
    maxLevel: 10,
    baseCost: 15,
    costGrowth: 1.25,
    effectPerLevel: 1.5,
    requires: [{ id: "econ_core", level: 3 }],
    icon: "⏱",
    depth: 2,
    angleOffset: 0.5,
  },
  {
    id: "econ_overtime",
    name: "Overtime Bonus",
    description: "+15% coins in last 10 seconds",
    branch: "economy",
    maxLevel: 8,
    baseCost: 60,
    costGrowth: 1.25,
    effectPerLevel: 0.15,
    requires: [{ id: "econ_duration", level: 4 }],
    icon: "⌛",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "econ_combo",
    name: "Bounty Hunter",
    description: "+5% kill streak coin bonus per level",
    branch: "economy",
    maxLevel: 12,
    baseCost: 30,
    costGrowth: 1.2,
    effectPerLevel: 0.05,
    requires: [{ id: "econ_core", level: 5 }],
    icon: "◎",
    depth: 2,
    angleOffset: 0,
  },
];

// Star (prestige) upgrades - kept separate
export interface StarUpgrade {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  effectPerLevel: number;
  icon: string;
}

export const STAR_UPGRADES: StarUpgrade[] = [
  {
    id: "star_power",
    name: "Star Power",
    description: "All damage ×1.25 per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    effectPerLevel: 0.25,
    icon: "⭐",
  },
  {
    id: "star_speed",
    name: "Star Speed",
    description: "All speed ×1.15 per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    effectPerLevel: 0.15,
    icon: "⭐",
  },
  {
    id: "star_endurance",
    name: "Star Endurance",
    description: "+3s base duration per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    effectPerLevel: 3,
    icon: "⭐",
  },
  {
    id: "star_fortune",
    name: "Star Fortune",
    description: "All coin gains ×1.2 per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    effectPerLevel: 0.2,
    icon: "⭐",
  },
  {
    id: "star_armor",
    name: "Star Armor",
    description: "Time-loss reduced 15% per level",
    maxLevel: 10,
    baseCost: 2,
    costGrowth: 1.8,
    effectPerLevel: 0.15,
    icon: "⭐",
  },
];

// Branch angles in radians (evenly spaced around circle)
// Order: DMG, GUNS, ECONOMY, MOVEMENT, HEALTH, MOTHERSHIP
export const BRANCH_ANGLES: Record<UpgradeBranch, number> = {
  dmg: -Math.PI / 2 + (Math.PI * 2 * 0) / 6, // top (pointing up)
  guns: -Math.PI / 2 + (Math.PI * 2 * 1) / 6,
  economy: -Math.PI / 2 + (Math.PI * 2 * 2) / 6,
  movement: -Math.PI / 2 + (Math.PI * 2 * 3) / 6,
  health: -Math.PI / 2 + (Math.PI * 2 * 4) / 6,
  mothership: -Math.PI / 2 + (Math.PI * 2 * 5) / 6,
};

export const BRANCH_COLORS: Record<UpgradeBranch, string> = {
  dmg: "#ff4466",
  guns: "#ffdd00",
  economy: "#ffaa00",
  movement: "#00ffcc",
  health: "#44ff44",
  mothership: "#4488ff",
};

export const BRANCH_LABELS: Record<UpgradeBranch, string> = {
  dmg: "DAMAGE",
  guns: "GUNS",
  economy: "ECONOMY",
  movement: "MOVEMENT",
  health: "HEALTH",
  mothership: "MOTHERSHIP",
};

// Helper functions
export function getNodeById(id: string): UpgradeNode | undefined {
  return UPGRADE_TREE.find((n) => n.id === id);
}

export function getStarUpgradeById(id: string): StarUpgrade | undefined {
  return STAR_UPGRADES.find((n) => n.id === id);
}

// Get parent node (the node this one requires)
export function getParentNode(node: UpgradeNode): UpgradeNode | undefined {
  if (!node.requires || node.requires.length === 0) return undefined;
  return UPGRADE_TREE.find((n) => n.id === node.requires![0].id);
}

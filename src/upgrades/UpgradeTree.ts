export type UpgradeBranch = "dmg" | "guns" | "movement" | "health" | "mothership" | "economy";

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
  depth: number; // 0=root, 1=tier1, 2=tier2, 3=tier3
  angleOffset: number;
  costs?: number[];
}

export function getUpgradeCost(node: UpgradeNode, currentLevel: number): number {
  if (node.costs && currentLevel < node.costs.length) {
    return node.costs[currentLevel];
  }
  return Math.floor(node.baseCost * Math.pow(node.costGrowth, currentLevel));
}

export function getUpgradeEffect(node: UpgradeNode, level: number): number {
  return node.effectPerLevel * level;
}

// ======= 3-TIER UPGRADE TREE =======
// Root → Tier 1 (4 basics) → Tier 2 (same + new abilities) → Tier 3 (endgame)

export const UPGRADE_TREE: UpgradeNode[] = [
  // ============ ROOT ============
  {
    id: "root",
    name: "Sentinel Core",
    description: "The heart of your ship. Unlocks all upgrade paths.",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 0,
    costGrowth: 1,
    effectPerLevel: 0,
    icon: "⬡",
    depth: 0,
    angleOffset: 0,
  },

  // ========================================
  // ============ TIER 1 — BASICS ===========
  // ========================================

  {
    id: "t1_dmg",
    name: "Weapon Power I",
    description: "+25% damage per level",
    branch: "dmg",
    maxLevel: 4,
    baseCost: 10,
    costGrowth: 2,
    effectPerLevel: 0.25,
    requires: [{ id: "root", level: 1 }],
    icon: "⚔",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "t1_speed",
    name: "Thruster Power I",
    description: "+20% movement speed per level",
    branch: "movement",
    maxLevel: 4,
    baseCost: 50,
    costGrowth: 1.3,
    effectPerLevel: 0.2,
    requires: [{ id: "root", level: 1 }],
    icon: "🚀",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "t1_ms_hp",
    name: "Mothership Hull I",
    description: "+1 mothership HP per level",
    branch: "mothership",
    maxLevel: 5,
    baseCost: 40,
    costGrowth: 1.25,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "⬡",
    depth: 1,
    angleOffset: 0,
  },
  {
    id: "t1_duration",
    name: "Extended Ops I",
    description: "+5s round length per level",
    branch: "economy",
    maxLevel: 4,
    baseCost: 50,
    costGrowth: 1.3,
    effectPerLevel: 5,
    requires: [{ id: "root", level: 1 }],
    icon: "⏱",
    depth: 1,
    angleOffset: 0,
  },

  // ========================================
  // ============ TIER 2 — SAME + NEW ======
  // ========================================

  // --- Same 4 basics, more expensive ---
  {
    id: "t2_dmg",
    name: "Weapon Power II",
    description: "+25% damage per level",
    branch: "dmg",
    maxLevel: 4,
    baseCost: 200,
    costGrowth: 1.35,
    effectPerLevel: 0.25,
    requires: [{ id: "t1_dmg", level: 4 }],
    icon: "⚔",
    depth: 2,
    angleOffset: -0.3,
  },
  {
    id: "t2_speed",
    name: "Thruster Power II",
    description: "+20% movement speed per level",
    branch: "movement",
    maxLevel: 4,
    baseCost: 200,
    costGrowth: 1.35,
    effectPerLevel: 0.2,
    requires: [{ id: "t1_speed", level: 4 }],
    icon: "🚀",
    depth: 2,
    angleOffset: -0.3,
  },
  {
    id: "t2_ms_hp",
    name: "Mothership Hull II",
    description: "+1 mothership HP per level",
    branch: "mothership",
    maxLevel: 5,
    baseCost: 150,
    costGrowth: 1.3,
    effectPerLevel: 1,
    requires: [{ id: "t1_ms_hp", level: 5 }],
    icon: "⬡",
    depth: 2,
    angleOffset: -0.4,
  },
  {
    id: "t2_duration",
    name: "Extended Ops II",
    description: "+5s round length per level",
    branch: "economy",
    maxLevel: 4,
    baseCost: 200,
    costGrowth: 1.35,
    effectPerLevel: 5,
    requires: [{ id: "t1_duration", level: 4 }],
    icon: "⏱",
    depth: 2,
    angleOffset: -0.3,
  },

  // --- Tier 2 NEW abilities ---
  {
    id: "t2_enemies",
    name: "Swarm Attractor",
    description: "+25% more enemies per level",
    branch: "economy",
    maxLevel: 2,
    baseCost: 300,
    costGrowth: 1.5,
    effectPerLevel: 0.25,
    requires: [{ id: "t1_duration", level: 2 }],
    icon: "👾",
    depth: 2,
    angleOffset: 0.4,
  },
  {
    id: "t2_boss_dmg",
    name: "Giant Slayer",
    description: "+50% damage to bosses per level",
    branch: "guns",
    maxLevel: 2,
    baseCost: 350,
    costGrowth: 1.4,
    effectPerLevel: 0.5,
    requires: [{ id: "t1_dmg", level: 2 }],
    icon: "💀",
    depth: 2,
    angleOffset: -0.6,
  },
  {
    id: "t2_shield_explode",
    name: "Shield Nova",
    description: "Shield explodes on hit (2× base dmg, lose shield, no shield = death)",
    branch: "health",
    maxLevel: 1,
    baseCost: 400,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "💥",
    depth: 2,
    angleOffset: -0.3,
  },
  {
    id: "t2_missiles",
    name: "Missile Pods",
    description: "Launch 2 homing missiles (½ base dmg each) every 2 beats",
    branch: "guns",
    maxLevel: 1,
    baseCost: 400,
    costGrowth: 1,
    effectPerLevel: 2,
    requires: [{ id: "t1_dmg", level: 2 }],
    icon: "🚀",
    depth: 2,
    angleOffset: 0.3,
  },
  {
    id: "t2_mine",
    name: "Proximity Mine",
    description: "Dash leaves a mine that explodes on contact",
    branch: "movement",
    maxLevel: 1,
    baseCost: 350,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "t1_speed", level: 2 }],
    icon: "💣",
    depth: 2,
    angleOffset: 0.4,
  },
  {
    id: "t2_range",
    name: "Pulse Amplifier",
    description: "+15px AoE range per level",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 250,
    costGrowth: 1.4,
    effectPerLevel: 15,
    requires: [{ id: "t1_dmg", level: 2 }],
    icon: "◎",
    depth: 2,
    angleOffset: 0.4,
  },
  {
    id: "t2_cluster",
    name: "Gravity Well",
    description: "Enemies spawn in clusters near each other",
    branch: "economy",
    maxLevel: 1,
    baseCost: 300,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "t1_duration", level: 2 }],
    icon: "🌀",
    depth: 2,
    angleOffset: 0,
  },
  {
    id: "t2_double_drops",
    name: "Scavenger",
    description: "Double material drops from enemies",
    branch: "economy",
    maxLevel: 1,
    baseCost: 500,
    costGrowth: 1,
    effectPerLevel: 2,
    requires: [{ id: "t1_duration", level: 3 }],
    icon: "◆",
    depth: 2,
    angleOffset: -0.6,
  },
  {
    id: "t2_shield_regen",
    name: "Shield Generator",
    description: "Regenerate 1 shield every 5 beats",
    branch: "health",
    maxLevel: 1,
    baseCost: 450,
    costGrowth: 1,
    effectPerLevel: 5,
    requires: [{ id: "t2_shield_explode", level: 1 }],
    icon: "♥",
    depth: 2,
    angleOffset: 0.4,
  },

  // ========================================
  // ============ TIER 3 — ENDGAME =========
  // ========================================

  {
    id: "t3_range",
    name: "Shockwave Array",
    description: "+20px AoE range per level",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 800,
    costGrowth: 1.4,
    effectPerLevel: 20,
    requires: [{ id: "t2_range", level: 2 }],
    icon: "◉",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "t3_enemies",
    name: "Swarm Beacon",
    description: "+50% more enemies",
    branch: "economy",
    maxLevel: 1,
    baseCost: 800,
    costGrowth: 1,
    effectPerLevel: 0.5,
    requires: [{ id: "t2_enemies", level: 2 }],
    icon: "👾",
    depth: 3,
    angleOffset: 0.4,
  },
  {
    id: "t3_shield_regen",
    name: "Rapid Shields",
    description: "Shield regen every 2 beats instead of 5",
    branch: "health",
    maxLevel: 1,
    baseCost: 1000,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "t2_shield_regen", level: 1 }],
    icon: "♥",
    depth: 3,
    angleOffset: 0.4,
  },
  {
    id: "t3_lightning",
    name: "Chain Lightning",
    description: "Lightning bolt chains between nearby enemies",
    branch: "guns",
    maxLevel: 1,
    baseCost: 900,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "t2_missiles", level: 1 }],
    icon: "⚡",
    depth: 3,
    angleOffset: 0,
  },
  {
    id: "t3_lightning_fork",
    name: "Forked Lightning",
    description: "+1 chain target per level",
    branch: "guns",
    maxLevel: 3,
    baseCost: 600,
    costGrowth: 1.4,
    effectPerLevel: 1,
    requires: [{ id: "t3_lightning", level: 1 }],
    icon: "⚡",
    depth: 3,
    angleOffset: -0.4,
  },
  {
    id: "t3_lightning_dist",
    name: "Surge Range",
    description: "+30px chain jump distance per level",
    branch: "guns",
    maxLevel: 3,
    baseCost: 600,
    costGrowth: 1.4,
    effectPerLevel: 30,
    requires: [{ id: "t3_lightning", level: 1 }],
    icon: "↯",
    depth: 3,
    angleOffset: 0.5,
  },
  {
    id: "t3_missiles",
    name: "Missile Barrage",
    description: "Fire 4 missiles instead of 2",
    branch: "guns",
    maxLevel: 1,
    baseCost: 1000,
    costGrowth: 1,
    effectPerLevel: 2,
    requires: [{ id: "t2_missiles", level: 1 }],
    icon: "🚀",
    depth: 3,
    angleOffset: 0.3,
  },
  {
    id: "t3_missile_dmg",
    name: "Warheads",
    description: "Double missile damage",
    branch: "guns",
    maxLevel: 1,
    baseCost: 900,
    costGrowth: 1,
    effectPerLevel: 2,
    requires: [{ id: "t2_missiles", level: 1 }],
    icon: "☢",
    depth: 3,
    angleOffset: -0.6,
  },
  {
    id: "t3_double_bpm",
    name: "Overclock",
    description: "Double attack speed (2× BPM)",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 1500,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "t2_range", level: 3 }],
    icon: "⏫",
    depth: 3,
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
export const BRANCH_ANGLES: Record<UpgradeBranch, number> = {
  dmg: -Math.PI / 2 + (Math.PI * 2 * 0) / 6,
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
  guns: "WEAPONS",
  economy: "ECONOMY",
  movement: "MOVEMENT",
  health: "SHIELDS",
  mothership: "MOTHERSHIP",
};

export function getNodeById(id: string): UpgradeNode | undefined {
  return UPGRADE_TREE.find((n) => n.id === id);
}

export function getStarUpgradeById(id: string): StarUpgrade | undefined {
  return STAR_UPGRADES.find((n) => n.id === id);
}

export function getParentNode(node: UpgradeNode): UpgradeNode | undefined {
  if (!node.requires || node.requires.length === 0) return undefined;
  return UPGRADE_TREE.find((n) => n.id === node.requires![0].id);
}

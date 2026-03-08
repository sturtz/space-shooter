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
  iconPath?: string;
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

// Base asset path for upgrade tree SVGs
const A = "./assets/upgrade-tree/";

// =====================================================================
// UPGRADE TREE
// Baseline economy: ~9-10 coins per early round
// T1 first level costs 9 coins — reachable after round 1
// Costs scale ~2.3× per level, ~2.5× between tiers
// =====================================================================

export const UPGRADE_TREE: UpgradeNode[] = [
  // ============================================================
  // ROOT
  // ============================================================
  {
    id: "root",
    name: "Sentinel Core",
    description: "The heart of your ship. All upgrade paths branch from here.",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 0,
    costGrowth: 1,
    effectPerLevel: 0,
    icon: "⬡",
    iconPath: `${A}forward-field.svg`,
    depth: 0,
    angleOffset: 0,
  },

  // ============================================================
  // DAMAGE BRANCH
  // dmg_core → dmg_range (left) / dmg_crit (right)
  //          dmg_range → dmg_overclock (left, depth-3)
  // ============================================================
  {
    id: "dmg_core",
    name: "Pulse Amplifier",
    description: "+25% pulse damage per level",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2,
    effectPerLevel: 0.25,
    requires: [{ id: "root", level: 1 }],
    icon: "⚔",
    iconPath: `${A}sword-brandish.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [10, 25, 50],
  },
  {
    id: "dmg_range",
    name: "Expanded Rays",
    description: "+20px pulse AoE radius per level",
    branch: "dmg",
    maxLevel: 2,
    baseCost: 40,
    costGrowth: 2.5,
    effectPerLevel: 20,
    requires: [{ id: "dmg_core", level: 1 }],
    icon: "◎",
    iconPath: `${A}expanded-rays.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [40, 100],
  },
  {
    id: "dmg_crit",
    name: "Sword Wound",
    description: "+8% critical strike chance per level (crits deal 2.5× damage)",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    effectPerLevel: 0.08,
    requires: [{ id: "dmg_core", level: 2 }],
    icon: "✦",
    iconPath: `${A}sword-wound.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [50, 125, 250],
  },
  {
    id: "dmg_overclock",
    name: "Scythe",
    description: "Double attack speed — 2× BPM fire rate",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 420,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "dmg_range", level: 2 }],
    icon: "☽",
    iconPath: `${A}scythe.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [400],
  },

  // ============================================================
  // WEAPONS BRANCH
  // guns_missile (left) / guns_chain (right)
  //           guns_missile → guns_barrage (left, depth-3)
  // ============================================================
  {
    id: "guns_missile",
    name: "Rocket Pods",
    description: "Homing missiles every 2 beats — +1 missile per level (max 3)",
    branch: "guns",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "↑",
    iconPath: `${A}rocket.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [50, 125, 300],
  },
  {
    id: "guns_chain",
    name: "Ringed Beam",
    description: "+1 chain lightning jump per level",
    branch: "guns",
    maxLevel: 3,
    baseCost: 55,
    costGrowth: 2.3,
    effectPerLevel: 1,
    requires: [{ id: "guns_missile", level: 2 }],
    icon: "⚡",
    iconPath: `${A}ringed-beam.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [60, 125, 300],
  },
  {
    id: "guns_barrage",
    name: "Bombing Run",
    description: "Override missiles — fire 4 at once with +30px splash radius",
    branch: "guns",
    maxLevel: 1,
    baseCost: 450,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "guns_missile", level: 2 }],
    icon: "💣",
    iconPath: `${A}bombing-run.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [500],
  },

  // ============================================================
  // ECONOMY BRANCH
  // econ_duration → econ_value (left) / econ_magnet (right)
  //              econ_magnet → econ_swarm (right, depth-3)
  // ============================================================
  {
    id: "econ_duration",
    name: "Extended Ops",
    description: "+50% round duration per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2.3,
    effectPerLevel: 1.5,
    requires: [{ id: "root", level: 1 }],
    icon: "⏱",
    iconPath: `${A}extra-time.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [10, 25, 50],
  },
  {
    id: "econ_value",
    name: "Double Take",
    description: "+25% coin drop value per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 30,
    costGrowth: 2.3,
    effectPerLevel: 0.25,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "◆",
    iconPath: `${A}two-coins.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [30, 65, 150],
  },
  {
    id: "econ_magnet",
    name: "Coin Magnet",
    description: "+20px coin attraction range per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2.1,
    effectPerLevel: 20,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "○",
    iconPath: `${A}coins.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [10, 20, 40],
  },
  {
    id: "econ_swarm",
    name: "Swarm Attractor",
    description: "+40% enemy spawn rate per level — more kills, more coins",
    branch: "economy",
    maxLevel: 2,
    baseCost: 100,
    costGrowth: 2.5,
    effectPerLevel: 0.4,
    requires: [{ id: "econ_magnet", level: 2 }],
    icon: "👾",
    iconPath: `${A}surrounded-eye.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [100, 250],
  },

  // ============================================================
  // MOVEMENT BRANCH
  // move_speed → move_emp (left) / move_mine (right)
  //            move_mine → move_trap (right, depth-3)
  // ============================================================
  {
    id: "move_speed",
    name: "Thrusters",
    description: "+25% movement speed per level",
    branch: "movement",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2.2,
    effectPerLevel: 0.25,
    requires: [{ id: "root", level: 1 }],
    icon: "▲",
    iconPath: `${A}jet-pack.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [10, 25, 50],
  },
  {
    id: "move_emp",
    name: "Flash Grenade",
    description: "+40px dash EMP blast radius per level",
    branch: "movement",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    effectPerLevel: 40,
    requires: [{ id: "move_speed", level: 1 }],
    icon: "◉",
    iconPath: `${A}flash-grenade.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [50, 100, 200],
  },
  {
    id: "move_mine",
    name: "Rolling Bomb",
    description: "Dashing leaves a proximity mine — explodes on enemy contact",
    branch: "movement",
    maxLevel: 1,
    baseCost: 75,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "move_speed", level: 2 }],
    icon: "💣",
    iconPath: `${A}rolling-bomb.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [75],
  },
  {
    id: "move_trap",
    name: "Time Trap",
    description: "Mine explosions create a 50% slow field lasting 4 seconds",
    branch: "movement",
    maxLevel: 1,
    baseCost: 210,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "move_mine", level: 1 }],
    icon: "⏰",
    iconPath: `${A}time-trap.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [200],
  },

  // ============================================================
  // EFFECTS BRANCH (formerly "health" — player is invincible)
  // eff_poison → eff_slow (left) / eff_bomb (right)
  // ============================================================
  {
    id: "eff_poison",
    name: "Assassin's Touch",
    description: "+5% poison DPS per level (% of base damage per second)",
    branch: "health",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2.4,
    effectPerLevel: 0.05,
    requires: [{ id: "root", level: 1 }],
    icon: "☠",
    iconPath: `${A}assassin-pocket.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [10, 25, 50],
  },
  {
    id: "eff_slow",
    name: "Toxic Drop",
    description: "+8% slow on hit per level",
    branch: "health",
    maxLevel: 3,
    baseCost: 38,
    costGrowth: 2.3,
    effectPerLevel: 0.08,
    requires: [{ id: "eff_poison", level: 1 }],
    icon: "↓",
    iconPath: `${A}drop.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [40, 90, 200],
  },
  {
    id: "eff_bomb",
    name: "Unlit Bomb",
    description: "Auto-deploys a bomb every 8 beats — deals 2× base damage",
    branch: "health",
    maxLevel: 1,
    baseCost: 80,
    costGrowth: 1,
    effectPerLevel: 1,
    requires: [{ id: "eff_poison", level: 2 }],
    icon: "💣",
    iconPath: `${A}unlit-bomb.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [80],
  },

  // ============================================================
  // MOTHERSHIP BRANCH
  // ms_hull → ms_turret (left) / ms_barrier (right)
  // ============================================================
  {
    id: "ms_hull",
    name: "Reinforced Hull",
    description: "+1 mothership max HP per level",
    branch: "mothership",
    maxLevel: 4,
    baseCost: 10,
    costGrowth: 2.2,
    effectPerLevel: 1,
    requires: [{ id: "root", level: 1 }],
    icon: "⬡",
    iconPath: `${A}shield.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [10, 25, 50, 100],
  },
  {
    id: "ms_turret",
    name: "Sentinel Eye",
    description: "Unlock / upgrade auto-targeting turret — higher level = faster fire",
    branch: "mothership",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.4,
    effectPerLevel: 1,
    requires: [{ id: "ms_hull", level: 2 }],
    icon: "◉",
    depth: 2,
    angleOffset: -0.35,
    costs: [50, 125, 275],
  },
  {
    id: "ms_barrier",
    name: "Barrier Echoes",
    description: "+1 energy barrier hit capacity per level",
    branch: "mothership",
    maxLevel: 3,
    baseCost: 40,
    costGrowth: 2.3,
    effectPerLevel: 1,
    requires: [{ id: "ms_hull", level: 1 }],
    icon: "◎",
    iconPath: `${A}shield-echoes.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [40, 90, 200],
  },
];

// ============================================================
// STAR (PRESTIGE) UPGRADES — spent with starCoins
// ============================================================
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
    description: "+3s base round duration per level",
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
    description: "Mothership time-penalty reduced 15% per level",
    maxLevel: 10,
    baseCost: 2,
    costGrowth: 1.8,
    effectPerLevel: 0.15,
    icon: "⭐",
  },
];

// ============================================================
// BRANCH LAYOUT — evenly spaced in a circle
// ============================================================
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
  health: "#cc44ff",
  mothership: "#4488ff",
};

// ============================================================
// HELPERS
// ============================================================
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

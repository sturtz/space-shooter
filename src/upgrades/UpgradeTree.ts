export type UpgradeBranch = "dmg" | "guns" | "movement" | "health" | "mothership" | "economy";

export interface UpgradeNode {
  id: string;
  name: string;
  description: string;
  branch: UpgradeBranch;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  requires?: { id: string; level: number }[];
  /** Mutually exclusive — locked if any listed node has level > 0 */
  excludes?: string[];
  /** Hidden from upgrade screen (stats computed but gameplay not yet wired) */
  hidden?: boolean;
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

// Base asset path for upgrade tree SVGs
const A = "./assets/upgrade-tree/";

// =====================================================================
// UPGRADE TREE
// Phase 1 rebalance: logarithmic economy
// T1 first level costs 5 coins — buyable after round 1
// Cost curve: T1: 5-8, T2: 18-45, T3: 60-300, T4: 180-400
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
    icon: "⬡",
    iconPath: `./assets/pulse-player.svg`,
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
    description: "Increase pulse damage (1→2→4→7)",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2,
    requires: [{ id: "root", level: 1 }],
    icon: "⚔",
    iconPath: `${A}sword-brandish.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [8, 18, 40],
  },
  {
    id: "dmg_forward",
    name: "Forward Field",
    description: "Pulse extends forward in facing direction — bigger reach ahead",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 20,
    costGrowth: 1,
    requires: [{ id: "dmg_core", level: 1 }],
    icon: "▶",
    iconPath: `${A}forward-field.svg`,
    depth: 2,
    angleOffset: -0.7,
    costs: [25],
  },
  {
    id: "dmg_range",
    name: "Expanded Rays",
    description: "+20px pulse AoE radius per level",
    branch: "dmg",
    maxLevel: 2,
    baseCost: 40,
    costGrowth: 2.5,
    requires: [{ id: "dmg_core", level: 1 }],
    icon: "◎",
    iconPath: `${A}expanded-rays.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [35, 85],
  },
  {
    id: "dmg_crit",
    name: "Sword Wound",
    description: "+8% critical strike chance per level (crits deal 2.5× damage)",
    branch: "dmg",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    requires: [{ id: "dmg_core", level: 2 }],
    icon: "✦",
    iconPath: `${A}sword-wound.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [30, 80, 180],
  },
  {
    id: "dmg_overclock",
    name: "Scythe",
    description: "Double attack speed — 2× BPM fire rate",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 420,
    costGrowth: 1,
    requires: [{ id: "dmg_range", level: 2 }],
    icon: "☽",
    iconPath: `${A}scythe.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [300],
  },

  // ============================================================
  // WEAPONS BRANCH
  // guns_missile (left) / guns_chain (right)
  //           guns_missile → guns_barrage (left, depth-3)
  // ============================================================
  {
    id: "guns_missile",
    name: "Twin Cannons",
    description: "+1 parallel shot per level — fires side-by-side bullets",
    branch: "guns",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    requires: [{ id: "dmg_core", level: 1 }],
    icon: "↑",
    iconPath: `${A}rocket.svg`,
    depth: 2,
    angleOffset: 0,
    costs: [25, 65, 150],
  },
  {
    id: "guns_bolt",
    name: "Hypersonic Bolt",
    description: "+1 bullet pierce per level — shots pass through enemies",
    branch: "guns",
    maxLevel: 3,
    baseCost: 40,
    costGrowth: 2.3,
    requires: [{ id: "dmg_core", level: 2 }],
    icon: "→",
    iconPath: `${A}hypersonic-bolt.svg`,
    depth: 2,
    angleOffset: 0.7,
    costs: [20, 55, 130],
  },
  {
    id: "guns_chain",
    name: "Ringed Beam",
    description: "+1 chain lightning jump per level",
    branch: "guns",
    maxLevel: 3,
    baseCost: 55,
    costGrowth: 2.3,
    requires: [{ id: "guns_missile", level: 2 }],
    icon: "⚡",
    iconPath: `${A}ringed-beam.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [60, 130, 280],
  },
  {
    id: "guns_barrage",
    name: "Bombing Run",
    description: "Override missiles — fire 4 at once with +30px splash radius",
    branch: "guns",
    maxLevel: 1,
    baseCost: 450,
    costGrowth: 1,
    requires: [{ id: "guns_missile", level: 2 }],
    icon: "💣",
    iconPath: `${A}bombing-run.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [400],
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
    requires: [{ id: "root", level: 1 }],
    icon: "⏱",
    iconPath: `${A}extra-time.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [8, 18, 40],
  },
  {
    id: "econ_value",
    name: "Double Take",
    description: "+1 extra coin per kill per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 30,
    costGrowth: 2.3,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "◆",
    iconPath: `${A}two-coins.svg`,
    depth: 2,
    angleOffset: -0.35,
    costs: [18, 45, 110],
  },
  {
    id: "econ_combo",
    name: "Profit Margin",
    description: "+10% bonus to total round coins per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 60,
    costGrowth: 2.3,
    requires: [{ id: "econ_value", level: 2 }],
    icon: "💰",
    iconPath: `${A}coins.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [60, 140, 300],
  },
  {
    id: "econ_magnet",
    name: "Coin Magnet",
    description: "+20px coin attraction range per level",
    branch: "economy",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 2.1,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "○",
    iconPath: `${A}coins.svg`,
    depth: 2,
    angleOffset: 0.35,
    costs: [8, 16, 30],
  },
  {
    id: "econ_lucky",
    name: "Lucky Strike",
    description: "+4% chance per level for enemies to drop 5× coins",
    branch: "economy",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    requires: [{ id: "econ_value", level: 1 }],
    icon: "🍀",
    iconPath: `${A}coins.svg`,
    depth: 3,
    angleOffset: 0,
    costs: [50, 120, 280],
  },
  {
    id: "econ_swarm",
    name: "Swarm Attractor",
    description: "+40% enemy spawn rate per level — more kills, more coins",
    branch: "economy",
    maxLevel: 2,
    baseCost: 15,
    costGrowth: 2.5,
    requires: [{ id: "root", level: 1 }],
    icon: "👾",
    iconPath: `${A}surrounded-eye.svg`,
    depth: 1,
    angleOffset: 0.8, // was 4 (way too high, caused overlap with guns branch)
    costs: [12, 30],
  },

  // ============================================================
  // MOVEMENT BRANCH (Thrusters is a root-level T1 upgrade — early game)
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
    requires: [{ id: "root", level: 1 }],
    icon: "▲",
    iconPath: `${A}jet-pack.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [8, 18, 40],
  },
  {
    id: "move_emp",
    name: "Flash Grenade",
    description: "+40px dash EMP blast radius per level",
    branch: "movement",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    requires: [{ id: "move_speed", level: 1 }],
    icon: "◉",
    iconPath: `${A}flash-grenade.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [40, 90, 180],
  },
  {
    id: "move_mine",
    name: "Rolling Bomb",
    description: "Dashing leaves a proximity mine — explodes on enemy contact",
    branch: "movement",
    maxLevel: 1,
    baseCost: 75,
    costGrowth: 1,
    requires: [{ id: "move_speed", level: 2 }],
    icon: "💣",
    iconPath: `${A}rolling-bomb.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [65],
  },
  {
    id: "move_trap",
    name: "Time Trap",
    description: "Mine explosions create a 50% slow field lasting 4 seconds",
    branch: "movement",
    maxLevel: 1,
    baseCost: 210,
    costGrowth: 1,
    requires: [{ id: "move_mine", level: 1 }],
    icon: "⏰",
    iconPath: `${A}time-trap.svg`,
    depth: 4,
    angleOffset: 0.35,
    costs: [180],
  },

  // ============================================================
  // PLAYER HEALTH BRANCH — survivability upgrades
  // hp_boost → hp_regen (left) / hp_shield (right)
  // ============================================================
  {
    id: "hp_boost",
    name: "Vital Core",
    description: "+1 player max HP per level",
    branch: "health",
    maxLevel: 3,
    baseCost: 8,
    costGrowth: 2.3,
    requires: [{ id: "root", level: 1 }],
    icon: "♥",
    iconPath: `${A}shield.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [12, 30, 70],
  },
  {
    id: "hp_regen",
    name: "Auto-Repair",
    description: "Regenerate 1 HP every 15s",
    branch: "health",
    maxLevel: 2,
    baseCost: 30,
    costGrowth: 2.5,
    requires: [{ id: "hp_boost", level: 1 }],
    icon: "✚",
    iconPath: `${A}shield.svg`,
    depth: 2,
    angleOffset: -0.5,
    costs: [30, 75],
  },
  {
    id: "hp_shield",
    name: "Hardened Plating",
    description: "+0.5s invulnerability after taking damage per level",
    branch: "health",
    maxLevel: 2,
    baseCost: 40,
    costGrowth: 2.5,
    requires: [{ id: "hp_boost", level: 2 }],
    icon: "🛡",
    iconPath: `${A}shield-echoes.svg`,
    depth: 2,
    angleOffset: 0.5,
    costs: [40, 100],
  },

  // ============================================================
  // EFFECTS BRANCH (formerly "health" — now shares branch with hp nodes)
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
    requires: [{ id: "dmg_core", level: 1 }],
    icon: "☠",
    iconPath: `${A}assassin-pocket.svg`,
    depth: 2,
    angleOffset: 0,
    costs: [8, 20, 45],
  },
  {
    id: "eff_slow",
    name: "Toxic Drop",
    description: "+8% slow on hit per level",
    branch: "health",
    maxLevel: 3,
    baseCost: 38,
    costGrowth: 2.3,
    requires: [{ id: "eff_poison", level: 1 }],
    icon: "↓",
    iconPath: `${A}drop.svg`,
    depth: 3,
    angleOffset: -0.35,
    costs: [30, 70, 160],
  },
  {
    id: "eff_bomb",
    name: "Unlit Bomb",
    description: "Auto-deploys a bomb every 8 beats — deals 2× base damage",
    branch: "health",
    maxLevel: 1,
    baseCost: 80,
    costGrowth: 1,
    requires: [{ id: "eff_poison", level: 2 }],
    icon: "💣",
    iconPath: `${A}unlit-bomb.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [70],
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
    requires: [{ id: "root", level: 1 }],
    icon: "⬡",
    iconPath: `${A}shield.svg`,
    depth: 1,
    angleOffset: 0,
    costs: [8, 20, 45, 90],
  },
  {
    id: "ms_slow",
    name: "Gravity Well",
    description: "Enemies near mothership are slowed — 50% / 60% / 75%",
    branch: "mothership",
    maxLevel: 3,
    baseCost: 10,
    costGrowth: 1.5,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "◎",
    iconPath: `${A}gravity-well.svg`,
    depth: 2,
    angleOffset: 0.5,
    costs: [8, 15, 30],
  },
  {
    id: "ms_turret",
    name: "Sentinel Eye",
    description: "Unlock / upgrade auto-targeting turret — higher level = faster fire",
    branch: "mothership",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.4,
    requires: [{ id: "ms_hull", level: 2 }],
    icon: "◉",
    depth: 3,
    angleOffset: -0.35,
    costs: [45, 110, 250],
  },
  {
    id: "ms_barrier",
    name: "Barrier Echoes",
    description: "+1 energy barrier hit capacity per level",
    branch: "mothership",
    maxLevel: 3,
    baseCost: 40,
    costGrowth: 2.3,
    requires: [{ id: "ms_hull", level: 1 }],
    icon: "◎",
    iconPath: `${A}shield-echoes.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [30, 75, 170],
  },

  // ============================================================
  // PHASE 2 — NEW UPGRADE NODES (~14 new)
  // ============================================================

  // ── DAMAGE: Execute & Overcharge ──────────────────────────────
  {
    id: "dmg_execute",
    name: "Executioner",
    description: "Instant-kill enemies below 15% HP",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 80,
    costGrowth: 1,
    requires: [{ id: "dmg_crit", level: 2 }],
    icon: "⚔",
    iconPath: `${A}explosion-rays.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [80],
  },
  {
    id: "dmg_overcharge",
    name: "Death Nova",
    description: "Killed enemies explode — 50% damage to enemies within 60px",
    branch: "dmg",
    maxLevel: 1,
    baseCost: 400,
    costGrowth: 1,
    requires: [{ id: "dmg_overclock", level: 1 }],
    icon: "💥",
    iconPath: `${A}explosion-rays.svg`,
    depth: 4,
    angleOffset: -0.35,
    costs: [400],
  },

  // ── GUNS: Multishot & Orbital ─────────────────────────────────
  {
    id: "guns_multishot",
    name: "Spread Shot",
    description: "+1 extra projectile per level in fan spread",
    branch: "guns",
    maxLevel: 2,
    baseCost: 70,
    costGrowth: 2.5,
    requires: [{ id: "guns_bolt", level: 1 }],
    icon: "⁂",
    iconPath: `${A}starfighter.svg`,
    depth: 3,
    angleOffset: 0.7,
    costs: [70, 180],
  },
  {
    id: "guns_orbital",
    name: "Orbital Drones",
    description: "2 orbiting drones fire independently every 3 beats",
    branch: "guns",
    maxLevel: 1,
    baseCost: 500,
    costGrowth: 1,
    requires: [{ id: "guns_chain", level: 2 }],
    icon: "◎",
    iconPath: `${A}surrounded-eye.svg`,
    depth: 4,
    angleOffset: 0.35,
    costs: [500],
  },

  // ── ECONOMY: Bounty & Interest ────────────────────────────────
  {
    id: "econ_bounty",
    name: "Elite Bounty",
    description: "Elite enemies drop 3× coins",
    branch: "economy",
    maxLevel: 2,
    baseCost: 20,
    costGrowth: 2.5,
    requires: [{ id: "econ_duration", level: 1 }],
    icon: "◆",
    iconPath: `${A}two-coins.svg`,
    depth: 2,
    angleOffset: 0,
    costs: [20, 50],
  },
  {
    id: "econ_interest",
    name: "Compound Interest",
    description: "Earn 5% of banked coins as bonus per round",
    branch: "economy",
    maxLevel: 2,
    baseCost: 80,
    costGrowth: 2.5,
    requires: [{ id: "econ_magnet", level: 2 }],
    icon: "💰",
    iconPath: `${A}coins.svg`,
    depth: 3,
    angleOffset: 0.35,
    costs: [80, 200],
  },

  // ── MOVEMENT: Afterimage & Warp ───────────────────────────────
  {
    id: "move_afterimage",
    name: "Afterburn",
    description: "Leave damage trail (20% base dmg/tick) when moving fast",
    branch: "movement",
    maxLevel: 2,
    baseCost: 60,
    costGrowth: 2.5,
    requires: [{ id: "move_speed", level: 2 }],
    icon: "≋",
    iconPath: `${A}speedometer.svg`,
    depth: 2,
    angleOffset: 0,
    costs: [60, 150],
  },
  {
    id: "move_warp",
    name: "Phase Rift",
    description: "Dash creates entry portal — dash again within 5s to teleport back",
    branch: "movement",
    maxLevel: 1,
    baseCost: 300,
    costGrowth: 1,
    requires: [{ id: "move_mine", level: 1 }],
    icon: "⊕",
    iconPath: `${A}sundial.svg`,
    depth: 4,
    angleOffset: 0,
    costs: [300],
  },

  // ── EFFECTS: Freeze & Bleed ───────────────────────────────────
  {
    id: "eff_freeze",
    name: "Flash Freeze",
    description: "+5% chance per level to freeze enemy for 2s",
    branch: "health",
    maxLevel: 3,
    baseCost: 50,
    costGrowth: 2.3,
    requires: [{ id: "eff_slow", level: 1 }],
    icon: "❄",
    iconPath: `${A}drop.svg`,
    depth: 4,
    angleOffset: -0.35,
    costs: [50, 120, 280],
  },
  {
    id: "eff_bleed",
    name: "Hemorrhage",
    description: "Hits apply stacking bleed — 2% max HP/sec per stack, max 5",
    branch: "health",
    maxLevel: 2,
    baseCost: 60,
    costGrowth: 2.5,
    requires: [{ id: "eff_poison", level: 2 }],
    icon: "🩸",
    iconPath: `${A}assassin-pocket.svg`,
    depth: 3,
    angleOffset: 0,
    costs: [60, 150],
  },

  // ── MOTHERSHIP: Repair, Mech, Overdrive, Fortress ─────────────
  {
    id: "ms_repair",
    name: "Auto-Repair",
    description: "Mothership auto-heals 1 HP every 30s",
    branch: "mothership",
    maxLevel: 2,
    baseCost: 25,
    costGrowth: 2.4,
    requires: [{ id: "ms_hull", level: 1 }],
    icon: "🔧",
    iconPath: `${A}shield.svg`,
    depth: 3,
    angleOffset: 0,
    costs: [25, 60],
  },
  {
    id: "ms_mech",
    name: "MECH MODE",
    description: "Mothership grows limbs — follows player at 50% speed, stomps enemies",
    branch: "mothership",
    maxLevel: 1,
    baseCost: 500,
    costGrowth: 1,
    requires: [{ id: "ms_turret", level: 2 }],
    excludes: ["ms_fortress"],
    icon: "🤖",
    iconPath: `${A}starfighter.svg`,
    depth: 4,
    angleOffset: -0.7,
    costs: [500],
  },
  {
    id: "ms_overdrive",
    name: "Mech Overdrive",
    description: "Mech fires homing missiles every 4 beats + AoE stomp shockwave",
    branch: "mothership",
    maxLevel: 1,
    baseCost: 800,
    costGrowth: 1,
    requires: [{ id: "ms_mech", level: 1 }],
    icon: "⚡",
    iconPath: `${A}rocket.svg`,
    depth: 5,
    angleOffset: -0.7,
    costs: [800],
  },
  {
    id: "ms_fortress",
    name: "FORTRESS MODE",
    description: "Immovable mothership — 150px damage dome, turret fires 3× faster",
    branch: "mothership",
    maxLevel: 1,
    baseCost: 600,
    costGrowth: 1,
    requires: [{ id: "ms_turret", level: 2 }],
    excludes: ["ms_mech"],
    icon: "🏰",
    iconPath: `${A}shield-echoes.svg`,
    depth: 4,
    angleOffset: -0.35,
    costs: [600],
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
    icon: "⭐",
  },
  {
    id: "star_speed",
    name: "Star Speed",
    description: "All speed ×1.15 per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    icon: "⭐",
  },
  {
    id: "star_endurance",
    name: "Star Endurance",
    description: "+3s base round duration per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    icon: "⭐",
  },
  {
    id: "star_fortune",
    name: "Star Fortune",
    description: "All coin gains ×1.2 per level",
    maxLevel: 20,
    baseCost: 1,
    costGrowth: 1.5,
    icon: "⭐",
  },
  {
    id: "star_armor",
    name: "Star Armor",
    description: "Mothership time-penalty reduced 15% per level",
    maxLevel: 10,
    baseCost: 2,
    costGrowth: 1.8,
    icon: "⭐",
  },
];

// ============================================================
// BRANCH LAYOUT — evenly spaced in a circle
// ============================================================
export const BRANCH_ANGLES: Record<UpgradeBranch, number> = {
  // Left arm — combat branches fanning wider
  dmg: Math.PI, // 180° straight left
  guns: (Math.PI * 5) / 9, // 100° upper-left (was 120°)
  health: (Math.PI * 4) / 3, // 240° (was 260° — moved to avoid overlap with movement at 285°)
  movement: (Math.PI * 19) / 12, // 285° (was 270° — widened gap from health)
  // Right arm — economy / ship branches spread wider
  economy: Math.PI / 12, // 15° slight upper-right (was 0°)
  mothership: -Math.PI / 3, // -60° upper-right (was -30°)
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

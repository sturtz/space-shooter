// === GAME CONSTANTS ===

/**
 * App version injected at build-time from package.json.
 * Bump with `npm version patch` (or minor/major) to wipe stale saves.
 */
export const APP_VERSION: string = __APP_VERSION__;

// Mobile detection (resolved once at module load)
export const isMobileDevice =
  typeof globalThis !== "undefined" &&
  ("ontouchstart" in globalThis || (navigator && navigator.maxTouchPoints > 0));

/** Visual sprite scale multiplier for mobile devices — disabled (1×), desktop and mobile render identically */
export const MOBILE_SPRITE_SCALE = 1;

/** Camera zoom level on mobile — shows a zoomed-in portion of the 1200×800 world that follows the player */
export const MOBILE_CAMERA_ZOOM = 2;

// Canvas
export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 800;

// Player
export const PLAYER_BASE_SPEED = 50; // pixels/sec (slow, deliberate)
export const PLAYER_BASE_FIRE_RATE = 1.2; // seconds between shots (slow, methodical pace)
export const PLAYER_BASE_DAMAGE = 1;
export const PLAYER_COLLISION_RADIUS = 4; // smaller, sleeker ship

// Mothership
export const MOTHERSHIP_COLLISION_RADIUS = 12;
export const MOTHERSHIP_BASE_HP = 1;
export const MOTHERSHIP_TIME_PENALTY = 2; // seconds lost per hit

// Player health
export const PLAYER_BASE_HP = 2; // player can take 3 hits before dying
export const PLAYER_HIT_INVULN = 1.0; // seconds of invulnerability after taking damage
export const BOSS_MOTHERSHIP_DAMAGE = 3; // boss body collision deals 3× damage to mothership
export const BOSS_BULLET_DAMAGE = 2; // boss bullets deal 2× damage to mothership

// Bullets
export const BULLET_SPEED = 180; // slow, visible projectiles
export const BULLET_SIZE = 3; // slimmer projectiles (was 4)
export const BULLET_LIFETIME = 1.2; // shorter to match slow speed

// Enemies
export const ROCK_BASE_HP = 2; // small rocks: 2 hits (was 3, rebalanced for early game)
export const ROCK_BIG_HP = 5; // big rocks: 5 hits
export const ROCK_BASE_SPEED = 15;
export const ROCK_SIZE = 10;
export const ROCK_BIG_SIZE = 22;
export const ENEMY_SHIP_BASE_HP = 4;
export const ENEMY_SHIP_BASE_SPEED = 25;
export const ENEMY_SHIP_SIZE = 18;

// Coins
export const COIN_SIZE = 6;
export const COIN_MAGNET_RANGE = 10; // base pickup range
export const COIN_LIFETIME = 4; // seconds before despawn
export const COIN_SPEED = 60; // speed when flying to player

// Waves
export const BASE_ROUND_DURATION = 20; // seconds
export const SPAWN_RATE_BASE = 4.0; // seconds between spawns (fewer enemies at start)
export const SPAWN_RATE_MIN = 1.5; // fastest spawn interval (was ~1.0 via exponential)
export const SPAWN_RAMP_PER_BOSS = 0.3; // seconds shaved off spawn rate per boss killed
export const SPAWN_DISTANCE = 500; // distance from center to spawn

// Weapons — formerly hardcoded in Game.ts
export const CONE_RANGE = 28; // circle weapon radius — bigger for visual prominence (was 18)
export const CONE_FIRE_EVERY = 1; // fire every N beats
export const CONE_FLASH_DURATION = 0.18; // seconds of flash after cone fires (was 0.12)
export const MISSILE_SPEED = 180;
export const MISSILE_FIRE_EVERY = 2; // fire missiles every N beats
export const LASER_INTERVAL = 2.5; // seconds between laser shots
export const LASER_DAMAGE_MULT = 3; // laser deals N× weapon damage
export const BOMB_FUSE = 1.5; // seconds before bomb detonates
export const BOMB_RADIUS = 80; // blast radius in px
export const BOMB_DAMAGE_MULT = 2; // bomb deals N× weapon damage
export const DASH_RING_LIFE = 0.3; // visual ring duration (seconds)
export const DASH_DAMAGE_MULT = 0.5; // dash ring deals fraction of weapon damage
export const STUN_DURATION = 2.0; // flashbang stun seconds
export const STUN_EXTRA_RADIUS = 20; // extra EMP range beyond flashbang
export const FIRST_BOSS_ELAPSED = 12; // seconds into round before first mega rock
export const CHAIN_RANGE = 120; // max chain lightning jump distance
export const SPLASH_DAMAGE_MULT = 0.5; // splash deals fraction of bullet damage

// Shooting enemy spawn gating
export const SHOOTING_ENEMY_MIN_ROUND = 8; // effective round before any ships can shoot
export const SHOOTING_ENEMY_RAMP = 0.15; // chance increase per round past gate

// Upgrades
export const UPGRADE_BASE_COST = 5;
export const UPGRADE_COST_GROWTH = 1.18;

// Economy scaling (Phase 1 — logarithmic rebalance)
/** Minimum coins awarded per round (bad-run floor) */
export const MIN_ROUND_COINS = 5;
/** ln-based coin value scaling factor per roundNumber */
export const COIN_LEVEL_SCALE = 0.15; // halved from 0.3 — slower coin inflation
/** ln-based enemy HP scaling factor per roundNumber */
export const ENEMY_HP_LEVEL_SCALE = 0.4;
/** Round-end bonus multiplier per roundNumber (coins × (1 + this × roundNumber)) */
export const ROUND_LEVEL_BONUS = 0.02; // reduced from 0.05 — less free coins at round end

// ── Endless Round System (Phase 4) ──────────────────────────────────────
/** First boss spawns at this many seconds elapsed */
export const FIRST_BOSS_SPAWN_TIME = 15;
/** After each boss kill, next boss spawns this much sooner (min 8s) */
export const BOSS_SPAWN_ACCELERATION = 2;
/** Minimum seconds between boss spawns */
export const MIN_BOSS_SPAWN_INTERVAL = 8;
/** Boss base HP — scales with bossesKilled + roundNumber */
export const BOSS_BASE_HP = 10;
/** Boss HP multiplier per boss killed within run */
export const BOSS_HP_PER_KILL = 5;
/** Boss HP multiplier per roundNumber (cross-run) */
export const BOSS_HP_PER_ROUND = 3;
/** Star coin milestone thresholds (seconds survived) */
export const STAR_MILESTONES = [30, 45, 60];
/** Cross-run difficulty multiplier per roundNumber on spawn rate */
export const ROUND_DIFFICULTY_SCALE = 0.04;

// Kill Streak tiers — threshold, coin multiplier, color
export const STREAK_TIERS = [
  { threshold: 50, multiplier: 3.0, color: "#cc44ff", label: "GOD" },
  { threshold: 20, multiplier: 2.0, color: "#ff4444", label: "FURY" },
  { threshold: 10, multiplier: 1.5, color: "#ffaa00", label: "RAMPAGE" },
  { threshold: 5, multiplier: 1.2, color: "#ffff00", label: "STREAK" },
] as const;
/** Seconds between kills before streak resets */
export const STREAK_TIMEOUT = 3.0;

// ── In-Run Perks (Phase 5) ──────────────────────────────────────────────
/** Base XP needed for first perk level */
export const PERK_BASE_XP = 5;
/** Additional XP needed per perk level */
export const PERK_XP_GROWTH = 3;
/** Number of perk choices shown on level-up */
export const PERK_CHOICES = 3;
/** Base XP awarded per enemy kill */
export const PERK_XP_PER_KILL = 1;
/** Bonus XP for killing elite enemies */
export const PERK_XP_ELITE_BONUS = 2;
/** Bonus XP for killing boss enemies */
export const PERK_XP_BOSS_BONUS = 5;

// ── In-Round Skills (Phase 6) ───────────────────────────────────────────
/** Minimum seconds into round before skill pickups can spawn */
export const SKILL_MIN_SPAWN_TIME = 10;
/** Min seconds between skill pickup spawns */
export const SKILL_SPAWN_INTERVAL_MIN = 15;
/** Max seconds between skill pickup spawns */
export const SKILL_SPAWN_INTERVAL_MAX = 25;
/** Pickup orb collision/visual radius */
export const SKILL_PICKUP_RADIUS = 10;
/** Seconds before uncollected skill pickup despawns */
export const SKILL_PICKUP_LIFETIME = 12;
/** Player collection range for skill pickups */
export const SKILL_COLLECT_RANGE = 18;

// Colors (retro palette)
export const COLORS = {
  bg: "#0a0a1a",
  stars: "#334",
  player: "#00d4ff",
  playerEngine: "#0088bb",
  mothership: "#4488ff",
  mothershipGlow: "#2244aa",
  mothershipDamaged: "#ff4444",
  bullet: "#ffff00",
  bulletTrail: "#ffaa00",
  rock: "#8888aa",
  rockDark: "#666688",
  enemyShip: "#ff4466",
  enemyShipAccent: "#cc2244",
  coin: "#ffdd00",
  coinShine: "#ffffff",
  hpBar: "#ff6644",
  hpBarDamage: "#441111",
  timerBar: "#4488ff",
  timerBarLow: "#ff4444",
  textPrimary: "#ffffff",
  textSecondary: "#aabbcc",
  textGold: "#ffdd00",
  textDamage: "#ff4444",
  upgradeDmg: "#ff4466",
  upgradeSpeed: "#00aaff",
  upgradeDuration: "#4488ff",
  upgradeQuantity: "#ffdd00",
  panelBg: "rgba(10, 10, 30, 0.9)",
  panelBorder: "#334466",
  buttonBg: "#1a1a3a",
  buttonHover: "#2a2a5a",
  buttonDisabled: "#111122",
  particle: "#ffaa00",
  explosion: "#ff6600",
  shield: "#4488ff",
  playerHp: "#ff4444",
  playerHpBg: "#441111",
  dashReady: "#00d4ff",
  dashCooldown: "#334455",
  flashbang: "#ffffff",
  mobileControl: "rgba(255, 255, 255, 0.15)",
  mobileControlActive: "rgba(255, 255, 255, 0.3)",
  poisoned: "#44ff44", // green — keep for poison status
  engineGlow: "#00ccff", // engine / thruster shadow glow (cyan — matches player theme)
  coinRare: "#ff44ff", // high-value coin (≥50)
  elite: "#ffaa00", // elite enemy highlight
  enemyBullet: "#ff6644", // enemy projectile body
  enemyBulletFront: "#ffaa66", // enemy projectile highlight
  timerGradA: "#2266ff", // timer gradient normal — start
  timerGradB: "#44aaff", // timer gradient normal — end
  timerLowA: "#ff2244", // timer gradient low — start
  timerLowB: "#ff6644", // timer gradient low — end
};

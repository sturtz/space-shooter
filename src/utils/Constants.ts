// === GAME CONSTANTS ===

// Mobile detection (resolved once at module load)
export const isMobileDevice =
  typeof globalThis !== "undefined" &&
  ("ontouchstart" in globalThis || (navigator && navigator.maxTouchPoints > 0));

/** Visual sprite scale multiplier for mobile devices */
export const MOBILE_SPRITE_SCALE = 1.75;

// Canvas
export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 800;

// Player
export const PLAYER_BASE_SPEED = 50; // pixels/sec (slow, deliberate)
export const PLAYER_BASE_FIRE_RATE = 0.4; // seconds between shots
export const PLAYER_BASE_DAMAGE = 1;
export const PLAYER_COLLISION_RADIUS = 4; // smaller, sleeker ship

// Mothership
export const MOTHERSHIP_COLLISION_RADIUS = 12;
export const MOTHERSHIP_BASE_HP = 1;
export const MOTHERSHIP_TIME_PENALTY = 2; // seconds lost per hit

// Bullets
export const BULLET_SPEED = 400;
export const BULLET_SIZE = 4;
export const BULLET_LIFETIME = 2; // seconds

// Enemies
export const ROCK_BASE_HP = 2; // small rocks: 2 hits (was 3, rebalanced for early game)
export const ROCK_BIG_HP = 5; // big rocks: 5 hits
export const ROCK_BASE_SPEED = 15;
export const ROCK_SIZE = 10;
export const ROCK_BIG_SIZE = 22;
export const ENEMY_SHIP_BASE_HP = 4;
export const ENEMY_SHIP_BASE_SPEED = 25;
export const ENEMY_SHIP_SIZE = 12;

// Coins
export const COIN_SIZE = 6;
export const COIN_MAGNET_RANGE = 10; // base pickup range
export const COIN_LIFETIME = 4; // seconds before despawn
export const COIN_SPEED = 60; // speed when flying to player

// Waves
export const BASE_ROUND_DURATION = 20; // seconds
export const SPAWN_RATE_BASE = 4.0; // seconds between spawns (fewer enemies at start)
export const SPAWN_DISTANCE = 500; // distance from center to spawn

// Weapons — formerly hardcoded in Game.ts
export const CONE_RANGE = 18; // circle weapon radius (matches loader ring visual)
export const CONE_FIRE_EVERY = 1; // fire every N beats
export const CONE_FLASH_DURATION = 0.12; // seconds of flash after cone fires
export const MISSILE_SPEED = 180;
export const MISSILE_FIRE_EVERY = 2; // fire missiles every N beats
export const LASER_INTERVAL = 2.5; // seconds between laser shots
export const LASER_DAMAGE_MULT = 3; // laser deals N× weapon damage
export const BOMB_FUSE = 1.5; // seconds before bomb detonates
export const BOMB_RADIUS = 80; // blast radius in px
export const BOMB_DAMAGE_MULT = 5; // bomb deals N× weapon damage
export const DASH_RING_LIFE = 0.3; // visual ring duration (seconds)
export const DASH_DAMAGE_MULT = 0.5; // dash ring deals fraction of weapon damage
export const STUN_DURATION = 2.0; // flashbang stun seconds
export const STUN_EXTRA_RADIUS = 20; // extra EMP range beyond flashbang
export const FIRST_BOSS_ELAPSED = 12; // seconds into round before first mega rock
export const CHAIN_RANGE = 120; // max chain lightning jump distance
export const SPLASH_DAMAGE_MULT = 0.5; // splash deals fraction of bullet damage

// Upgrades
export const UPGRADE_BASE_COST = 10;
export const UPGRADE_COST_GROWTH = 1.18;

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

// === GAME CONSTANTS ===

// Canvas
export const GAME_WIDTH = 900;
export const GAME_HEIGHT = 600;

// Player
export const PLAYER_BASE_SPEED = 50; // pixels/sec (slow, deliberate)
export const PLAYER_BASE_FIRE_RATE = 0.4; // seconds between shots
export const PLAYER_BASE_DAMAGE = 1;
export const PLAYER_COLLISION_RADIUS = 4; // smaller, sleeker ship

// Mothership
export const MOTHERSHIP_COLLISION_RADIUS = 14;
export const MOTHERSHIP_BASE_HP = 5;
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
export const ROCK_BIG_SIZE = 16;
export const ENEMY_SHIP_BASE_HP = 4;
export const ENEMY_SHIP_BASE_SPEED = 25;
export const ENEMY_SHIP_SIZE = 12;

// Coins
export const COIN_SIZE = 6;
export const COIN_MAGNET_RANGE = 10; // base pickup range
export const COIN_LIFETIME = 4; // seconds before despawn
export const COIN_SPEED = 60; // speed when flying to player

// Waves
export const BASE_ROUND_DURATION = 15; // seconds
export const SPAWN_RATE_BASE = 4.0; // seconds between spawns (fewer enemies at start)
export const SPAWN_DISTANCE = 500; // distance from center to spawn

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
  hpBar: "#44ff44",
  hpBarDamage: "#ff4444",
  timerBar: "#4488ff",
  timerBarLow: "#ff4444",
  textPrimary: "#ffffff",
  textSecondary: "#aabbcc",
  textGold: "#ffdd00",
  textDamage: "#ff4444",
  upgradeDmg: "#ff4466",
  upgradeSpeed: "#00ffcc",
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
  dashReady: "#00ffcc",
  dashCooldown: "#334455",
  flashbang: "#ffffff",
  mobileControl: "rgba(255, 255, 255, 0.15)",
  mobileControlActive: "rgba(255, 255, 255, 0.3)",
};

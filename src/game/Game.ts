import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { UpgradeManager, PlayerStats } from "../upgrades/UpgradeManager";
import { SaveData, loadGame, saveGame } from "../utils/SaveManager";
import { Player } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { Bullet } from "../entities/Bullet";
import { Missile } from "../entities/Missile";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Enemy } from "../entities/Enemy";
import { Coin } from "../entities/Coin";
import {
  vec2,
  vecDist,
  vecSub,
  vecNormalize,
  vecFromAngle,
  vecAngle,
  randomAngle,
  randomRange,
} from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_RATE_BASE,
  ROCK_BASE_SPEED,
  COLORS,
} from "../utils/Constants";
import { HUD } from "../ui/HUD";
import { UpgradeScreen } from "../ui/UpgradeScreen";
import { AudioManager } from "../audio/AudioManager";
import { IGame } from "./GameInterface";
export type GameState =
  | "menu"
  | "tutorial"
  | "playing"
  | "bossReward"
  | "upgradeScreen"
  | "gameover";

interface Star {
  x: number;
  y: number;
  brightness: number;
  twinkleSpeed: number;
  size: number;
}

interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

interface DashRing {
  x: number;
  y: number;
  currentRadius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

/** Fading laser beam visual */
interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
}

/** Delayed bomb dropped on dash landing */
interface PendingBomb {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  radius: number;
}

interface BossRewardChoice {
  id: string;
  name: string;
  lines: string[];
  color: string;
  borderColor: string;
  glowColor: string;
}

const BOSS_REWARD_CHOICES: BossRewardChoice[] = [
  {
    id: "laser",
    name: "TARGETING LASER",
    lines: ["Fires at nearest enemy", "every 2.5 seconds", "Deals 3× weapon damage"],
    color: "#ff4444",
    borderColor: "rgba(255,68,68,0.7)",
    glowColor: "rgba(255,68,68,0.15)",
  },
  {
    id: "bomb_dash",
    name: "DASH BOMB",
    lines: ["Dash drops a bomb at", "landing point", "5× damage, 80px blast"],
    color: "#ffaa00",
    borderColor: "rgba(255,170,0,0.7)",
    glowColor: "rgba(255,170,0,0.15)",
  },
  {
    id: "flashbang",
    name: "STUN FIELD",
    lines: ["Dash EMP freezes all", "enemies for 2 seconds", "+20px EMP range bonus"],
    color: "#44ccff",
    borderColor: "rgba(68,200,255,0.7)",
    glowColor: "rgba(68,200,255,0.15)",
  },
];

export class Game implements IGame {
  renderer: Renderer;
  input: InputManager;
  particles: ParticleSystem;
  collisions: CollisionSystem;
  spawner: SpawnSystem;
  upgrades: UpgradeManager;
  hud: HUD;
  upgradeScreen: UpgradeScreen;
  audio: AudioManager;
  save: SaveData;
  stats!: PlayerStats;

  state: GameState = "menu";
  player!: Player;
  mothership!: Mothership;
  bullets: Bullet[] = [];
  enemies: (Rock | EnemyShip)[] = [];
  coins: Coin[] = [];
  enemyBullets: Bullet[] = [];

  roundTimer: number = 0;
  roundDuration: number = 0;
  spawnTimer: number = 0;
  spawnRate: number = SPAWN_RATE_BASE;
  roundCoins: number = 0;
  roundKills: number = 0;
  killStreak: number = 0;
  streakTimer: number = 0;
  bossSpawned: boolean = false;
  bossDefeated: boolean = false;
  bossEnemy: Rock | null = null;
  gameTime: number = 0;
  menuPulse: number = 0;
  paused: boolean = false;
  screenFlashTimer: number = 0;
  screenFlashColor: string = "";
  damageNumbers: DamageNumber[] = [];
  dashRings: DashRing[] = [];
  private lastDt: number = 1 / 60;

  // Circle weapon state (default weapon — synced to music beat)
  coneFlashTimer: number = 0;
  coneBeatCount: number = 0;
  readonly CONE_RANGE = 45; // pixels — circle radius around player
  readonly CONE_FIRE_EVERY = 1; // fire every beat
  coneTimeSinceLastFire: number = 0; // tracks loader progress
  coneMeasuredInterval: number = 60 / 140; // measured actual beat interval (starts at 140 BPM estimate)
  coneLastFireTime: number = 0; // timestamp of last fire for measuring interval

  // Missile weapon state (dmg branch 2 — fires every 2 beats)
  missileBeatCount: number = 0;
  readonly MISSILE_FIRE_EVERY = 2; // fire every 2nd beat
  readonly MISSILE_SPEED = 180; // slower than bullets, tracks target

  // Special ability state (persists across rounds via save.specialAbility)
  laserTimer: number = 0;
  laserBeams: LaserBeam[] = [];
  pendingBombs: PendingBomb[] = [];

  // Tutorial
  tutorialStep: 1 | 2 = 1;

  // Starfield
  stars: Star[] = [];
  private bgCache: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.particles = new ParticleSystem();
    this.collisions = new CollisionSystem();
    this.spawner = new SpawnSystem();
    this.save = loadGame();
    this.upgrades = new UpgradeManager(this.save);
    this.stats = this.upgrades.computeStats();
    this.hud = new HUD();
    this.upgradeScreen = new UpgradeScreen(this.upgrades, this);
    this.audio = new AudioManager();

    // Show tutorial on first load; return to menu after completing it
    if (!this.save.tutorialSeen) {
      this.state = "tutorial";
      this.tutorialStep = 1;
    }

    // Generate starfield
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        brightness: randomRange(0.2, 1),
        twinkleSpeed: randomRange(1, 4),
        size: randomRange(0.5, 2),
      });
    }

    const getScaledCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / rect.width;
      const scaleY = GAME_HEIGHT / rect.height;
      return {
        mx: (clientX - rect.left) * scaleX,
        my: (clientY - rect.top) * scaleY,
      };
    };

    const handleUIInteraction = (mx: number, my: number) => {
      if (this.state === "tutorial") {
        this.advanceTutorial();
      } else if (this.state === "menu") {
        this.audio.init();
        this.startRun();
      } else if (this.state === "bossReward") {
        this.handleBossRewardClick(mx, my);
      } else if (this.state === "upgradeScreen") {
        this.audio.init();
        this.upgradeScreen.handleClick(mx, my);
      } else if (this.state === "gameover") {
        this.state = "upgradeScreen";
        this.upgradeScreen.refresh();
        this.audio.stopMenuMusic();
      }
    };

    // Mouse/desktop
    canvas.addEventListener("click", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      handleUIInteraction(mx, my);
    });

    // Mobile — touchend fires after touchstart's preventDefault suppresses click
    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        handleUIInteraction(mx, my);
      },
      { passive: false }
    );

    // Keyboard handlers for pause and dash
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Escape" || e.key.toLowerCase() === "p") && this.state === "playing") {
        this.paused = !this.paused;
        if (this.paused) {
          this.audio.stopMenuMusic();
        } else {
          this.audio.resumeMenuMusic();
        }
      }
      // Dash on Shift key
      if (e.key === "Shift" && this.state === "playing" && !this.paused) {
        this.handleDash();
      }
      // K key — instant forfeit, skip gameover, go straight to upgrade screen
      if (e.key.toLowerCase() === "k" && this.state === "playing") {
        this.audio.stopConeTrack();
        this.save.lifetimeKills += this.roundKills;
        saveGame(this.save);
        this.state = "upgradeScreen";
        this.upgradeScreen.refresh();
        this.audio.stopMenuMusic();
      }
    });
  }

  /** Handle dash attempt — short dash with expanding explosion ring */
  handleDash() {
    const result = this.player.tryDash();
    if (!result.dashed) return;

    const ringRadius = result.flashbangRadius; // base 60 + EMP upgrade bonus
    const ringOrigin = { x: this.player.pos.x, y: this.player.pos.y };

    // Dash sound + small trail particles
    this.audio.playDash();
    this.particles.emit(this.player.pos, 4, COLORS.dashReady, 30, 0.15, 1.5);

    // Screen flash
    this.screenFlashTimer = 0.08;
    this.screenFlashColor = "rgba(100, 200, 255, 0.15)";
    this.renderer.shake(2);

    // Create expanding ring animation
    const ringLife = 0.3; // seconds to expand
    this.dashRings.push({
      x: ringOrigin.x,
      y: ringOrigin.y,
      currentRadius: 0,
      maxRadius: ringRadius,
      life: ringLife,
      maxLife: ringLife,
    });

    // Clear enemy bullets in radius (instant)
    for (const bullet of this.enemyBullets) {
      if (!bullet.alive) continue;
      if (vecDist(ringOrigin, bullet.pos) <= ringRadius) {
        this.particles.emit(bullet.pos, 2, "#ffffff", 20, 0.1, 1);
        bullet.destroy();
      }
    }

    // Damage enemies in radius (ring explosion deals damage)
    const ringDamage = this.stats.damage * 0.5; // half player's damage
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (vecDist(ringOrigin, enemy.pos) <= ringRadius) {
        const wasAlive = enemy.alive;
        enemy.takeDamage(ringDamage);
        this.spawnDamageNumber(enemy.pos.x, enemy.pos.y, ringDamage, false);
        this.particles.emit(enemy.pos, 3, COLORS.flashbang, 20, 0.15, 1);
        if (wasAlive && !enemy.alive) {
          this.onEnemyKilled(enemy);
        }
      }
    }

    // Special ability: stun field — freeze all enemies in ring radius for 2 seconds
    if (this.save.specialAbility === "flashbang") {
      const stunRadius = ringRadius + 20; // slightly larger stun range
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (vecDist(ringOrigin, enemy.pos) <= stunRadius) {
          enemy.applyStun(2.0);
        }
      }
      // Brighter cyan flash for stun
      this.screenFlashTimer = 0.12;
      this.screenFlashColor = "rgba(80, 210, 255, 0.2)";
      this.particles.emit(vec2(ringOrigin.x, ringOrigin.y), 12, "#44ccff", 80, 0.3, 2);
    }

    // Special ability: drop bomb at dash landing position
    if (this.save.specialAbility === "bomb_dash") {
      this.pendingBombs.push({
        x: ringOrigin.x,
        y: ringOrigin.y,
        timer: 1.5,
        maxTimer: 1.5,
        radius: 80,
      });
      this.particles.emit(vec2(ringOrigin.x, ringOrigin.y), 4, "#ffaa00", 40, 0.15, 1.5);
    }

    // Play flashbang sound for the ring
    this.audio.playFlashbang();
  }

  /** Find the nearest alive enemy to the player */
  findNearestEnemy(): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = vecDist(this.player.pos, enemy.pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = enemy;
      }
    }
    return nearest;
  }

  startRun() {
    this.stats = this.upgrades.computeStats();
    this.player = new Player();
    this.player.updateStats(this.stats);
    this.mothership = new Mothership(this.stats.mothershipHP);
    this.bullets = [];
    this.enemies = [];
    this.coins = [];
    this.enemyBullets = [];
    this.roundTimer = this.stats.roundDuration;
    this.roundDuration = this.stats.roundDuration;
    this.spawnTimer = 1;
    this.spawnRate = SPAWN_RATE_BASE / this.stats.enemySpawnMultiplier;
    this.roundCoins = 0;
    this.roundKills = 0;
    this.killStreak = 0;
    this.streakTimer = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.bossEnemy = null;
    this.dashRings = [];
    this.laserBeams = [];
    this.pendingBombs = [];
    this.laserTimer = 2.5; // laser fires after initial 2.5s delay
    this.coneFlashTimer = 0;
    this.particles.clear();
    this.spawner.reset(this);
    // Resume music when run starts (comes from upgrade screen where it is paused)
    this.audio.resumeMenuMusic();
    this.state = "playing";

    // Spawn initial small asteroids spread around the arena
    const initialRockCount = 8;
    for (let i = 0; i < initialRockCount; i++) {
      const angle = (Math.PI * 2 * i) / initialRockCount + randomRange(-0.2, 0.2);
      const dist = 180 + Math.random() * 100; // 180–280px from center
      const x = GAME_WIDTH / 2 + Math.cos(angle) * dist;
      const y = GAME_HEIGHT / 2 + Math.sin(angle) * dist;
      // 65% normal size, 1 HP, at base speed
      const rock = new Rock(x, y, 1, ROCK_BASE_SPEED, false, 0.65);
      this.enemies.push(rock);
    }

    // Start the cone weapon music track — cone fires every beat
    this.coneBeatCount = 0;
    this.missileBeatCount = 0;
    this.audio.startConeTrack(() => {
      this.coneBeatCount++;
      if (this.coneBeatCount % this.CONE_FIRE_EVERY === 0) {
        this.fireConeWeapon();
      }
      // Missile fires every 2nd beat (if upgrade unlocked)
      this.missileBeatCount++;
      if (this.missileBeatCount % this.MISSILE_FIRE_EVERY === 0) {
        this.fireMissile();
      }
    });
  }

  /** Missile weapon — fires a homing missile every 2 beats toward nearest enemy.
   *  Unlocked via dmg_missile upgrade. Deals half base damage. */
  fireMissile() {
    if (this.state !== "playing" || this.paused) return;
    if (this.stats.missileLevel <= 0) return;

    const target = this.findNearestEnemy();
    if (!target) return;

    const missileDmg = this.stats.damage * 0.5; // half base damage
    const dir = vecNormalize(vecSub(target.pos, this.player.pos));
    const spawnX = this.player.pos.x + dir.x * 12;
    const spawnY = this.player.pos.y + dir.y * 12;

    // Fire 1 missile per level (up to missileLevel missiles)
    const count = Math.min(this.stats.missileLevel, 3); // cap at 3 simultaneous
    for (let i = 0; i < count; i++) {
      // Slight angle spread for multiple missiles
      const spread = count > 1 ? (i - (count - 1) / 2) * 0.3 : 0;
      const angle = vecAngle(dir) + spread;
      const missileDir = vecFromAngle(angle);

      const missile = new Missile(
        spawnX,
        spawnY,
        missileDir,
        this.MISSILE_SPEED,
        missileDmg,
        target
      );
      this.bullets.push(missile); // missiles go in bullets array for collision handling
    }

    // Launch sound / visual
    this.particles.emitDirectional(
      vec2(spawnX, spawnY),
      vecAngle(dir),
      0.4,
      2,
      "#ff4466",
      50,
      0.1,
      1.5
    );
  }

  /** Circle weapon — fires automatically on every music beat (140 BPM).
   *  Damages all enemies within a circle around the player. */
  fireConeWeapon() {
    if (this.state !== "playing" || this.paused) return;

    // Measure actual interval between beats for loader sync
    const now = performance.now() / 1000;
    if (this.coneLastFireTime > 0) {
      const measured = now - this.coneLastFireTime;
      if (measured > 0.1 && measured < 2) {
        // sanity check
        this.coneMeasuredInterval = measured;
      }
    }
    this.coneLastFireTime = now;

    // Reset loader timer and trigger flash
    this.coneTimeSinceLastFire = 0;
    this.coneFlashTimer = 0.12;

    const coneDmg = this.stats.damage;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = vecDist(this.player.pos, enemy.pos);
      if (dist > this.CONE_RANGE) continue;

      // Full circle AoE — no angle check needed
      const isCrit = Math.random() < this.stats.critChance;
      const dmg = isCrit ? coneDmg * this.stats.critMultiplier : coneDmg;
      const wasAlive = enemy.alive;
      enemy.takeDamage(dmg);
      this.spawnDamageNumber(enemy.pos.x, enemy.pos.y, dmg, isCrit);

      // Hit particles — white burst toward enemy
      this.particles.emit(enemy.pos, 3, "#ffffff", 40, 0.15, 1.5);

      if (wasAlive && !enemy.alive) {
        this.onEnemyKilled(enemy);
      }
    }

    // Ring burst particles (always, even if no enemies hit)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = this.player.pos.x + Math.cos(a) * this.CONE_RANGE * 0.7;
      const py = this.player.pos.y + Math.sin(a) * this.CONE_RANGE * 0.7;
      this.particles.emitDirectional(vec2(px, py), a, 0.3, 1, "#ccccdd", 30, 0.08, 1);
    }
  }

  update(dt: number) {
    this.lastDt = dt;
    this.gameTime += dt;
    this.menuPulse += dt;

    // Screen flash decay
    if (this.screenFlashTimer > 0) {
      this.screenFlashTimer -= dt;
    }

    // Damage numbers decay
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= dt;
      dn.y += dn.vy * dt;
      if (dn.life <= 0) {
        this.damageNumbers.splice(i, 1);
      }
    }

    switch (this.state) {
      case "tutorial":
        break; // tutorial is fully static — no physics needed
      case "menu":
        break;
      case "playing":
        if (!this.paused) {
          this.updatePlaying(dt);
        }
        break;
      case "bossReward":
        // Particles keep animating while player chooses reward
        this.particles.update(dt);
        break;
      case "upgradeScreen":
        break;
      case "gameover":
        this.particles.update(dt);
        break;
    }
  }

  updatePlaying(dt: number) {
    // Timer — counts down; when it hits 0 force-spawn the boss if not yet spawned.
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.endRound(false);
      this.roundTimer = 0;
    }

    // Streak decay
    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) {
        this.killStreak = 0;
      }
    }

    // Player input & movement
    this.player.move(this.input, dt);
    this.player.update(dt);

    // Mobile auto-aim: point player toward nearest enemy
    if (this.input.isTouchDevice) {
      const nearest = this.findNearestEnemy();
      if (nearest) {
        const toEnemy = vecSub(nearest.pos, this.player.pos);
        this.player.angle = vecAngle(toEnemy);
      }
    }

    // Mobile dash (tap right side of screen)
    if (this.input.consumeDash() && this.state === "playing") {
      this.handleDash();
    }

    // Circle weapon fires automatically on beat (handled by audio callback).
    // Track loader progress and decay flash timer
    this.coneTimeSinceLastFire += dt;
    if (this.coneFlashTimer > 0) {
      this.coneFlashTimer -= dt;
    }

    // NOTE: Bullet firing disabled — cone is the default weapon.
    // Bullet weapon kept for future upgrade unlock.
    // if (this.input.isFiring) { ... }

    // Update entities
    this.mothership.update(dt);
    this.bullets.forEach((b) => b.update(dt));
    this.enemyBullets.forEach((b) => b.update(dt));

    // Update enemies — track poison kills
    for (const enemy of this.enemies) {
      const wasAlive = enemy.alive;
      enemy.update(dt);
      if (wasAlive && !enemy.alive) {
        // Killed by poison DoT
        this.onEnemyKilled(enemy);
      }
    }
    this.coins.forEach((c) => {
      c.attractTo(this.player.pos, this.stats.coinMagnetRange);
      c.update(dt);
    });
    this.particles.update(dt);

    // Update dash rings
    for (let i = this.dashRings.length - 1; i >= 0; i--) {
      const ring = this.dashRings[i];
      ring.life -= dt;
      const progress = 1 - ring.life / ring.maxLife; // 0→1
      ring.currentRadius = ring.maxRadius * progress;
      if (ring.life <= 0) {
        this.dashRings.splice(i, 1);
      }
    }

    // Boss spawn at 14 seconds into the round if not already spawned by timer expiry
    const elapsed = this.roundDuration - this.roundTimer;
    if (!this.bossSpawned && elapsed >= 14) {
      this.spawnMegaRock();
      this.bossSpawned = true;
    }

    // Special ability: targeting laser fires every 2.5s
    if (this.save.specialAbility === "laser") {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.fireLaser();
        this.laserTimer = 2.5;
      }
    }

    // Special ability: tick pending dash bombs
    if (this.pendingBombs.length > 0) {
      this.updateBombs(dt);
    }

    // Decay fading laser beams
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      this.laserBeams[i].life -= dt;
      if (this.laserBeams[i].life <= 0) {
        this.laserBeams.splice(i, 1);
      }
    }

    // Spawn rate ramps within a round
    const rampFactor = 1 - (elapsed / this.roundDuration) * 0.4; // speeds up to 60% of base by end
    const currentSpawnRate = this.spawnRate * Math.max(0.4, rampFactor);

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawner.spawnEnemy(this);
      this.spawnTimer = currentSpawnRate;
    }

    // Slow aura
    this.spawner.applySlowAura(this);

    // Mothership systems
    this.spawner.updateTurret(this, dt);
    this.spawner.updateMothershipRegen(this, dt);
    this.spawner.updateMothershipBarrier(this, dt);

    // Collisions (delegated to CollisionSystem)
    this.collisions.checkBulletEnemyCollisions(this);
    if (this.collisions.checkEnemyMothershipCollisions(this)) return;
    this.collisions.checkCoinCollections(this);

    // Enemy ships shooting (targets player now)
    this.spawner.handleEnemyShooting(this);

    // Cleanup dead entities
    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.coins = this.coins.filter((c) => c.alive);
  }

  spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean = false) {
    if (damage === 0) {
      // Evade text
      this.damageNumbers.push({
        x: x + randomRange(-8, 8),
        y: y - 10,
        text: "DODGE",
        color: COLORS.player,
        life: 0.6,
        vy: -30,
      });
      return;
    }
    const text = isCrit ? `${Math.round(damage)}!` : `${Math.round(damage)}`;
    this.damageNumbers.push({
      x: x + randomRange(-8, 8),
      y: y - 10,
      text,
      color: isCrit ? "#ff4444" : "#ffff00",
      life: 0.8,
      vy: -40,
    });
  }

  /** Spawn a mega rock boss — huge, slow, high HP */
  spawnMegaRock() {
    const angle = randomAngle();
    const dist = 350;
    const x = GAME_WIDTH / 2 + Math.cos(angle) * dist;
    const y = GAME_HEIGHT / 2 + Math.sin(angle) * dist;
    const bossHP = 15 + this.save.currentLevel * 5; // scales with level
    const boss = new Rock(x, y, bossHP, 15, true); // slow speed, big rock
    boss.radius = 30; // extra large
    boss.coinValue = 10;
    this.bossEnemy = boss;
    this.enemies.push(boss);

    // Announce boss — shake only, no screen flash (flash was jarring/confusing)
    this.renderer.shake(4);
  }

  onEnemyKilled(enemy: Enemy) {
    // Check if boss was killed
    if (this.bossEnemy && enemy === this.bossEnemy) {
      this.bossDefeated = true;
      this.bossEnemy = null;
      // Big boss explosion
      this.particles.emit(enemy.pos, 40, "#ff4444", 160, 0.7, 5);
      this.particles.emit(enemy.pos, 25, "#ffaa00", 130, 0.55, 4);
      this.particles.emit(enemy.pos, 15, "#ffffff", 90, 0.35, 2.5);
      this.renderer.shake(10);
      this.screenFlashTimer = 0.25;
      this.screenFlashColor = "rgba(255, 255, 255, 0.35)";
      this.audio.playExplosion();
      // Stop the beat track
      this.audio.stopConeTrack();
      // Level up — only boss kill advances the level
      this.save.currentLevel++;
      if (this.save.currentLevel > this.save.highestLevel) {
        this.save.highestLevel = this.save.currentLevel;
      }
      this.save.starCoins++;
      // Transition to boss reward selection screen
      this.state = "bossReward";
      return;
    }

    // Explosion particles
    this.particles.emit(enemy.pos, 12, COLORS.explosion, 100, 0.4, 3);
    this.particles.emit(enemy.pos, 6, COLORS.particle, 60, 0.3, 2);
    this.renderer.shake(3);
    this.audio.playExplosion();

    // Kill streak
    this.killStreak++;
    this.streakTimer = 1.5;
    this.roundKills++;

    // Drop coins
    const baseValue = enemy.coinValue;
    const dropMult = this.stats.coinDropMultiplier;
    const streakBonus = 1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.1;
    let value = Math.max(1, Math.round(baseValue * dropMult * streakBonus));

    // Lucky drop check
    const luckyChance = this.upgrades.getLevel("econ_lucky") * 0.04;
    if (Math.random() < luckyChance) {
      value *= 5;
    }

    const coin = new Coin(enemy.pos.x, enemy.pos.y, value);
    this.coins.push(coin);
  }

  endRound(mothershipDestroyed: boolean) {
    // Stop the beat track
    this.audio.stopConeTrack();
    // endRound is called when the timer expires or the mothership is destroyed (loss path).
    // Boss kill goes through onEnemyKilled → bossReward state instead.
    // mothershipDestroyed is kept for IGame interface compatibility.
    void mothershipDestroyed;
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.state = "gameover";
  }

  goToUpgradeScreen() {
    this.state = "upgradeScreen";
    this.upgradeScreen.refresh();
    this.audio.stopMenuMusic();
  }

  render() {
    this.renderer.beginFrame(this.lastDt);

    // Draw starfield (always)
    this.renderStarfield();

    switch (this.state) {
      case "tutorial":
        this.renderTutorial();
        break;
      case "menu":
        this.renderMenu();
        break;
      case "playing":
        this.renderPlaying();
        if (this.paused) {
          this.renderPauseOverlay();
        }
        break;
      case "bossReward":
        // Render frozen game state as backdrop, then overlay the reward cards
        this.renderPlaying();
        this.renderBossReward();
        break;
      case "upgradeScreen":
        this.upgradeScreen.render(this.renderer, this.lastDt);
        break;
      case "gameover":
        this.renderGameOver();
        break;
    }

    this.renderer.endFrame();
  }

  /** Build a hi-res procedural background cached on an offscreen canvas.
   *  Renders nebula gradients + dense star field at native game resolution
   *  so we never stretch a tiny image. Called once at init. */
  private buildBgCache(): HTMLCanvasElement {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;

    // ── Base fill — deep rose-purple (pinkish space feel) ────────────────
    ctx.fillStyle = "#160a18";
    ctx.fillRect(0, 0, w, h);

    // ── Nebula clouds — shifted toward pink, rose, lavender palette ──────
    const nebulae: {
      x: number;
      y: number;
      r: number;
      color: string;
      alpha: number;
    }[] = [
      { x: w * 0.2, y: h * 0.25, r: 340, color: "200, 80, 140", alpha: 0.26 }, // rose
      { x: w * 0.75, y: h * 0.65, r: 280, color: "155, 70, 175", alpha: 0.21 }, // lavender
      { x: w * 0.5, y: h * 0.5, r: 420, color: "215, 90, 130", alpha: 0.18 }, // coral pink center
      { x: w * 0.85, y: h * 0.15, r: 210, color: "170, 60, 155", alpha: 0.18 }, // purple-rose
      { x: w * 0.15, y: h * 0.8, r: 260, color: "175, 50, 120", alpha: 0.2 }, // deep rose
      { x: w * 0.6, y: h * 0.2, r: 230, color: "225, 100, 145", alpha: 0.17 }, // bright pastel pink
      { x: w * 0.4, y: h * 0.75, r: 190, color: "185, 95, 165", alpha: 0.15 }, // soft mauve
    ];

    for (const neb of nebulae) {
      const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      grad.addColorStop(0, `rgba(${neb.color}, ${neb.alpha})`);
      grad.addColorStop(0.5, `rgba(${neb.color}, ${neb.alpha * 0.4})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Fine dust (very dim, adds texture) ──────────────────────────────
    for (let i = 0; i < 600; i++) {
      const dx = Math.random() * w;
      const dy = Math.random() * h;
      const dr = Math.random() * 1.2 + 0.3;
      const da = Math.random() * 0.08 + 0.02;
      ctx.globalAlpha = da;
      ctx.fillStyle = `hsl(${220 + Math.random() * 60}, 30%, 60%)`;
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Static stars (many layers, varied sizes & colors) ───────────────
    // Tiny dim stars (background density)
    for (let i = 0; i < 350; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = Math.random() * 0.8 + 0.2;
      const sa = Math.random() * 0.5 + 0.15;
      ctx.globalAlpha = sa;
      ctx.fillStyle = "#aabbdd";
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Medium stars (moderate brightness)
    for (let i = 0; i < 80; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = Math.random() * 1.2 + 0.5;
      const sa = Math.random() * 0.6 + 0.3;
      // Slight color variation: white, blue-white, warm-white
      const hue = Math.random() < 0.3 ? 40 : 200 + Math.random() * 40;
      ctx.globalAlpha = sa;
      ctx.fillStyle = `hsl(${hue}, 30%, 90%)`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright stars with glow (a few focal points)
    for (let i = 0; i < 20; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = Math.random() * 1.5 + 1;
      const glowR = sr * 4;
      // Glow
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glow.addColorStop(0, "rgba(200, 210, 255, 0.25)");
      glow.addColorStop(0.3, "rgba(180, 190, 240, 0.08)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#eef0ff";
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // ── Subtle vignette (darken edges slightly) ─────────────────────────
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.7);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.25)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    return offscreen;
  }

  renderStarfield() {
    const ctx = this.renderer.ctx;

    // Build & cache the procedural background on first call
    if (!this.bgCache) {
      this.bgCache = this.buildBgCache();
    }

    // Layer 1 — cached hi-res procedural background (full bleed, pixel-perfect)
    ctx.drawImage(this.bgCache, 0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Layer 2 — animated twinkle dots (sparse, on top of static bg)
    for (const star of this.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(this.gameTime * star.twinkleSpeed + star.x);
      ctx.globalAlpha = star.brightness * twinkle * 0.6;
      this.renderer.drawCircle(vec2(star.x, star.y), star.size * 0.8, "#ddeeff");
    }
    ctx.globalAlpha = 1;
  }

  renderMenu() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const ctx = this.renderer.ctx;

    // Decorative mothership glow (behind everything)
    const pulse = 1 + Math.sin(this.menuPulse * 1.5) * 0.1;
    ctx.save();
    ctx.globalAlpha = 0.15;
    const motherGlow = ctx.createRadialGradient(cx, cy + 180, 0, cx, cy + 180, 80 * pulse);
    motherGlow.addColorStop(0, COLORS.mothership);
    motherGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = motherGlow;
    ctx.beginPath();
    ctx.arc(cx, cy + 180, 80 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    this.renderer.drawCircle(vec2(cx, cy + 180), 20, COLORS.mothership);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Title with glow
    const titleScale = 1 + Math.sin(this.menuPulse * 2) * 0.02;
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 20;
    this.renderer.drawTitleTextOutline(
      "SPACE SHOOTER",
      cx,
      cy - 120,
      COLORS.player,
      "#000",
      30 * titleScale,
      "center",
      "middle"
    );
    ctx.restore();

    // Subtitle
    this.renderer.drawTitleText(
      "Defend the Mothership",
      cx,
      cy - 78,
      COLORS.textSecondary,
      12,
      "center",
      "middle"
    );

    // Stats panel
    const statsPanelW = 300;
    this.renderer.drawPanel(cx - statsPanelW / 2, cy - 50, statsPanelW, 30, {
      bg: "rgba(6, 6, 20, 0.8)",
      border: "rgba(255, 221, 0, 0.2)",
      radius: 6,
    });

    ctx.save();
    ctx.font = `bold 12px 'Orbitron', monospace`;
    ctx.fillStyle = COLORS.textGold;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Level: ${this.save.currentLevel}   ⭐ ${this.save.starCoins}   💰 ${this.save.coins}`,
      cx,
      cy - 35
    );
    ctx.restore();

    // Start button (blinking glow)
    const blink = Math.sin(this.menuPulse * 3) > 0;
    const startBtnW = 260;
    const startBtnH = 40;
    const startBtnX = cx - startBtnW / 2;
    const startBtnY = cy + 10;

    if (blink) {
      this.renderer.drawButton(startBtnX, startBtnY, startBtnW, startBtnH, "TAP TO START", {
        bg: "rgba(0, 40, 30, 0.9)",
        border: "rgba(0, 255, 204, 0.5)",
        textColor: "#fff",
        fontSize: 16,
        radius: 10,
        glow: "rgba(0, 255, 204, 0.2)",
      });
    } else {
      this.renderer.drawButton(startBtnX, startBtnY, startBtnW, startBtnH, "TAP TO START", {
        bg: "rgba(0, 30, 20, 0.8)",
        border: "rgba(0, 255, 204, 0.25)",
        textColor: "rgba(255,255,255,0.6)",
        fontSize: 16,
        radius: 10,
      });
    }

    // Controls info — hi-fi panel
    const controlsY = cy + 75;
    this.renderer.drawPanel(cx - 200, controlsY - 8, 400, 45, {
      bg: "rgba(6, 6, 20, 0.6)",
      border: "rgba(100, 120, 160, 0.15)",
      radius: 6,
    });

    if (this.input.isTouchDevice) {
      ctx.save();
      ctx.font = `10px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Touch & drag to move  •  Right edge: Dash", cx, controlsY + 4);
      ctx.fillText("Auto-shoot  •  Destroy enemies → Coins → Upgrade", cx, controlsY + 18);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = `10px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Mouse to move  •  Shift to dash", cx, controlsY + 8);
      ctx.fillText("Auto-fires to beat  •  Destroy enemies → Coins → Upgrade", cx, controlsY + 24);
      ctx.restore();
    }
  }

  renderPlaying() {
    // Mothership
    this.mothership.render(this.renderer);

    // Coins
    for (const coin of this.coins) {
      coin.render(this.renderer);
    }

    // Enemies
    for (const enemy of this.enemies) {
      enemy.render(this.renderer);
    }

    // Enemy bullets
    for (const bullet of this.enemyBullets) {
      bullet.render(this.renderer);
    }

    // Player bullets
    for (const bullet of this.bullets) {
      bullet.render(this.renderer);
    }

    // Player
    this.player.render(this.renderer);

    // Circle weapon visual — white ring around player with loader arc
    {
      const ctx = this.renderer.ctx;
      const px = this.player.pos.x;
      const py = this.player.pos.y;
      const range = this.CONE_RANGE;
      const isFiring = this.coneFlashTimer > 0;
      const flashPower = isFiring ? this.coneFlashTimer / 0.12 : 0;

      ctx.save();

      // === Loader arc (fills up between beats, white, like a cooldown spinner) ===
      const loaderProgress = Math.min(1, this.coneTimeSinceLastFire / this.coneMeasuredInterval);
      const loaderArc = loaderProgress * Math.PI * 2;
      const loaderRadius = 18; // small, tight around the player

      // Background ring (dim, shows full circle outline)
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, loaderRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Progress arc (bright white, fills clockwise from top)
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, loaderRadius, -Math.PI / 2, -Math.PI / 2 + loaderArc);
      ctx.stroke();

      // === Fire flash — bright white circle burst on beat ===
      if (isFiring) {
        // Expanding flash ring
        const flashRadius = range * (1 - flashPower * 0.3); // slight contraction
        ctx.globalAlpha = flashPower * 0.4;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, flashRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow fill
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, range);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flashPower * 0.15})`);
        gradient.addColorStop(0.5, `rgba(200, 200, 220, ${flashPower * 0.06})`);
        gradient.addColorStop(1, "rgba(150, 150, 170, 0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, range, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Particles on top
    this.particles.render(this.renderer);

    // ── Special ability visuals ──────────────────────────────────────────

    // Targeting laser beams (fading red beams)
    {
      const ctx = this.renderer.ctx;
      for (const beam of this.laserBeams) {
        const alpha = beam.life / beam.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Outer glow stroke
        ctx.strokeStyle = "#ff6666";
        ctx.lineWidth = 3 + alpha * 3;
        ctx.shadowColor = "#ff2222";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(beam.x1, beam.y1);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.stroke();
        // Bright core
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(beam.x1, beam.y1);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Pending bombs (pulsing orange glow + countdown arc)
    {
      const ctx = this.renderer.ctx;
      for (const bomb of this.pendingBombs) {
        const progress = 1 - bomb.timer / bomb.maxTimer; // 0→1 as countdown completes
        const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * 12 + progress * Math.PI * 4);
        ctx.save();
        // Dashed blast-radius indicator
        ctx.globalAlpha = 0.07 + pulse * 0.06;
        ctx.strokeStyle = "#ff8800";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Core glow (intensifies as detonation approaches)
        ctx.globalAlpha = 0.55 + progress * 0.4;
        const gradient = ctx.createRadialGradient(bomb.x, bomb.y, 0, bomb.x, bomb.y, 14);
        gradient.addColorStop(0, "#ffff88");
        gradient.addColorStop(0.45, "#ff6600");
        gradient.addColorStop(1, "rgba(255,50,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 14, 0, Math.PI * 2);
        ctx.fill();
        // Countdown arc (orange ring, fills clockwise from top)
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = "#ffcc00";
        ctx.lineWidth = 2.5;
        const countArc = progress * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 10, -Math.PI / 2, -Math.PI / 2 + countArc);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Dash explosion rings
    for (const ring of this.dashRings) {
      const ctx = this.renderer.ctx;
      const progress = 1 - ring.life / ring.maxLife; // 0→1
      const alpha = (1 - progress) * 0.7; // fade out as it expands
      ctx.save();
      ctx.globalAlpha = alpha;

      // Outer ring stroke (cyan/white)
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 3 * (1 - progress) + 1; // thicker at start, thinner as it expands
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow fill
      const gradient = ctx.createRadialGradient(
        ring.x,
        ring.y,
        ring.currentRadius * 0.7,
        ring.x,
        ring.y,
        ring.currentRadius
      );
      gradient.addColorStop(0, "rgba(100, 220, 255, 0)");
      gradient.addColorStop(1, `rgba(100, 220, 255, ${alpha * 0.3})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Damage numbers
    for (const dn of this.damageNumbers) {
      const alpha = Math.max(0, dn.life / 0.8);
      this.renderer.ctx.globalAlpha = alpha;
      this.renderer.drawTextOutline(
        dn.text,
        dn.x,
        dn.y,
        dn.color,
        "#000",
        dn.text.endsWith("!") ? 12 : 10,
        "center",
        "middle"
      );
    }
    this.renderer.ctx.globalAlpha = 1;

    // Screen flash overlay
    if (this.screenFlashTimer > 0) {
      this.renderer.ctx.fillStyle = this.screenFlashColor;
      this.renderer.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Compute actual streak coin bonus for HUD (Issue #19 fix)
    const streakBonus = 1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.1;

    // HUD
    this.hud.render(this.renderer, {
      roundTimer: this.roundTimer,
      roundDuration: this.roundDuration,
      coins: this.save.coins,
      roundCoins: this.roundCoins,
      roundKills: this.roundKills,
      killStreak: this.killStreak,
      level: this.save.currentLevel,
      mothershipHp: this.mothership.hp,
      mothershipMaxHp: this.mothership.maxHp,
      streakCoinBonus: streakBonus,
      dashReady: this.player.dashReady,
      dashCooldownRatio: this.player.dashCooldownRatio,
      isMobile: this.input.isTouchDevice,
    });

    // Special ability active indicator (bottom center, subtle)
    if (this.save.specialAbility) {
      const choice = BOSS_REWARD_CHOICES.find((c) => c.id === this.save.specialAbility);
      if (choice) {
        const ctx = this.renderer.ctx;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.font = `bold 8px 'Orbitron', monospace`;
        ctx.fillStyle = choice.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`⚡ ${choice.name}`, GAME_WIDTH / 2, GAME_HEIGHT - 14);
        ctx.restore();
      }
    }

    // Mobile controls overlay
    if (this.input.isTouchDevice) {
      this.renderMobileControls();
    }
  }

  /** Render touch target indicator and dash button for mobile */
  renderMobileControls() {
    const ctx = this.renderer.ctx;

    // Touch target indicator — small crosshair where the player is moving toward
    if (this.input.touchTargetActive) {
      const target = this.input.mousePos;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Center dot
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Draw line from player to target
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.player.pos.x, this.player.pos.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Dash button — bottom right corner
    const dashX = GAME_WIDTH - 60;
    const dashY = GAME_HEIGHT - 80;
    const dashR = 30;
    ctx.save();

    if (this.player.dashReady) {
      // Ready — glowing circle
      ctx.globalAlpha = 0.1;
      const dashGlow = ctx.createRadialGradient(dashX, dashY, 0, dashX, dashY, dashR * 1.5);
      dashGlow.addColorStop(0, COLORS.dashReady);
      dashGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dashGlow;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.font = `bold 9px 'Orbitron', monospace`;
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashX, dashY);
    } else {
      // Cooldown — progress arc
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = "#445";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, 0, Math.PI * 2);
      ctx.stroke();

      // Cooldown fill arc
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 3;
      const arc = this.player.dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, -Math.PI / 2, -Math.PI / 2 + arc);
      ctx.stroke();

      const pct = Math.floor(this.player.dashCooldownRatio * 100);
      ctx.globalAlpha = 0.2;
      ctx.font = `bold 9px 'Orbitron', monospace`;
      ctx.fillStyle = COLORS.dashCooldown;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${pct}%`, dashX, dashY);
    }
    ctx.restore();
  }

  renderPauseOverlay() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Frosted backdrop
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Pause panel
    const panelW = 240;
    const panelH = 80;
    this.renderer.drawPanel(cx - panelW / 2, cy - panelH / 2, panelW, panelH, {
      bg: "rgba(8, 8, 24, 0.92)",
      border: "rgba(100, 120, 180, 0.4)",
      radius: 12,
      glow: "rgba(100, 150, 255, 0.1)",
      glowBlur: 15,
    });

    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 10;
    this.renderer.drawTitleTextOutline(
      "PAUSED",
      cx,
      cy - 12,
      "#fff",
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    ctx.save();
    ctx.font = `9px monospace`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Press P or ESC to resume", cx, cy + 18);
    ctx.fillText("Press K to Die", cx, cy + 34);
    ctx.restore();
  }

  /** Fire the targeting laser at the nearest enemy (special ability) */
  private fireLaser() {
    if (this.state !== "playing" || this.paused) return;
    const target = this.findNearestEnemy();
    if (!target) return;

    const laserDmg = this.stats.damage * 3;
    const wasAlive = target.alive;
    target.takeDamage(laserDmg);
    this.spawnDamageNumber(target.pos.x, target.pos.y, laserDmg, false);
    this.particles.emit(target.pos, 5, "#ff4444", 80, 0.2, 2);

    if (wasAlive && !target.alive) {
      this.onEnemyKilled(target);
    }

    // Store beam for visual fade-out
    this.laserBeams.push({
      x1: this.player.pos.x,
      y1: this.player.pos.y,
      x2: target.pos.x,
      y2: target.pos.y,
      life: 0.22,
      maxLife: 0.22,
    });

    this.renderer.shake(1);
  }

  /** Tick pending dash bombs — detonate when countdown reaches 0 */
  private updateBombs(dt: number) {
    for (let i = this.pendingBombs.length - 1; i >= 0; i--) {
      const bomb = this.pendingBombs[i];
      bomb.timer -= dt;
      if (bomb.timer <= 0) {
        // DETONATE
        const bombDmg = this.stats.damage * 5;
        const bPos = vec2(bomb.x, bomb.y);
        this.particles.emit(bPos, 45, "#ff8800", 200, 0.65, 6);
        this.particles.emit(bPos, 25, "#ffcc00", 150, 0.45, 4);
        this.particles.emit(bPos, 15, "#ffffff", 110, 0.25, 2.5);
        this.renderer.shake(7);
        this.screenFlashTimer = 0.12;
        this.screenFlashColor = "rgba(255, 140, 0, 0.22)";
        this.audio.playExplosion();

        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          if (vecDist(bPos, enemy.pos) <= bomb.radius) {
            const wasAlive = enemy.alive;
            enemy.takeDamage(bombDmg);
            this.spawnDamageNumber(enemy.pos.x, enemy.pos.y, bombDmg, false);
            if (wasAlive && !enemy.alive) {
              this.onEnemyKilled(enemy);
            }
          }
        }

        this.pendingBombs.splice(i, 1);
      }
    }
  }

  /** Handle click on the boss reward choice screen */
  private handleBossRewardClick(mx: number, my: number) {
    const layout = this.getBossRewardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const card = layout[i];
      if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
        this.selectSpecialAbility(BOSS_REWARD_CHOICES[i].id);
        return;
      }
    }
  }

  /** Store the chosen special ability, save progress, and move to gameover screen */
  private selectSpecialAbility(id: string) {
    this.save.specialAbility = id;
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.state = "gameover";
  }

  /** Card layout data for boss reward screen (used for both click detection and rendering) */
  private getBossRewardLayout(): Array<{ x: number; y: number; w: number; h: number }> {
    const cardW = 155;
    const cardH = 220;
    const gap = 15;
    const totalW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - totalW) / 2;
    const startY = 280;
    return BOSS_REWARD_CHOICES.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    }));
  }

  /** Render the boss reward ability selection overlay */
  private renderBossReward() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;

    // Dark transparent backdrop
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Title
    ctx.save();
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 22;
    this.renderer.drawTitleTextOutline(
      "BOSS DEFEATED!",
      cx,
      180,
      "#ffcc00",
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    this.renderer.drawTitleText(
      "Choose your Special Ability",
      cx,
      218,
      COLORS.textSecondary,
      12,
      "center",
      "middle"
    );

    // Show current ability if already equipped
    if (this.save.specialAbility) {
      const existing = BOSS_REWARD_CHOICES.find((c) => c.id === this.save.specialAbility);
      if (existing) {
        ctx.save();
        ctx.font = `8px monospace`;
        ctx.fillStyle = existing.color;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`Currently equipped: ${existing.name} — choose again to switch`, cx, 242);
        ctx.restore();
      }
    }

    // Cards
    const layout = this.getBossRewardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const choice = BOSS_REWARD_CHOICES[i];
      const card = layout[i];
      const isCurrent = this.save.specialAbility === choice.id;

      // Card panel with colored glow
      this.renderer.drawPanel(card.x, card.y, card.w, card.h, {
        bg: isCurrent ? "rgba(25,25,55,0.96)" : "rgba(10,10,28,0.94)",
        border: isCurrent ? choice.borderColor : "rgba(120,120,160,0.35)",
        radius: 10,
        glow: choice.glowColor,
        glowBlur: isCurrent ? 22 : 10,
      });

      // Icon (canvas shapes)
      this.drawAbilityIcon(ctx, choice.id, card.x + card.w / 2, card.y + 52, choice.color);

      // Name
      ctx.save();
      ctx.font = `bold 12px 'Orbitron', monospace`;
      ctx.fillStyle = choice.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = choice.color;
      ctx.shadowBlur = isCurrent ? 8 : 0;
      ctx.fillText(choice.name, card.x + card.w / 2, card.y + 98);
      ctx.restore();

      // Description lines
      ctx.save();
      ctx.font = `8.5px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let j = 0; j < choice.lines.length; j++) {
        ctx.fillText(choice.lines[j], card.x + card.w / 2, card.y + 122 + j * 16);
      }
      ctx.restore();

      // CHOOSE / EQUIPPED button at card bottom
      const btnY = card.y + card.h - 36;
      const btnX = card.x + 12;
      const btnW = card.w - 24;
      this.renderer.drawButton(btnX, btnY, btnW, 24, isCurrent ? "EQUIPPED ✓" : "CHOOSE", {
        bg: isCurrent ? "rgba(30,30,60,0.9)" : "rgba(10,20,35,0.85)",
        border: choice.borderColor,
        textColor: isCurrent ? choice.color : "#ffffff",
        fontSize: 9,
        radius: 5,
      });
    }

    // Hint text below cards
    ctx.save();
    ctx.font = `8px monospace`;
    ctx.fillStyle = "rgba(150,150,180,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Tap a card to equip — ability carries into future runs",
      cx,
      layout[0].y + layout[0].h + 22
    );
    ctx.restore();
  }

  /** Draw a simple canvas icon representing each special ability */
  private drawAbilityIcon(
    ctx: CanvasRenderingContext2D,
    id: string,
    cx: number,
    cy: number,
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.92;

    if (id === "laser") {
      // Targeting reticle + laser beam
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Cross hairs
      const gaps = [
        [-20, -18],
        [18, 20],
        [0, 0],
        [0, 0],
      ];
      for (let g = 0; g < 4; g++) {
        const angle = (g / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 17, cy + Math.sin(angle) * 17);
        ctx.lineTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22);
        ctx.stroke();
      }
      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      // Diagonal beam slash
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 10);
      ctx.lineTo(cx + 10, cy - 22);
      ctx.stroke();
      void gaps;
    } else if (id === "bomb_dash") {
      // Bomb body
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 14, 0, Math.PI * 2);
      ctx.fill();
      // Shiny highlight
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      // Fuse
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 8);
      ctx.quadraticCurveTo(cx + 16, cy - 16, cx + 11, cy - 22);
      ctx.stroke();
      // Spark
      ctx.fillStyle = "#ffcc00";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx + 11, cy - 22, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "flashbang") {
      // Starburst freeze icon
      const spikes = 8;
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7);
        ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 18);
        ctx.stroke();
        // Small tick at tip
        const perpA = angle + Math.PI / 2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * 18 + Math.cos(perpA) * 4,
          cy + Math.sin(angle) * 18 + Math.sin(perpA) * 4
        );
        ctx.lineTo(
          cx + Math.cos(angle) * 18 - Math.cos(perpA) * 4,
          cy + Math.sin(angle) * 18 - Math.sin(perpA) * 4
        );
        ctx.stroke();
        ctx.lineWidth = 2;
      }
      // Inner circle
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Advance to the next tutorial step, or complete it and go to menu */
  private advanceTutorial() {
    if (this.tutorialStep === 1) {
      this.tutorialStep = 2;
    } else {
      // Tutorial complete — mark as seen, save, go to menu
      this.save.tutorialSeen = true;
      saveGame(this.save);
      this.state = "menu";
    }
  }

  /** Render the 2-step first-load tutorial overlay */
  private renderTutorial() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const t = this.gameTime;

    // Semi-transparent backdrop
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Step indicator dots at top
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const active = i + 1 === this.tutorialStep;
      ctx.globalAlpha = active ? 1 : 0.3;
      ctx.fillStyle = active ? COLORS.player : "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 8 + i * 16, 30, active ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.tutorialStep === 1) {
      // ── STEP 1: Movement ────────────────────────────────────────────────

      // Title
      ctx.save();
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 14;
      this.renderer.drawTitleTextOutline(
        "HOW TO PLAY",
        cx,
        70,
        COLORS.player,
        "#000",
        22,
        "center",
        "middle"
      );
      ctx.restore();

      this.renderer.drawTitleText(
        "1 / 2  —  MOVEMENT",
        cx,
        100,
        COLORS.textSecondary,
        10,
        "center",
        "middle"
      );

      // Instruction panel
      this.renderer.drawPanel(cx - 180, 128, 360, 90, {
        bg: "rgba(8, 8, 24, 0.88)",
        border: "rgba(0, 255, 204, 0.25)",
        radius: 10,
      });

      ctx.save();
      ctx.font = `bold 13px 'Orbitron', monospace`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TAP & DRAG anywhere", cx, 152);
      ctx.font = `11px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("to move your ship", cx, 172);
      ctx.font = `10px monospace`;
      ctx.fillStyle = "rgba(0,255,204,0.6)";
      ctx.fillText("Auto-shoots to the music beat", cx, 196);
      ctx.restore();

      // Animated drag illustration — finger trail
      const dragCX = cx;
      const dragCY = 330;
      const dragLen = 80;
      const dragPhase = (t * 0.7) % 1; // 0→1 loop
      const fingerX = dragCX - dragLen / 2 + dragPhase * dragLen;
      const fingerY = dragCY;

      // Trail line
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(dragCX - dragLen / 2, dragCY);
      ctx.lineTo(dragCX + dragLen / 2, dragCY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Finger circle (animated)
      const trailAlpha = dragPhase < 0.85 ? 0.75 : 0.75 * (1 - (dragPhase - 0.85) / 0.15);
      ctx.save();
      ctx.globalAlpha = trailAlpha;
      // Outer ring
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fingerX, fingerY, 16, 0, Math.PI * 2);
      ctx.stroke();
      // Inner fill
      ctx.fillStyle = COLORS.player;
      ctx.globalAlpha = trailAlpha * 0.25;
      ctx.beginPath();
      ctx.arc(fingerX, fingerY, 16, 0, Math.PI * 2);
      ctx.fill();
      // Center dot
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(fingerX, fingerY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Arrow indicating direction
      const arrowAlpha = 0.35 + 0.25 * Math.sin(t * 4);
      ctx.save();
      ctx.globalAlpha = arrowAlpha;
      ctx.fillStyle = COLORS.player;
      ctx.font = `20px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("→", dragCX + dragLen / 2 + 24, dragCY);
      ctx.restore();

      // Mock ship at cursor
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fingerX, fingerY - 16);
      ctx.lineTo(fingerX - 10, fingerY + 10);
      ctx.lineTo(fingerX + 10, fingerY + 10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Bottom hint
      this.renderer.drawPanel(cx - 170, GAME_HEIGHT - 140, 340, 50, {
        bg: "rgba(4, 4, 14, 0.85)",
        border: "rgba(0,255,204,0.2)",
        radius: 8,
      });
      ctx.save();
      ctx.font = `9px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Your ship follows your finger.", cx, GAME_HEIGHT - 122);
      ctx.fillText(
        "Enemies fly toward the Mothership — don't let them reach it!",
        cx,
        GAME_HEIGHT - 106
      );
      ctx.restore();
    } else {
      // ── STEP 2: Dash ────────────────────────────────────────────────────

      // Title
      ctx.save();
      ctx.shadowColor = COLORS.dashReady;
      ctx.shadowBlur = 14;
      this.renderer.drawTitleTextOutline(
        "DASH",
        cx,
        70,
        COLORS.dashReady,
        "#000",
        22,
        "center",
        "middle"
      );
      ctx.restore();

      this.renderer.drawTitleText(
        "2 / 2  —  DASH",
        cx,
        100,
        COLORS.textSecondary,
        10,
        "center",
        "middle"
      );

      // Instruction panel
      this.renderer.drawPanel(cx - 180, 128, 360, 90, {
        bg: "rgba(8, 8, 24, 0.88)",
        border: "rgba(100, 220, 255, 0.25)",
        radius: 10,
      });

      ctx.save();
      ctx.font = `bold 13px 'Orbitron', monospace`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TAP the DASH button", cx, 152);
      ctx.font = `11px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("bottom-right corner", cx, 172);
      ctx.font = `10px monospace`;
      ctx.fillStyle = "rgba(100,220,255,0.6)";
      ctx.fillText("Teleport + clear nearby bullets", cx, 196);
      ctx.restore();

      // Dash button mock at bottom-right (same position as real button)
      const dashBtnX = GAME_WIDTH - 60;
      const dashBtnY = GAME_HEIGHT - 80;
      const dashR = 30;

      // Animated highlight ring
      const ringScale = 1 + 0.2 * Math.sin(t * 4);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4);
      const glow = ctx.createRadialGradient(dashBtnX, dashBtnY, 0, dashBtnX, dashBtnY, dashR * 2);
      glow.addColorStop(0, COLORS.dashReady);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, dashR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Button circle
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, dashR * ringScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.font = `bold 9px 'Orbitron', monospace`;
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashBtnX, dashBtnY);
      ctx.restore();

      // Arrow pointing to dash button from center
      const arrowT = (t * 0.6) % 1;
      const arrowStartX = cx + 50;
      const arrowStartY = GAME_HEIGHT / 2 + 60;
      const arrowEndX = dashBtnX - 50;
      const arrowEndY = dashBtnY - 30;
      const arrowX = arrowStartX + (arrowEndX - arrowStartX) * arrowT;
      const arrowY = arrowStartY + (arrowEndY - arrowStartY) * arrowT;
      const arrowFade = arrowT < 0.8 ? 0.55 : 0.55 * (1 - (arrowT - 0.8) / 0.2);

      ctx.save();
      ctx.globalAlpha = arrowFade;
      ctx.fillStyle = COLORS.dashReady;
      ctx.beginPath();
      ctx.arc(arrowX, arrowY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // EMP ring visual preview (pulsing ring emanating from button)
      const empProgress = (t * 0.7) % 1;
      const empRadius = empProgress * 90;
      const empAlpha = (1 - empProgress) * 0.35;
      ctx.save();
      ctx.globalAlpha = empAlpha;
      ctx.strokeStyle = "#44ccff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, empRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Bottom hint
      this.renderer.drawPanel(cx - 170, GAME_HEIGHT - 140, 340, 50, {
        bg: "rgba(4, 4, 14, 0.85)",
        border: "rgba(100,220,255,0.2)",
        radius: 8,
      });
      ctx.save();
      ctx.font = `9px monospace`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Dash teleports you & fires an EMP ring.", cx, GAME_HEIGHT - 122);
      ctx.fillText("Clears enemy bullets • damages nearby enemies.", cx, GAME_HEIGHT - 106);
      ctx.restore();
    }

    // "TAP TO CONTINUE" button at very bottom
    const blink = Math.sin(t * 3) > 0;
    const btnLabel = this.tutorialStep === 2 ? "GOT IT — LET'S GO!" : "TAP TO CONTINUE";
    const btnColor = this.tutorialStep === 2 ? "rgba(100, 220, 255," : "rgba(0, 255, 204,";
    const btnW = 240;
    const btnH = 36;
    const btnX = cx - btnW / 2;
    const btnY = GAME_HEIGHT - 52;

    if (blink) {
      this.renderer.drawButton(btnX, btnY, btnW, btnH, btnLabel, {
        bg: "rgba(4, 20, 16, 0.9)",
        border: `${btnColor}0.5)`,
        textColor: "#fff",
        fontSize: 13,
        radius: 10,
        glow: `${btnColor}0.18)`,
      });
    } else {
      this.renderer.drawButton(btnX, btnY, btnW, btnH, btnLabel, {
        bg: "rgba(4, 14, 10, 0.8)",
        border: `${btnColor}0.22)`,
        textColor: "rgba(255,255,255,0.55)",
        fontSize: 13,
        radius: 10,
      });
    }
  }

  renderGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const ctx = this.renderer.ctx;

    this.particles.render(this.renderer);

    // Darkened backdrop
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const title = "ROUND COMPLETE";
    const titleColor = "#44ff88";

    // Results panel
    const panelW = 320;
    const panelH = 200;
    this.renderer.drawPanel(cx - panelW / 2, cy - panelH / 2, panelW, panelH, {
      bg: "rgba(6, 6, 20, 0.92)",
      border: "rgba(68, 255, 136, 0.3)",
      radius: 12,
      glow: "rgba(68, 255, 136, 0.15)",
      glowBlur: 20,
    });

    // Title
    ctx.save();
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 15;
    this.renderer.drawTitleTextOutline(
      title,
      cx,
      cy - 72,
      titleColor,
      "#000",
      18,
      "center",
      "middle"
    );
    ctx.restore();

    // Level
    this.renderer.drawTitleText(
      `Level ${this.save.currentLevel}`,
      cx,
      cy - 42,
      COLORS.textPrimary,
      14,
      "center",
      "middle"
    );

    // Divider line
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 100, cy - 28);
    ctx.lineTo(cx + 100, cy - 28);
    ctx.stroke();
    ctx.restore();

    // Stats rows
    const statY = cy - 10;
    const lineH = 22;

    ctx.save();
    ctx.font = `bold 11px 'Orbitron', monospace`;
    ctx.textBaseline = "middle";

    // Coins earned
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Coins Earned", cx - 100, statY);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.textGold;
    ctx.fillText(`+${this.roundCoins}`, cx + 100, statY);

    // Enemies
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Enemies Defeated", cx - 100, statY + lineH);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8866";
    ctx.fillText(`${this.roundKills}`, cx + 100, statY + lineH);

    // Total coins
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Total Coins", cx - 100, statY + lineH * 2);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.coin;
    ctx.fillText(`${this.save.coins}`, cx + 100, statY + lineH * 2);

    ctx.restore();

    // Continue button
    const blink = Math.sin(this.gameTime * 3) > 0;
    const btnW = 220;
    const btnH = 32;
    const btnX = cx - btnW / 2;
    const btnY = cy + 62;

    if (blink) {
      this.renderer.drawButton(btnX, btnY, btnW, btnH, "TAP TO CONTINUE", {
        bg: "rgba(10, 30, 20, 0.9)",
        border: "rgba(100, 200, 150, 0.4)",
        textColor: "#fff",
        fontSize: 12,
        radius: 8,
        glow: "rgba(100, 200, 150, 0.15)",
      });
    } else {
      this.renderer.drawButton(btnX, btnY, btnW, btnH, "TAP TO CONTINUE", {
        bg: "rgba(10, 20, 15, 0.8)",
        border: "rgba(100, 200, 150, 0.2)",
        textColor: "rgba(255,255,255,0.5)",
        fontSize: 12,
        radius: 8,
      });
    }
  }
}

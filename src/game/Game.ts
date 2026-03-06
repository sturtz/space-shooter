import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { UpgradeManager, PlayerStats } from "../upgrades/UpgradeManager";
import {
  SaveData,
  loadGame,
  saveGame,
  getDefaultSave,
} from "../utils/SaveManager";
import { Player, DashResult } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { Bullet } from "../entities/Bullet";
import { Missile } from "../entities/Missile";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Enemy } from "../entities/Enemy";
import { Coin } from "../entities/Coin";
import {
  Vec2,
  vec2,
  vecDist,
  vecSub,
  vecNormalize,
  vecScale,
  vecFromAngle,
  vecAngle,
  randomAngle,
  randomRange,
  circleCollision,
} from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_RATE_BASE,
  COLORS,
} from "../utils/Constants";
import { HUD } from "../ui/HUD";
import { UpgradeScreen } from "../ui/UpgradeScreen";
import { AudioManager } from "../audio/AudioManager";
import { IGame } from "./GameInterface";

export type GameState = "menu" | "playing" | "upgradeScreen" | "gameover";

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
  readonly CONE_RANGE = 45;         // pixels — circle radius around player
  readonly CONE_FIRE_EVERY = 1;     // fire every beat
  coneTimeSinceLastFire: number = 0; // tracks loader progress
  coneMeasuredInterval: number = 60 / 140; // measured actual beat interval (starts at 140 BPM estimate)
  coneLastFireTime: number = 0; // timestamp of last fire for measuring interval

  // Missile weapon state (dmg branch 2 — fires every 2 beats)
  missileBeatCount: number = 0;
  readonly MISSILE_FIRE_EVERY = 2;  // fire every 2nd beat
  readonly MISSILE_SPEED = 180;     // slower than bullets, tracks target

  // Starfield
  stars: Star[] = [];

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

    // Click handler for menu & upgrade screen
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / rect.width;
      const scaleY = GAME_HEIGHT / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      if (this.state === "menu") {
        this.audio.init();
        this.startRun();
      } else if (this.state === "upgradeScreen") {
        this.audio.init();
        this.upgradeScreen.handleClick(mx, my);
      } else if (this.state === "gameover") {
        this.state = "upgradeScreen";
        this.upgradeScreen.refresh();
      }
    });

    // Keyboard handlers for pause and dash
    window.addEventListener("keydown", (e) => {
      if (
        (e.key === "Escape" || e.key.toLowerCase() === "p") &&
        this.state === "playing"
      ) {
        this.paused = !this.paused;
      }
      // Dash on Shift key
      if (e.key === "Shift" && this.state === "playing" && !this.paused) {
        this.handleDash();
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
    this.coneFlashTimer = 0;
    this.particles.clear();
    this.spawner.reset(this);
    this.state = "playing";

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
        target,
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
      1.5,
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
      if (measured > 0.1 && measured < 2) { // sanity check
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
      this.particles.emitDirectional(
        vec2(px, py),
        a,
        0.3,
        1,
        "#ccccdd",
        30,
        0.08,
        1,
      );
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
      case "menu":
        break;
      case "playing":
        if (!this.paused) {
          this.updatePlaying(dt);
        }
        break;
      case "upgradeScreen":
        break;
      case "gameover":
        this.particles.update(dt);
        break;
    }
  }

  updatePlaying(dt: number) {
    // Timer — counts down but doesn't end the round; must kill boss to advance
    this.roundTimer -= dt;
    if (this.roundTimer < 0) this.roundTimer = 0;

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

    // Boss spawn at 15 seconds elapsed
    const elapsed = this.roundDuration - this.roundTimer;
    if (!this.bossSpawned && elapsed >= 15) {
      this.spawnMegaRock();
      this.bossSpawned = true;
    }

    // Spawn rate ramps within a round (Issue #18 fix)
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
    this.collisions.checkEnemyBulletPlayerCollisions(this);
    this.collisions.checkCoinCollections(this);

    // Enemy ships shooting (targets player now)
    this.spawner.handleEnemyShooting(this);

    // Cleanup dead entities
    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.coins = this.coins.filter((c) => c.alive);
  }

  spawnDamageNumber(
    x: number,
    y: number,
    damage: number,
    isCrit: boolean = false,
  ) {
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

    // Announce boss
    this.screenFlashTimer = 0.15;
    this.screenFlashColor = "rgba(255, 50, 50, 0.2)";
    this.renderer.shake(5);
  }

  onEnemyKilled(enemy: Enemy) {
    // Check if boss was killed
    if (this.bossEnemy && enemy === this.bossEnemy) {
      this.bossDefeated = true;
      this.bossEnemy = null;
      // Big boss explosion
      this.particles.emit(enemy.pos, 30, "#ff4444", 150, 0.6, 4);
      this.particles.emit(enemy.pos, 20, "#ffaa00", 120, 0.5, 3);
      this.renderer.shake(8);
      this.screenFlashTimer = 0.2;
      this.screenFlashColor = "rgba(255, 255, 255, 0.3)";
      // Boss killed = round won, level up
      this.endRound(false);
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
    const streakBonus =
      1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.10;
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
    // Stop cone attack music if playing
    this.audio.stopConeTrack();

    if (!mothershipDestroyed) {
      // Timer ran out — survived! Level up
      this.save.currentLevel++;
      if (this.save.currentLevel > this.save.highestLevel) {
        this.save.highestLevel = this.save.currentLevel;
      }
      this.save.starCoins++;
    }

    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.state = "gameover";
  }

  goToUpgradeScreen() {
    this.state = "upgradeScreen";
    this.upgradeScreen.refresh();
  }

  render() {
    this.renderer.beginFrame(this.lastDt);

    // Draw starfield (always)
    this.renderStarfield();

    switch (this.state) {
      case "menu":
        this.renderMenu();
        break;
      case "playing":
        this.renderPlaying();
        if (this.paused) {
          this.renderPauseOverlay();
        }
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

  renderStarfield() {
    for (const star of this.stars) {
      const twinkle =
        0.5 + 0.5 * Math.sin(this.gameTime * star.twinkleSpeed + star.x);
      const alpha = star.brightness * twinkle;
      this.renderer.ctx.globalAlpha = alpha;
      this.renderer.drawCircle(vec2(star.x, star.y), star.size, "#aabbdd");
    }
    this.renderer.ctx.globalAlpha = 1;
  }

  renderMenu() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const titleScale = 1 + Math.sin(this.menuPulse * 2) * 0.03;
    this.renderer.drawTextOutline(
      "SPACE SHOOTER",
      cx,
      cy - 120,
      COLORS.player,
      "#000",
      36 * titleScale,
      "center",
      "middle",
    );

    this.renderer.drawText(
      "Defend the Mothership",
      cx,
      cy - 75,
      COLORS.textSecondary,
      16,
      "center",
      "middle",
    );

    this.renderer.drawText(
      `Level: ${this.save.currentLevel}  |  ⭐ ${this.save.starCoins}  |  Coins: ${this.save.coins}`,
      cx,
      cy - 30,
      COLORS.textGold,
      14,
      "center",
      "middle",
    );

    const blink = Math.sin(this.menuPulse * 3) > 0;
    if (blink) {
      this.renderer.drawTextOutline(
        "[ TAP / CLICK TO START ]",
        cx,
        cy + 30,
        "#fff",
        "#000",
        20,
        "center",
        "middle",
      );
    }

    // Controls info — adapt for mobile
    if (this.input.isTouchDevice) {
      this.renderer.drawText(
        "Left side: Move joystick  •  Right side: Dash  •  Auto-shoot",
        cx,
        cy + 100,
        COLORS.textSecondary,
        11,
        "center",
        "middle",
      );
    } else {
      this.renderer.drawText(
        "WASD to move  •  Mouse to aim  •  Cone auto-fires to beat  •  Shift to dash",
        cx,
        cy + 100,
        COLORS.textSecondary,
        12,
        "center",
        "middle",
      );
    }

    this.renderer.drawText(
      "Destroy enemies → Collect coins → Upgrade → Repeat",
      cx,
      cy + 125,
      COLORS.textSecondary,
      11,
      "center",
      "middle",
    );

    // Decorative mothership
    this.renderer.ctx.save();
    this.renderer.ctx.globalAlpha = 0.4;
    const pulse = 1 + Math.sin(this.menuPulse * 1.5) * 0.1;
    this.renderer.drawCircle(
      vec2(cx, cy + 200),
      30 * pulse,
      COLORS.mothershipGlow,
    );
    this.renderer.drawCircle(vec2(cx, cy + 200), 20, COLORS.mothership);
    this.renderer.ctx.globalAlpha = 1;
    this.renderer.ctx.restore();
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
      const flashPower = isFiring ? (this.coneFlashTimer / 0.12) : 0;

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
        ring.x, ring.y, ring.currentRadius * 0.7,
        ring.x, ring.y, ring.currentRadius,
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
        "middle",
      );
    }
    this.renderer.ctx.globalAlpha = 1;

    // Screen flash overlay
    if (this.screenFlashTimer > 0) {
      this.renderer.ctx.fillStyle = this.screenFlashColor;
      this.renderer.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Compute actual streak coin bonus for HUD (Issue #19 fix)
    const streakBonus =
      1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.10;

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
      playerHp: this.player.hp,
      playerMaxHp: this.player.maxHp,
      playerShields: this.player.shields,
      playerMaxShields: this.player.maxShields,
      streakCoinBonus: streakBonus,
      dashReady: this.player.dashReady,
      dashCooldownRatio: this.player.dashCooldownRatio,
      isMobile: this.input.isTouchDevice,
    });

    // Mobile controls overlay
    if (this.input.isTouchDevice) {
      this.renderMobileControls();
    }
  }

  /** Render virtual joystick and dash zone indicators for mobile */
  renderMobileControls() {
    const ctx = this.renderer.ctx;

    // Virtual joystick
    if (this.input.joystickActive) {
      const center = this.input.joystickCenter;
      const thumb = this.input.joystickThumb;

      // Outer ring
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 35, 0, Math.PI * 2);
      ctx.stroke();

      // Thumb
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(thumb.x, thumb.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Dash button hint (right side)
    const dashX = GAME_WIDTH - 60;
    const dashY = GAME_HEIGHT / 2;
    ctx.save();
    ctx.globalAlpha = this.player.dashReady ? 0.25 : 0.1;
    ctx.strokeStyle = this.player.dashReady ? COLORS.dashReady : COLORS.dashCooldown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dashX, dashY, 25, 0, Math.PI * 2);
    ctx.stroke();

    if (this.player.dashReady) {
      ctx.globalAlpha = 0.3;
      this.renderer.drawText(
        "DASH",
        dashX,
        dashY,
        COLORS.dashReady,
        10,
        "center",
        "middle",
      );
    } else {
      // Show cooldown arc
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 3;
      const arc = this.player.dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, 25, -Math.PI / 2, -Math.PI / 2 + arc);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderPauseOverlay() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.renderer.drawTextOutline(
      "PAUSED",
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 20,
      "#fff",
      "#000",
      32,
      "center",
      "middle",
    );
    this.renderer.drawText(
      "Press P or ESC to resume",
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 20,
      COLORS.textSecondary,
      14,
      "center",
      "middle",
    );
  }

  renderGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.particles.render(this.renderer);

    this.renderer.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    this.renderer.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Check if player died
    const playerDied = this.player && this.player.isDead;
    const title = playerDied ? "SHIP DESTROYED" : "ROUND OVER";
    const titleColor = playerDied ? "#ff4444" : COLORS.mothershipDamaged;

    this.renderer.drawTextOutline(
      title,
      cx,
      cy - 100,
      titleColor,
      "#000",
      32,
      "center",
      "middle",
    );

    this.renderer.drawText(
      `Level ${this.save.currentLevel}`,
      cx,
      cy - 60,
      COLORS.textPrimary,
      18,
      "center",
      "middle",
    );

    this.renderer.drawText(
      `Coins Earned: ${this.roundCoins}`,
      cx,
      cy - 25,
      COLORS.textGold,
      16,
      "center",
      "middle",
    );

    this.renderer.drawText(
      `Enemies Defeated: ${this.roundKills}`,
      cx,
      cy + 0,
      COLORS.textSecondary,
      14,
      "center",
      "middle",
    );

    this.renderer.drawText(
      `Total Coins: ${this.save.coins}`,
      cx,
      cy + 30,
      COLORS.coin,
      14,
      "center",
      "middle",
    );

    const blink = Math.sin(this.gameTime * 3) > 0;
    if (blink) {
      this.renderer.drawText(
        "[ TAP / CLICK TO CONTINUE ]",
        cx,
        cy + 80,
        "#fff",
        18,
        "center",
        "middle",
      );
    }
  }
}

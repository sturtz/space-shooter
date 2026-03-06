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
import { Player } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { Bullet } from "../entities/Bullet";
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
  gameTime: number = 0;
  menuPulse: number = 0;
  paused: boolean = false;
  screenFlashTimer: number = 0;
  screenFlashColor: string = "";
  damageNumbers: DamageNumber[] = [];
  private lastDt: number = 1 / 60;

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
        this.player.tryDash();
      }
    });
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
    this.particles.clear();
    this.spawner.reset(this);
    this.state = "playing";
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
    // Timer
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.endRound(false);
      return;
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

    // Firing
    if (this.input.isFiring) {
      const directions = this.player.fire();
      if (directions.length > 0) {
        this.audio.playShoot();
      }
      for (const dir of directions) {
        const isCrit = Math.random() < this.stats.critChance;
        const dmg = isCrit
          ? this.stats.damage * this.stats.critMultiplier
          : this.stats.damage;
        const bullet = new Bullet(
          this.player.pos.x + dir.x * 10,
          this.player.pos.y + dir.y * 10,
          dir,
          this.stats.bulletSpeed,
          dmg,
          isCrit,
          this.stats.pierceCount,
        );
        this.bullets.push(bullet);
      }
      // Muzzle flash
      if (directions.length > 0) {
        const noseX = this.player.pos.x + Math.cos(this.player.angle) * 14;
        const noseY = this.player.pos.y + Math.sin(this.player.angle) * 14;
        this.particles.emitDirectional(
          vec2(noseX, noseY),
          this.player.angle,
          0.25,
          3,
          "#ffffff",
          80,
          0.1,
          2,
        );
        this.particles.emitDirectional(
          vec2(noseX, noseY),
          this.player.angle,
          0.4,
          2,
          COLORS.bullet,
          60,
          0.15,
          1.5,
        );
      }
    }

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

    // Spawn rate ramps within a round (Issue #18 fix)
    const elapsed = this.roundDuration - this.roundTimer;
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

  onEnemyKilled(enemy: Enemy) {
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
      1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.05;
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
        "[ CLICK TO START ]",
        cx,
        cy + 30,
        "#fff",
        "#000",
        20,
        "center",
        "middle",
      );
    }

    this.renderer.drawText(
      "WASD to move  •  Mouse to aim  •  Click to fire  •  Shift to dash",
      cx,
      cy + 100,
      COLORS.textSecondary,
      12,
      "center",
      "middle",
    );

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

    // Particles on top
    this.particles.render(this.renderer);

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
      1 + this.killStreak * this.upgrades.getLevel("econ_combo") * 0.05;

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
      playerShields: this.player.shields,
      playerMaxShields: this.player.maxShields,
      streakCoinBonus: streakBonus,
    });
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

    this.renderer.drawTextOutline(
      "ROUND OVER",
      cx,
      cy - 100,
      COLORS.mothershipDamaged,
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
        "[ CLICK TO CONTINUE ]",
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

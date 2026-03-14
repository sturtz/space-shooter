import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { PlayerStats } from "../upgrades/UpgradeManager";
import { saveGame, hasAbility, addAbility } from "../utils/SaveManager";
import { Player } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { Bullet } from "../entities/Bullet";
import { Missile } from "../entities/Missile";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Enemy } from "../entities/Enemy";
import { Coin } from "../entities/Coin";
import { Debris } from "../entities/Debris";
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
import { compactAlive } from "../utils/Array";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_RATE_BASE,
  ROCK_BASE_SPEED,
  COLORS,
  CONE_RANGE,
  CONE_FIRE_EVERY,
  MISSILE_SPEED,
  MISSILE_FIRE_EVERY,
  PLAYER_BASE_HP,
  BOMB_DAMAGE_MULT,
  isMobileDevice,
  MOBILE_CAMERA_ZOOM,
} from "../utils/Constants";
import { HUD } from "../ui/HUD";
import { PauseMenu } from "../ui/PauseMenu";
import { BossRewardScreen, BOSS_REWARD_CHOICES } from "../ui/BossRewardScreen";
import { GameOverScreen } from "../ui/GameOverScreen";
import { MobileControls } from "../ui/MobileControls";
import type { ScreenManager } from "./ScreenManager";
import { IGame } from "./GameInterface";
import { TutorialSystem } from "./TutorialSystem";
import {
  SacredGeometryBg,
  emitFibonacciSpiral,
  emitSpirograph,
  emitGoldenRings,
  emitSymmetricStar,
  generateFormation,
  randomFormationType,
  renderFormationPreview,
  type FormationSlot,
  type FormationPreview,
  type FormationType,
} from "../systems/AlgoArt";

export type GameState = "playing" | "bossReward" | "gameover" | "tutorial";

interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
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

interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
}

interface PendingBomb {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  radius: number;
}

/* ── pulse shockwave — same system as upgrade screen purchase shockwave ── */
interface PulseShockwave {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  color: string;
}

/**
 * Game screen — handles active gameplay, boss reward, and game over.
 * Menu and upgrade screens are separate canvases managed by ScreenManager.
 */
export class Game implements IGame {
  renderer: Renderer;
  input: InputManager;
  particles: ParticleSystem;
  collisions: CollisionSystem;
  spawner: SpawnSystem;
  hud: HUD;
  manager: ScreenManager;

  // Expose shared resources from manager
  get save() {
    return this.manager.save;
  }
  get upgrades() {
    return this.manager.upgrades;
  }
  get audio() {
    return this.manager.audio;
  }
  get stats(): PlayerStats {
    return this._stats;
  }
  set stats(v: PlayerStats) {
    this._stats = v;
  }
  private _stats!: PlayerStats;

  state: GameState = "playing";
  deathCause: "mothership" | "player" | "time" | "forfeit" | "" = "";
  /** Countdown before transitioning to gameover — lets explosion play out */
  private deathDelay: number = 0;
  private deathDelayActive: boolean = false;
  /** Timestamp (gameTime) when state last changed — used to block accidental taps */
  private stateChangeTime: number = 0;
  player!: Player;
  mothership!: Mothership;
  bullets: Bullet[] = [];
  enemies: (Rock | EnemyShip)[] = [];
  coins: Coin[] = [];
  enemyBullets: Bullet[] = [];
  debris: Debris[] = [];
  private debrisTimer: number = 0;

  roundTimer: number = 0;
  roundDuration: number = 20;
  spawnTimer: number = 0;
  spawnRate: number = SPAWN_RATE_BASE;
  roundCoins: number = 0;
  roundKills: number = 0;
  killStreak: number = 0;
  streakTimer: number = 0;
  bossDefeated: boolean = false;
  bossEnemy: Rock | EnemyShip | null = null;
  nextBossElapsed: number = 12;
  gameTime: number = 0;
  paused: boolean = false;
  damageNumbers: DamageNumber[] = [];
  dashRings: DashRing[] = [];
  private lastDt: number = 1 / 60;

  // Circle weapon state
  coneFlashTimer: number = 0;
  coneBeatCount: number = 0;
  coneTimeSinceLastFire: number = 0;
  coneMeasuredInterval: number = (60 / 100) * 2; // default: 2 beats at 100 BPM = 1.2s
  coneLastFireTime: number = 0;

  // Missile weapon state
  missileBeatCount: number = 0;

  // Special ability state
  laserTimer: number = 0;
  laserBeams: LaserBeam[] = [];
  pendingBombs: PendingBomb[] = [];
  pulseShockwaves: PulseShockwave[] = [];

  // Boss reward state — tracks what was auto-granted (null = show choice screen)
  private autoGrantedAbility: string | null = null;

  // ── Tutorial ──
  private tutorial: TutorialSystem | null = null;

  // ── Algorithmic Art ──
  private sacredGeometry = new SacredGeometryBg();
  private formationTimer = 0;
  private formationCooldown = 12; // seconds between formation waves
  private activeFormation: {
    slots: FormationSlot[];
    type: FormationType;
    spawnedCount: number;
    elapsed: number;
  } | null = null;
  private formationPreview: FormationPreview | null = null;
  private algoKillCounter = 0; // cycles through geometric burst patterns

  // ── Extracted UI modules ──
  private pauseMenu = new PauseMenu();
  private bossRewardUI = new BossRewardScreen();
  private gameOverUI = new GameOverScreen();
  private mobileControlsUI = new MobileControls();

  constructor(canvas: HTMLCanvasElement, renderer: Renderer, manager: ScreenManager) {
    this.renderer = renderer;
    this.manager = manager;
    this.input = new InputManager(canvas);
    this.input.setCoordTransform(renderer.gameOffsetX, renderer.gameOffsetY, renderer.gameScale);
    this.particles = new ParticleSystem();
    this.collisions = new CollisionSystem();
    this.spawner = new SpawnSystem();
    this._stats = this.upgrades.computeStats();
    this.hud = new HUD();

    const getScaledCoords = (clientX: number, clientY: number) =>
      this.renderer.screenToGame(clientX, clientY);

    const handleUIInteraction = (mx: number, my: number) => {
      // Pause menu click handling (while paused)
      if (this.paused && this.state === "playing") {
        const action = this.pauseMenu.handleClick(mx, my, this.audio, this.save);
        if (action === "resume") this.togglePause();
        else if (action === "tutorial") {
          this.paused = false;
          this.audio.stopConeTrack();
          this.startTutorial("playing");
        } else if (action === "forfeit") {
          this.paused = false;
          this.forfeitRound();
        }
        return;
      }
      // Pause button (top-right, during gameplay — works on mobile + desktop)
      if (this.state === "playing" && !this.paused) {
        if (this.pauseMenu.hitTestPauseButton(mx, my)) {
          this.togglePause();
          return;
        }
      }
      // Guard: ignore taps for 0.6s after state changes (prevents touchend → instant screen skip)
      if (this.gameTime - this.stateChangeTime < 0.6) return;
      if (this.state === "bossReward") {
        this.handleBossRewardClick(mx, my);
      } else if (this.state === "gameover") {
        this.manager.goToUpgradeScreen();
      }
    };

    canvas.addEventListener("click", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      handleUIInteraction(mx, my);
    });

    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        // End volume drag if active
        if (this.pauseMenu.volumeDragActive) {
          this.pauseMenu.volumeDragActive = false;
          const touch = e.changedTouches[0];
          const { mx } = getScaledCoords(touch.clientX, touch.clientY);
          this.pauseMenu.handleVolumeTouch(mx, this.audio, this.save);
          return;
        }
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        handleUIInteraction(mx, my);
      },
      { passive: false }
    );

    // Touch start — detect volume bar drag initiation in pause menu
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (!this.paused || this.state !== "playing") return;
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        const vb = this.pauseMenu.getLayout().volumeBar;
        if (mx >= vb.x && mx <= vb.x + vb.w && my >= vb.y - 10 && my <= vb.y + vb.h + 10) {
          this.pauseMenu.volumeDragActive = true;
          this.pauseMenu.handleVolumeTouch(mx, this.audio, this.save);
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // Touch move — update volume while dragging on volume bar
    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!this.pauseMenu.volumeDragActive) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const { mx } = getScaledCoords(touch.clientX, touch.clientY);
        this.pauseMenu.handleVolumeTouch(mx, this.audio, this.save);
      },
      { passive: false }
    );

    // Keyboard handlers for pause, dash, and tutorial skip
    window.addEventListener("keydown", (e) => {
      if (this.manager.active !== "game") return;
      // ESC skips tutorial
      if (e.key === "Escape" && this.state === "tutorial" && this.tutorial) {
        this.tutorial.skip();
        return;
      }
      if ((e.key === "Escape" || e.key.toLowerCase() === "p") && this.state === "playing") {
        this.togglePause();
      }
      // Dash is handled via InputManager.consumeDash() in updatePlaying
      if (e.key.toLowerCase() === "k" && this.state === "playing") {
        this.forfeitRound();
      }
    });
  }

  // ── Pause / Settings ──────────────────────────────────────────────

  /** Toggle pause state and manage cone track */
  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.stopConeTrack();
    } else {
      this.resumeFromPause();
    }
  }

  /** Resume gameplay — restart cone track with beat callback */
  private resumeFromPause() {
    this.audio.startConeTrack(() => this.onBeat());
  }

  /** Shared beat callback — used by both startRun() and resumeFromPause() */
  private onBeat() {
    // Pulse sacred geometry on every beat (not just cone fire beats)
    if (this.save.algoArtEnabled) {
      this.sacredGeometry.pulse();
    }
    this.coneBeatCount++;
    if (this.coneBeatCount % CONE_FIRE_EVERY === 0) {
      this.fireConeWeapon();
    }
    this.missileBeatCount++;
    if (this.missileBeatCount % MISSILE_FIRE_EVERY === 0) {
      this.fireMissile();
    }
  }

  handleDash() {
    const result = this.player.tryDash();
    if (!result.dashed) return;

    const ringRadius = result.flashbangRadius;
    const ringOrigin = { x: this.player.pos.x, y: this.player.pos.y };

    this.audio.playDash();
    // Thruster burst at dash start (trail behind player)
    const thrustAngle = this.player.angle + Math.PI; // opposite of facing direction
    this.particles.emitDirectional(
      vec2(ringOrigin.x, ringOrigin.y),
      thrustAngle,
      0.6,
      8,
      COLORS.engineGlow,
      60,
      0.25,
      2.5
    );
    this.particles.emitDirectional(
      vec2(ringOrigin.x, ringOrigin.y),
      thrustAngle,
      0.4,
      4,
      "#ffffff",
      40,
      0.15,
      1.5
    );
    this.renderer.shake(2);

    // Dash fires 1 free cone weapon hit — don't reset the beat loader
    this.fireDashConeHit();

    const ringLife = 0.3;
    this.dashRings.push({
      x: ringOrigin.x,
      y: ringOrigin.y,
      currentRadius: 0,
      maxRadius: ringRadius,
      life: ringLife,
      maxLife: ringLife,
    });

    for (const bullet of this.enemyBullets) {
      if (!bullet.alive) continue;
      if (vecDist(ringOrigin, bullet.pos) <= ringRadius) {
        this.particles.emit(bullet.pos, 2, "#ffffff", 20, 0.1, 1);
        bullet.destroy();
      }
    }

    const ringDamage = this._stats.damage * 0.5;
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

    if (hasAbility(this.save, "flashbang")) {
      const stunRadius = ringRadius + 20;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (vecDist(ringOrigin, enemy.pos) <= stunRadius) {
          enemy.applyStun(2.0);
        }
      }
      this.particles.emit(vec2(ringOrigin.x, ringOrigin.y), 12, "#44ccff", 80, 0.3, 2);
    }

    if (hasAbility(this.save, "bomb_dash")) {
      // Bomb spawns at dash START point (origin), not landing
      this.pendingBombs.push({
        x: ringOrigin.x,
        y: ringOrigin.y,
        timer: 1.5,
        maxTimer: 1.5,
        radius: 80,
      });
      this.particles.emit(vec2(ringOrigin.x, ringOrigin.y), 4, "#ffaa00", 40, 0.15, 1.5);
    }

    this.audio.playFlashbang();
  }

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

  /** Start the interactive tutorial on the game canvas */
  startTutorial(returnTo: "menu" | "playing") {
    this._stats = this.upgrades.computeStats();
    this.state = "tutorial";
    this.paused = false;
    this.tutorial = new TutorialSystem(this.renderer, this.input, this._stats, () => {
      // Tutorial complete callback
      this.tutorial = null;
      this.save.tutorialSeen = true;
      saveGame(this.save);
      if (returnTo === "playing") {
        // Resume the current run — restore state
        this.state = "playing";
        this.resumeFromPause();
      } else {
        // Go to upgrade screen / start first run
        this.manager.startGame();
      }
    });
  }

  startRun() {
    this._stats = this.upgrades.computeStats();
    this.player = new Player();
    this.player.updateStats(this._stats);
    this.player.resetHp(PLAYER_BASE_HP);
    this.mothership = new Mothership(this._stats.mothershipHP);
    this.bullets = [];
    this.enemies = [];
    this.coins = [];
    this.enemyBullets = [];
    this.roundTimer = this._stats.roundDuration;
    this.roundDuration = this._stats.roundDuration;
    this.spawnTimer = 1;
    this.spawnRate = SPAWN_RATE_BASE / this._stats.enemySpawnMultiplier;
    this.roundCoins = 0;
    this.roundKills = 0;
    this.killStreak = 0;
    this.streakTimer = 0;
    this.nextBossElapsed = 12;
    this.bossDefeated = false;
    this.bossEnemy = null;
    this.dashRings = [];
    this.laserBeams = [];
    this.pendingBombs = [];
    this.debris = [];
    this.debrisTimer = 0;
    this.laserTimer = 2.5;
    this.coneFlashTimer = 0;
    this.particles.clear();
    this.spawner.reset(this);
    this.formationTimer = 0;
    this.formationCooldown = 12;
    this.activeFormation = null;
    this.formationPreview = null;
    this.algoKillCounter = 0;
    this.state = "playing";
    this.paused = false;
    this.deathDelayActive = false;
    this.deathDelay = 0;
    this.deathCause = "";
    this.stateChangeTime = 0;

    const level = this.save.currentLevel;
    const initialRockCount = 5 + Math.floor(level * 0.5);
    for (let i = 0; i < initialRockCount; i++) {
      const angle = (Math.PI * 2 * i) / initialRockCount + randomRange(-0.2, 0.2);
      const dist = 180 + Math.random() * 120;
      const x = GAME_WIDTH / 2 + Math.cos(angle) * dist;
      const y = GAME_HEIGHT / 2 + Math.sin(angle) * dist;
      const rock = new Rock(x, y, 1, ROCK_BASE_SPEED, false, 0.65);
      this.enemies.push(rock);
    }

    // ── Camera: enable zoom on mobile ──
    if (isMobileDevice) {
      this.renderer.cameraZoom = MOBILE_CAMERA_ZOOM;
      // Start camera centered on player
      this.renderer.cameraX = this.player.pos.x;
      this.renderer.cameraY = this.player.pos.y;
    } else {
      this.renderer.cameraZoom = 1.0;
    }

    this.coneBeatCount = 0;
    this.missileBeatCount = 0;
    // Music-synced: fires locked to beat crossings (100 BPM fire, every other beat = 1.2s)
    this.audio.startConeTrack(() => this.onBeat());
  }

  fireMissile() {
    if (this.state !== "playing" || this.paused) return;
    if (this._stats.missileLevel <= 0) return;

    const target = this.findNearestEnemy();
    if (!target) return;

    const missileDmg = this._stats.damage * 0.5;
    const dir = vecNormalize(vecSub(target.pos, this.player.pos));
    const spawnX = this.player.pos.x + dir.x * 12;
    const spawnY = this.player.pos.y + dir.y * 12;

    const count = Math.min(this._stats.missileLevel, 3);
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * 0.3 : 0;
      const angle = vecAngle(dir) + spread;
      const missileDir = vecFromAngle(angle);

      const missile = new Missile(spawnX, spawnY, missileDir, MISSILE_SPEED, missileDmg, target);
      this.bullets.push(missile);
    }

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

  /** Check if enemy is within pulse range, accounting for forward pulse upgrade */
  private isInPulseRange(enemy: Enemy): boolean {
    const dist = vecDist(this.player.pos, enemy.pos);
    const edgeDist = dist - enemy.radius;
    if (edgeDist <= CONE_RANGE) return true; // always hit in base range
    if (!this._stats.forwardPulse) return false;
    // Forward pulse: extend range in the player's facing direction
    const dx = enemy.pos.x - this.player.pos.x;
    const dy = enemy.pos.y - this.player.pos.y;
    const facingX = Math.cos(this.player.angle);
    const facingY = Math.sin(this.player.angle);
    const dot = dx * facingX + dy * facingY; // how "forward" is the enemy
    if (dot <= 0) return false; // behind the player — no extended range
    const forwardRange = CONE_RANGE * 2.5;
    return edgeDist <= forwardRange;
  }

  /** Dash cone hit — deals damage but does NOT reset the beat loader or timing */
  private fireDashConeHit() {
    if (this.state !== "playing") return;

    const coneDmg = this._stats.damage;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (!this.isInPulseRange(enemy)) continue;

      const isCrit = Math.random() < this._stats.critChance;
      const dmg = isCrit ? coneDmg * this._stats.critMultiplier : coneDmg;
      const wasAlive = enemy.alive;
      enemy.takeDamage(dmg);
      this.spawnDamageNumber(enemy.pos.x, enemy.pos.y, dmg, isCrit);
      this.particles.emit(enemy.pos, 5, "#88eeff", 60, 0.2, 2);
      this.particles.emit(enemy.pos, 2, "#ffffff", 30, 0.1, 1);

      if (wasAlive && !enemy.alive) {
        this.onEnemyKilled(enemy);
      }
    }
    this.renderer.shake(1.5);
  }

  fireConeWeapon() {
    if (this.state !== "playing" || this.paused) return;

    const now = performance.now() / 1000;
    if (this.coneLastFireTime > 0) {
      const measured = now - this.coneLastFireTime;
      if (measured > 0.1 && measured < 2) {
        this.coneMeasuredInterval = measured;
      }
    }
    this.coneLastFireTime = now;
    this.coneTimeSinceLastFire = 0;
    this.coneFlashTimer = 0.18; // longer flash for more prominent effect

    // Push purchase-style shockwave (same as upgrade screen buy animation)
    this.pulseShockwaves.push({
      x: this.player.pos.x,
      y: this.player.pos.y,
      timer: 0.35,
      maxTimer: 0.35,
      color: COLORS.player,
    });

    const coneDmg = this._stats.damage;
    let hitCount = 0;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (!this.isInPulseRange(enemy)) continue;

      const isCrit = Math.random() < this._stats.critChance;
      const dmg = isCrit ? coneDmg * this._stats.critMultiplier : coneDmg;
      const wasAlive = enemy.alive;
      enemy.takeDamage(dmg);
      this.spawnDamageNumber(enemy.pos.x, enemy.pos.y, dmg, isCrit);
      // More particles per hit, cyan-white theme
      this.particles.emit(enemy.pos, 5, "#88eeff", 60, 0.2, 2);
      this.particles.emit(enemy.pos, 2, "#ffffff", 30, 0.1, 1);
      hitCount++;

      if (wasAlive && !enemy.alive) {
        this.onEnemyKilled(enemy);
      }
    }

    // ── Forward pulse directional particles ──
    if (this._stats.forwardPulse) {
      const fwd = this.player.angle;
      const forwardRange = CONE_RANGE * 2.5;
      for (let i = 0; i < 8; i++) {
        const spread = (i - 3.5) * 0.08;
        const a = fwd + spread;
        const px = this.player.pos.x + Math.cos(a) * 8;
        const py = this.player.pos.y + Math.sin(a) * 8;
        this.particles.emitDirectional(
          vec2(px, py),
          a,
          0.15,
          1,
          "#ff6688",
          forwardRange * 0.6,
          0.25,
          2
        );
      }
    }

    // ── Death pulse shockwave particles — expanding ring burst ──
    const ringCount = 20;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const px = this.player.pos.x + Math.cos(a) * 4;
      const py = this.player.pos.y + Math.sin(a) * 4;
      this.particles.emitDirectional(vec2(px, py), a, 0.12, 1, COLORS.player, 120, 0.25, 2);
    }
    // Outer ring — fainter, wider
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const px = this.player.pos.x + Math.cos(a) * 6;
      const py = this.player.pos.y + Math.sin(a) * 6;
      this.particles.emitDirectional(vec2(px, py), a, 0.08, 1, "#aaddff", 160, 0.2, 1.2);
    }
    // Inner burst — bright white core flash
    this.particles.emit(this.player.pos, 8, "#ffffff", 60, 0.15, 2.5);

    // Screen shake on hit for impact feel
    if (hitCount > 0) {
      this.renderer.shake(1.5);
    }

    // Play the cone blast SFX with reverb
    this.audio.playConeBlast();
  }

  update(dt: number) {
    this.lastDt = dt;
    this.gameTime += dt;

    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= dt;
      dn.y += dn.vy * dt;
      if (dn.life <= 0) {
        this.damageNumbers.splice(i, 1);
      }
    }

    switch (this.state) {
      case "playing":
        if (!this.paused) {
          this.updatePlaying(dt);
        }
        break;
      case "tutorial":
        if (this.tutorial) {
          this.tutorial.update(dt);
        }
        break;
      case "bossReward":
        this.particles.update(dt);
        break;
      case "gameover":
        this.particles.update(dt);
        break;
    }
  }

  updatePlaying(dt: number) {
    this._killedThisFrame.clear();

    // Death delay countdown — let mothership explosion play out before transitioning
    if (this.deathDelayActive) {
      this.deathDelay -= dt;
      this.mothership.update(dt); // tick death animation (expand + fade)
      this.particles.update(dt);
      // Continue updating enemies/coins visually during the delay
      for (const enemy of this.enemies) enemy.update(dt);
      this.coins.forEach((c) => {
        c.attractTo(this.player.pos, this._stats.coinMagnetRange);
        c.update(dt);
      });
      this.collisions.checkCoinCollections(this);
      compactAlive(this.coins);
      if (this.deathDelay <= 0) {
        this.endRound(true, this.deathCause as "mothership" | "player" | "time");
      }
      return;
    }

    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.endRound(false);
      this.roundTimer = 0;
      return;
    }

    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) {
        this.killStreak = 0;
      }
    }

    this.player.move(this.input, dt);
    this.player.update(dt);

    // ── Engine thruster trail particles (like the upgrade screen ship) ──
    if (this.player.isMoving && !this.player.isDashing) {
      const backAngle = this.player.angle + Math.PI;
      // Emit ~20 particles/sec while moving
      if (Math.random() < dt * 20) {
        const spread = (Math.random() - 0.5) * 0.6;
        const speed = 25 + Math.random() * 35;
        this.particles.emitDirectional(
          vec2(
            this.player.pos.x + Math.cos(backAngle) * 8,
            this.player.pos.y + Math.sin(backAngle) * 8
          ),
          backAngle + spread,
          0.15,
          1,
          COLORS.engineGlow,
          speed,
          0.25,
          1.5
        );
      }
      // Occasional white core particle
      if (Math.random() < dt * 8) {
        this.particles.emitDirectional(
          vec2(
            this.player.pos.x + Math.cos(backAngle) * 6,
            this.player.pos.y + Math.sin(backAngle) * 6
          ),
          backAngle + (Math.random() - 0.5) * 0.3,
          0.1,
          1,
          "#ffffff",
          20 + Math.random() * 20,
          0.15,
          0.8
        );
      }
    }

    // ── Camera follow player (smooth lerp) ──
    if (this.renderer.cameraZoom > 1) {
      const lerpSpeed = 0.08;
      // Bias camera slightly toward center-bottom to keep mothership partially visible
      const targetX = this.player.pos.x;
      const targetY = this.player.pos.y + 40; // slight downward bias
      this.renderer.cameraX += (targetX - this.renderer.cameraX) * lerpSpeed;
      this.renderer.cameraY += (targetY - this.renderer.cameraY) * lerpSpeed;
    }

    if (this.input.consumeDash() && this.state === "playing") {
      this.handleDash();
    }

    this.coneTimeSinceLastFire += dt;
    if (this.coneFlashTimer > 0) {
      this.coneFlashTimer -= dt;
    }

    this.mothership.update(dt);
    this.bullets.forEach((b) => b.update(dt));
    this.enemyBullets.forEach((b) => b.update(dt));

    for (const enemy of this.enemies) {
      const wasAlive = enemy.alive;
      enemy.update(dt);
      if (wasAlive && !enemy.alive) {
        this.onEnemyKilled(enemy);
      }
    }
    this.coins.forEach((c) => {
      c.attractTo(this.player.pos, this._stats.coinMagnetRange);
      c.update(dt);
    });
    this.particles.update(dt);

    for (let i = this.dashRings.length - 1; i >= 0; i--) {
      const ring = this.dashRings[i];
      ring.life -= dt;
      const progress = 1 - ring.life / ring.maxLife;
      ring.currentRadius = ring.maxRadius * progress;
      if (ring.life <= 0) {
        this.dashRings.splice(i, 1);
      }
    }

    const elapsed = this.roundDuration - this.roundTimer;
    if (elapsed >= this.nextBossElapsed) {
      this.spawnBoss();
      const interval = randomRange(15, 30) - this.save.currentLevel * 0.5;
      this.nextBossElapsed += interval;
    }

    if (hasAbility(this.save, "laser")) {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.fireLaser();
        this.laserTimer = 2.5;
      }
    }

    if (this.pendingBombs.length > 0) {
      this.updateBombs(dt);
    }

    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      this.laserBeams[i].life -= dt;
      if (this.laserBeams[i].life <= 0) {
        this.laserBeams.splice(i, 1);
      }
    }

    // ── Pulse shockwaves (same system as upgrade screen purchase shockwaves) ──
    for (let i = this.pulseShockwaves.length - 1; i >= 0; i--) {
      this.pulseShockwaves[i].timer -= dt;
      if (this.pulseShockwaves[i].timer <= 0) this.pulseShockwaves.splice(i, 1);
    }

    const progress = this.roundDuration > 0 ? Math.min(1, elapsed / this.roundDuration) : 0;
    const rampFactor = Math.pow(0.25, progress);
    const levelMult = this.save.currentLevel >= 2 ? 0.5 : 1;
    const currentSpawnRate = Math.max(0.8, this.spawnRate * rampFactor * levelMult);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawner.spawnEnemy(this);
      this.spawnTimer = currentSpawnRate;
    }

    this.spawner.updateEnemyTargets(this);
    this.spawner.applySlowAura(this);
    this.spawner.applyMothershipSlow(this);
    this.spawner.updateTurret(this, dt);
    this.spawner.updateMothershipRegen(this, dt);
    this.spawner.updateMothershipBarrier(this, dt);

    this.collisions.checkBulletEnemyCollisions(this);
    this.collisions.checkBulletDebrisCollisions(this);
    if (this.collisions.checkEnemyMothershipCollisions(this)) return;
    if (this.collisions.checkEnemyBulletPlayerCollisions(this)) return;
    this.collisions.checkCoinCollections(this);

    this.spawner.handleEnemyShooting(this);

    // ── Sacred Geometry background animation ──
    if (this.save.algoArtEnabled) this.sacredGeometry.update(dt);

    // ── Formation Spawning (algorithmic enemy patterns) ──
    this.updateFormations(dt);

    // ── Formation preview fade-out ──
    if (this.formationPreview) {
      this.formationPreview.life -= dt;
      if (this.formationPreview.life <= 0) {
        this.formationPreview = null;
      }
    }

    // ── Debris (harmless background asteroids) ──
    this.debrisTimer -= dt;
    if (this.debrisTimer <= 0 && this.debris.length < 40) {
      // Spawn from random positions along all edges (wide spread to avoid trail effect)
      const edge = Math.random();
      let dx: number, dy: number;
      if (edge < 0.5) {
        // top edge — full width with overshoot
        dx = randomRange(-80, GAME_WIDTH + 80);
        dy = randomRange(-50, -20);
      } else if (edge < 0.75) {
        // left edge — upper half
        dx = randomRange(-50, -20);
        dy = randomRange(-50, GAME_HEIGHT * 0.4);
      } else {
        // right edge — upper half
        dx = GAME_WIDTH + randomRange(20, 50);
        dy = randomRange(-50, GAME_HEIGHT * 0.4);
      }
      this.debris.push(new Debris(dx, dy));
      this.debrisTimer = randomRange(0.3, 0.7);
    }
    for (const d of this.debris) d.update(dt);
    compactAlive(this.debris);

    compactAlive(this.bullets);
    compactAlive(this.enemyBullets);
    compactAlive(this.enemies);
    compactAlive(this.coins);
  }

  spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean = false) {
    if (damage === 0) {
      const life = 0.6;
      this.damageNumbers.push({
        x: x + randomRange(-8, 8),
        y: y - 10,
        text: "DODGE",
        color: COLORS.player,
        life,
        maxLife: life,
        vy: -30,
      });
      return;
    }
    const life = 0.8;
    const text = isCrit ? `${Math.round(damage)}!` : `${Math.round(damage)}`;
    this.damageNumbers.push({
      x: x + randomRange(-8, 8),
      y: y - 10,
      text,
      color: isCrit ? "#ff4444" : "#ffff00",
      life,
      maxLife: life,
      vy: -40,
    });
  }

  spawnBoss() {
    const angle = randomAngle();
    const dist = 350;
    const x = GAME_WIDTH / 2 + Math.cos(angle) * dist;
    const y = GAME_HEIGHT / 2 + Math.sin(angle) * dist;
    const level = this.save.currentLevel;
    const bossHP = 5 + level * 5;

    if (level === 1) {
      // Level 1: mega asteroid boss — big and imposing
      const megaRock = new Rock(x, y, bossHP, 15, true, 2, true);
      megaRock.radius = 45;
      megaRock.coinValue = 10;
      megaRock.isBoss = true;
      this.bossEnemy = megaRock;
      this.enemies.push(megaRock);
    } else if (level === 2) {
      // Level 2: Bee boss — fast, agile, shoots
      const bee = new EnemyShip(x, y, bossHP, 35, true, "bee");
      bee.radius = 20;
      bee.coinValue = 15;
      bee.isBoss = true;
      this.bossEnemy = bee;
      this.enemies.push(bee);
    } else if (level === 3) {
      // Level 3: Butterfly boss — tanky, shoots, beautiful
      const butterfly = new EnemyShip(x, y, Math.floor(bossHP * 1.5), 25, true, "butterfly");
      butterfly.radius = 24;
      butterfly.coinValue = 20;
      butterfly.isBoss = true;
      this.bossEnemy = butterfly;
      this.enemies.push(butterfly);
    } else {
      // Level 4+: Boss ship variant — cycles between bee and butterfly, getting stronger
      const variant = level % 2 === 0 ? "bee" : "butterfly";
      const boss = new EnemyShip(x, y, bossHP * 2, 30 + level * 2, true, variant);
      boss.radius = 22 + level;
      boss.coinValue = 15 + level * 5;
      boss.isBoss = true;
      this.bossEnemy = boss;
      this.enemies.push(boss);
    }

    this.renderer.shake(2);
  }

  private _killedThisFrame = new Set<Enemy>();

  onEnemyKilled(enemy: Enemy) {
    // Bug #9 fix: guard against double-kill (splash/chain/poison can all trigger in same frame)
    if (this._killedThisFrame.has(enemy)) return;
    this._killedThisFrame.add(enemy);

    if (this.bossEnemy && enemy === this.bossEnemy) {
      this.bossDefeated = true;
      this.bossEnemy = null;
      this.particles.emit(enemy.pos, 40, "#ff4444", 160, 0.7, 5);
      this.particles.emit(enemy.pos, 25, "#ffaa00", 130, 0.55, 4);
      this.particles.emit(enemy.pos, 15, "#ffffff", 90, 0.35, 2.5);
      this.renderer.shake(2);
      this.audio.playExplosion();
      {
        this.audio.stopConeTrack();
        this.save.currentLevel++;
        this.save.starCoins++;
        const level = this.save.currentLevel - 1; // level that was just beaten
        // Auto-grant abilities for first 3 bosses; level 4+ shows choice screen
        if (level === 1 && !hasAbility(this.save, "bomb_dash")) {
          addAbility(this.save, "bomb_dash");
          this.autoGrantedAbility = "bomb_dash";
        } else if (level === 2 && !hasAbility(this.save, "laser")) {
          addAbility(this.save, "laser");
          this.autoGrantedAbility = "laser";
        } else if (level === 3 && !hasAbility(this.save, "flashbang")) {
          addAbility(this.save, "flashbang");
          this.autoGrantedAbility = "flashbang";
        } else {
          this.autoGrantedAbility = null;
        }
        saveGame(this.save);
        this.state = "bossReward";
        this.stateChangeTime = this.gameTime;
      }
      if (this.save.currentLevel > this.save.highestLevel) {
        this.save.highestLevel = this.save.currentLevel;
        saveGame(this.save); // Bug #18 fix: persist highestLevel immediately
      }
      return;
    }

    // ── Death burst particles ──
    if (this.save.algoArtEnabled) {
      // Algorithmic geometric death burst — cycles through 4 patterns
      const pattern = this.algoKillCounter % 4;
      const isBigEnemy = enemy.isBoss || enemy.isElite || enemy.coinValue >= 5;
      if (isBigEnemy) {
        emitSpirograph(this.particles, enemy.pos, 40, COLORS.explosion, 120, 0.8, 2.5, 0.33);
        emitGoldenRings(this.particles, enemy.pos, 3, 8, "#ffaa00", 100, 0.6, 2);
      } else if (pattern === 0) {
        emitFibonacciSpiral(this.particles, enemy.pos, 18, COLORS.explosion, 80, 0.45, 1.8);
      } else if (pattern === 1) {
        emitSpirograph(this.particles, enemy.pos, 20, COLORS.particle, 70, 0.5, 1.5, 0.4);
      } else if (pattern === 2) {
        emitSymmetricStar(this.particles, enemy.pos, 5, COLORS.explosion, 75, 0.45, 1.6);
      } else {
        emitGoldenRings(this.particles, enemy.pos, 2, 6, COLORS.particle, 65, 0.4, 1.5);
      }
      this.algoKillCounter++;
    } else {
      // Simple fallback explosion
      this.particles.emit(enemy.pos, 10, COLORS.explosion, 80, 0.4, 2.5);
    }
    this.renderer.shake(2);
    this.audio.playExplosion();

    this.killStreak++;
    this.streakTimer = 1.5;
    this.roundKills++;

    const baseValue = enemy.coinValue + 1 + this._stats.extraCoinPerKill;
    let value = Math.max(1, baseValue);

    if (Math.random() < this._stats.luckyChance) {
      value *= 5;
    }

    const coin = new Coin(enemy.pos.x, enemy.pos.y, value);
    this.coins.push(coin);
  }

  endRound(mothershipDestroyed: boolean, cause?: "mothership" | "player" | "time") {
    // For mothership destruction: start a 1.2s delay so explosion plays out
    // (only if there's still time left on the round timer)
    if (cause === "mothership" && this.roundTimer > 0 && !this.deathDelayActive) {
      this.deathDelayActive = true;
      this.deathDelay = 1.2;
      this.deathCause = cause;
      this.audio.stopConeTrack();
      // Big mothership explosion particles
      this.particles.emit(this.mothership.pos, 50, "#ff4444", 200, 0.8, 6);
      this.particles.emit(this.mothership.pos, 30, "#ffaa00", 160, 0.6, 5);
      this.particles.emit(this.mothership.pos, 20, "#ffffff", 120, 0.4, 3);
      this.renderer.shake(10);
      return; // don't transition yet — delay will handle it
    }

    this.audio.stopConeTrack();
    this.deathDelayActive = false;
    this.deathCause = cause || (mothershipDestroyed ? "mothership" : "time");

    // Apply round-end coin bonus (econ_combo upgrade)
    if (this._stats.roundCoinBonus > 0 && this.roundCoins > 0) {
      const bonus = Math.round(this.roundCoins * this._stats.roundCoinBonus);
      this.roundCoins += bonus;
      this.save.coins += bonus;
      this.save.lifetimeCoins += bonus;
    }
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    // Clear lingering particles so mothership explosion debris doesn't
    // render behind the gameover screen as a visual artifact cloud
    this.particles.clear();
    this.state = "gameover";
    this.stateChangeTime = this.gameTime;
  }

  /** Forfeit the current round — shows gameover screen with neutral "forfeited" message */
  forfeitRound() {
    this.audio.stopConeTrack();
    this.deathCause = "forfeit";
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.particles.clear();
    this.state = "gameover";
    this.stateChangeTime = this.gameTime;
  }

  goToUpgradeScreen() {
    this.manager.goToUpgradeScreen();
  }

  render() {
    // Tutorial has its own render pipeline (calls beginFrame/endFrame internally)
    if (this.state === "tutorial" && this.tutorial) {
      this.tutorial.render();
      return;
    }

    this.renderer.beginFrame(this.lastDt);

    switch (this.state) {
      case "playing":
        this.renderPlaying();
        if (this.paused) {
          this.pauseMenu.renderOverlay(
            this.renderer,
            this.audio,
            this.save,
            this.input.isTouchDevice
          );
        }
        break;
      case "bossReward":
        this.renderPlaying();
        this.bossRewardUI.render(this.renderer, this.save, this.autoGrantedAbility, this.gameTime);
        break;
      case "gameover":
        this.particles.render(this.renderer);
        this.gameOverUI.render(this.renderer, {
          deathCause: this.deathCause,
          roundCoins: this.roundCoins,
          roundKills: this.roundKills,
          totalCoins: this.save.coins,
          currentLevel: this.save.currentLevel,
          gameTime: this.gameTime,
        });
        break;
    }

    this.renderer.endFrame();
  }

  // ── Gameplay Rendering ────────────────────────────────────────────────

  renderPlaying() {
    // Background debris (harmless asteroids) — rendered behind everything
    for (const d of this.debris) d.render(this.renderer);

    // ── Sacred geometry mandala (behind entities, very faint) ──
    if (this.save.algoArtEnabled) {
      this.sacredGeometry.render(this.renderer);
    }

    // ── Formation preview (ghostly dots showing incoming pattern) ──
    if (this.save.algoArtEnabled && this.formationPreview) {
      renderFormationPreview(this.renderer, this.formationPreview);
    }

    // ── Mothership gravity well visual (ms_slow upgrade) ──
    if (this._stats.msSlowRadius > 0 && !this.mothership.isDestroyed) {
      const ctx = this.renderer.ctx;
      const mx = this.mothership.pos.x;
      const my = this.mothership.pos.y;
      const r = this._stats.msSlowRadius;
      const pulse = 0.12 + 0.04 * Math.sin(this.gameTime * 3);
      ctx.save();
      ctx.globalAlpha = pulse;
      const grad = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, r);
      grad.addColorStop(0, "rgba(68, 136, 255, 0)");
      grad.addColorStop(0.7, "rgba(68, 136, 255, 0.15)");
      grad.addColorStop(1, "rgba(68, 136, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      // Dashed ring at edge
      ctx.globalAlpha = pulse * 1.5;
      ctx.strokeStyle = "#4488ff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -this.gameTime * 15;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    this.mothership.render(this.renderer);
    for (const coin of this.coins) coin.render(this.renderer);
    for (const enemy of this.enemies) enemy.render(this.renderer);
    for (const bullet of this.enemyBullets) bullet.render(this.renderer);
    for (const bullet of this.bullets) bullet.render(this.renderer);
    this.player.render(this.renderer);

    // Dash ready indicator — pulsing green glow around player
    if (this.player.dashReady) {
      const ctx = this.renderer.ctx;
      const px = this.player.pos.x;
      const py = this.player.pos.y;
      const pulse = 0.3 + 0.2 * Math.sin(this.gameTime * 5);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = COLORS.dashReady;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Circle weapon visual — prominent pulse shockwave
    {
      const ctx = this.renderer.ctx;
      const px = this.player.pos.x;
      const py = this.player.pos.y;
      const range = CONE_RANGE;

      ctx.save();
      const loaderProgress = Math.min(1, this.coneTimeSinceLastFire / this.coneMeasuredInterval);
      const loaderArc = loaderProgress * Math.PI * 2;
      const loaderRadius = 18;

      // Loader ring — gets brighter as it fills
      const loaderAlpha = 0.3 + loaderProgress * 0.4;
      ctx.globalAlpha = loaderAlpha;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, loaderRadius, -Math.PI / 2, -Math.PI / 2 + loaderArc);
      ctx.stroke();

      // Subtle ambient glow when loader is nearly full
      if (loaderProgress > 0.75) {
        const readyPulse = (loaderProgress - 0.75) * 4; // 0→1
        ctx.globalAlpha = readyPulse * 0.08;
        const readyGrad = ctx.createRadialGradient(px, py, 0, px, py, range);
        readyGrad.addColorStop(0, COLORS.player);
        readyGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = readyGrad;
        ctx.beginPath();
        ctx.arc(px, py, range, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ── Pulse shockwaves — exact same render as upgrade screen purchase shockwaves ──
    {
      const ctx = this.renderer.ctx;
      const NODE_RADIUS = CONE_RANGE; // use cone range as the base radius
      for (const sw of this.pulseShockwaves) {
        const progress = 1 - sw.timer / sw.maxTimer;
        const radius = NODE_RADIUS * (1 + progress * 2.5);
        const alpha = 1 - progress;

        ctx.save();
        // Outer ring
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = alpha * 0.8;
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3 * (1 - progress);
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ring
        ctx.globalAlpha = alpha * 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    this.particles.render(this.renderer);

    // Laser beams
    {
      const ctx = this.renderer.ctx;
      for (const beam of this.laserBeams) {
        const alpha = beam.life / beam.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = COLORS.mothershipDamaged;
        ctx.lineWidth = 3 + alpha * 3;
        ctx.shadowColor = COLORS.mothershipDamaged;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(beam.x1, beam.y1);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.stroke();
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

    // Pending bombs
    {
      const ctx = this.renderer.ctx;
      for (const bomb of this.pendingBombs) {
        const progress = 1 - bomb.timer / bomb.maxTimer;
        const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * 12 + progress * Math.PI * 4);
        ctx.save();
        ctx.globalAlpha = 0.07 + pulse * 0.06;
        ctx.strokeStyle = "#ff8800";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.55 + progress * 0.4;
        const gradient = ctx.createRadialGradient(bomb.x, bomb.y, 0, bomb.x, bomb.y, 14);
        gradient.addColorStop(0, "#ffff88");
        gradient.addColorStop(0.45, "#ff6600");
        gradient.addColorStop(1, "rgba(255,50,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = COLORS.engineGlow;
        ctx.lineWidth = 2.5;
        const countArc = progress * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 10, -Math.PI / 2, -Math.PI / 2 + countArc);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Dash ripple ring visual
    {
      const ctx = this.renderer.ctx;
      for (const ring of this.dashRings) {
        const progress = 1 - ring.life / ring.maxLife;
        const alpha = (1 - progress) * 0.35;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = COLORS.player;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Damage numbers — Bug #8 fix: use dn.maxLife instead of hardcoded 0.8
    for (const dn of this.damageNumbers) {
      const alpha = Math.max(0, dn.life / dn.maxLife);
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

    // ── Switch to screen-space for HUD, mobile controls, overlays ──
    this.renderer.pushScreenSpace();

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
      dashReady: this.player.dashReady,
      dashCooldownRatio: this.player.dashCooldownRatio,
      isMobile: this.input.isTouchDevice,
    });

    if (this.save.specialAbilities.length > 0) {
      const ctx = this.renderer.ctx;
      const abilityNames = this.save.specialAbilities
        .map((id) => BOSS_REWARD_CHOICES.find((c) => c.id === id))
        .filter(Boolean);
      if (abilityNames.length > 0) {
        const label = abilityNames.map((c) => `⚡ ${c!.name}`).join("  ");
        const color = abilityNames[abilityNames.length - 1]!.color;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.font = this.renderer.getFont(8, true);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, GAME_WIDTH / 2, GAME_HEIGHT - 14);
        ctx.restore();
      }
    }

    if (this.input.isTouchDevice) {
      this.mobileControlsUI.render(
        this.renderer,
        this.input,
        this.player.dashReady,
        this.player.dashCooldownRatio
      );
    }
    // Pause button always visible (mobile + desktop)
    this.pauseMenu.renderPauseButton(this.renderer);

    // ── End screen-space pass ──
    this.renderer.popScreenSpace();
  }

  private fireLaser() {
    if (this.state !== "playing" || this.paused) return;

    // Fire toward where the player is pointing (mouse/touch aim direction)
    const aimPos = this.input.mousePos;
    const dir = vecNormalize(vecSub(aimPos, this.player.pos));

    // If aim is exactly on player (zero-length dir), skip
    if (dir.x === 0 && dir.y === 0) return;

    // Raycast: find the closest enemy along the aim direction
    // For each enemy, check perpendicular distance to the ray and pick the nearest hit
    let hitEnemy: Enemy | null = null;
    let hitDist = Infinity;
    const LASER_MAX_RANGE = 1600; // extends well past screen bounds

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      // Vector from player to enemy
      const toEnemy = vecSub(enemy.pos, this.player.pos);

      // Project enemy onto ray direction (dot product)
      const alongRay = toEnemy.x * dir.x + toEnemy.y * dir.y;

      // Enemy must be in front of player (positive projection)
      if (alongRay < 0) continue;
      if (alongRay > LASER_MAX_RANGE) continue;

      // Perpendicular distance from enemy center to the ray line
      const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);

      // Hit if the ray passes within the enemy's radius (generous hitbox)
      if (perpDist <= enemy.radius + 4) {
        if (alongRay < hitDist) {
          hitDist = alongRay;
          hitEnemy = enemy;
        }
      }
    }

    // Calculate beam endpoint — either the hit enemy or extend to max range
    let endX: number;
    let endY: number;

    if (hitEnemy) {
      endX = hitEnemy.pos.x;
      endY = hitEnemy.pos.y;

      const laserDmg = this._stats.damage * 3;
      const wasAlive = hitEnemy.alive;
      hitEnemy.takeDamage(laserDmg);
      this.spawnDamageNumber(hitEnemy.pos.x, hitEnemy.pos.y, laserDmg, false);
      this.particles.emit(hitEnemy.pos, 5, "#ff4444", 80, 0.2, 2);

      if (wasAlive && !hitEnemy.alive) {
        this.onEnemyKilled(hitEnemy);
      }
    } else {
      // No enemy hit — beam extends to max range in aim direction
      endX = this.player.pos.x + dir.x * LASER_MAX_RANGE;
      endY = this.player.pos.y + dir.y * LASER_MAX_RANGE;
    }

    this.laserBeams.push({
      x1: this.player.pos.x,
      y1: this.player.pos.y,
      x2: endX,
      y2: endY,
      life: 0.22,
      maxLife: 0.22,
    });

    this.renderer.shake(2);
  }

  private updateBombs(dt: number) {
    for (let i = this.pendingBombs.length - 1; i >= 0; i--) {
      const bomb = this.pendingBombs[i];
      bomb.timer -= dt;
      if (bomb.timer <= 0) {
        const bombDmg = this._stats.damage * BOMB_DAMAGE_MULT;
        const bPos = vec2(bomb.x, bomb.y);
        this.particles.emit(bPos, 45, "#ff8800", 200, 0.65, 6);
        this.particles.emit(bPos, 25, COLORS.engineGlow, 150, 0.45, 4);
        this.particles.emit(bPos, 15, "#ffffff", 110, 0.25, 2.5);
        this.renderer.shake(2);
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

  /** Manage algorithmic formation spawning — creates enemy waves in mathematical patterns */
  private updateFormations(dt: number) {
    const level = this.save.currentLevel;
    // Formations start at level 2+, and get more frequent at higher levels
    if (level < 2) return;

    // If there's an active formation being spawned, tick its stagger timers
    if (this.activeFormation) {
      this.activeFormation.elapsed += dt;
      const f = this.activeFormation;
      // Spawn enemies whose delay has passed
      while (f.spawnedCount < f.slots.length) {
        const slot = f.slots[f.spawnedCount];
        if (f.elapsed < slot.delay) break; // not yet time for this one
        // Spawn a rock at the formation slot position
        const hp = 1 + Math.floor(level * 0.3);
        const speed = ROCK_BASE_SPEED + level * 2;
        const rock = new Rock(slot.x, slot.y, hp, speed, false, 0.8);
        rock.coinValue = 2;
        this.enemies.push(rock);
        f.spawnedCount++;
      }
      // Formation complete when all enemies spawned
      if (f.spawnedCount >= f.slots.length) {
        this.activeFormation = null;
        // Next formation in 8–15 seconds (faster at higher levels)
        this.formationCooldown = randomRange(8, 15) - Math.min(5, level * 0.5);
        this.formationTimer = 0;
      }
      return;
    }

    // Count down to next formation
    this.formationTimer += dt;
    if (this.formationTimer >= this.formationCooldown) {
      // Generate a new formation
      const type = randomFormationType();
      const count = Math.min(6 + level, 14); // 7–14 enemies depending on level
      const slots = generateFormation(type, count);

      this.activeFormation = { slots, type, spawnedCount: 0, elapsed: 0 };

      // Show a ghostly preview of the formation shape for 2 seconds
      this.formationPreview = { type, slots, life: 2.0, maxLife: 2.0 };

      this.formationTimer = 0;
    }
  }

  private handleBossRewardClick(mx: number, my: number) {
    const result = this.bossRewardUI.handleClick(mx, my, this.autoGrantedAbility);
    if (result === "continue") {
      // Boss 1-3 auto-grant path — persist kills before leaving
      this.save.lifetimeKills += this.roundKills;
      saveGame(this.save);
      this.audio.playClick();
      this.manager.goToUpgradeScreen();
    } else if (result) {
      // Boss 4+ choice path — equip chosen ability then persist kills
      addAbility(this.save, result);
      this.save.lifetimeKills += this.roundKills;
      saveGame(this.save);
      this.audio.playClick();
      this.manager.goToUpgradeScreen();
    }
  }
}

import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { PlayerStats } from "../upgrades/UpgradeManager";
import { saveGame } from "../utils/SaveManager";
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
  CONE_RANGE,
  CONE_FIRE_EVERY,
  MISSILE_SPEED,
  MISSILE_FIRE_EVERY,
} from "../utils/Constants";
import { HUD } from "../ui/HUD";
import type { ScreenManager } from "./ScreenManager";
import { IGame } from "./GameInterface";
import { saveGame as persistSave } from "../utils/SaveManager";
import type { MusicTrack } from "../utils/SaveManager";

export type GameState = "playing" | "bossReward" | "gameover";

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
  player!: Player;
  mothership!: Mothership;
  bullets: Bullet[] = [];
  enemies: (Rock | EnemyShip)[] = [];
  coins: Coin[] = [];
  enemyBullets: Bullet[] = [];

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
  screenFlashColor: string = "";
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

  // Boss reward state — tracks what was auto-granted (null = show choice screen)
  private autoGrantedAbility: string | null = null;

  // Pause menu layout constants — scaled up for mobile fat-finger usability
  private readonly PAUSE_PANEL_W = 420;
  private readonly PAUSE_PANEL_H = 480;

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

    const getScaledCoords = (clientX: number, clientY: number) => {
      return {
        mx: (clientX - this.renderer.gameOffsetX) / this.renderer.gameScale,
        my: (clientY - this.renderer.gameOffsetY) / this.renderer.gameScale,
      };
    };

    const handleUIInteraction = (mx: number, my: number) => {
      // Pause menu click handling (while paused)
      if (this.paused && this.state === "playing") {
        this.handlePauseMenuClick(mx, my);
        return;
      }
      // Pause button (top-right, during gameplay — works on mobile + desktop)
      if (this.state === "playing" && !this.paused) {
        if (this.hitTestPauseButton(mx, my)) {
          this.togglePause();
          return;
        }
      }
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
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        handleUIInteraction(mx, my);
      },
      { passive: false }
    );

    // Keyboard handlers for pause and dash
    window.addEventListener("keydown", (e) => {
      if (this.manager.active !== "game") return;
      if (
        (e.key === "Escape" || e.key.toLowerCase() === "p" || e.key === " ") &&
        this.state === "playing"
      ) {
        this.togglePause();
      }
      if (e.key === "Shift" && this.state === "playing" && !this.paused) {
        this.handleDash();
      }
      if (e.key.toLowerCase() === "k" && this.state === "playing") {
        this.audio.stopConeTrack();
        this.save.lifetimeKills += this.roundKills;
        saveGame(this.save);
        this.manager.goToUpgradeScreen();
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
    this.audio.startConeTrack(() => {
      this.coneBeatCount++;
      if (this.coneBeatCount % CONE_FIRE_EVERY === 0) {
        this.fireConeWeapon();
      }
      this.missileBeatCount++;
      if (this.missileBeatCount % MISSILE_FIRE_EVERY === 0) {
        this.fireMissile();
      }
    });
  }

  /** Pause button (top-right, beside HUD) — big for easy tapping on mobile + desktop */
  private readonly PAUSE_BTN_X = GAME_WIDTH - 72;
  private readonly PAUSE_BTN_Y = 6;
  private readonly PAUSE_BTN_W = 64;
  private readonly PAUSE_BTN_H = 36;

  hitTestPauseButton(mx: number, my: number): boolean {
    return (
      mx >= this.PAUSE_BTN_X &&
      mx <= this.PAUSE_BTN_X + this.PAUSE_BTN_W &&
      my >= this.PAUSE_BTN_Y &&
      my <= this.PAUSE_BTN_Y + this.PAUSE_BTN_H
    );
  }

  /** Get pause menu layout rects — scaled up for mobile */
  private getPauseMenuLayout() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const pw = this.PAUSE_PANEL_W;
    const ph = this.PAUSE_PANEL_H;
    const px = cx - pw / 2;
    const py = cy - ph / 2;

    const btnW = pw - 50;
    const btnH = 40; // taller buttons for fat fingers
    const btnX = cx - btnW / 2;

    // Track buttons — wider with more gap
    const tracks: MusicTrack[] = ["fire", "chill", "trap"];
    const trackBtnW = 90;
    const trackBtnH = 38;
    const trackGap = 14;
    const totalTrackW = trackBtnW * tracks.length + trackGap * (tracks.length - 1);
    const trackStartX = cx - totalTrackW / 2;
    const trackY = py + 100;

    // Volume bar — much thicker for mobile
    const volBarX = px + 35;
    const volBarY = py + 210;
    const volBarW = pw - 70;
    const volBarH = 30;

    // Resume button — more spacing
    const resumeY = py + 280;

    // Forfeit button — more spacing from resume
    const forfeitY = py + 340;

    return {
      panel: { x: px, y: py, w: pw, h: ph },
      tracks: tracks.map((t, i) => ({
        track: t,
        x: trackStartX + i * (trackBtnW + trackGap),
        y: trackY,
        w: trackBtnW,
        h: trackBtnH,
      })),
      volumeBar: { x: volBarX, y: volBarY, w: volBarW, h: volBarH },
      resume: { x: btnX, y: resumeY, w: btnW, h: btnH },
      forfeit: { x: btnX, y: forfeitY, w: btnW, h: btnH },
    };
  }

  /** Handle clicks within the pause menu */
  handlePauseMenuClick(mx: number, my: number) {
    const layout = this.getPauseMenuLayout();

    // Track buttons — only allow switching to unlocked tracks
    for (const tb of layout.tracks) {
      if (mx >= tb.x && mx <= tb.x + tb.w && my >= tb.y && my <= tb.y + tb.h) {
        const unlocked = this.audio.isTrackUnlocked(
          tb.track,
          this.save.upgradeLevels,
          this.save.prestigeCount
        );
        if (!unlocked) {
          this.audio.playError();
          return;
        }
        this.audio.switchTrack(tb.track);
        this.save.musicTrack = tb.track;
        persistSave(this.save);
        this.audio.playClick();
        return;
      }
    }

    // Volume bar — click to set volume
    const vb = layout.volumeBar;
    if (mx >= vb.x && mx <= vb.x + vb.w && my >= vb.y && my <= vb.y + vb.h) {
      const ratio = Math.max(0, Math.min(1, (mx - vb.x) / vb.w));
      this.audio.setMusicVolume(ratio);
      this.save.musicVolume = ratio;
      persistSave(this.save);
      return;
    }

    // Resume button
    const rb = layout.resume;
    if (mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) {
      this.audio.playClick();
      this.togglePause();
      return;
    }

    // Forfeit button
    const fb = layout.forfeit;
    if (mx >= fb.x && mx <= fb.x + fb.w && my >= fb.y && my <= fb.y + fb.h) {
      this.audio.playClick();
      this.paused = false;
      this.audio.stopConeTrack();
      this.save.lifetimeKills += this.roundKills;
      saveGame(this.save);
      this.manager.goToUpgradeScreen();
      return;
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

    if (this.save.specialAbility === "flashbang") {
      const stunRadius = ringRadius + 20;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (vecDist(ringOrigin, enemy.pos) <= stunRadius) {
          enemy.applyStun(2.0);
        }
      }
      this.particles.emit(vec2(ringOrigin.x, ringOrigin.y), 12, "#44ccff", 80, 0.3, 2);
    }

    if (this.save.specialAbility === "bomb_dash") {
      // Bomb spawns at dash LANDING point (end of dash), not origin
      const dashDist = this.player.DASH_BASE_DISTANCE * (this.player.stats?.dashDistMult ?? 1);
      const dashDir = vecFromAngle(this.player.angle);
      const margin = 20;
      const landX = Math.max(
        margin,
        Math.min(GAME_WIDTH - margin, ringOrigin.x + dashDir.x * dashDist)
      );
      const landY = Math.max(
        margin,
        Math.min(GAME_HEIGHT - margin, ringOrigin.y + dashDir.y * dashDist)
      );
      this.pendingBombs.push({
        x: landX,
        y: landY,
        timer: 1.5,
        maxTimer: 1.5,
        radius: 80,
      });
      this.particles.emit(vec2(landX, landY), 4, "#ffaa00", 40, 0.15, 1.5);
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

  startRun() {
    this._stats = this.upgrades.computeStats();
    this.player = new Player();
    this.player.updateStats(this._stats);
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
    this.laserTimer = 2.5;
    this.coneFlashTimer = 0;
    this.particles.clear();
    this.spawner.reset(this);
    this.state = "playing";
    this.paused = false;

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

    this.coneBeatCount = 0;
    this.missileBeatCount = 0;
    // Music-synced: fires locked to beat crossings (100 BPM fire, every other beat = 1.2s)
    this.audio.startConeTrack(() => {
      this.coneBeatCount++;
      if (this.coneBeatCount % CONE_FIRE_EVERY === 0) {
        this.fireConeWeapon();
      }
      this.missileBeatCount++;
      if (this.missileBeatCount % MISSILE_FIRE_EVERY === 0) {
        this.fireMissile();
      }
    });
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

  /** Dash cone hit — deals damage but does NOT reset the beat loader or timing */
  private fireDashConeHit() {
    if (this.state !== "playing") return;

    const coneDmg = this._stats.damage;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = vecDist(this.player.pos, enemy.pos);
      if (dist > CONE_RANGE) continue;

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

    const coneDmg = this._stats.damage;
    let hitCount = 0;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = vecDist(this.player.pos, enemy.pos);
      if (dist > CONE_RANGE) continue;

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

    // ── Shockwave ring particles (expanding outward from player) ──
    const ringCount = 16;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const px = this.player.pos.x + Math.cos(a) * CONE_RANGE * 0.3;
      const py = this.player.pos.y + Math.sin(a) * CONE_RANGE * 0.3;
      this.particles.emitDirectional(vec2(px, py), a, 0.15, 1, "#aaddff", 70, 0.18, 1.5);
    }
    // Inner burst — bright white splash
    this.particles.emit(this.player.pos, 6, "#ffffff", 50, 0.12, 2);

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

    if (this.save.specialAbility === "laser") {
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

    const progress = this.roundDuration > 0 ? Math.min(1, elapsed / this.roundDuration) : 0;
    const rampFactor = Math.pow(0.25, progress);
    const levelMult = this.save.currentLevel >= 2 ? 0.5 : 1;
    const currentSpawnRate = Math.max(0.8, this.spawnRate * rampFactor * levelMult);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawner.spawnEnemy(this);
      this.spawnTimer = currentSpawnRate;
    }

    this.spawner.applySlowAura(this);
    this.spawner.updateTurret(this, dt);
    this.spawner.updateMothershipRegen(this, dt);
    this.spawner.updateMothershipBarrier(this, dt);

    this.collisions.checkBulletEnemyCollisions(this);
    if (this.collisions.checkEnemyMothershipCollisions(this)) return;
    this.collisions.checkCoinCollections(this);

    this.spawner.handleEnemyShooting(this);

    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.coins = this.coins.filter((c) => c.alive);
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
      // Level 1: mega asteroid boss
      const megaRock = new Rock(x, y, bossHP, 15, true, 2, true);
      megaRock.radius = 30;
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
        this.save.lifetimeKills += this.roundKills;
        // Auto-grant abilities for first 3 bosses; level 4+ shows choice screen
        if (level === 1 && !this.save.specialAbility) {
          this.save.specialAbility = "bomb_dash";
          this.autoGrantedAbility = "bomb_dash";
        } else if (level === 2) {
          this.save.specialAbility = "laser";
          this.autoGrantedAbility = "laser";
        } else if (level === 3) {
          this.save.specialAbility = "bomb_dash";
          this.autoGrantedAbility = "bomb_dash";
        } else {
          this.autoGrantedAbility = null;
        }
        saveGame(this.save);
        this.state = "bossReward";
      }
      if (this.save.currentLevel > this.save.highestLevel) {
        this.save.highestLevel = this.save.currentLevel;
      }
      return;
    }

    this.particles.emit(enemy.pos, 12, COLORS.explosion, 100, 0.4, 3);
    this.particles.emit(enemy.pos, 6, COLORS.particle, 60, 0.3, 2);
    this.renderer.shake(2);
    this.audio.playExplosion();

    this.killStreak++;
    this.streakTimer = 1.5;
    this.roundKills++;

    const baseValue = enemy.coinValue + 1 + this._stats.extraCoinPerKill;
    let value = Math.max(1, baseValue);

    const luckyChance = this.upgrades.getLevel("econ_lucky") * 0.04;
    if (Math.random() < luckyChance) {
      value *= 5;
    }

    const coin = new Coin(enemy.pos.x, enemy.pos.y, value);
    this.coins.push(coin);
  }

  endRound(mothershipDestroyed: boolean) {
    this.audio.stopConeTrack();
    void mothershipDestroyed;
    // Apply round-end coin bonus (econ_combo upgrade)
    if (this._stats.roundCoinBonus > 0 && this.roundCoins > 0) {
      const bonus = Math.round(this.roundCoins * this._stats.roundCoinBonus);
      this.roundCoins += bonus;
      this.save.coins += bonus;
      this.save.lifetimeCoins += bonus;
    }
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.state = "gameover";
  }

  goToUpgradeScreen() {
    this.manager.goToUpgradeScreen();
  }

  render() {
    this.renderer.beginFrame(this.lastDt);

    switch (this.state) {
      case "playing":
        this.renderPlaying();
        if (this.paused) {
          this.renderPauseOverlay();
        }
        break;
      case "bossReward":
        this.renderPlaying();
        this.renderBossReward();
        break;
      case "gameover":
        this.renderGameOver();
        break;
    }

    this.renderer.endFrame();
  }

  // ── Gameplay Rendering ────────────────────────────────────────────────

  renderPlaying() {
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
      const isFiring = this.coneFlashTimer > 0;
      const flashPower = isFiring ? this.coneFlashTimer / 0.18 : 0;

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

      if (isFiring) {
        // ── Expanding shockwave ring ──
        const expandProgress = 1 - flashPower; // 0→1 over flash duration
        const shockRadius = range * (0.4 + expandProgress * 0.8);
        const ringAlpha = flashPower * 0.7;

        // Outer shockwave ring (cyan)
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = COLORS.player;
        ctx.lineWidth = 3 * flashPower;
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 12 * flashPower;
        ctx.beginPath();
        ctx.arc(px, py, shockRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner bright ring (white)
        ctx.globalAlpha = ringAlpha * 0.6;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 * flashPower;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 8 * flashPower;
        ctx.beginPath();
        ctx.arc(px, py, shockRadius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Central flash fill — bright splash ──
        const splashGrad = ctx.createRadialGradient(px, py, 0, px, py, range);
        splashGrad.addColorStop(0, `rgba(136, 238, 255, ${flashPower * 0.3})`);
        splashGrad.addColorStop(0.3, `rgba(0, 212, 255, ${flashPower * 0.15})`);
        splashGrad.addColorStop(0.6, `rgba(100, 180, 220, ${flashPower * 0.05})`);
        splashGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = splashGrad;
        ctx.beginPath();
        ctx.arc(px, py, range, 0, Math.PI * 2);
        ctx.fill();

        // ── Radial spike lines for "splash" feel ──
        ctx.globalAlpha = flashPower * 0.35;
        ctx.strokeStyle = "#aaeeff";
        ctx.lineWidth = 1;
        const spikeCount = 12;
        for (let i = 0; i < spikeCount; i++) {
          const a = (i / spikeCount) * Math.PI * 2 + expandProgress * 0.3;
          const innerR = range * 0.15;
          const outerR = range * (0.5 + expandProgress * 0.5);
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * innerR, py + Math.sin(a) * innerR);
          ctx.lineTo(px + Math.cos(a) * outerR, py + Math.sin(a) * outerR);
          ctx.stroke();
        }
      }

      ctx.restore();
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

    const streakBonus = 1; // kill streak bonus removed — econ_combo is now round-end %

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

    if (this.save.specialAbility) {
      const choice = BOSS_REWARD_CHOICES.find((c) => c.id === this.save.specialAbility);
      if (choice) {
        const ctx = this.renderer.ctx;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.font = `bold 8px Tektur`;
        ctx.fillStyle = choice.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`⚡ ${choice.name}`, GAME_WIDTH / 2, GAME_HEIGHT - 14);
        ctx.restore();
      }
    }

    if (this.input.isTouchDevice) {
      this.renderMobileControls();
    }
    // Pause button always visible (mobile + desktop)
    this.renderMobilePauseButton();
  }

  renderMobileControls() {
    const ctx = this.renderer.ctx;
    const joy = this.input.joystick;

    // Floating virtual joystick
    if (joy.active) {
      const baseR = this.input.JOYSTICK_RADIUS;
      const thumbR = 14;

      ctx.save();
      // Outer ring (base)
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, baseR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring (thumb)
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joy.thumbX, joy.thumbY, thumbR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joy.thumbX, joy.thumbY, thumbR, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot on base
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Dash button: bigger + more central for mobile fat-finger usability
    const dashX = GAME_WIDTH - 120;
    const dashY = GAME_HEIGHT - 120;
    const dashR = 48;
    ctx.save();

    if (this.player.dashReady) {
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
      ctx.globalAlpha = 0.45;
      ctx.font = `bold 14px Tektur`;
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashX, dashY);
    } else {
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = "#445";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 3;
      const arc = this.player.dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, -Math.PI / 2, -Math.PI / 2 + arc);
      ctx.stroke();
      const pct = Math.floor(this.player.dashCooldownRatio * 100);
      ctx.globalAlpha = 0.25;
      ctx.font = `bold 14px Tektur`;
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
    const layout = this.getPauseMenuLayout();
    const p = layout.panel;

    // Dim background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Main panel
    this.renderer.drawPanel(p.x, p.y, p.w, p.h, {
      bg: "rgba(8, 8, 24, 0.94)",
      border: "rgba(100, 120, 180, 0.4)",
      radius: 14,
      glow: "rgba(100, 150, 255, 0.1)",
      glowBlur: 18,
    });

    // Title
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 12;
    this.renderer.drawTitleTextOutline(
      "PAUSED",
      cx,
      p.y + 36,
      "#fff",
      "#000",
      22,
      "center",
      "middle"
    );
    ctx.restore();

    // Divider
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 20, p.y + 60);
    ctx.lineTo(p.x + p.w - 20, p.y + 60);
    ctx.stroke();
    ctx.restore();

    // ── Music Track Section ──
    ctx.save();
    ctx.font = `bold 11px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MUSIC TRACK", cx, p.y + 80);
    ctx.restore();

    // Track label colors
    const trackColors: Record<string, string> = {
      fire: "#ff6644",
      chill: "#44ccff",
      trap: "#cc44ff",
    };
    const trackEmojis: Record<string, string> = {
      fire: "🔥",
      chill: "❄️",
      trap: "🎵",
    };

    for (const tb of layout.tracks) {
      const isActive = this.audio.track === tb.track;
      const isUnlocked = this.audio.isTrackUnlocked(
        tb.track,
        this.save.upgradeLevels,
        this.save.prestigeCount
      );
      const color = trackColors[tb.track] || "#fff";

      if (!isUnlocked) {
        // Locked track — show 🔒 with dimmed styling
        const lockHint = tb.track === "chill" ? "Scythe" : "Prestige";
        this.renderer.drawButton(tb.x, tb.y, tb.w, tb.h, `🔒 ${tb.track.toUpperCase()}`, {
          bg: "rgba(10, 10, 20, 0.85)",
          border: "rgba(60, 60, 80, 0.3)",
          textColor: "rgba(100, 100, 120, 0.5)",
          fontSize: 11,
          radius: 8,
        });
        // Lock hint below button
        ctx.save();
        ctx.font = `8px Tektur`;
        ctx.fillStyle = "rgba(100, 100, 130, 0.45)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`Req: ${lockHint}`, tb.x + tb.w / 2, tb.y + tb.h + 2);
        ctx.restore();
      } else {
        this.renderer.drawButton(
          tb.x,
          tb.y,
          tb.w,
          tb.h,
          `${trackEmojis[tb.track]} ${tb.track.toUpperCase()}`,
          {
            bg: isActive ? "rgba(40, 40, 80, 0.95)" : "rgba(15, 15, 35, 0.85)",
            border: isActive ? color : "rgba(100, 110, 140, 0.35)",
            textColor: isActive ? color : "rgba(180, 180, 200, 0.7)",
            fontSize: 11,
            radius: 8,
            glow: isActive ? color.replace(")", ",0.2)").replace("rgb", "rgba") : undefined,
          }
        );
      }
    }

    // ── Volume Section ──
    ctx.save();
    ctx.font = `bold 11px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VOLUME", cx, p.y + 195);
    ctx.restore();

    const vb = layout.volumeBar;
    const vol = this.audio.getMusicVolume();
    this.renderer.drawGradientBar(
      vb.x,
      vb.y,
      vb.w,
      vb.h,
      vol,
      "#4488ff",
      "#00d4ff",
      "rgba(20, 20, 40, 0.8)",
      "rgba(80, 100, 160, 0.3)",
      vb.h / 2
    );

    // Volume percentage
    ctx.save();
    ctx.font = `bold 11px Tektur`;
    ctx.fillStyle = "#aabbcc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(vol * 100)}%`, cx, vb.y + vb.h / 2);
    ctx.restore();

    // ── Resume Button ──
    const rb = layout.resume;
    this.renderer.drawButton(rb.x, rb.y, rb.w, rb.h, "▶  RESUME", {
      bg: "rgba(20, 60, 50, 0.9)",
      border: "rgba(68, 255, 136, 0.45)",
      textColor: "#44ff88",
      fontSize: 14,
      radius: 8,
      glow: "rgba(68, 255, 136, 0.12)",
    });

    // ── Forfeit Button ──
    const fb = layout.forfeit;
    this.renderer.drawButton(fb.x, fb.y, fb.w, fb.h, "↩  BACK TO UPGRADES", {
      bg: "rgba(50, 20, 20, 0.85)",
      border: "rgba(255, 80, 80, 0.3)",
      textColor: "rgba(255, 120, 120, 0.8)",
      fontSize: 12,
      radius: 8,
    });

    // Keyboard hint (only for non-mobile)
    if (!this.input.isTouchDevice) {
      ctx.save();
      ctx.font = `8px Tektur`;
      ctx.fillStyle = "rgba(120, 130, 160, 0.5)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P / ESC to resume  ·  K to forfeit", cx, p.y + p.h - 14);
      ctx.restore();
    }
  }

  /** Render mobile pause button (top-right, always visible during gameplay) */
  private renderMobilePauseButton() {
    const ctx = this.renderer.ctx;
    const bx = this.PAUSE_BTN_X;
    const by = this.PAUSE_BTN_Y;
    const bw = this.PAUSE_BTN_W;
    const bh = this.PAUSE_BTN_H;

    ctx.save();
    // Background pill
    ctx.globalAlpha = 0.35;
    this.renderer.drawRoundedRect(bx, by, bw, bh, 6, "rgba(8, 8, 24, 0.85)");
    ctx.globalAlpha = 0.25;
    this.renderer.drawRoundedRectStroke(bx, by, bw, bh, 6, "rgba(100, 120, 180, 0.4)", 1);

    // Pause icon — two thick vertical bars
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffffff";
    const iconX = bx + bw / 2;
    const iconY = by + bh / 2;
    const barW = 5;
    const barH = 20;
    const barGap = 6;
    ctx.fillRect(iconX - barGap - barW, iconY - barH / 2, barW, barH);
    ctx.fillRect(iconX + barGap, iconY - barH / 2, barW, barH);

    ctx.restore();
  }

  private fireLaser() {
    if (this.state !== "playing" || this.paused) return;
    const target = this.findNearestEnemy();
    if (!target) return;

    const laserDmg = this._stats.damage * 3;
    const wasAlive = target.alive;
    target.takeDamage(laserDmg);
    this.spawnDamageNumber(target.pos.x, target.pos.y, laserDmg, false);
    this.particles.emit(target.pos, 5, "#ff4444", 80, 0.2, 2);

    if (wasAlive && !target.alive) {
      this.onEnemyKilled(target);
    }

    this.laserBeams.push({
      x1: this.player.pos.x,
      y1: this.player.pos.y,
      x2: target.pos.x,
      y2: target.pos.y,
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
        const bombDmg = this._stats.damage * 5;
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

  private handleBossRewardClick(mx: number, my: number) {
    // Auto-granted ability (bosses 1-3): any tap goes to upgrades
    if (this.autoGrantedAbility) {
      this.audio.playClick();
      this.manager.goToUpgradeScreen();
      return;
    }
    // Choice screen (boss 4+): tap a card to select, then go to upgrades
    const layout = this.getBossRewardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const card = layout[i];
      if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
        this.selectSpecialAbility(BOSS_REWARD_CHOICES[i].id);
        return;
      }
    }
  }

  private selectSpecialAbility(id: string) {
    this.save.specialAbility = id;
    this.save.lifetimeKills += this.roundKills;
    saveGame(this.save);
    this.audio.playClick();
    this.manager.goToUpgradeScreen();
  }

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

  private renderBossReward() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;

    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.save();
    ctx.shadowColor = COLORS.engineGlow;
    ctx.shadowBlur = 22;
    this.renderer.drawTitleTextOutline(
      "BOSS DEFEATED!",
      cx,
      180,
      COLORS.engineGlow,
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    // Auto-granted ability (bosses 1-3): show single reward card
    if (this.autoGrantedAbility) {
      const choice = BOSS_REWARD_CHOICES.find((c) => c.id === this.autoGrantedAbility);
      if (choice) {
        this.renderer.drawTitleText(
          "New Ability Unlocked!",
          cx,
          218,
          "#ffffff",
          14,
          "center",
          "middle"
        );

        // Single centered card — bigger than the 3-card layout
        const cardW = 220;
        const cardH = 260;
        const cardX = cx - cardW / 2;
        const cardY = 250;

        this.renderer.drawPanel(cardX, cardY, cardW, cardH, {
          bg: "rgba(25,25,55,0.96)",
          border: choice.borderColor,
          radius: 12,
          glow: choice.glowColor,
          glowBlur: 28,
        });

        this.drawAbilityIcon(ctx, choice.id, cx, cardY + 60, choice.color);

        ctx.save();
        ctx.font = `bold 16px Tektur`;
        ctx.fillStyle = choice.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = choice.color;
        ctx.shadowBlur = 12;
        ctx.fillText(choice.name, cx, cardY + 110);
        ctx.restore();

        ctx.save();
        ctx.font = `11px Tektur`;
        ctx.fillStyle = COLORS.textSecondary;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let j = 0; j < choice.lines.length; j++) {
          ctx.fillText(choice.lines[j], cx, cardY + 140 + j * 20);
        }
        ctx.restore();

        // "EQUIPPED ✓" badge
        ctx.save();
        ctx.font = `bold 12px Tektur`;
        ctx.fillStyle = choice.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✓ EQUIPPED", cx, cardY + cardH - 28);
        ctx.restore();

        // Continue hint
        const blink = Math.sin(this.gameTime * 3) > 0;
        const btnW = 260;
        const btnH = 36;
        const btnX = cx - btnW / 2;
        const btnY = cardY + cardH + 20;
        this.renderer.drawButton(btnX, btnY, btnW, btnH, "TAP TO CONTINUE", {
          bg: blink ? "rgba(61, 180, 150, 0.9)" : "rgba(10, 20, 15, 0.8)",
          border: blink ? "rgba(38, 180, 180, 0.4)" : "rgba(100, 200, 150, 0.2)",
          textColor: blink ? "#fff" : "rgba(255,255,255,0.5)",
          fontSize: 13,
          radius: 8,
          glow: blink ? "rgba(15, 210, 228, 0.15)" : undefined,
        });
      }
      return;
    }

    // Choice screen (boss 4+): show 3 cards
    this.renderer.drawTitleText(
      "Choose your Special Ability",
      cx,
      218,
      COLORS.textSecondary,
      12,
      "center",
      "middle"
    );

    if (this.save.specialAbility) {
      const existing = BOSS_REWARD_CHOICES.find((c) => c.id === this.save.specialAbility);
      if (existing) {
        ctx.save();
        ctx.font = `8px Tektur`;
        ctx.fillStyle = existing.color;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`Currently equipped: ${existing.name} — choose again to switch`, cx, 242);
        ctx.restore();
      }
    }

    const layout = this.getBossRewardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const choice = BOSS_REWARD_CHOICES[i];
      const card = layout[i];
      const isCurrent = this.save.specialAbility === choice.id;

      this.renderer.drawPanel(card.x, card.y, card.w, card.h, {
        bg: isCurrent ? "rgba(25,25,55,0.96)" : "rgba(10,10,28,0.94)",
        border: isCurrent ? choice.borderColor : "rgba(120,120,160,0.35)",
        radius: 10,
        glow: choice.glowColor,
        glowBlur: isCurrent ? 22 : 10,
      });

      this.drawAbilityIcon(ctx, choice.id, card.x + card.w / 2, card.y + 52, choice.color);

      ctx.save();
      ctx.font = `bold 12px Tektur`;
      ctx.fillStyle = choice.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = choice.color;
      ctx.shadowBlur = isCurrent ? 8 : 0;
      ctx.fillText(choice.name, card.x + card.w / 2, card.y + 98);
      ctx.restore();

      ctx.save();
      ctx.font = `8.5px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let j = 0; j < choice.lines.length; j++) {
        ctx.fillText(choice.lines[j], card.x + card.w / 2, card.y + 122 + j * 16);
      }
      ctx.restore();

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

    ctx.save();
    ctx.font = `8px Tektur`;
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
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let g = 0; g < 4; g++) {
        const angle = (g / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 17, cy + Math.sin(angle) * 17);
        ctx.lineTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 10);
      ctx.lineTo(cx + 10, cy - 22);
      ctx.stroke();
    } else if (id === "bomb_dash") {
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 8);
      ctx.quadraticCurveTo(cx + 16, cy - 16, cx + 11, cy - 22);
      ctx.stroke();
      ctx.fillStyle = COLORS.engineGlow;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx + 11, cy - 22, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "flashbang") {
      const spikes = 8;
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7);
        ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 18);
        ctx.stroke();
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
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  renderGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const ctx = this.renderer.ctx;

    this.particles.render(this.renderer);

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const title = "ROUND COMPLETE";
    const titleColor = "#00d4ff";

    const panelW = 320;
    const panelH = 200;
    this.renderer.drawPanel(cx - panelW / 2, cy - panelH / 2, panelW, panelH, {
      bg: "rgba(6, 6, 20, 0.92)",
      border: "rgba(68, 255, 136, 0.3)",
      radius: 12,
      glow: "rgba(68, 255, 136, 0.15)",
      glowBlur: 20,
    });

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

    this.renderer.drawTitleText(
      `Level ${this.save.currentLevel}`,
      cx,
      cy - 42,
      COLORS.textPrimary,
      14,
      "center",
      "middle"
    );

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 100, cy - 28);
    ctx.lineTo(cx + 100, cy - 28);
    ctx.stroke();
    ctx.restore();

    const statY = cy - 10;
    const lineH = 22;

    ctx.save();
    ctx.font = `bold 11px Tektur`;
    ctx.textBaseline = "middle";

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Coins Earned", cx - 100, statY);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.textGold;
    ctx.fillText(`+${this.roundCoins}`, cx + 100, statY);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Enemies Defeated", cx - 100, statY + lineH);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8866";
    ctx.fillText(`${this.roundKills}`, cx + 100, statY + lineH);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Total Coins", cx - 100, statY + lineH * 2);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.coin;
    ctx.fillText(`${this.save.coins}`, cx + 100, statY + lineH * 2);

    ctx.restore();

    const blink = Math.sin(this.gameTime * 3) > 0;
    const btnW = 220;
    const btnH = 32;
    const btnX = cx - btnW / 2;
    const btnY = cy + 62;

    this.renderer.drawButton(btnX, btnY, btnW, btnH, "TAP TO CONTINUE", {
      bg: blink ? "rgba(61, 180, 150, 0.9)" : "rgba(10, 20, 15, 0.8)",
      border: blink ? "rgba(38, 180, 180, 0.4)" : "rgba(100, 200, 150, 0.2)",
      textColor: blink ? "#fff" : "rgba(255,255,255,0.5)",
      fontSize: 12,
      radius: 8,
      glow: blink ? "rgba(15, 210, 228, 0.15)" : undefined,
    });
  }
}

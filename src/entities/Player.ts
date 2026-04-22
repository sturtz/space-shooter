import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { PlayerStats } from "../upgrades/UpgradeManager";
import { Vec2, vec2, vecScale, vecFromAngle, clamp } from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_COLLISION_RADIUS,
  PLAYER_BASE_HP,
  PLAYER_HIT_INVULN,
  COLORS,
  isMobileDevice,
  MOBILE_SPRITE_SCALE,
} from "../utils/Constants";
import { PlayerImages, imageReady } from "../utils/Assets";

export interface DashResult {
  dashed: boolean;
  flashbangRadius: number;
}

export class Player extends Entity {
  stats: PlayerStats;
  fireCooldown: number = 0;

  // Player health
  hp: number = PLAYER_BASE_HP;
  maxHp: number = PLAYER_BASE_HP;
  invulnTimer: number = 0; // seconds of invulnerability remaining
  damageFlash: number = 0; // visual flash when hit

  // Dash ability
  dashCooldown: number = 0;
  readonly DASH_COOLDOWN_TIME = 4; // seconds between dashes
  readonly DASH_BASE_DISTANCE = 100; // pixels to cover per dash
  readonly DASH_DURATION = 0.3; // seconds the dash motion takes
  readonly DASH_BASE_RING_RADIUS = 60; // base explosion ring radius

  // Smooth dash state
  isDashing: boolean = false;
  private dashTimer: number = 0;
  private dashVelocity: Vec2 = vec2(0, 0);

  /** True while the ship is actively moving toward the cursor/touch */
  isMoving: boolean = false;

  constructor() {
    super(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, PLAYER_COLLISION_RADIUS);
    // Initialize with safe defaults so stats is never undefined before updateStats() is called
    this.stats = {
      damage: 1,
      critChance: 0,
      critMultiplier: 2.5,
      splashRadius: 0,
      forwardPulse: false,
      pierceCount: 0,
      chainTargets: 0,
      missileLevel: 0,
      barrageSplashBonus: 0,
      poisonDps: 0,
      slowOnHit: 0,
      moveSpeed: 200,
      flashbangRadius: 0,
      mineOnDash: false,
      mineSlow: false,
      fireRate: 0.5,
      autoBomb: false,
      mothershipHP: 5,
      msBarrierHits: 0,
      msBarrierCooldown: 25,
      turretLevel: 0,
      msSlowStrength: 0,
      msSlowRadius: 0,
      roundDuration: 30,
      coinMagnetRange: 50,
      extraCoinPerKill: 0,
      roundCoinBonus: 0,
      luckyChance: 0,
      enemySpawnMultiplier: 1,
      // Phase 2 defaults
      executeThreshold: 0,
      deathNovaActive: false,
      deathNovaDamageFraction: 0,
      deathNovaRadius: 0,
      multishotCount: 0,
      orbitalDrones: false,
      eliteCoinMultiplier: 1,
      interestRate: 0,
      afterimageActive: false,
      afterimageDpsFraction: 0,
      warpDash: false,
      freezeChance: 0,
      freezeDuration: 0,
      bleedActive: false,
      bleedDpsPerStack: 0,
      bleedMaxStacks: 0,
      msRepairInterval: 0,
      msMechActive: false,
      msOverdriveActive: false,
      msFortressActive: false,
      msFortressDomeRadius: 0,
      timePenaltyPerHit: 3,
      extraProjectiles: 0,
      spreadAngle: 0.15,
      dashDistMult: 1,
      slowAuraRange: 0,
      slowAuraFactor: 0,
      turretDamageMult: 1,
      overtimeBonus: 0,
      playerMaxHp: PLAYER_BASE_HP,
      playerRegenInterval: 0,
      playerInvulnTime: PLAYER_HIT_INVULN,
    };
  }

  updateStats(stats: PlayerStats) {
    this.stats = stats;
  }

  /** Take damage from an enemy bullet or boss hit. Returns true if player is killed. */
  takeDamage(amount: number = 1): boolean {
    if (this.invulnTimer > 0 || this.isDashing) return false; // invulnerable
    this.hp -= amount;
    this.damageFlash = 0.3;
    this.invulnTimer = this.stats.playerInvulnTime;
    if (this.hp <= 0) {
      this.hp = 0;
      return true; // killed
    }
    return false;
  }

  /** Reset HP to max (called at start of each run) */
  resetHp(maxHp: number) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.invulnTimer = 0;
    this.damageFlash = 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.isDashing;
  }

  update(dt: number) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
    if (this.dashCooldown > 0) {
      this.dashCooldown -= dt;
    }
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
    }
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
    }

    // Smooth dash motion — move at high speed for DASH_DURATION seconds
    if (this.isDashing) {
      this.dashTimer -= dt;
      const margin = 20;
      this.pos.x = clamp(this.pos.x + this.dashVelocity.x * dt, margin, GAME_WIDTH - margin);
      this.pos.y = clamp(this.pos.y + this.dashVelocity.y * dt, margin, GAME_HEIGHT - margin);
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.dashTimer = 0;
      }
    }
  }

  move(input: InputManager, dt: number) {
    // Skip normal movement while dashing — dash controls movement directly
    if (this.isDashing) return;

    if (input.isTouchDevice) {
      // Mobile: use joystick direction
      const joy = input.joystick;
      this.isMoving = joy.active && joy.magnitude > 0;

      if (this.isMoving) {
        const speed = this.stats.moveSpeed * joy.magnitude; // magnitude scales speed
        this.pos.x += joy.dirX * speed * dt;
        this.pos.y += joy.dirY * speed * dt;
        // Face movement direction
        this.angle = Math.atan2(joy.dirY, joy.dirX);
      }
    } else {
      // Desktop: move toward mouse cursor
      const target = input.mousePos;
      const dx = target.x - this.pos.x;
      const dy = target.y - this.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const STOP_THRESHOLD = 3;
      this.isMoving = dist > STOP_THRESHOLD;

      if (this.isMoving) {
        const moveAmount = Math.min(this.stats.moveSpeed * dt, dist);
        this.pos.x += (dx / dist) * moveAmount;
        this.pos.y += (dy / dist) * moveAmount;
      }

      if (dist > STOP_THRESHOLD) {
        this.angle = Math.atan2(dy, dx);
      }
    }

    // Clamp to screen
    const margin = 20;
    this.pos.x = clamp(this.pos.x, margin, GAME_WIDTH - margin);
    this.pos.y = clamp(this.pos.y, margin, GAME_HEIGHT - margin);
  }

  /** Attempt a smooth high-speed dash in current facing direction. */
  tryDash(): DashResult {
    if (this.dashCooldown > 0 || this.isDashing) return { dashed: false, flashbangRadius: 0 };

    this.dashCooldown = this.DASH_COOLDOWN_TIME;

    const dist = this.DASH_BASE_DISTANCE * this.stats.dashDistMult;
    const dashDir = vecFromAngle(this.angle);
    const dashSpeed = dist / this.DASH_DURATION; // pixels per second

    // Start smooth dash
    this.isDashing = true;
    this.dashTimer = this.DASH_DURATION;
    this.dashVelocity = vecScale(dashDir, dashSpeed);

    const ringRadius = this.DASH_BASE_RING_RADIUS + this.stats.flashbangRadius;
    return { dashed: true, flashbangRadius: ringRadius };
  }

  get dashReady(): boolean {
    return this.dashCooldown <= 0;
  }

  get dashCooldownRatio(): number {
    if (this.dashCooldown <= 0) return 1;
    return 1 - this.dashCooldown / this.DASH_COOLDOWN_TIME;
  }

  canFire(): boolean {
    return this.fireCooldown <= 0;
  }

  fire(): Vec2[] {
    if (!this.canFire()) return [];
    this.fireCooldown = this.stats.fireRate;

    const directions: Vec2[] = [];
    directions.push(vecFromAngle(this.angle));

    const extraCount = this.stats.extraProjectiles;
    const spreadAngle = this.stats.spreadAngle;
    for (let i = 1; i <= extraCount; i++) {
      const spread = i * spreadAngle;
      directions.push(vecFromAngle(this.angle + spread));
      directions.push(vecFromAngle(this.angle - spread));
    }

    return directions;
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const s = 0.55; // hull scale factor (fallback only)

    // ship-glider.svg — nose points up (north) in SVG space.
    // rotate(angle + Math.PI/2) maps north → aim direction correctly.
    // spaceship.svg has a square viewBox — use equal W and H.
    const mob = isMobileDevice ? MOBILE_SPRITE_SCALE : 1;
    const SPRITE_W = 16 * mob; // display size in game-pixels (3× on mobile)
    const SPRITE_H = 23.6 * mob; // starfighter-r2 viewBox is 208×304 → aspect preserved

    // ── Invulnerability blink — flicker visibility when recently hit ──
    if (this.invulnTimer > 0 && !this.isDashing) {
      // Blink rapidly (10Hz) — skip rendering every other frame
      if (Math.floor(this.invulnTimer * 20) % 2 === 0) {
        // Draw a red damage flash ring instead of the ship
        if (this.damageFlash > 0) {
          ctx.save();
          ctx.globalAlpha = this.damageFlash / 0.3;
          ctx.strokeStyle = COLORS.playerHp;
          ctx.lineWidth = 2;
          ctx.shadowColor = COLORS.playerHp;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(this.pos.x, this.pos.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        return; // skip ship render this frame (blink)
      }
    }

    // ── DASH (no flash — just render with cyan glow) ────────────
    if (this.isDashing) {
      const sprite = imageReady(PlayerImages.glider) ? PlayerImages.glider : null;
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(this.angle + Math.PI / 2);
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 18;
      if (sprite) {
        ctx.drawImage(sprite, -SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, SPRITE_H);
      } else {
        ctx.fillStyle = COLORS.player;
        ctx.beginPath();
        ctx.moveTo(10 * s, 0);
        ctx.lineTo(-6 * s, -6 * s);
        ctx.lineTo(-6 * s, 6 * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // ── NORMAL SHIP RENDER (ship-glider.svg) ──────────────────────
    const sprite = imageReady(PlayerImages.glider) ? PlayerImages.glider : null;

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle + Math.PI / 2); // rotate sprite to face aim direction

    if (sprite) {
      // Dash-ready pulsing glow — ship breathes bright when dash is available
      if (this.dashReady) {
        const pulse = (Math.sin((performance.now() / 1000) * 3) + 1) / 2;
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 12 + pulse * 14;
      } else if (this.isMoving) {
        // Subtle engine-glow halo when moving (dash on cooldown)
        ctx.shadowColor = COLORS.engineGlow;
        ctx.shadowBlur = 6;
      }
      ctx.drawImage(sprite, -SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, SPRITE_H);
      ctx.shadowBlur = 0;
    } else {
      // Canvas fallback while SVG loads — Galaga red/white/black
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(12 * s, 0);
      ctx.lineTo(3 * s, -4 * s);
      ctx.lineTo(-4 * s, -6 * s);
      ctx.lineTo(-7 * s, -7 * s);
      ctx.lineTo(-6 * s, -3.5 * s);
      ctx.lineTo(-7 * s, 2.5 * s);
      ctx.lineTo(-6 * s, 3.5 * s);
      ctx.lineTo(-7 * s, 7 * s);
      ctx.lineTo(-4 * s, 6 * s);
      ctx.lineTo(3 * s, 4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0f0f0f";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Red accent on wings
      ctx.fillStyle = "#c81414";
      ctx.beginPath();
      ctx.moveTo(-3 * s, -5 * s);
      ctx.lineTo(-6 * s, -6 * s);
      ctx.lineTo(-5 * s, -2.5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3 * s, 5 * s);
      ctx.lineTo(-6 * s, 6 * s);
      ctx.lineTo(-5 * s, 2.5 * s);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    // ── DASH COOLDOWN ARC ─────────────────────────────────────────
    if (this.dashCooldown > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.dashCooldown;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      const dashArc = this.dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        this.pos.x,
        this.pos.y,
        PLAYER_COLLISION_RADIUS + 10,
        -Math.PI / 2,
        -Math.PI / 2 + dashArc
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

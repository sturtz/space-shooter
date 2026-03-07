import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { PlayerStats } from "../upgrades/UpgradeManager";
import {
  Vec2,
  vec2,
  vecAdd,
  vecSub,
  vecScale,
  vecNormalize,
  vecAngle,
  vecFromAngle,
  clamp,
} from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_COLLISION_RADIUS,
  COLORS,
} from "../utils/Constants";
import { PlayerImages, imageReady } from "../utils/Assets";

export interface DashResult {
  dashed: boolean;
  flashbangRadius: number;
}

export class Player extends Entity {
  stats!: PlayerStats;
  fireCooldown: number = 0;
  invincibleTimer: number = 0;

  // Shield system (from health_core upgrade)
  shields: number = 0;
  maxShields: number = 0;
  shieldRegenTimer: number = 0;

  // Dash ability
  dashCooldown: number = 0;
  readonly DASH_COOLDOWN_TIME = 2.5;       // seconds between dashes
  readonly DASH_BASE_DISTANCE = 110;       // pixels to cover per dash
  readonly DASH_DURATION = 0.18;           // seconds the dash motion takes
  readonly DASH_BASE_INVINCIBILITY = 0.25; // i-frame duration (at least DASH_DURATION)
  readonly DASH_BASE_RING_RADIUS = 60;     // base explosion ring radius

  // Smooth dash state
  isDashing: boolean = false;
  private dashTimer: number = 0;
  private dashVelocity: Vec2 = vec2(0, 0);

  /** True while the ship is actively moving toward the cursor/touch */
  isMoving: boolean = false;

  constructor() {
    super(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, PLAYER_COLLISION_RADIUS);
  }

  updateStats(stats: PlayerStats) {
    this.stats = stats;
    this.maxShields = stats.playerShields;
    this.shields = this.maxShields;
  }

  update(dt: number) {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
    }
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
    if (this.dashCooldown > 0) {
      this.dashCooldown -= dt;
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

    // Shield regen
    if (this.stats.shieldRegenInterval > 0 && this.shields < this.maxShields) {
      this.shieldRegenTimer += dt;
      if (this.shieldRegenTimer >= this.stats.shieldRegenInterval) {
        this.shieldRegenTimer = 0;
        this.shields = Math.min(this.maxShields, this.shields + 1);
      }
    }
  }

  move(input: InputManager, dt: number) {
    // Skip normal movement while dashing — dash controls movement directly
    if (this.isDashing) return;

    // Move toward mouse cursor (desktop) or touch position (mobile).
    // On touch, only move when a finger is actively held down.
    const canMove = !input.isTouchDevice || input.touchTargetActive;

    const target = input.mousePos;
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const STOP_THRESHOLD = 3; // px — prevents jitter when already at cursor

    this.isMoving = canMove && dist > STOP_THRESHOLD;

    if (this.isMoving) {
      const moveAmount = Math.min(this.stats.moveSpeed * dt, dist); // never overshoot
      this.pos.x += (dx / dist) * moveAmount;
      this.pos.y += (dy / dist) * moveAmount;
    }

    // Clamp to screen
    const margin = 20;
    this.pos.x = clamp(this.pos.x, margin, GAME_WIDTH - margin);
    this.pos.y = clamp(this.pos.y, margin, GAME_HEIGHT - margin);

    // Face toward mouse target (on desktop) — on mobile, Game.ts overrides with auto-aim
    if (!input.isTouchDevice && dist > STOP_THRESHOLD) {
      this.angle = Math.atan2(dy, dx);
    }
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

    // I-frames cover at least the full dash duration
    const totalInvincibility = Math.max(
      this.DASH_DURATION + 0.08,
      this.DASH_BASE_INVINCIBILITY + this.stats.dashInvincibility,
    );
    this.invincibleTimer = Math.max(this.invincibleTimer, totalInvincibility);

    const ringRadius = this.DASH_BASE_RING_RADIUS + this.stats.flashbangRadius;
    return { dashed: true, flashbangRadius: ringRadius };
  }

  /**
   * Take damage. Player has no HP — hits either absorb on shields
   * or grant invincibility frames. Player never dies from combat.
   */
  takeDamage(amount: number): {
    actualDamage: number;
    evaded: boolean;
    playerDied: boolean;
  } {
    // Invincibility check
    if (this.invincibleTimer > 0) {
      return { actualDamage: 0, evaded: true, playerDied: false };
    }

    // Evasion check
    if (Math.random() < this.stats.evasionChance) {
      return { actualDamage: 0, evaded: true, playerDied: false };
    }

    // Shield absorb
    if (this.shields > 0) {
      this.shields--;
      this.invincibleTimer = 0.5;
      return { actualDamage: 0, evaded: false, playerDied: false };
    }

    // No shields — grant invincibility frames, player cannot die
    this.invincibleTimer = 1.5;
    return { actualDamage: 0, evaded: false, playerDied: false };
  }

  healShield(amount: number = 1) {
    this.shields = Math.min(this.maxShields, this.shields + amount);
  }

  /** Player no longer has HP — always alive */
  get isDead(): boolean {
    return false;
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
    const s = 0.55; // hull scale factor

    const SPRITE_SIZE = 22; // 70% of original 32px

    // ── DASH FLASH ──────────────────────────────────────────────
    // During a dash: rapidly alternate between bright cyan-tinted sprite and blank.
    if (this.isDashing) {
      const flashOn = Math.floor(this.dashTimer * 22) % 2 === 0;
      if (flashOn) {
        const sprite = imageReady(PlayerImages.moving) ? PlayerImages.moving : null;
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle + Math.PI / 2); // flipped 180° from original up-facing sprite
        if (sprite) {
          ctx.shadowColor = COLORS.player;
          ctx.shadowBlur = 22;
          ctx.drawImage(sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
          // Cyan overlay tint
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "rgba(0,255,204,0.7)";
          ctx.fillRect(-SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
          ctx.globalCompositeOperation = "source-over";
        } else {
          // Fallback silhouette
          ctx.fillStyle = COLORS.player;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.moveTo(10 * s, 0);
          ctx.lineTo(-6 * s, -6 * s);
          ctx.lineTo(-6 * s, 6 * s);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      return; // skip normal hull and overlays during dash
    }

    // ── INVINCIBILITY BLINK ──────────────────────────────────────
    if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) {
      return;
    }

    // ── NORMAL SHIP RENDER (sprite) ───────────────────────────────
    const sprite = this.isMoving
      ? (imageReady(PlayerImages.moving) ? PlayerImages.moving : null)
      : (imageReady(PlayerImages.still) ? PlayerImages.still : null);

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle + Math.PI / 2); // flipped 180° — sprite faces down in PNG

    if (sprite) {
      ctx.drawImage(sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
    } else {
      // Canvas fallback while images load
      ctx.fillStyle = "#111111";
      ctx.beginPath();
      ctx.moveTo(10 * s, 0);
      ctx.lineTo(2 * s, -3 * s);
      ctx.lineTo(-3 * s, -5 * s);
      ctx.lineTo(-6 * s, -6 * s);
      ctx.lineTo(-5 * s, -2.5 * s);
      ctx.lineTo(-6 * s, 1.5 * s);
      ctx.lineTo(-5 * s, 2.5 * s);
      ctx.lineTo(-6 * s, 6 * s);
      ctx.lineTo(-3 * s, 5 * s);
      ctx.lineTo(2 * s, 3 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#cc2222";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();

    // ── SHIELD RING ───────────────────────────────────────────────
    if (this.maxShields > 0 && this.shields > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      const shieldArc = (this.shields / this.maxShields) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        this.pos.x,
        this.pos.y,
        PLAYER_COLLISION_RADIUS + 6,
        -Math.PI / 2,
        -Math.PI / 2 + shieldArc,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

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
        -Math.PI / 2 + dashArc,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { PlayerStats } from "../upgrades/UpgradeManager";
import { Vec2, vec2, vecScale, vecFromAngle, clamp } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_COLLISION_RADIUS, COLORS } from "../utils/Constants";
import { PlayerImages, imageReady } from "../utils/Assets";

export interface DashResult {
  dashed: boolean;
  flashbangRadius: number;
}

export class Player extends Entity {
  stats!: PlayerStats;
  fireCooldown: number = 0;

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
  }

  updateStats(stats: PlayerStats) {
    this.stats = stats;
  }

  update(dt: number) {
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
    const SPRITE_W = 10; // display size in game-pixels
    const SPRITE_H = 14.75; // starfighter-r2 viewBox is 208×304 → 40×59

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
      // Add a subtle engine-glow halo when moving
      if (this.isMoving) {
        ctx.shadowColor = COLORS.engineGlow;
        ctx.shadowBlur = 10;
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

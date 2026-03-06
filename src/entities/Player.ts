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

export class Player extends Entity {
  stats!: PlayerStats;
  fireCooldown: number = 0;
  invincibleTimer: number = 0;

  // Shield system (from health_core upgrade)
  shields: number = 0;
  maxShields: number = 0;
  shieldRegenTimer: number = 0;

  // Dash ability (from move_dash upgrade)
  dashCooldown: number = 0;
  readonly DASH_COOLDOWN_TIME = 3; // seconds between dashes
  readonly DASH_BASE_DISTANCE = 80; // pixels

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
    const dir = input.moveDirection;
    this.pos = vecAdd(this.pos, vecScale(dir, this.stats.moveSpeed * dt));

    // Clamp to screen
    const margin = 20;
    this.pos.x = clamp(this.pos.x, margin, GAME_WIDTH - margin);
    this.pos.y = clamp(this.pos.y, margin, GAME_HEIGHT - margin);

    // Face mouse
    const toMouse = vecSub(input.mousePos, this.pos);
    this.angle = vecAngle(toMouse);
  }

  /** Attempt to dash in current facing direction. Returns true if dash happened. */
  tryDash(): boolean {
    if (this.dashCooldown > 0 || this.stats.dashDistMult <= 1) return false;
    this.dashCooldown = this.DASH_COOLDOWN_TIME;
    const dist = this.DASH_BASE_DISTANCE * this.stats.dashDistMult;
    const dashDir = vecFromAngle(this.angle);
    this.pos = vecAdd(this.pos, vecScale(dashDir, dist));

    // Clamp
    const margin = 20;
    this.pos.x = clamp(this.pos.x, margin, GAME_WIDTH - margin);
    this.pos.y = clamp(this.pos.y, margin, GAME_HEIGHT - margin);

    // Phase shift invincibility
    if (this.stats.dashInvincibility > 0) {
      this.invincibleTimer = Math.max(
        this.invincibleTimer,
        this.stats.dashInvincibility,
      );
    }

    return true;
  }

  /**
   * Take damage from enemy bullet/collision.
   * Returns actual damage dealt after armor, shields, and evasion.
   */
  takeDamage(amount: number): { actualDamage: number; evaded: boolean } {
    // Invincibility check
    if (this.invincibleTimer > 0) {
      return { actualDamage: 0, evaded: true };
    }

    // Evasion check
    if (Math.random() < this.stats.evasionChance) {
      return { actualDamage: 0, evaded: true };
    }

    // Armor reduction
    let dmg = amount * (1 - Math.min(0.8, this.stats.armorReduction));

    // Shield absorb
    if (this.shields > 0) {
      this.shields--;
      this.invincibleTimer = 0.5; // brief invincibility after shield hit
      return { actualDamage: 0, evaded: false };
    }

    // No shields left — take the hit
    this.invincibleTimer = 1.0;
    return { actualDamage: dmg, evaded: false };
  }

  healShield(amount: number = 1) {
    this.shields = Math.min(this.maxShields, this.shields + amount);
  }

  canFire(): boolean {
    return this.fireCooldown <= 0;
  }

  fire(): Vec2[] {
    if (!this.canFire()) return [];
    this.fireCooldown = this.stats.fireRate;

    const directions: Vec2[] = [];
    // Main shot
    directions.push(vecFromAngle(this.angle));

    // Extra projectiles with dynamic spread angle
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

    // Blink when invincible
    if (
      this.invincibleTimer > 0 &&
      Math.floor(this.invincibleTimer * 10) % 2 === 0
    ) {
      return;
    }

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    // Galaga-style outlined ship
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "miter";

    // Engine exhaust flicker
    const flickerLen = 4 + Math.random() * 4;
    ctx.strokeStyle = COLORS.playerEngine;
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(-9 - flickerLen, 0);
    ctx.lineTo(-9, 3);
    ctx.stroke();

    // Main hull outline (pointed fighter shape)
    ctx.strokeStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(14, 0); // nose
    ctx.lineTo(4, -4); // upper nose taper
    ctx.lineTo(-2, -4); // upper body
    ctx.lineTo(-4, -9); // upper wing tip
    ctx.lineTo(-8, -9); // wing back
    ctx.lineTo(-6, -4); // wing join
    ctx.lineTo(-9, -3); // rear upper
    ctx.lineTo(-9, 3); // rear lower
    ctx.lineTo(-6, 4); // wing join
    ctx.lineTo(-8, 9); // wing back
    ctx.lineTo(-4, 9); // lower wing tip
    ctx.lineTo(-2, 4); // lower body
    ctx.lineTo(4, 4); // lower nose taper
    ctx.closePath();
    ctx.stroke();

    // Inner detail lines (cockpit canopy)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -2);
    ctx.lineTo(4, 2);
    ctx.closePath();
    ctx.stroke();

    // Wing stripe accents
    ctx.strokeStyle = COLORS.playerEngine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-6, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, 5);
    ctx.lineTo(-6, 8);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(1, -1, 2, 2);

    ctx.restore();

    // Shield indicator ring (drawn in screen space, not rotated)
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
  }
}

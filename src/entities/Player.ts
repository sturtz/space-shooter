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

export interface DashResult {
  dashed: boolean;
  flashbangRadius: number;
}

export class Player extends Entity {
  stats!: PlayerStats;
  fireCooldown: number = 0;
  invincibleTimer: number = 0;

  // HP system (base 1 HP)
  hp: number = 1;
  maxHp: number = 1;

  // Shield system (from health_core upgrade)
  shields: number = 0;
  maxShields: number = 0;
  shieldRegenTimer: number = 0;

  // Dash ability (always available, upgrades enhance it)
  dashCooldown: number = 0;
  readonly DASH_COOLDOWN_TIME = 2.5; // seconds between dashes
  readonly DASH_BASE_DISTANCE = 40; // pixels (short dash)
  readonly DASH_BASE_INVINCIBILITY = 0.15; // base i-frame duration
  readonly DASH_BASE_RING_RADIUS = 60; // base explosion ring radius

  constructor() {
    super(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, PLAYER_COLLISION_RADIUS);
  }

  updateStats(stats: PlayerStats) {
    this.stats = stats;
    this.maxHp = stats.playerHp;
    this.hp = this.maxHp;
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

    // Face mouse (on desktop) — on mobile, Game.ts handles auto-aim
    if (!input.isTouchDevice) {
      const toMouse = vecSub(input.mousePos, this.pos);
      this.angle = vecAngle(toMouse);
    }
  }

  /** Attempt to dash in current facing direction. Returns dash result with flashbang info. */
  tryDash(): DashResult {
    if (this.dashCooldown > 0) return { dashed: false, flashbangRadius: 0 };

    this.dashCooldown = this.DASH_COOLDOWN_TIME;
    const dist = this.DASH_BASE_DISTANCE * this.stats.dashDistMult;
    const dashDir = vecFromAngle(this.angle);
    this.pos = vecAdd(this.pos, vecScale(dashDir, dist));

    // Clamp
    const margin = 20;
    this.pos.x = clamp(this.pos.x, margin, GAME_WIDTH - margin);
    this.pos.y = clamp(this.pos.y, margin, GAME_HEIGHT - margin);

    // Base i-frames + Phase Shift bonus
    const totalInvincibility =
      this.DASH_BASE_INVINCIBILITY + this.stats.dashInvincibility;
    this.invincibleTimer = Math.max(this.invincibleTimer, totalInvincibility);

    // Ring radius = base + EMP Burst upgrade bonus
    const ringRadius = this.DASH_BASE_RING_RADIUS + this.stats.flashbangRadius;
    return { dashed: true, flashbangRadius: ringRadius };
  }

  /**
   * Take damage from enemy bullet/collision.
   * Returns actual damage dealt after armor, shields, and evasion.
   * Also returns whether the player died.
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

    // Armor reduction
    let dmg = amount * (1 - Math.min(0.8, this.stats.armorReduction));

    // Shield absorb
    if (this.shields > 0) {
      this.shields--;
      this.invincibleTimer = 0.5; // brief invincibility after shield hit
      return { actualDamage: 0, evaded: false, playerDied: false };
    }

    // No shields left — take HP damage
    this.hp = Math.max(0, this.hp - 1);
    this.invincibleTimer = 1.5; // longer invincibility on HP damage
    return { actualDamage: dmg, evaded: false, playerDied: this.hp <= 0 };
  }

  healShield(amount: number = 1) {
    this.shields = Math.min(this.maxShields, this.shields + amount);
  }

  get isDead(): boolean {
    return this.hp <= 0;
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

    // Sleek minimal black/red ship — small, angular, no cartoon outlines
    const s = 0.55; // scale factor (much smaller)

    // Engine glow (dim red thruster)
    const flickerLen = 2 + Math.random() * 3;
    ctx.fillStyle = "#880000";
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-6 * s, -2 * s);
    ctx.lineTo(-6 * s - flickerLen * s, 0);
    ctx.lineTo(-6 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Main hull (filled dark shape)
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.moveTo(10 * s, 0);           // nose tip
    ctx.lineTo(2 * s, -3 * s);       // upper nose
    ctx.lineTo(-3 * s, -5 * s);      // upper wing root
    ctx.lineTo(-6 * s, -6 * s);      // wing tip
    ctx.lineTo(-5 * s, -2.5 * s);    // wing inner
    ctx.lineTo(-6 * s, -1.5 * s);    // rear notch
    ctx.lineTo(-6 * s, 1.5 * s);     // rear notch
    ctx.lineTo(-5 * s, 2.5 * s);     // wing inner
    ctx.lineTo(-6 * s, 6 * s);       // wing tip
    ctx.lineTo(-3 * s, 5 * s);       // lower wing root
    ctx.lineTo(2 * s, 3 * s);        // lower nose
    ctx.closePath();
    ctx.fill();

    // Red edge trim (thin lines for detail)
    ctx.strokeStyle = "#cc2222";
    ctx.lineWidth = 0.8;
    ctx.stroke(); // outlines the hull path above

    // Red center stripe (cockpit line)
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(8 * s, 0);
    ctx.lineTo(-2 * s, 0);
    ctx.stroke();

    // Nose tip glow dot
    ctx.fillStyle = "#ff2222";
    ctx.beginPath();
    ctx.arc(9 * s, 0, 0.8 * s, 0, Math.PI * 2);
    ctx.fill();

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

    // Dash cooldown indicator (small arc under player)
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

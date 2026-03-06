import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { Vec2, vecAdd, vecScale, vecAngle } from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BULLET_SIZE,
  BULLET_LIFETIME,
  COLORS,
} from "../utils/Constants";

export class Bullet extends Entity {
  damage: number;
  speed: number;
  direction: Vec2;
  lifetime: number;
  isCrit: boolean;
  pierceCount: number;
  isEnemy: boolean;

  constructor(
    x: number,
    y: number,
    direction: Vec2,
    speed: number,
    damage: number,
    isCrit: boolean = false,
    pierceCount: number = 0,
    isEnemy: boolean = false,
  ) {
    super(x, y, BULLET_SIZE);
    this.direction = direction;
    this.speed = speed;
    this.damage = damage;
    this.lifetime = BULLET_LIFETIME;
    this.angle = vecAngle(direction);
    this.isCrit = isCrit;
    this.pierceCount = pierceCount;
    this.isEnemy = isEnemy;
  }

  update(dt: number) {
    this.pos = vecAdd(this.pos, vecScale(this.direction, this.speed * dt));
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.destroy();
    }
    // Off screen check — use constants instead of magic numbers
    if (
      this.pos.x < -20 ||
      this.pos.x > GAME_WIDTH + 20 ||
      this.pos.y < -20 ||
      this.pos.y > GAME_HEIGHT + 20
    ) {
      this.destroy();
    }
  }

  /** Called when this bullet hits an enemy. Returns true if bullet should be destroyed. */
  onHitEnemy(): boolean {
    if (this.pierceCount > 0) {
      this.pierceCount--;
      return false; // bullet survives
    }
    return true; // bullet is consumed
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    if (this.isEnemy) {
      // Enemy bullet: red-orange style
      ctx.fillStyle = "#ff6644";
      ctx.fillRect(-2, -1.5, 4, 3);
      ctx.fillStyle = "#ffaa66";
      ctx.fillRect(1, -1, 2, 2);
      ctx.restore();
      return;
    }

    const color = this.isCrit ? "#ff4444" : COLORS.bullet;

    // Galaga-style bullet: small bright pixel with trail dashes
    ctx.strokeStyle = COLORS.bulletTrail;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    // Trail dashes
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-6, 0);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Bullet core - crisp pixel rectangle
    ctx.fillStyle = color;
    ctx.fillRect(-2, -1.5, 5, 3);

    // Bright leading edge
    ctx.fillStyle = "#fff";
    ctx.fillRect(2, -1, 2, 2);

    // Crit glow outline
    if (this.isCrit) {
      ctx.strokeStyle = "#ff6666";
      ctx.lineWidth = 1;
      ctx.strokeRect(-3, -2.5, 7, 5);
    }

    ctx.restore();
  }
}

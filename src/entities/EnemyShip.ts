import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import { vec2, vecSub, vecNormalize, vecAdd, vecScale, vecAngle, randomRange } from "../utils/Math";
import { ENEMY_SHIP_SIZE, COLORS, isMobileDevice, MOBILE_SPRITE_SCALE } from "../utils/Constants";
import { ShipImages, imageReady } from "../utils/Assets";

/** Visual variant for enemy ships */
export type EnemyShipVariant = "normal" | "pulse" | "bee" | "butterfly" | "boss";

export class EnemyShip extends Enemy {
  shootCooldown: number;
  shootTimer: number;
  canShoot: boolean;
  wobbleOffset: number;
  wobbleTimer: number = 0;
  variant: EnemyShipVariant;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    canShoot: boolean = false,
    variant: EnemyShipVariant = "normal"
  ) {
    super(x, y, ENEMY_SHIP_SIZE, hp, speed, 2);
    this.canShoot = canShoot;
    this.shootCooldown = randomRange(2, 4);
    this.shootTimer = this.shootCooldown;
    this.wobbleOffset = randomRange(0, Math.PI * 2);
    this.variant = variant;

    // Face toward target (center of screen) immediately so bosses
    // don't spawn visually pointing right before their first update()
    this.angle = Math.atan2(this.targetPos.y - y, this.targetPos.x - x);
  }

  update(dt: number) {
    // Tick debuffs (poison/slow)
    if (this.updateDebuffs(dt)) return; // killed by poison

    this.wobbleTimer += dt;

    // Move toward target with slight wobble
    const dir = vecNormalize(vecSub(this.targetPos, this.pos));
    const wobble = Math.sin(this.wobbleTimer * 3 + this.wobbleOffset) * 0.3;
    const moveDir = vec2(dir.x + dir.y * wobble, dir.y - dir.x * wobble);
    this.pos = vecAdd(this.pos, vecScale(vecNormalize(moveDir), this.effectiveSpeed * dt));
    this.angle = vecAngle(dir);

    // Shoot cooldown
    if (this.canShoot) {
      this.shootTimer -= dt;
    }
  }

  shouldShoot(): boolean {
    if (!this.canShoot) return false;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.shootCooldown;
      return true;
    }
    return false;
  }

  /** Get the sprite for this variant */
  private getSprite(): HTMLImageElement | null {
    switch (this.variant) {
      case "bee":
        return ShipImages.enemyBee;
      case "butterfly":
        return ShipImages.enemyButterfly;
      case "boss":
        return ShipImages.enemyBoss;
      case "pulse":
        return ShipImages.enemy;
      default:
        return null; // canvas-drawn for "normal"
    }
  }

  /** Variant-specific glow colors */
  private getGlowColor(): string {
    switch (this.variant) {
      case "bee":
        return "rgba(255,200,0,0.6)";
      case "butterfly":
        return "rgba(200,80,255,0.5)";
      case "boss":
        return "rgba(255,60,60,0.7)";
      case "pulse":
        return "rgba(0,200,255,0.5)";
      default:
        return "rgba(255,68,100,0.4)";
    }
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const sprite = this.getSprite();
    const isPoisoned = this.poisonTimer > 0;

    const mob = isMobileDevice ? MOBILE_SPRITE_SCALE : 1;

    // Sprite-based variants (bee, butterfly, boss, pulse)
    if (sprite && imageReady(sprite)) {
      const drawSize = this.radius * 2 * mob;

      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(this.angle);

      // Glow halo behind sprite
      const glowColor = isPoisoned ? "rgba(80,255,80,0.7)" : this.getGlowColor();
      const glowGrad = ctx.createRadialGradient(0, 0, this.radius * 0.2, 0, 0, this.radius * 2);
      glowGrad.addColorStop(0, glowColor);
      glowGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw sprite
      if (isPoisoned) {
        ctx.filter = "hue-rotate(120deg) saturate(3) brightness(1.5)";
      } else {
        ctx.filter = "brightness(1.4) drop-shadow(1px 1px 4px rgba(255,255,255,0.3))";
      }
      ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.filter = "none";

      // Elite gold tint overlay
      if (this.isElite) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255, 220, 0, 0.25)";
        ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.restore();
    } else {
      // Canvas-drawn fallback (original normal variant) — scale for mobile
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(this.angle);
      if (mob > 1) ctx.scale(mob, mob);

      ctx.lineWidth = 1.5;
      ctx.lineJoin = "miter";

      const mainColor = this.isElite
        ? COLORS.elite
        : isPoisoned
          ? COLORS.poisoned
          : COLORS.enemyShip;
      const accentColor = this.isElite ? COLORS.explosion : COLORS.enemyShipAccent;

      // Engine exhaust flicker
      const flickerLen = 4.5 + Math.random() * 4.5;
      ctx.strokeStyle = COLORS.bulletTrail;
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.lineTo(-12 - flickerLen, 0);
      ctx.lineTo(-12, 3);
      ctx.stroke();

      // Main hull outline (scaled to match ENEMY_SHIP_SIZE=18)
      ctx.strokeStyle = mainColor;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(9, -4.5);
      ctx.lineTo(3, -4.5);
      ctx.lineTo(-1.5, -12);
      ctx.lineTo(-9, -15);
      ctx.lineTo(-6, -7.5);
      ctx.lineTo(-10.5, -4.5);
      ctx.lineTo(-10.5, 4.5);
      ctx.lineTo(-6, 7.5);
      ctx.lineTo(-9, 15);
      ctx.lineTo(-1.5, 12);
      ctx.lineTo(3, 4.5);
      ctx.lineTo(9, 4.5);
      ctx.closePath();
      ctx.stroke();

      // Inner accent lines
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(3, -3);
      ctx.lineTo(3, 3);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-3, -6);
      ctx.lineTo(-3, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7.5, 0);
      ctx.lineTo(1.5, 0);
      ctx.stroke();

      ctx.restore();
    }

    // HP bar if damaged
    if (this.hp < this.maxHp) {
      const barW = this.isBoss ? 40 : 20;
      const barH = this.isBoss ? 3 : 2;
      const barX = this.pos.x - barW / 2;
      const barY = this.pos.y - this.radius - 6;
      renderer.drawRect(barX, barY, barW, barH, "#222");
      renderer.drawRect(barX, barY, barW * (this.hp / this.maxHp), barH, COLORS.hpBarDamage);
    }
  }
}

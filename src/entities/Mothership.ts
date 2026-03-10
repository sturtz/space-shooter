import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MOTHERSHIP_COLLISION_RADIUS,
  COLORS,
  isMobileDevice,
  MOBILE_SPRITE_SCALE,
} from "../utils/Constants";
import { ShipImages, imageReady } from "../utils/Assets";

export class Mothership extends Entity {
  maxHp: number;
  hp: number;
  damageFlash: number = 0;
  pulseTimer: number = 0;
  spinAngle: number = 0;
  /** True once HP hits 0 — plays the death gif overlay */
  isDestroyed: boolean = false;
  deathAnimTimer: number = 0;
  readonly DEATH_ANIM_DURATION = 1.2; // seconds to show death gif

  constructor(maxHp: number) {
    super(GAME_WIDTH / 2, GAME_HEIGHT / 2, MOTHERSHIP_COLLISION_RADIUS);
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.damageFlash = 0.3;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDestroyed = true;
      this.deathAnimTimer = this.DEATH_ANIM_DURATION;
      return true; // destroyed
    }
    return false;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt: number) {
    this.pulseTimer += dt;
    this.spinAngle += dt * 0.5; // slow continuous spin (~0.5 rad/s)
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
    }
    if (this.deathAnimTimer > 0) {
      this.deathAnimTimer -= dt;
    }
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const cx = this.pos.x;
    const cy = this.pos.y;

    const mob = isMobileDevice ? MOBILE_SPRITE_SCALE : 1;
    const pulseScale = 1 + Math.sin(this.pulseTimer * 2) * 0.04;
    const SPRITE_SIZE = 60 * mob; // 3× on mobile

    ctx.save();

    // Don't draw sprite or HP bar if destroyed — only death animation below
    if (!this.isDestroyed) {
      // Draw sprite with spin
      const sprite = ShipImages.mothership;
      if (imageReady(sprite)) {
        const size = SPRITE_SIZE * pulseScale;
        if (this.damageFlash > 0) {
          ctx.shadowColor = COLORS.mothershipDamaged;
          ctx.shadowBlur = 18;
        } else {
          ctx.shadowColor = COLORS.mothership;
          ctx.shadowBlur = 10;
        }
        ctx.translate(cx, cy);
        ctx.rotate(this.spinAngle);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        if (this.damageFlash > 0) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "rgba(255,68,68,0.5)";
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.shadowBlur = 0;
        ctx.rotate(-this.spinAngle);
        ctx.translate(-cx, -cy);
      } else {
        // Fallback: simple circle
        ctx.strokeStyle = this.damageFlash > 0 ? COLORS.mothershipDamaged : COLORS.mothership;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * mob, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // HP bar below (hide when destroyed)
    if (!this.isDestroyed) {
      const barWidth = 40 * mob;
      const barHeight = 3 * mob;
      const barX = cx - barWidth / 2;
      const barY = cy + 28 * mob;
      const hpRatio = this.hp / this.maxHp;

      // HP bar outline style
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      const hpColor =
        hpRatio > 0.5 ? COLORS.hpBar : hpRatio > 0.25 ? "#ffaa00" : COLORS.hpBarDamage;
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

      // HP numbers
      ctx.fillStyle = "#fff";
      ctx.font = `${8 * mob}px Tektur`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`${this.hp}/${this.maxHp}`, cx, barY + barHeight + 2);
    }

    // ── DEATH ANIMATION GIF ────────────────────────────────────────
    if (this.isDestroyed && this.deathAnimTimer > 0) {
      const deathImg = ShipImages.mothershipDeath;
      if (imageReady(deathImg)) {
        const progress = 1 - this.deathAnimTimer / this.DEATH_ANIM_DURATION;
        const gifSize = (80 + progress * 40) * mob; // expands 80→120px (3× on mobile)
        ctx.globalAlpha = Math.min(1, this.deathAnimTimer / 0.3); // fade out in last 300ms
        ctx.drawImage(deathImg, cx - gifSize / 2, cy - gifSize / 2, gifSize, gifSize);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }
}

import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import {
  Vec2,
  vec2,
  vecSub,
  vecNormalize,
  vecAdd,
  vecScale,
  vecDist,
  randomRange,
} from "../utils/Math";
import { COIN_SIZE, COIN_LIFETIME, COIN_SPEED, COLORS } from "../utils/Constants";
import { ItemImages, imageReady } from "../utils/Assets";

export class Coin extends Entity {
  value: number;
  lifetime: number;
  magnetRange: number;
  attracted: boolean = false;
  sparkleTimer: number = 0;
  bobOffset: number;

  constructor(x: number, y: number, value: number = 1) {
    super(x, y, COIN_SIZE);
    this.value = value;
    this.lifetime = COIN_LIFETIME;
    this.magnetRange = 0; // Set by game based on upgrades
    this.bobOffset = randomRange(0, Math.PI * 2);
    // Small initial velocity burst
    this.vel = vec2(randomRange(-40, 40), randomRange(-40, 40));
  }

  update(dt: number) {
    this.lifetime -= dt;
    this.sparkleTimer += dt;

    if (this.lifetime <= 0) {
      this.destroy();
      return;
    }

    // Friction on initial burst
    if (!this.attracted) {
      this.vel.x *= 0.95;
      this.vel.y *= 0.95;
    }

    this.pos = vecAdd(this.pos, vecScale(this.vel, dt));
  }

  attractTo(target: Vec2, magnetRange: number) {
    const dist = vecDist(this.pos, target);
    if (dist < magnetRange) {
      this.attracted = true;
      const dir = vecNormalize(vecSub(target, this.pos));
      const speed = COIN_SPEED * (1 + (magnetRange - dist) / magnetRange);
      this.vel = vecScale(dir, speed);
    }
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const bob = Math.sin(this.sparkleTimer * 4 + this.bobOffset) * 2;

    ctx.save();

    // Fade out near death — applied BEFORE drawing so it wraps all visuals
    if (this.lifetime < 2) {
      ctx.globalAlpha = this.lifetime / 2;
    }

    const baseAlpha = ctx.globalAlpha;
    const drawX = this.pos.x;
    const drawY = this.pos.y + bob;
    const coinSprite = imageReady(ItemImages.coin) ? ItemImages.coin : null;

    // Coin glow ring (soft pulse behind sprite)
    const glowColor = this.value >= 50 ? "#ff44ff" : this.value >= 5 ? "#ffaa00" : COLORS.coin;
    ctx.globalAlpha = baseAlpha * 0.35 * (0.7 + 0.3 * Math.sin(this.sparkleTimer * 5));
    renderer.drawCircle(vec2(drawX, drawY), COIN_SIZE + 3, glowColor);
    ctx.globalAlpha = baseAlpha;

    if (coinSprite) {
      // Draw sprite — scale high-value coins slightly bigger
      const drawSize = this.value >= 5 ? COIN_SIZE * 2.8 : COIN_SIZE * 2.2;
      ctx.drawImage(coinSprite, drawX - drawSize / 2, drawY - drawSize / 2, drawSize, drawSize);

      // Gold/purple tint overlay for high-value coins
      if (this.value >= 5) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = this.value >= 50 ? "rgba(200,0,255,0.35)" : "rgba(255,160,0,0.35)";
        ctx.fillRect(drawX - drawSize / 2, drawY - drawSize / 2, drawSize, drawSize);
        ctx.globalCompositeOperation = "source-over";
      }
    } else {
      // Canvas circle fallback
      const color = this.value >= 50 ? "#ff44ff" : this.value >= 5 ? "#ffaa00" : COLORS.coin;
      renderer.drawCircle(vec2(drawX, drawY), COIN_SIZE, color);
    }
    ctx.globalAlpha = baseAlpha;

    // Value label above coin for multi-value drops
    if (this.value > 1) {
      const color = this.value >= 50 ? "#ff44ff" : this.value >= 5 ? "#ffaa00" : COLORS.coin;
      renderer.drawText(
        `${this.value}`,
        drawX,
        drawY - COIN_SIZE * 1.8,
        color,
        8,
        "center",
        "middle"
      );
    }

    ctx.restore();
  }
}

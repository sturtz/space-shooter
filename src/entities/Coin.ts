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
import {
  COIN_SIZE,
  COIN_LIFETIME,
  COIN_SPEED,
  COLORS,
} from "../utils/Constants";

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

    // Coin glow
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * 0.3;
    renderer.drawCircle(
      vec2(this.pos.x, this.pos.y + bob),
      COIN_SIZE + 2,
      this.value >= 5 ? "#ffaa00" : COLORS.coin,
    );
    ctx.globalAlpha = baseAlpha;

    // Coin body
    const color =
      this.value >= 50 ? "#ff44ff" : this.value >= 5 ? "#ffaa00" : COLORS.coin;
    renderer.drawCircle(vec2(this.pos.x, this.pos.y + bob), COIN_SIZE, color);

    // Shine
    ctx.fillStyle = COLORS.coinShine;
    ctx.globalAlpha = baseAlpha * (0.6 + Math.sin(this.sparkleTimer * 6) * 0.4);
    ctx.beginPath();
    ctx.arc(
      this.pos.x - 1,
      this.pos.y + bob - 1,
      COIN_SIZE * 0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = baseAlpha;

    // Value text for high-value coins
    if (this.value > 1) {
      renderer.drawText(
        `${this.value}`,
        this.pos.x,
        this.pos.y + bob - 10,
        color,
        8,
        "center",
        "middle",
      );
    }

    ctx.restore();
  }
}

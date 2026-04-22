import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { Vec2, vec2, randomRange } from "../utils/Math";
import { COIN_SIZE, COIN_LIFETIME, COIN_SPEED, COLORS } from "../utils/Constants";
import { ItemImages, imageReady } from "../utils/Assets";

// ── Offscreen canvas for safe source-atop tinting ───────────────────
let _tintCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _tintCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTintCtx(
  w: number,
  h: number
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!_tintCanvas || _tintCanvas.width < w || _tintCanvas.height < h) {
    const size = Math.max(w, h, 64);
    if (typeof OffscreenCanvas !== "undefined") {
      _tintCanvas = new OffscreenCanvas(size, size);
    } else {
      _tintCanvas = document.createElement("canvas");
      _tintCanvas.width = size;
      _tintCanvas.height = size;
    }
    _tintCtx = _tintCanvas.getContext("2d")!;
  }
  return _tintCtx!;
}

export class Coin extends Entity {
  value: number;
  lifetime: number;
  attracted: boolean = false;
  sparkleTimer: number = 0;
  bobOffset: number;

  constructor(x: number, y: number, value: number = 1) {
    super(x, y, COIN_SIZE);
    this.value = value;
    this.lifetime = COIN_LIFETIME;
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

    // Inline vecAdd + vecScale to avoid object allocations
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }

  attractTo(target: Vec2, magnetRange: number) {
    // Inline vecDist to avoid sqrt + Vec2 allocation when out of range
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= magnetRange * magnetRange) return;

    this.attracted = true;
    const dist = Math.sqrt(distSq);
    // Inline vecNormalize + vecScale
    if (dist > 0) {
      const speed = COIN_SPEED * (1 + (magnetRange - dist) / magnetRange);
      const invDist = 1 / dist;
      this.vel.x = dx * invDist * speed;
      this.vel.y = dy * invDist * speed;
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
      // Draw sprite — scaled up for mobile readability; high-value coins slightly bigger
      const drawSize = this.value >= 5 ? COIN_SIZE * 4.5 : COIN_SIZE * 3.5;
      // Gold/purple tint overlay for high-value coins — use offscreen canvas
      // to avoid source-atop bleeding onto the main canvas (same fix as Rock/EnemyShip)
      if (this.value >= 5) {
        const s = Math.ceil(drawSize);
        const tCtx = getTintCtx(s, s);
        tCtx.clearRect(0, 0, s, s);
        tCtx.globalCompositeOperation = "source-over";
        tCtx.drawImage(coinSprite, 0, 0, s, s);
        tCtx.globalCompositeOperation = "source-atop";
        tCtx.fillStyle = this.value >= 50 ? "rgba(200,0,255,0.35)" : "rgba(255,160,0,0.35)";
        tCtx.fillRect(0, 0, s, s);
        ctx.drawImage(
          tCtx.canvas,
          0,
          0,
          s,
          s,
          drawX - drawSize / 2,
          drawY - drawSize / 2,
          drawSize,
          drawSize
        );
      } else {
        ctx.drawImage(coinSprite, drawX - drawSize / 2, drawY - drawSize / 2, drawSize, drawSize);
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

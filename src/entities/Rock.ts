import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import { Vec2, vec2, vecSub, vecNormalize, vecAdd, vecScale, randomRange } from "../utils/Math";
import { ROCK_SIZE, ROCK_BIG_SIZE, COLORS } from "../utils/Constants";
import { AsteroidImages, pickRandom, imageReady } from "../utils/Assets";

export class Rock extends Enemy {
  rotSpeed: number;
  vertices: Vec2[];
  isBig: boolean;
  flashTimer: number = 0;
  private sprite: HTMLImageElement;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    isBig: boolean = false,
    sizeScale: number = 1.0
  ) {
    super(x, y, (isBig ? ROCK_BIG_SIZE : ROCK_SIZE) * sizeScale, hp, speed, isBig ? 3 : 1);
    this.isBig = isBig;
    this.rotSpeed = randomRange(-1.5, 1.5);

    // Pick sprite based on size — no tiny pool, all small rocks use the small pool
    if (isBig) {
      this.sprite = pickRandom(AsteroidImages.big);
    } else {
      this.sprite = pickRandom(AsteroidImages.small);
    }

    // Generate angular rock vertices (kept for collision/fallback reference)
    this.vertices = [];
    const points = isBig ? 10 : 7;
    const size = (isBig ? ROCK_BIG_SIZE : ROCK_SIZE) * sizeScale;
    for (let i = 0; i < points; i++) {
      const a = (Math.PI * 2 * i) / points;
      const r = size * randomRange(0.75, 1.15);
      this.vertices.push(vec2(Math.cos(a) * r, Math.sin(a) * r));
    }
  }

  override takeDamage(amount: number): boolean {
    this.flashTimer = 0.1;
    return super.takeDamage(amount);
  }

  update(dt: number) {
    // Tick debuffs (poison/slow)
    if (this.updateDebuffs(dt)) return; // killed by poison

    const dir = vecNormalize(vecSub(this.targetPos, this.pos));
    this.pos = vecAdd(this.pos, vecScale(dir, this.effectiveSpeed * dt));
    this.angle += this.rotSpeed * dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const isFlashing = this.flashTimer > 0;
    const isPoisoned = this.poisonTimer > 0;
    const drawSize = this.radius * 2.4; // sprite draw size (slightly larger than collision radius)

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    if (imageReady(this.sprite)) {
      // ── Glow halo behind sprite so rocks read against dark bg ──
      if (!isFlashing) {
        const glowColor = this.isElite
          ? "rgba(255,200,0,0.18)"
          : isPoisoned
            ? "rgba(80,255,80,0.15)"
            : "rgba(200,140,80,0.18)";
        const glowGrad = ctx.createRadialGradient(0, 0, this.radius * 0.3, 0, 0, this.radius * 1.35);
        glowGrad.addColorStop(0, glowColor);
        glowGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── SPRITE RENDER ──────────────────────────────────────────
      if (isFlashing) {
        ctx.drawImage(this.sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.globalCompositeOperation = "source-over";
      } else if (isPoisoned) {
        ctx.filter = "hue-rotate(120deg) saturate(3) brightness(1.3)";
        ctx.drawImage(this.sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.filter = "none";
      } else {
        // Slightly brighten all rocks so they pop against the dark bg
        ctx.filter = "brightness(1.35) contrast(1.1)";
        ctx.drawImage(this.sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.filter = "none";
      }

      // Elite gold tint overlay
      if (this.isElite) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255, 220, 0, 0.35)";
        ctx.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.globalCompositeOperation = "source-over";
      }

      // Thin rim highlight around the rock sprite
      if (!isFlashing) {
        ctx.strokeStyle = this.isElite
          ? "rgba(255,220,60,0.5)"
          : isPoisoned
            ? "rgba(80,255,80,0.4)"
            : "rgba(210,160,100,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.05, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // ── CANVAS FALLBACK (while image loads) ──────────────────────
      ctx.strokeStyle = isFlashing
        ? "#fff"
        : this.isElite
          ? "#ffdd00"
          : isPoisoned
            ? "#44ff44"
            : "#9999bb";
      ctx.lineWidth = isFlashing ? 2 : 1.5;
      ctx.fillStyle = isFlashing ? "#445" : this.isElite ? "#554422" : "#2a2a3a";
      ctx.beginPath();
      ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
      for (let i = 1; i < this.vertices.length; i++)
        ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Elite glow ring (always on top)
    if (this.isElite) {
      ctx.strokeStyle = "#ffdd00";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // HP bar if damaged
    if (this.hp < this.maxHp) {
      const barW = this.isBig ? 28 : 18;
      const barH = 2;
      const barX = this.pos.x - barW / 2;
      const barY = this.pos.y - this.radius - 5;
      renderer.drawRect(barX, barY, barW, barH, "#222");
      renderer.drawRect(barX, barY, barW * (this.hp / this.maxHp), barH, COLORS.hpBarDamage);
    }
  }
}

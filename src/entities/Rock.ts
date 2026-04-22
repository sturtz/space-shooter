import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import { Vec2, vec2, vecSub, vecNormalize, vecAdd, vecScale, randomRange } from "../utils/Math";
import { ROCK_SIZE, ROCK_BIG_SIZE, COLORS } from "../utils/Constants";
import { AsteroidImages, pickRandom, imageReady } from "../utils/Assets";

// ── Offscreen canvas for safe source-atop tinting ───────────────────
let _tintCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _tintCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTintCtx(
  w: number,
  h: number
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!_tintCanvas || _tintCanvas.width < w || _tintCanvas.height < h) {
    const size = Math.max(w, h, 128);
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

export class Rock extends Enemy {
  rotSpeed: number;
  vertices: Vec2[];
  isBig: boolean;
  isMega: boolean = false;
  flashTimer: number = 0;
  private sprite: HTMLImageElement;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    isBig: boolean = false,
    sizeScale: number = 1.0,
    mega: boolean = false
  ) {
    super(x, y, (isBig ? ROCK_BIG_SIZE : ROCK_SIZE) * sizeScale, hp, speed, isBig ? 3 : 1);
    this.isBig = isBig;
    this.rotSpeed = randomRange(-1.5, 1.5);

    // Pick sprite based on size — no tiny pool, all small rocks use the small pool
    if (mega) {
      this.sprite = AsteroidImages.mega;
      this.isMega = true;
    } else if (isBig) {
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
    const drawSize = this.radius * 2.2; // sprite draw size — closely matches collision radius

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    if (imageReady(this.sprite)) {
      // ── Red glow halo behind sprite — marks rocks as dangerous ──
      // Uses cached offscreen glow texture instead of creating a gradient every frame
      if (!isFlashing) {
        const glowColor = this.isElite
          ? "rgba(255,200,0,0.7)"
          : isPoisoned
            ? "rgba(80,255,80,0.7)"
            : "rgba(255,20,20,0.9)";
        const midColor = glowColor.replace(/[\d.]+\)$/, "0.2)");
        const halo = renderer.getGlowHalo(
          glowColor,
          this.radius * 0.2,
          this.radius * 2.5,
          midColor
        );
        ctx.drawImage(halo.canvas, -halo.size / 2, -halo.size / 2);
      }

      // ── SPRITE RENDER — use offscreen canvas for tint overlays to avoid
      // source-atop bleeding onto the main canvas (Bug #1 fix) ────────────
      if (isPoisoned || this.isElite) {
        const s = Math.ceil(drawSize);
        const tCtx = getTintCtx(s, s);
        tCtx.clearRect(0, 0, s, s);
        tCtx.globalCompositeOperation = "source-over";
        tCtx.drawImage(this.sprite, 0, 0, s, s);
        if (isPoisoned) {
          tCtx.globalCompositeOperation = "source-atop";
          tCtx.fillStyle = "rgba(0, 255, 50, 0.35)";
          tCtx.fillRect(0, 0, s, s);
        }
        if (this.isElite) {
          tCtx.globalCompositeOperation = "source-atop";
          tCtx.fillStyle = "rgba(255, 220, 0, 0.30)";
          tCtx.fillRect(0, 0, s, s);
        }
        ctx.drawImage(tCtx.canvas, 0, 0, s, s, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      } else {
        ctx.drawImage(this.sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      }

      // ── The Rock's face on mega asteroids (clipped to circle, counter-rotated) ──
      if (this.isMega && imageReady(AsteroidImages.rockFace)) {
        ctx.save();
        ctx.rotate(-this.angle); // counter-rotate to keep face upright
        const faceSize = drawSize * 0.75;
        // Clip to circle so face fits the round rock
        ctx.beginPath();
        ctx.arc(0, 0, faceSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(AsteroidImages.rockFace, -faceSize / 2, -faceSize / 2, faceSize, faceSize);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    } else {
      // ── CANVAS FALLBACK (while image loads) ──────────────────────
      ctx.strokeStyle = isFlashing
        ? "#fff"
        : this.isElite
          ? COLORS.textGold
          : isPoisoned
            ? "#44ff44"
            : COLORS.rock;
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

    ctx.restore();

    // HP bar if damaged
    if (this.hp < this.maxHp) {
      const barW = this.isBig ? 28 : 18;
      const barH = 2;
      const barX = this.pos.x - barW / 2;
      const barY = this.pos.y - this.radius - 5;
      renderer.drawRect(barX, barY, barW, barH, "#1a1a2e");
      renderer.drawRect(barX, barY, barW * (this.hp / this.maxHp), barH, COLORS.hpBarDamage);
    }
  }
}

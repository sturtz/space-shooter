import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import {
  Vec2,
  vec2,
  vecSub,
  vecNormalize,
  vecAdd,
  vecScale,
  randomRange,
} from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  ROCK_SIZE,
  ROCK_BIG_SIZE,
  COLORS,
} from "../utils/Constants";

export class Rock extends Enemy {
  rotSpeed: number;
  vertices: Vec2[];
  isBig: boolean;
  flashTimer: number = 0;

  constructor(
    x: number,
    y: number,
    hp: number,
    speed: number,
    isBig: boolean = false,
  ) {
    super(x, y, isBig ? ROCK_BIG_SIZE : ROCK_SIZE, hp, speed, isBig ? 3 : 1);
    this.isBig = isBig;
    this.rotSpeed = randomRange(-1.5, 1.5);

    // Generate angular rock vertices (more Galaga-like, less smooth)
    this.vertices = [];
    const points = isBig ? 10 : 7;
    const size = isBig ? ROCK_BIG_SIZE : ROCK_SIZE;
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
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    const isFlashing = this.flashTimer > 0;
    const isPoisoned = this.poisonTimer > 0;

    // Rock outline (Galaga-style: outlined shapes)
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
    for (let i = 1; i < this.vertices.length; i++) {
      ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner detail lines (cracks)
    ctx.strokeStyle = isFlashing ? "#888" : "#444455";
    ctx.lineWidth = 0.8;
    const s = this.isBig ? ROCK_BIG_SIZE : ROCK_SIZE;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.2);
    ctx.lineTo(s * 0.1, s * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.3);
    ctx.lineTo(-s * 0.1, s * 0.1);
    ctx.stroke();

    // Elite glow ring
    if (this.isElite) {
      ctx.strokeStyle = "#ffdd00";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
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
      renderer.drawRect(
        barX,
        barY,
        barW * (this.hp / this.maxHp),
        barH,
        COLORS.hpBarDamage,
      );
    }
  }
}

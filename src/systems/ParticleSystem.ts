import { Vec2, vec2, randomRange, randomAngle, vecFromAngle } from "../utils/Math";
import { Renderer } from "../rendering/Renderer";

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shrink: boolean;
}

export class ParticleSystem {
  particles: Particle[] = [];

  update(dt: number) {
    let writeIdx = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      // Inline vecAdd + vecScale to avoid 2 object allocations per particle per frame
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
      if (p.life > 0) {
        this.particles[writeIdx] = p;
        writeIdx++;
      }
    }
    this.particles.length = writeIdx;
  }

  render(renderer: Renderer) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const size = p.shrink ? p.size * alpha : p.size;
      renderer.ctx.globalAlpha = alpha;
      renderer.drawCircle(p.pos, Math.max(0.5, size), p.color);
    }
    renderer.ctx.globalAlpha = 1;
  }

  emit(
    pos: Vec2,
    count: number,
    color: string,
    speed: number = 80,
    life: number = 0.5,
    size: number = 2
  ) {
    for (let i = 0; i < count; i++) {
      const angle = randomAngle();
      const spd = randomRange(speed * 0.3, speed);
      this.particles.push({
        pos: vec2(pos.x, pos.y),
        vel: vecFromAngle(angle, spd),
        life: randomRange(life * 0.5, life),
        maxLife: life,
        size: randomRange(size * 0.5, size),
        color,
        shrink: true,
      });
    }
  }

  emitDirectional(
    pos: Vec2,
    angle: number,
    spread: number,
    count: number,
    color: string,
    speed: number = 80,
    life: number = 0.4,
    size: number = 1.5
  ) {
    for (let i = 0; i < count; i++) {
      const a = angle + randomRange(-spread, spread);
      const spd = randomRange(speed * 0.5, speed);
      this.particles.push({
        pos: vec2(pos.x, pos.y),
        vel: vecFromAngle(a, spd),
        life: randomRange(life * 0.5, life),
        maxLife: life,
        size: randomRange(size * 0.5, size),
        color,
        shrink: true,
      });
    }
  }

  clear() {
    this.particles = [];
  }

  // ── Named Presets ─────────────────────────────────────────────────

  /** 3-layer explosion (red + orange + white). Used for boss kills, mothership death, bombs. */
  emitExplosion(pos: Vec2, scale: number = 1) {
    this.emit(pos, Math.round(50 * scale), "#ff4444", 200 * scale, 0.8, 6 * scale);
    this.emit(pos, Math.round(30 * scale), "#ffaa00", 160 * scale, 0.6, 5 * scale);
    this.emit(pos, Math.round(20 * scale), "#ffffff", 120 * scale, 0.4, 3 * scale);
  }

  /** Enemy death burst (explosion color + particle color). */
  emitEnemyDeath(pos: Vec2, explosionColor: string, particleColor: string) {
    this.emit(pos, 12, explosionColor, 100, 0.4, 3);
    this.emit(pos, 6, particleColor, 60, 0.3, 2);
  }

  /** Coin pickup sparkle (color + white ring). */
  emitCoinPickup(pos: Vec2, color: string, isRare: boolean) {
    this.emit(pos, isRare ? 12 : 8, color, isRare ? 60 : 45, 0.3, 1.5);
    this.emit(pos, 4, "#ffffff", 35, 0.15, 0.8);
  }
}

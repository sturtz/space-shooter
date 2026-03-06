import {
  Vec2,
  vec2,
  vecAdd,
  vecScale,
  randomRange,
  randomAngle,
  vecFromAngle,
} from "../utils/Math";
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
      p.pos = vecAdd(p.pos, vecScale(p.vel, dt));
      p.life -= dt;
      if (p.life > 0) {
        // Keep particle — swap to writeIdx
        this.particles[writeIdx] = p;
        writeIdx++;
      }
    }
    // Trim the array to only living particles
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
    size: number = 2,
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
    size: number = 1.5,
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
}

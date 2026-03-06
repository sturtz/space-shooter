import { Bullet } from "./Bullet";
import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import {
  Vec2,
  vecSub,
  vecAngle,
  vecDist,
  vecAdd,
  vecScale,
  vecFromAngle,
} from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/Constants";

/**
 * Homing missile projectile — tracks nearest enemy.
 * Fires every 2 beats, deals half base damage.
 * Unlocked via dmg_missile upgrade.
 */
export class Missile extends Bullet {
  target: Enemy | null;
  turnRate: number = 3.5; // radians per second

  constructor(
    x: number,
    y: number,
    direction: Vec2,
    speed: number,
    damage: number,
    target: Enemy | null,
  ) {
    super(x, y, direction, speed, damage, false, 0, false);
    this.target = target;
    this.lifetime = 4; // longer lifetime for tracking
    this.radius = 5;
  }

  update(dt: number) {
    // Track target — turn toward it each frame
    if (this.target && this.target.alive) {
      const toTarget = vecSub(this.target.pos, this.pos);
      const targetAngle = vecAngle(toTarget);
      let angleDiff = targetAngle - this.angle;

      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Turn toward target
      const maxTurn = this.turnRate * dt;
      if (Math.abs(angleDiff) < maxTurn) {
        this.angle = targetAngle;
      } else {
        this.angle += Math.sign(angleDiff) * maxTurn;
      }

      this.direction = vecFromAngle(this.angle);
    }

    // Move forward
    this.pos = vecAdd(this.pos, vecScale(this.direction, this.speed * dt));
    this.lifetime -= dt;
    if (this.lifetime <= 0) this.destroy();

    // Off screen check (generous bounds for tracking missiles)
    if (
      this.pos.x < -60 ||
      this.pos.x > GAME_WIDTH + 60 ||
      this.pos.y < -60 ||
      this.pos.y > GAME_HEIGHT + 60
    ) {
      this.destroy();
    }
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    // Engine exhaust trail
    ctx.strokeStyle = "#ff6600";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-8, 0);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-16, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Missile body (red diamond shape)
    ctx.fillStyle = "#ff4466";
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();

    // Missile nose (bright tip)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(5, -1.5);
    ctx.lineTo(5, 1.5);
    ctx.closePath();
    ctx.fill();

    // Engine glow
    ctx.fillStyle = "#ff8800";
    ctx.fillRect(-7, -2, 3, 4);

    // Fins
    ctx.fillStyle = "#cc2244";
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 3);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

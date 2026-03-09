import { Enemy } from "./Enemy";
import { Renderer } from "../rendering/Renderer";
import { vec2, vecSub, vecNormalize, vecAdd, vecScale, vecAngle, randomRange } from "../utils/Math";
import { ENEMY_SHIP_SIZE, COLORS } from "../utils/Constants";

export class EnemyShip extends Enemy {
  shootCooldown: number;
  shootTimer: number;
  canShoot: boolean;
  wobbleOffset: number;
  wobbleTimer: number = 0;

  constructor(x: number, y: number, hp: number, speed: number, canShoot: boolean = false) {
    super(x, y, ENEMY_SHIP_SIZE, hp, speed, 2);
    this.canShoot = canShoot;
    this.shootCooldown = randomRange(2, 4);
    this.shootTimer = this.shootCooldown;
    this.wobbleOffset = randomRange(0, Math.PI * 2);
  }

  update(dt: number) {
    // Tick debuffs (poison/slow)
    if (this.updateDebuffs(dt)) return; // killed by poison

    this.wobbleTimer += dt;

    // Move toward target with slight wobble
    const dir = vecNormalize(vecSub(this.targetPos, this.pos));
    const wobble = Math.sin(this.wobbleTimer * 3 + this.wobbleOffset) * 0.3;
    const moveDir = vec2(dir.x + dir.y * wobble, dir.y - dir.x * wobble);
    this.pos = vecAdd(this.pos, vecScale(vecNormalize(moveDir), this.effectiveSpeed * dt));
    this.angle = vecAngle(dir);

    // Shoot cooldown
    if (this.canShoot) {
      this.shootTimer -= dt;
    }
  }

  shouldShoot(): boolean {
    if (!this.canShoot) return false;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.shootCooldown;
      return true;
    }
    return false;
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    // Galaga-style outlined enemy ship
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "miter";

    const isPoisoned = this.poisonTimer > 0;
    const mainColor = this.isElite ? COLORS.elite : isPoisoned ? COLORS.poisoned : COLORS.enemyShip;
    const accentColor = this.isElite ? COLORS.explosion : COLORS.enemyShipAccent;

    // Engine exhaust flicker
    const flickerLen = 3 + Math.random() * 3;
    ctx.strokeStyle = COLORS.bulletTrail;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-8 - flickerLen, 0);
    ctx.lineTo(-8, 2);
    ctx.stroke();

    // Main hull outline (angular aggressive shape)
    ctx.strokeStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(12, 0); // nose
    ctx.lineTo(6, -3); // upper nose
    ctx.lineTo(2, -3); // upper body
    ctx.lineTo(-1, -8); // upper wing tip
    ctx.lineTo(-6, -10); // wing end
    ctx.lineTo(-4, -5); // wing inner
    ctx.lineTo(-7, -3); // rear upper
    ctx.lineTo(-7, 3); // rear lower
    ctx.lineTo(-4, 5); // wing inner
    ctx.lineTo(-6, 10); // wing end
    ctx.lineTo(-1, 8); // lower wing tip
    ctx.lineTo(2, 3); // lower body
    ctx.lineTo(6, 3); // lower nose
    ctx.closePath();
    ctx.stroke();

    // Inner accent lines
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(2, -2);
    ctx.lineTo(2, 2);
    ctx.closePath();
    ctx.stroke();

    // Cross detail on body
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.lineTo(-2, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(1, 0);
    ctx.stroke();

    ctx.restore();

    // HP bar if damaged
    if (this.hp < this.maxHp) {
      const barW = 20;
      const barH = 2;
      const barX = this.pos.x - barW / 2;
      const barY = this.pos.y - ENEMY_SHIP_SIZE - 6;
      renderer.drawRect(barX, barY, barW, barH, "#222");
      renderer.drawRect(barX, barY, barW * (this.hp / this.maxHp), barH, COLORS.hpBarDamage);
    }
  }
}

import { Entity } from "./Entity";
import {
  Vec2,
  vec2,
  vecSub,
  vecNormalize,
  vecAdd,
  vecScale,
} from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/Constants";

/**
 * Shared base class for all enemy types (Rock, EnemyShip).
 * Provides common HP, coin value, elite status, poison/slow debuff handling.
 */
export abstract class Enemy extends Entity {
  hp: number;
  maxHp: number;
  speed: number;
  targetPos: Vec2;
  coinValue: number;
  isElite: boolean = false;

  // Debuff state
  poisonTimer: number = 0;
  poisonDps: number = 0;
  slowFactor: number = 1; // 1 = normal speed, < 1 = slowed
  slowTimer: number = 0;

  constructor(
    x: number,
    y: number,
    radius: number,
    hp: number,
    speed: number,
    coinValue: number,
  ) {
    super(x, y, radius);
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.coinValue = coinValue;
    this.targetPos = vec2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }

  applyPoison(dps: number, duration: number) {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  }

  applySlow(factor: number, duration: number) {
    // factor is e.g. 0.05 per level → slowFactor = 1 - factor
    this.slowFactor = Math.min(this.slowFactor, 1 - factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** Call in subclass update() to tick debuffs. Returns true if killed by poison. */
  updateDebuffs(dt: number): boolean {
    // Poison tick
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.hp -= this.poisonDps * dt;
      if (this.hp <= 0) {
        this.destroy();
        return true;
      }
    }

    // Slow decay
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowFactor = 1;
      }
    }

    return false;
  }

  /** Effective speed accounting for slow debuff */
  get effectiveSpeed(): number {
    return this.speed * Math.max(0.1, this.slowFactor);
  }
}

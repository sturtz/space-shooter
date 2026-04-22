import { Entity } from "./Entity";
import { Vec2, vec2 } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/Constants";

/**
 * Shared base class for all enemy types (Rock, EnemyShip).
 * Provides common HP, coin value, elite status, poison/slow debuff handling.
 */
export abstract class Enemy extends Entity {
  /** Global execute threshold — set once per run from PlayerStats */
  static executeThreshold: number = 0;

  hp: number;
  maxHp: number;
  speed: number;
  targetPos: Vec2;
  coinValue: number;
  isElite: boolean = false;
  isBoss: boolean = false;

  // Debuff state
  poisonTimer: number = 0;
  poisonDps: number = 0;
  slowFactor: number = 1; // 1 = normal speed, < 1 = slowed
  slowTimer: number = 0;
  stunTimer: number = 0; // > 0 = frozen (cannot move)
  // Bleed (stacking DoT — % of max HP per stack per second)
  bleedStacks: number = 0;
  bleedDpsPerStack: number = 0;
  bleedMaxStacks: number = 0;
  bleedTimer: number = 0;

  constructor(x: number, y: number, radius: number, hp: number, speed: number, coinValue: number) {
    super(x, y, radius);
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.coinValue = coinValue;
    this.targetPos = vec2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    // Execute threshold — instant kill when HP falls below threshold
    if (this.hp > 0 && Enemy.executeThreshold > 0 && this.hp / this.maxHp <= Enemy.executeThreshold) {
      this.hp = 0;
    }
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

  applyStun(duration: number) {
    this.stunTimer = Math.max(this.stunTimer, duration);
  }

  applyBleed(dpsPerStack: number, maxStacks: number) {
    this.bleedDpsPerStack = dpsPerStack;
    this.bleedMaxStacks = maxStacks;
    if (this.bleedStacks < maxStacks) {
      this.bleedStacks++;
    }
    this.bleedTimer = 3; // refresh 3s duration on each hit
  }

  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /** Call in subclass update() to tick debuffs. Returns true if killed by poison. */
  updateDebuffs(dt: number): boolean {
    // Stun tick (freeze)
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      if (this.stunTimer < 0) this.stunTimer = 0;
    }

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

    // Bleed tick (stacking DoT — % of max HP per stack per second)
    if (this.bleedStacks > 0 && this.bleedTimer > 0) {
      this.bleedTimer -= dt;
      const bleedDmg = this.bleedStacks * this.bleedDpsPerStack * this.maxHp * dt;
      this.hp -= bleedDmg;
      if (this.hp <= 0) {
        this.destroy();
        return true;
      }
      if (this.bleedTimer <= 0) {
        this.bleedStacks = 0;
      }
    }

    return false;
  }

  /** Effective speed accounting for slow debuff and stun */
  get effectiveSpeed(): number {
    if (this.stunTimer > 0) return 0;
    return this.speed * Math.max(0.1, this.slowFactor);
  }
}

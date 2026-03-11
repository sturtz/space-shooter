import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import { randomRange } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/Constants";
import { AsteroidImages, pickRandom, imageReady } from "../utils/Assets";

/**
 * Killable background debris asteroid.
 * Flies in a straight line from top of screen toward and past the mothership.
 * Can be destroyed by player bullets — 50% chance to drop 1 coin on death.
 * No damage to player/mothership, no glow.
 */
export class Debris extends Entity {
  hp: number = 1;
  private rotSpeed: number;
  private sprite: HTMLImageElement;
  private drawSize: number;
  private speed: number;
  /** Normalized direction — set once at spawn, never changes */
  private dirX: number;
  private dirY: number;

  constructor(x: number, y: number) {
    // Visible rock size
    const size = randomRange(4, 7);
    super(x, y, size);

    this.rotSpeed = randomRange(-2, 2);
    this.sprite = pickRandom(AsteroidImages.small);
    this.drawSize = size * randomRange(2.2, 3.0);
    this.speed = randomRange(60, 120);

    // Target: mothership area (bottom center ± some spread)
    const targetX = GAME_WIDTH / 2 + randomRange(-120, 120);
    const targetY = GAME_HEIGHT + 60; // below screen — fly all the way through

    // Compute direction once — fly perfectly straight
    const dx = targetX - x;
    const dy = targetY - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.dirX = dx / dist;
    this.dirY = dy / dist;
  }

  /** Returns true if killed */
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.angle += this.rotSpeed * dt;

    // Fly straight — no veering, no fleeing
    const step = this.speed * dt;
    this.pos.x += this.dirX * step;
    this.pos.y += this.dirY * step;

    // Kill when off-screen (generous margin)
    const margin = 80;
    if (
      this.pos.x < -margin ||
      this.pos.x > GAME_WIDTH + margin ||
      this.pos.y < -margin ||
      this.pos.y > GAME_HEIGHT + margin
    ) {
      this.alive = false;
    }
  }

  render(renderer: Renderer) {
    if (!imageReady(this.sprite)) return;

    const ctx = renderer.ctx;
    ctx.save();
    ctx.globalAlpha = 1.0; // fully visible rock
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    ctx.drawImage(
      this.sprite,
      -this.drawSize / 2,
      -this.drawSize / 2,
      this.drawSize,
      this.drawSize
    );
    ctx.restore();
  }
}

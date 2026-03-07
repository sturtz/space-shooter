import { Vec2, vec2 } from "../utils/Math";
import { Renderer } from "../rendering/Renderer";

export abstract class Entity {
  pos: Vec2;
  vel: Vec2 = vec2(0, 0);
  radius: number;
  alive: boolean = true;
  angle: number = 0;

  constructor(x: number, y: number, radius: number) {
    this.pos = vec2(x, y);
    this.radius = radius;
  }

  abstract update(dt: number): void;
  abstract render(renderer: Renderer): void;

  destroy() {
    this.alive = false;
  }
}

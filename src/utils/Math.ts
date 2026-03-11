// === MATH UTILITIES ===

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vecLength(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecNormalize(v: Vec2): Vec2 {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vecDist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance — avoids sqrt. Use with squared-radius comparisons. */
export function vecDistSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function vecAngle(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function vecFromAngle(angle: number, length: number = 1): Vec2 {
  return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
}

export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function randomAngle(): number {
  return Math.random() * Math.PI * 2;
}

/** Circle-circle collision using squared distance — no sqrt. */
export function circleCollision(pos1: Vec2, radius1: number, pos2: Vec2, radius2: number): boolean {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const r = radius1 + radius2;
  return dx * dx + dy * dy < r * r;
}

export function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Point-in-rectangle hit test (inclusive bounds). */
export function hitTestRect(
  mx: number,
  my: number,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}

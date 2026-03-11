/**
 * AlgoArt — Algorithmic art systems for the space shooter.
 *
 * Three subsystems:
 * 1. Sacred geometry background overlay (rendered behind entities, in world-space)
 * 2. Geometric particle burst patterns (fibonacci spirals, spirographs, phyllotaxis)
 * 3. Formation spawning patterns (Lissajous, spirals, sine waves, rings)
 */

import { Vec2, vec2, randomRange } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { Renderer } from "../rendering/Renderer";
import { ParticleSystem } from "./ParticleSystem";

// ── Constants ────────────────────────────────────────────────────────
const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio ≈ 1.618
const GOLDEN_ANGLE = Math.PI * 2 * (1 - 1 / PHI); // ≈ 2.3999 rad (137.508°)
const TAU = Math.PI * 2;

// ═══════════════════════════════════════════════════════════════════════
// 1. SACRED GEOMETRY BACKGROUND
// ═══════════════════════════════════════════════════════════════════════

interface GeometryRing {
  radius: number;
  dotCount: number;
  speed: number; // radians per second
  phase: number;
  color: string;
  alpha: number;
}

interface SacredLine {
  fromRing: number;
  fromDot: number;
  toRing: number;
  toDot: number;
}

export class SacredGeometryBg {
  private time = 0;
  private rings: GeometryRing[] = [];
  private connections: SacredLine[] = [];
  private goldenSpiral: Vec2[] = [];
  private breathPhase = 0;
  /** Beat pulse intensity (0–1, decays quickly after each beat) */
  private beatPulse = 0;

  /** Center of the mandala in world-space */
  cx = GAME_WIDTH / 2;
  cy = GAME_HEIGHT / 2;

  constructor() {
    this.buildGeometry();
  }

  private buildGeometry() {
    // Concentric rings with different rotation speeds — creates moiré interference
    this.rings = [
      { radius: 60, dotCount: 6, speed: 0.15, phase: 0, color: COLORS.player, alpha: 0.08 },
      {
        radius: 110,
        dotCount: 12,
        speed: -0.08,
        phase: Math.PI / 6,
        color: "#4488ff",
        alpha: 0.06,
      },
      { radius: 170, dotCount: 18, speed: 0.05, phase: 0, color: "#aa44ff", alpha: 0.05 },
      {
        radius: 240,
        dotCount: 24,
        speed: -0.03,
        phase: Math.PI / 12,
        color: COLORS.player,
        alpha: 0.04,
      },
      { radius: 320, dotCount: 36, speed: 0.02, phase: 0, color: "#4488ff", alpha: 0.035 },
    ];

    // Flower-of-life connections — connect nearest dots between adjacent rings
    for (let r = 0; r < this.rings.length - 1; r++) {
      const inner = this.rings[r];
      const outer = this.rings[r + 1];
      for (let i = 0; i < inner.dotCount; i++) {
        // Connect each inner dot to the 2 nearest outer dots
        const innerAngle = (i / inner.dotCount) * TAU;
        let bestJ = 0;
        let bestDiff = Infinity;
        for (let j = 0; j < outer.dotCount; j++) {
          const outerAngle = (j / outer.dotCount) * TAU;
          const diff = Math.abs(innerAngle - outerAngle);
          const wrapped = Math.min(diff, TAU - diff);
          if (wrapped < bestDiff) {
            bestDiff = wrapped;
            bestJ = j;
          }
        }
        this.connections.push({ fromRing: r, fromDot: i, toRing: r + 1, toDot: bestJ });
        // Also connect to neighbor
        const next = (bestJ + 1) % outer.dotCount;
        this.connections.push({ fromRing: r, fromDot: i, toRing: r + 1, toDot: next });
      }
    }

    // Golden spiral points (pre-computed, static shape that rotates)
    this.goldenSpiral = [];
    for (let i = 0; i < 120; i++) {
      const t = i * 0.08;
      const r = 8 * Math.pow(PHI, t / TAU) * t * 0.3;
      if (r > 350) break;
      const a = t * GOLDEN_ANGLE;
      this.goldenSpiral.push(vec2(Math.cos(a) * r, Math.sin(a) * r));
    }
  }

  /** Get the world-space position of a dot on a ring at current time */
  private dotPos(ringIdx: number, dotIdx: number): Vec2 {
    const ring = this.rings[ringIdx];
    const breath = 1 + 0.06 * Math.sin(this.breathPhase);
    const angle = (dotIdx / ring.dotCount) * TAU + ring.phase + ring.speed * this.time;
    const r = ring.radius * breath;
    return vec2(this.cx + Math.cos(angle) * r, this.cy + Math.sin(angle) * r);
  }

  update(dt: number) {
    this.time += dt;
    this.breathPhase += dt * 0.4;
    // Decay beat pulse quickly (half-life ~0.12s)
    this.beatPulse *= Math.max(0, 1 - dt * 8);
    if (this.beatPulse < 0.01) this.beatPulse = 0;
  }

  /** Trigger a beat pulse — call from the cone weapon beat callback */
  pulse() {
    this.beatPulse = 1;
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    ctx.save();

    // Beat pulse amplifies breath and alpha
    const bp = this.beatPulse;
    const breath = 1 + 0.06 * Math.sin(this.breathPhase) + bp * 0.15;
    const alphaBoost = 1 + bp * 4; // up to 5× brighter on beat

    // ── Beat pulse ring — expanding circle from center ──
    if (bp > 0.05) {
      const pulseRadius = (1 - bp) * 400; // expands outward as pulse decays
      ctx.globalAlpha = bp * 0.12;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2 * bp;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, pulseRadius, 0, TAU);
      ctx.stroke();
    }

    // ── Golden spiral (very faint, slowly rotating) ──
    const spiralAngle = this.time * 0.03;
    ctx.globalAlpha = 0.025 * alphaBoost;
    ctx.strokeStyle = "#aa44ff";
    ctx.lineWidth = 0.8 + bp * 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.goldenSpiral.length; i++) {
      const p = this.goldenSpiral[i];
      const cos = Math.cos(spiralAngle);
      const sin = Math.sin(spiralAngle);
      const wx = this.cx + p.x * cos - p.y * sin;
      const wy = this.cy + p.x * sin + p.y * cos;
      if (i === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();

    // ── Ring connections (flower-of-life web) ──
    for (const conn of this.connections) {
      const from = this.dotPos(conn.fromRing, conn.fromDot);
      const to = this.dotPos(conn.toRing, conn.toDot);

      // Fade based on distance from center
      const midX = (from.x + to.x) / 2 - this.cx;
      const midY = (from.y + to.y) / 2 - this.cy;
      const distFromCenter = Math.sqrt(midX * midX + midY * midY);
      const fade = Math.max(0, 1 - distFromCenter / 350);

      ctx.globalAlpha = 0.03 * fade * alphaBoost;
      ctx.strokeStyle = this.rings[conn.fromRing].color;
      ctx.lineWidth = 0.5 + bp * 0.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    // ── Ring circles (subtle, brighten on beat) ──
    for (const ring of this.rings) {
      const r = ring.radius * breath;
      ctx.globalAlpha = ring.alpha * 0.4 * alphaBoost;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 0.4 + bp * 0.8;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, TAU);
      ctx.stroke();
    }

    // ── Dots on rings ──
    for (let r = 0; r < this.rings.length; r++) {
      const ring = this.rings[r];
      ctx.fillStyle = ring.color;
      for (let d = 0; d < ring.dotCount; d++) {
        const pos = this.dotPos(r, d);
        ctx.globalAlpha = ring.alpha * 1.2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.2, 0, TAU);
        ctx.fill();
      }
    }

    // ── Central flower of life (6 overlapping circles) ──
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 0.6;
    const flowerR = 55 * breath;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + this.time * 0.1;
      const ox = Math.cos(a) * flowerR * 0.5;
      const oy = Math.sin(a) * flowerR * 0.5;
      ctx.beginPath();
      ctx.arc(this.cx + ox, this.cy + oy, flowerR * 0.5, 0, TAU);
      ctx.stroke();
    }
    // Center circle
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, flowerR * 0.5, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. GEOMETRIC PARTICLE BURSTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Emit particles in a Fibonacci/phyllotaxis sunflower pattern.
 * Each particle is placed at the golden angle offset from the previous.
 * Creates a stunning sunflower spiral arrangement.
 */
export function emitFibonacciSpiral(
  particles: ParticleSystem,
  pos: Vec2,
  count: number,
  color: string,
  speed: number = 100,
  life: number = 0.6,
  size: number = 2
) {
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE;
    // Radius increases with sqrt(i) for even distribution (phyllotaxis)
    const r = Math.sqrt(i) * (speed / Math.sqrt(count));
    const spd = r * 1.5 + randomRange(0, speed * 0.2);
    particles.particles.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(Math.cos(angle) * spd, Math.sin(angle) * spd),
      life: randomRange(life * 0.6, life),
      maxLife: life,
      size: size * (1 - (i / count) * 0.5), // outer particles slightly smaller
      color,
      shrink: true,
    });
  }
}

/**
 * Emit particles along a spirograph (hypotrochoid) curve.
 * Creates intricate looping petal patterns.
 * R = outer circle radius, r = inner circle radius, d = pen distance
 */
export function emitSpirograph(
  particles: ParticleSystem,
  pos: Vec2,
  count: number,
  color: string,
  speed: number = 80,
  life: number = 0.7,
  size: number = 1.5,
  /** Ratio of inner to outer circle (determines number of petals) */
  ratio: number = 0.4
) {
  const R = 1; // normalized outer radius
  const r = ratio; // inner radius
  const d = 0.8; // pen distance
  const petals = Math.round(1 / (1 - ratio)); // approximate petal count

  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU * petals;
    // Hypotrochoid parametric equations
    const hx = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const hy = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    // Normalize and scale to speed
    const len = Math.sqrt(hx * hx + hy * hy);
    const nx = len > 0 ? hx / len : 0;
    const ny = len > 0 ? hy / len : 0;
    const spd = speed * (0.5 + len * 0.8) + randomRange(0, speed * 0.15);

    particles.particles.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(nx * spd, ny * spd),
      life: randomRange(life * 0.5, life),
      maxLife: life,
      size: randomRange(size * 0.6, size),
      color,
      shrink: true,
    });
  }
}

/**
 * Emit particles in concentric golden ratio rings.
 * Each ring has PHI × the radius of the previous.
 */
export function emitGoldenRings(
  particles: ParticleSystem,
  pos: Vec2,
  ringCount: number,
  dotsPerRing: number,
  color: string,
  speed: number = 90,
  life: number = 0.5,
  size: number = 1.8
) {
  for (let ring = 0; ring < ringCount; ring++) {
    const ringSpeed = speed * Math.pow(PHI, ring * 0.4);
    const ringLife = life * (1 - ring * 0.1);
    const offset = ring * GOLDEN_ANGLE; // each ring offset by golden angle

    for (let i = 0; i < dotsPerRing; i++) {
      const angle = (i / dotsPerRing) * TAU + offset;
      const spd = ringSpeed + randomRange(-speed * 0.1, speed * 0.1);
      particles.particles.push({
        pos: vec2(pos.x, pos.y),
        vel: vec2(Math.cos(angle) * spd, Math.sin(angle) * spd),
        life: randomRange(ringLife * 0.7, ringLife),
        maxLife: ringLife,
        size: size * (1 - (ring / ringCount) * 0.4),
        color,
        shrink: true,
      });
    }
  }
}

/**
 * Emit a symmetric star / mandala burst.
 * Creates N-fold rotational symmetry with inner and outer arms.
 */
export function emitSymmetricStar(
  particles: ParticleSystem,
  pos: Vec2,
  symmetry: number, // 5 = pentagonal, 6 = hexagonal, etc.
  color: string,
  speed: number = 100,
  life: number = 0.55,
  size: number = 2
) {
  const armsPerFold = 3; // particles per arm per symmetry fold
  for (let fold = 0; fold < symmetry; fold++) {
    const baseAngle = (fold / symmetry) * TAU;
    // Main arm
    for (let j = 0; j < armsPerFold; j++) {
      const t = (j + 1) / armsPerFold;
      const angle = baseAngle + randomRange(-0.05, 0.05);
      const spd = speed * t + randomRange(0, speed * 0.15);
      particles.particles.push({
        pos: vec2(pos.x, pos.y),
        vel: vec2(Math.cos(angle) * spd, Math.sin(angle) * spd),
        life: randomRange(life * 0.6, life),
        maxLife: life,
        size: size * (1.2 - t * 0.4),
        color,
        shrink: true,
      });
    }
    // Inter-arm accent (halfway between folds)
    const midAngle = baseAngle + TAU / symmetry / 2;
    const midSpd = speed * 0.5 + randomRange(0, speed * 0.1);
    particles.particles.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(Math.cos(midAngle) * midSpd, Math.sin(midAngle) * midSpd),
      life: life * 0.8,
      maxLife: life,
      size: size * 0.7,
      color: "#ffffff",
      shrink: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. FORMATION SPAWNING
// ═══════════════════════════════════════════════════════════════════════

/** A position + delay describing one enemy in a formation */
export interface FormationSlot {
  x: number;
  y: number;
  delay: number; // seconds after formation start
}

/**
 * Generate a Lissajous curve formation.
 * Enemies trace a figure-8 or pretzel pattern.
 * @param a frequency ratio x
 * @param b frequency ratio y
 * @param delta phase offset (π/2 for circle, 0 for line, π/4 for figure-8)
 */
export function lissajousFormation(
  count: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  a: number = 3,
  b: number = 2,
  delta: number = Math.PI / 2,
  stagger: number = 0.3
): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    const x = cx + radiusX * Math.sin(a * t + delta);
    const y = cy + radiusY * Math.sin(b * t);
    slots.push({ x, y, delay: i * stagger });
  }
  return slots;
}

/**
 * Generate a phyllotaxis (sunflower) spiral formation.
 * Enemies arranged in the golden-angle spiral — naturally beautiful.
 */
export function phyllotaxisFormation(
  count: number,
  cx: number,
  cy: number,
  spacing: number = 18,
  stagger: number = 0.2
): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE;
    const r = spacing * Math.sqrt(i);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    slots.push({ x, y, delay: i * stagger });
  }
  return slots;
}

/**
 * Generate a sine wave formation.
 * Enemies spawn in a wavy horizontal line from one side of the screen.
 */
export function sineWaveFormation(
  count: number,
  startX: number,
  startY: number,
  wavelength: number = 120,
  amplitude: number = 80,
  spacing: number = 40,
  stagger: number = 0.25
): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    const y = startY + Math.sin((i / count) * TAU * ((count * spacing) / wavelength)) * amplitude;
    slots.push({ x, y, delay: i * stagger });
  }
  return slots;
}

/**
 * Generate a ring/circle formation.
 * All enemies in a perfect ring, optionally with a center enemy.
 */
export function ringFormation(
  count: number,
  cx: number,
  cy: number,
  radius: number,
  stagger: number = 0.15,
  includeCenter: boolean = false
): FormationSlot[] {
  const slots: FormationSlot[] = [];
  if (includeCenter) {
    slots.push({ x: cx, y: cy, delay: 0 });
  }
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    slots.push({ x, y, delay: (includeCenter ? 0.3 : 0) + i * stagger });
  }
  return slots;
}

/**
 * Generate a cardioid (heart-shaped) formation.
 * Enemies trace a cardioid curve — visually dramatic.
 */
export function cardioidFormation(
  count: number,
  cx: number,
  cy: number,
  scale: number = 60,
  stagger: number = 0.2
): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    const r = scale * (1 - Math.cos(t));
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    slots.push({ x, y, delay: i * stagger });
  }
  return slots;
}

// ── Formation Manager ─────────────────────────────────────────────────

export type FormationType = "lissajous" | "phyllotaxis" | "sineWave" | "ring" | "cardioid";

const FORMATION_TYPES: FormationType[] = [
  "lissajous",
  "phyllotaxis",
  "sineWave",
  "ring",
  "cardioid",
];

/** Pick a random formation type */
export function randomFormationType(): FormationType {
  return FORMATION_TYPES[Math.floor(Math.random() * FORMATION_TYPES.length)];
}

/**
 * Generate a formation of the given type with sensible defaults
 * for the game's 1200×800 world.
 */
export function generateFormation(type: FormationType, count: number): FormationSlot[] {
  // Spawn formations from the top half of the screen
  const cx = GAME_WIDTH / 2 + randomRange(-200, 200);
  const cy = randomRange(80, 250);

  switch (type) {
    case "lissajous": {
      // Random Lissajous ratios for variety
      const ratios: [number, number, number][] = [
        [3, 2, Math.PI / 2], // trefoil
        [5, 4, Math.PI / 4], // complex
        [3, 4, Math.PI / 3], // pretzel
        [2, 3, Math.PI / 6], // figure-8 variant
        [5, 3, Math.PI / 2], // star-like
      ];
      const [a, b, delta] = ratios[Math.floor(Math.random() * ratios.length)];
      return lissajousFormation(count, cx, cy, 130, 80, a, b, delta, 0.3);
    }
    case "phyllotaxis":
      return phyllotaxisFormation(count, cx, cy, 22, 0.25);
    case "sineWave": {
      const startX = randomRange(-50, 100);
      const startY = randomRange(60, 180);
      return sineWaveFormation(count, startX, startY, 150, 70, 50, 0.2);
    }
    case "ring":
      return ringFormation(count, cx, cy, 90 + count * 5, 0.12, count >= 8);
    case "cardioid":
      return cardioidFormation(count, cx, cy, 55 + count * 2, 0.2);
  }
}

// ── Formation Indicator (renders a brief preview of the formation shape) ──

export interface FormationPreview {
  type: FormationType;
  slots: FormationSlot[];
  life: number;
  maxLife: number;
}

/**
 * Render a ghostly preview of an incoming formation.
 * Shows faint dots at the spawn positions with connecting lines.
 */
export function renderFormationPreview(renderer: Renderer, preview: FormationPreview) {
  const alpha = Math.min(1, preview.life / preview.maxLife) * 0.25;
  if (alpha < 0.01) return;

  const ctx = renderer.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Connecting lines between sequential slots
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  for (let i = 0; i < preview.slots.length; i++) {
    const s = preview.slots[i];
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Dot at each spawn position
  ctx.fillStyle = COLORS.player;
  for (const s of preview.slots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, TAU);
    ctx.fill();
  }

  // Formation type label
  const cx = preview.slots.reduce((sum, s) => sum + s.x, 0) / preview.slots.length;
  const cy = Math.min(...preview.slots.map((s) => s.y)) - 18;
  ctx.globalAlpha = alpha * 1.5;
  renderer.drawText(`⟨${preview.type}⟩`, cx, cy, COLORS.player, 8, "center", "middle");

  ctx.restore();
}

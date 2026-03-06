import { Entity } from "./Entity";
import { Renderer } from "../rendering/Renderer";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MOTHERSHIP_COLLISION_RADIUS,
  COLORS,
} from "../utils/Constants";

export class Mothership extends Entity {
  maxHp: number;
  hp: number;
  damageFlash: number = 0;
  pulseTimer: number = 0;

  constructor(maxHp: number) {
    super(GAME_WIDTH / 2, GAME_HEIGHT / 2, MOTHERSHIP_COLLISION_RADIUS);
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.damageFlash = 0.3;
    if (this.hp <= 0) {
      this.hp = 0;
      return true; // destroyed
    }
    return false;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt: number) {
    this.pulseTimer += dt;
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
    }
  }

  render(renderer: Renderer) {
    const ctx = renderer.ctx;
    const cx = this.pos.x;
    const cy = this.pos.y;

    const bodyColor =
      this.damageFlash > 0 ? COLORS.mothershipDamaged : COLORS.mothership;
    const glowColor =
      this.damageFlash > 0 ? COLORS.mothershipDamaged : COLORS.mothershipGlow;
    const pulseScale = 1 + Math.sin(this.pulseTimer * 2) * 0.08;

    ctx.save();

    // Outer ring outline (pulses)
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 28 * pulseScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 36 * pulseScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Main body - hexagonal outline
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const r = 18;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner hexagon outline
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const r = 10;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // Center core - small bright pixel
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 2, cy - 2, 4, 4);

    // Docking arms (4 lines extending out, slowly rotating)
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + this.pulseTimer * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13);
      ctx.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
      ctx.stroke();
      // Small tick at end
      const endX = cx + Math.cos(a) * 22;
      const endY = cy + Math.sin(a) * 22;
      const perpX = -Math.sin(a) * 3;
      const perpY = Math.cos(a) * 3;
      ctx.beginPath();
      ctx.moveTo(endX - perpX, endY - perpY);
      ctx.lineTo(endX + perpX, endY + perpY);
      ctx.stroke();
    }

    // Vertex dots on hexagon
    ctx.fillStyle = bodyColor;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const r = 18;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }

    // HP bar below
    const barWidth = 40;
    const barHeight = 3;
    const barX = cx - barWidth / 2;
    const barY = cy + 26;
    const hpRatio = this.hp / this.maxHp;

    // HP bar outline style
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const hpColor =
      hpRatio > 0.5
        ? COLORS.hpBar
        : hpRatio > 0.25
          ? "#ffaa00"
          : COLORS.hpBarDamage;
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

    // HP numbers
    ctx.fillStyle = "#fff";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${this.hp}/${this.maxHp}`, cx, barY + barHeight + 2);

    ctx.restore();
  }
}

import { Vec2 } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private shakeAmount = 0;
  private shakeDecay = 0.9;

  /** Device pixel ratio — set once at init, updated on resize */
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× to avoid VRAM issues
    this.dpr = dpr;

    // Compute the largest size that fits the viewport while keeping 900×600 aspect ratio
    const container = this.canvas.parentElement;
    const availW = container ? container.clientWidth : window.innerWidth;
    const availH = container ? container.clientHeight : window.innerHeight;

    const aspect = GAME_WIDTH / GAME_HEIGHT; // 900/600 = 1.5
    let displayW = availW;
    let displayH = availW / aspect;
    if (displayH > availH) {
      displayH = availH;
      displayW = availH * aspect;
    }

    // Physical pixel buffer = display size × dpr (for sharpness on Retina / hi-DPI)
    this.canvas.width  = Math.round(displayW * dpr);
    this.canvas.height = Math.round(displayH * dpr);

    // CSS display size — exact fit, centered by flex parent
    this.canvas.style.width  = `${Math.round(displayW)}px`;
    this.canvas.style.height = `${Math.round(displayH)}px`;

    // Scale context so all game-coordinate drawing (0..GAME_WIDTH, 0..GAME_HEIGHT)
    // maps correctly onto the hi-res physical buffer
    const scaleX = (displayW * dpr) / GAME_WIDTH;
    const scaleY = (displayH * dpr) / GAME_HEIGHT;
    this.ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    this.ctx.imageSmoothingEnabled = false;
  }

  shake(amount: number) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  beginFrame(dt: number = 1 / 60) {
    this.ctx.save();
    if (this.shakeAmount > 0.5) {
      const sx = (Math.random() - 0.5) * this.shakeAmount * 2;
      const sy = (Math.random() - 0.5) * this.shakeAmount * 2;
      this.ctx.translate(sx, sy);
      this.shakeAmount *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeAmount = 0;
    }
    this.ctx.fillStyle = COLORS.bg;
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  endFrame() {
    this.ctx.restore();
  }

  drawCircle(pos: Vec2, radius: number, color: string) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawCircleStroke(
    pos: Vec2,
    radius: number,
    color: string,
    lineWidth: number = 1,
  ) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  drawRect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  drawRectStroke(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    lineWidth: number = 1,
  ) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, w, h);
  }

  drawLine(from: Vec2, to: Vec2, color: string, lineWidth: number = 1) {
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  drawText(
    text: string,
    x: number,
    y: number,
    color: string = COLORS.textPrimary,
    size: number = 14,
    align: CanvasTextAlign = "left",
    baseline: CanvasTextBaseline = "top",
  ) {
    this.ctx.font = `${size}px monospace`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(text, x, y);
  }

  drawTextOutline(
    text: string,
    x: number,
    y: number,
    color: string = COLORS.textPrimary,
    outlineColor: string = "#000",
    size: number = 14,
    align: CanvasTextAlign = "left",
    baseline: CanvasTextBaseline = "top",
  ) {
    this.ctx.font = `${size}px monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.strokeStyle = outlineColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }

  measureText(text: string, size: number = 14): number {
    this.ctx.font = `${size}px monospace`;
    return this.ctx.measureText(text).width;
  }

  // ======= Hi-Fi Drawing Helpers =======

  /** Draw text using Orbitron (title font loaded via Google Fonts) */
  drawTitleText(
    text: string,
    x: number,
    y: number,
    color: string,
    size: number,
    align: CanvasTextAlign = "center",
    baseline: CanvasTextBaseline = "middle",
  ) {
    this.ctx.font = `bold ${size}px 'Orbitron', monospace`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(text, x, y);
  }

  /** Draw text with Orbitron + outline */
  drawTitleTextOutline(
    text: string,
    x: number,
    y: number,
    color: string,
    outlineColor: string,
    size: number,
    align: CanvasTextAlign = "center",
    baseline: CanvasTextBaseline = "middle",
  ) {
    this.ctx.font = `bold ${size}px 'Orbitron', monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.strokeStyle = outlineColor;
    this.ctx.lineWidth = Math.max(3, size * 0.12);
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }

  /** Draw a rounded rectangle path */
  roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /** Draw a filled rounded rectangle */
  drawRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: string,
  ) {
    this.roundedRectPath(x, y, w, h, r);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  /** Draw a stroked rounded rectangle */
  drawRoundedRectStroke(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: string,
    lineWidth: number = 1,
  ) {
    this.roundedRectPath(x, y, w, h, r);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  /** Draw a gradient bar (horizontal) with rounded ends — great for HP, shield, timer bars */
  drawGradientBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    colorStart: string,
    colorEnd: string,
    bgColor: string = "rgba(0,0,0,0.5)",
    borderColor: string = "rgba(255,255,255,0.1)",
    radius: number = -1,
  ) {
    if (radius < 0) radius = h / 2;
    const fillW = Math.max(0, w * Math.max(0, Math.min(1, ratio)));

    // Background
    this.drawRoundedRect(x, y, w, h, radius, bgColor);

    // Fill
    if (fillW > 0) {
      const grad = this.ctx.createLinearGradient(x, y, x + fillW, y);
      grad.addColorStop(0, colorStart);
      grad.addColorStop(1, colorEnd);
      // Clip fill to rounded rect
      this.ctx.save();
      this.roundedRectPath(x, y, w, h, radius);
      this.ctx.clip();
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(x, y, fillW, h);
      // Shine highlight on top half
      const shine = this.ctx.createLinearGradient(x, y, x, y + h);
      shine.addColorStop(0, "rgba(255,255,255,0.2)");
      shine.addColorStop(0.5, "rgba(255,255,255,0.05)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      this.ctx.fillStyle = shine;
      this.ctx.fillRect(x, y, fillW, h);
      this.ctx.restore();
    }

    // Border
    this.drawRoundedRectStroke(x, y, w, h, radius, borderColor, 1);
  }

  /** Draw a glowing circle (bloom effect) */
  drawGlowCircle(
    pos: Vec2,
    radius: number,
    color: string,
    glowRadius: number = 0,
    alpha: number = 0.3,
  ) {
    if (glowRadius <= 0) glowRadius = radius * 2;
    const grad = this.ctx.createRadialGradient(
      pos.x,
      pos.y,
      radius * 0.3,
      pos.x,
      pos.y,
      glowRadius,
    );
    grad.addColorStop(0, color);
    grad.addColorStop(
      0.4,
      color.replace(/[\d.]+\)$/, `${alpha * 0.5})`).includes("rgba")
        ? color
        : this.hexToRgba(color, alpha * 0.5),
    );
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, glowRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Draw a panel (dark translucent box with rounded corners, border, and optional glow) */
  drawPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    options?: {
      bg?: string;
      border?: string;
      borderWidth?: number;
      radius?: number;
      glow?: string;
      glowBlur?: number;
    },
  ) {
    const {
      bg = "rgba(8, 8, 24, 0.88)",
      border = "rgba(60, 80, 120, 0.4)",
      borderWidth = 1.5,
      radius = 8,
      glow,
      glowBlur = 12,
    } = options || {};

    this.ctx.save();

    // Glow shadow
    if (glow) {
      this.ctx.shadowColor = glow;
      this.ctx.shadowBlur = glowBlur;
    }

    this.drawRoundedRect(x, y, w, h, radius, bg);

    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;

    // Top edge highlight
    const topHighlight = this.ctx.createLinearGradient(x, y, x, y + h);
    topHighlight.addColorStop(0, "rgba(255,255,255,0.06)");
    topHighlight.addColorStop(0.15, "rgba(255,255,255,0)");
    topHighlight.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.save();
    this.roundedRectPath(x, y, w, h, radius);
    this.ctx.clip();
    this.ctx.fillStyle = topHighlight;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    // Border
    this.drawRoundedRectStroke(x, y, w, h, radius, border, borderWidth);

    this.ctx.restore();
  }

  /** Draw a hi-fi button */
  drawButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    options?: {
      bg?: string;
      border?: string;
      textColor?: string;
      fontSize?: number;
      radius?: number;
      glow?: string;
      icon?: string;
    },
  ) {
    const {
      bg = "rgba(20, 25, 50, 0.9)",
      border = "rgba(80, 100, 160, 0.6)",
      textColor = "#ffffff",
      fontSize = 12,
      radius = 6,
      glow,
      icon,
    } = options || {};

    this.ctx.save();
    if (glow) {
      this.ctx.shadowColor = glow;
      this.ctx.shadowBlur = 10;
    }

    // Button background with gradient
    const grad = this.ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, this.darkenColor(bg, 0.3));
    this.drawRoundedRect(x, y, w, h, radius, "transparent");
    this.ctx.save();
    this.roundedRectPath(x, y, w, h, radius);
    this.ctx.clip();
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, h);
    // Top shine
    const shine = this.ctx.createLinearGradient(x, y, x, y + h * 0.5);
    shine.addColorStop(0, "rgba(255,255,255,0.1)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    this.ctx.fillStyle = shine;
    this.ctx.fillRect(x, y, w, h * 0.5);
    this.ctx.restore();

    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;

    // Border
    this.drawRoundedRectStroke(x, y, w, h, radius, border, 1.5);

    // Label text
    const textX = icon ? x + w / 2 + 4 : x + w / 2;
    this.ctx.font = `bold ${fontSize}px 'Orbitron', monospace`;
    this.ctx.fillStyle = textColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(label, textX, y + h / 2 + 1);

    this.ctx.restore();
  }

  /** Utility: hex color to rgba string */
  hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Utility: darken a color */
  private darkenColor(color: string, amount: number): string {
    if (color.startsWith("rgba")) {
      return color.replace(
        /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/,
        (_, r, g, b, a) => {
          const nr = Math.max(0, Math.round(parseInt(r) * (1 - amount)));
          const ng = Math.max(0, Math.round(parseInt(g) * (1 - amount)));
          const nb = Math.max(0, Math.round(parseInt(b) * (1 - amount)));
          return `rgba(${nr},${ng},${nb},${a})`;
        },
      );
    }
    return color;
  }
}

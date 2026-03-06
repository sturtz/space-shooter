import { Vec2 } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private shakeAmount = 0;
  private shakeDecay = 0.9;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    let w = window.innerWidth;
    let h = window.innerHeight;
    if (w / h > aspect) {
      w = h * aspect;
    } else {
      h = w / aspect;
    }
    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
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
      // Frame-rate independent decay: normalize to 60fps baseline
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
}

import { Vec2 } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private shakeAmount = 0;
  private shakeDecay = 0.9;

  // ── Caches ──────────────────────────────────────────────────
  /** Font string cache — avoids 30+ template-literal allocations per frame */
  private fontCache = new Map<string, string>();
  /** Glow halo texture cache — keyed by "color|innerR|outerR" → offscreen canvas */
  private glowCache = new Map<
    string,
    { canvas: OffscreenCanvas | HTMLCanvasElement; size: number }
  >();

  /** Device pixel ratio — set once at init, updated on resize */
  private dpr = 1;

  /** Pixel offset of the game area within the full-viewport canvas (for input mapping) */
  gameOffsetX = 0;
  gameOffsetY = 0;
  /** CSS display scale of the game area (game-coords → CSS pixels) */
  gameScale = 1;

  // ── Camera (world-space zoom + follow) ──────────────────────────
  /** Camera center in world coordinates */
  cameraX = GAME_WIDTH / 2;
  cameraY = GAME_HEIGHT / 2;
  /** 1.0 = see full 1200×800; 1.5 = zoomed in, see ~800×533 */
  cameraZoom = 1.0;
  /** Whether the camera transform is currently active (between beginFrame/endFrame) */
  private cameraActive = false;
  /** Base transform set by resize() — stored so pushScreenSpace can restore it */
  private baseTransform: DOMMatrix | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× to avoid VRAM issues
    this.dpr = dpr;

    // Canvas fills the entire viewport for edge-to-edge touch
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // Physical pixel buffer = full viewport × dpr
    this.canvas.width = Math.round(vpW * dpr);
    this.canvas.height = Math.round(vpH * dpr);

    // CSS display size = full viewport
    this.canvas.style.width = `${vpW}px`;
    this.canvas.style.height = `${vpH}px`;

    // Compute the largest 1200×800 area that fits, centered within the viewport
    const aspect = GAME_WIDTH / GAME_HEIGHT; // 1.5
    let gameW = vpW;
    let gameH = vpW / aspect;
    if (gameH > vpH) {
      gameH = vpH;
      gameW = vpH * aspect;
    }

    // Offset to center the game area
    const offsetX = (vpW - gameW) / 2;
    const offsetY = (vpH - gameH) / 2;

    // Store for input coordinate mapping
    this.gameOffsetX = offsetX;
    this.gameOffsetY = offsetY;
    this.gameScale = gameW / GAME_WIDTH;

    // Scale context: translate to center, then scale game coords → physical pixels
    const scaleX = (gameW * dpr) / GAME_WIDTH;
    const scaleY = (gameH * dpr) / GAME_HEIGHT;
    const txPx = offsetX * dpr;
    const tyPx = offsetY * dpr;
    this.ctx.setTransform(scaleX, 0, 0, scaleY, txPx, tyPx);
    // Store the base transform so pushScreenSpace() can restore it without calling resize()
    this.baseTransform = this.ctx.getTransform();

    this.ctx.imageSmoothingEnabled = false;
  }

  shake(amount: number) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  beginFrame(dt: number = 1 / 60) {
    // Always re-apply the base transform before saving — this ensures that if a
    // resize() happened mid-frame (between save/restore), we start from the
    // correct base rather than the stale transform that restore() popped back to.
    if (this.baseTransform) {
      this.ctx.setTransform(this.baseTransform);
    }
    this.ctx.save();

    // Clip to the logical game area — prevents any rendering from leaking into
    // the viewport region outside the 1200×800 game bounds (letter-box margins).
    this.ctx.beginPath();
    this.ctx.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.ctx.clip();

    // Clear the entire logical area (need to clear wider when zoomed in)
    if (this.cameraZoom > 1) {
      // Clear a region large enough to cover the full canvas regardless of camera
      this.ctx.clearRect(-GAME_WIDTH, -GAME_HEIGHT, GAME_WIDTH * 3, GAME_HEIGHT * 3);
    } else {
      this.ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    if (this.shakeAmount > 0.5) {
      const sx = (Math.random() - 0.5) * this.shakeAmount * 2;
      const sy = (Math.random() - 0.5) * this.shakeAmount * 2;
      this.ctx.translate(sx, sy);
      this.shakeAmount *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeAmount = 0;
    }

    // Apply camera zoom + follow
    if (this.cameraZoom > 1) {
      const vw = GAME_WIDTH / this.cameraZoom;
      const vh = GAME_HEIGHT / this.cameraZoom;
      // Clamp camera so it doesn't show outside the world
      const cx = Math.max(vw / 2, Math.min(GAME_WIDTH - vw / 2, this.cameraX));
      const cy = Math.max(vh / 2, Math.min(GAME_HEIGHT - vh / 2, this.cameraY));
      // Translate so camera center maps to screen center, then zoom
      this.ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      this.ctx.scale(this.cameraZoom, this.cameraZoom);
      this.ctx.translate(-cx, -cy);
      this.cameraActive = true;
    } else {
      this.cameraActive = false;
    }
  }

  endFrame() {
    this.cameraActive = false;
    this.ctx.restore();
  }

  /**
   * Push a screen-space context — removes camera transform so UI elements
   * render at fixed positions (0,0 = top-left of 1200×800 logical space).
   * Must be paired with popScreenSpace().
   */
  pushScreenSpace() {
    this.ctx.save();
    if (this.cameraActive && this.baseTransform) {
      // Reset to the base viewport transform (no camera zoom/offset)
      this.ctx.setTransform(this.baseTransform);
    }
  }

  /** Restore the camera transform after screen-space rendering. */
  popScreenSpace() {
    this.ctx.restore();
  }

  /**
   * Convert CSS client coordinates to game-logical coordinates (0..GAME_WIDTH, 0..GAME_HEIGHT).
   * Replaces the duplicated `getScaledCoords` closures in Game.ts, MenuScreen.ts, UpgradeScreen.ts.
   */
  screenToGame(clientX: number, clientY: number): { mx: number; my: number } {
    return {
      mx: (clientX - this.gameOffsetX) / this.gameScale,
      my: (clientY - this.gameOffsetY) / this.gameScale,
    };
  }

  /**
   * Convert screen-space coordinates (in game logical coords, post-viewport mapping)
   * to world-space coordinates accounting for camera zoom + position.
   * Use this for input mapping (touch/mouse → world position).
   */
  screenToWorld(screenX: number, screenY: number): { worldX: number; worldY: number } {
    if (this.cameraZoom <= 1) {
      return { worldX: screenX, worldY: screenY };
    }
    const vw = GAME_WIDTH / this.cameraZoom;
    const vh = GAME_HEIGHT / this.cameraZoom;
    const cx = Math.max(vw / 2, Math.min(GAME_WIDTH - vw / 2, this.cameraX));
    const cy = Math.max(vh / 2, Math.min(GAME_HEIGHT - vh / 2, this.cameraY));
    // screenX is in 0..GAME_WIDTH logical space
    // The camera maps world region [cx-vw/2..cx+vw/2] to [0..GAME_WIDTH]
    const worldX = cx - vw / 2 + (screenX / GAME_WIDTH) * vw;
    const worldY = cy - vh / 2 + (screenY / GAME_HEIGHT) * vh;
    return { worldX, worldY };
  }

  drawCircle(pos: Vec2, radius: number, color: string) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawCircleStroke(pos: Vec2, radius: number, color: string, lineWidth: number = 1) {
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

  drawRectStroke(x: number, y: number, w: number, h: number, color: string, lineWidth: number = 1) {
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
    baseline: CanvasTextBaseline = "top"
  ) {
    this.ctx.font = this.getFont(size);
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
    baseline: CanvasTextBaseline = "top"
  ) {
    this.ctx.font = this.getFont(size);
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.strokeStyle = outlineColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }

  measureText(text: string, size: number = 14): number {
    this.ctx.font = this.getFont(size);
    return this.ctx.measureText(text).width;
  }

  // ======= Hi-Fi Drawing Helpers =======

  /** Draw text using Tektur (title font loaded via Google Fonts) */
  drawTitleText(
    text: string,
    x: number,
    y: number,
    color: string,
    size: number,
    align: CanvasTextAlign = "center",
    baseline: CanvasTextBaseline = "middle"
  ) {
    this.ctx.font = this.getFont(size, true);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(text, x, y);
  }

  /** Draw text with Tektur + outline */
  drawTitleTextOutline(
    text: string,
    x: number,
    y: number,
    color: string,
    outlineColor: string,
    size: number,
    align: CanvasTextAlign = "center",
    baseline: CanvasTextBaseline = "middle"
  ) {
    this.ctx.font = this.getFont(size, true);
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
  drawRoundedRect(x: number, y: number, w: number, h: number, r: number, color: string) {
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
    lineWidth: number = 1
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
    radius: number = -1
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
    alpha: number = 0.3
  ) {
    if (glowRadius <= 0) glowRadius = radius * 2;
    const grad = this.ctx.createRadialGradient(
      pos.x,
      pos.y,
      radius * 0.3,
      pos.x,
      pos.y,
      glowRadius
    );
    grad.addColorStop(0, color);
    grad.addColorStop(
      0.4,
      color.replace(/[\d.]+\)$/, `${alpha * 0.5})`).includes("rgba")
        ? color
        : this.hexToRgba(color, alpha * 0.5)
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
    }
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
    }
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
    this.ctx.font = this.getFont(fontSize, true);
    this.ctx.fillStyle = textColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(label, textX, y + h / 2 + 1);

    this.ctx.restore();
  }

  // ── Cache helpers ───────────────────────────────────────────

  /** Get a cached font string — avoids template literal allocation per call */
  getFont(size: number, bold = false): string {
    const key = bold ? `b${size}` : `${size}`;
    let f = this.fontCache.get(key);
    if (!f) {
      f = bold ? `bold ${size}px Tektur` : `${size}px Tektur`;
      this.fontCache.set(key, f);
    }
    return f;
  }

  /**
   * Get a cached glow halo texture (offscreen canvas with pre-rendered radial gradient).
   * Returns the canvas and its pixel size. Draw it centered on the entity with drawImage.
   * Halo is centered in the canvas at (size/2, size/2).
   */
  getGlowHalo(
    color: string,
    innerRadius: number,
    outerRadius: number,
    midColor?: string
  ): { canvas: OffscreenCanvas | HTMLCanvasElement; size: number } {
    // Quantize radii to nearest int to keep cache small
    const ir = Math.round(innerRadius);
    const or = Math.round(outerRadius);
    const key = `${color}|${ir}|${or}|${midColor ?? ""}`;
    let entry = this.glowCache.get(key);
    if (!entry) {
      const size = or * 2 + 2; // +2 for rounding safety
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(size, size);
      } else {
        canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
      }
      const gCtx = canvas.getContext("2d")!;
      const cx = size / 2;
      const grad = (gCtx as CanvasRenderingContext2D).createRadialGradient(cx, cx, ir, cx, cx, or);
      grad.addColorStop(0, color);
      if (midColor) {
        grad.addColorStop(0.5, midColor);
      }
      grad.addColorStop(1, "rgba(0,0,0,0)");
      (gCtx as CanvasRenderingContext2D).fillStyle = grad;
      (gCtx as CanvasRenderingContext2D).beginPath();
      (gCtx as CanvasRenderingContext2D).arc(cx, cx, or, 0, Math.PI * 2);
      (gCtx as CanvasRenderingContext2D).fill();
      entry = { canvas, size };
      this.glowCache.set(key, entry);
    }
    return entry;
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
      return color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/, (_, r, g, b, a) => {
        const nr = Math.max(0, Math.round(parseInt(r) * (1 - amount)));
        const ng = Math.max(0, Math.round(parseInt(g) * (1 - amount)));
        const nb = Math.max(0, Math.round(parseInt(b) * (1 - amount)));
        return `rgba(${nr},${ng},${nb},${a})`;
      });
    }
    return color;
  }
}

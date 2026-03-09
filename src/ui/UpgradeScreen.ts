import { Renderer } from "../rendering/Renderer";
import {
  UPGRADE_TREE,
  UpgradeNode,
  getUpgradeCost,
  getParentNode,
  BRANCH_ANGLES,
  BRANCH_COLORS,
} from "../upgrades/UpgradeTree";
import { saveGame, clearSave, getDefaultSave } from "../utils/SaveManager";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { PlayerImages, imageReady } from "../utils/Assets";
import type { ScreenManager } from "../game/ScreenManager";

interface ClickableArea {
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

interface ShakeAnim {
  nodeId: string;
  timer: number;
}

interface NodePos {
  x: number;
  y: number;
}

/* ── tiny sparkle particles on maxed nodes ── */
interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

/* ── purchase flash ── */
interface PurchaseFlash {
  nodeId: string;
  timer: number;
  maxTimer: number;
  color: string;
}

export class UpgradeScreen {
  renderer: Renderer;
  manager: ScreenManager;
  clickables: ClickableArea[] = [];
  hoveredNode: UpgradeNode | null = null;
  nodePositions: Map<string, NodePos> = new Map();
  tooltip: { node: UpgradeNode; x: number; y: number } | null = null;
  cantAffordShake: ShakeAnim | null = null;
  cantAffordMessage: { text: string; timer: number } | null = null;
  iconImages: Map<string, HTMLImageElement> = new Map();

  readonly CX = GAME_WIDTH / 2;
  readonly CY = GAME_HEIGHT / 2 - 20;
  readonly DEPTH_SPACING = 120;
  readonly NODE_RADIUS = 22;
  readonly BRANCH_SPREAD = 0.3;

  time = 0;
  private sparkles: Sparkle[] = [];
  private purchaseFlash: PurchaseFlash | null = null;
  private connectionDashOffset = 0;

  panX = 0;
  panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private panMoved = 0;

  private mouseX = 0;
  private mouseY = 0;
  private touchActive = false;

  constructor(renderer: Renderer, manager: ScreenManager) {
    this.renderer = renderer;
    this.manager = manager;
    this.computeNodePositions();
    this.preloadIcons();

    const canvas = renderer.canvas;

    const getScaledCoords = (clientX: number, clientY: number) => {
      return {
        mx: (clientX - this.renderer.gameOffsetX) / this.renderer.gameScale,
        my: (clientY - this.renderer.gameOffsetY) / this.renderer.gameScale,
      };
    };

    canvas.addEventListener("click", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      this.handleClick(mx, my);
    });

    canvas.addEventListener("mousemove", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      this.mouseX = mx;
      this.mouseY = my;
    });

    canvas.addEventListener("mousedown", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      this.beginPan(mx, my);
    });
    canvas.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        const { mx, my } = getScaledCoords(e.clientX, e.clientY);
        this.updatePan(mx, my);
      }
    });
    canvas.addEventListener("mouseup", () => {
      this.endPan();
    });

    canvas.addEventListener(
      "touchstart",
      (e) => {
        const touch = e.touches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        this.beginPan(mx, my);
        this.touchActive = true;
        this.mouseX = mx;
        this.mouseY = my;
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        this.updatePan(mx, my);
        this.mouseX = mx;
        this.mouseY = my;
      },
      { passive: false }
    );
    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        this.endPan();
        this.touchActive = false;
        this.handleClick(mx, my);
      },
      { passive: false }
    );
  }

  get upgrades() {
    return this.manager.upgrades;
  }

  preloadIcons() {
    for (const node of UPGRADE_TREE) {
      if (node.iconPath && !this.iconImages.has(node.iconPath)) {
        const img = new Image();
        img.src = node.iconPath;
        this.iconImages.set(node.iconPath, img);
      }
    }
  }

  refresh() {
    this.clickables = [];
    this.hoveredNode = null;
    this.tooltip = null;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panMoved = 0;
    this.computeNodePositions();
  }

  beginPan(mx: number, my: number) {
    this.isPanning = true;
    this.panStartX = mx;
    this.panStartY = my;
    this.panStartPanX = this.panX;
    this.panStartPanY = this.panY;
    this.panMoved = 0;
  }

  updatePan(mx: number, my: number) {
    if (!this.isPanning) return;
    const dx = mx - this.panStartX;
    const dy = my - this.panStartY;
    this.panMoved = Math.sqrt(dx * dx + dy * dy);
    const margin = 50;
    const minX = -(this.CX - margin);
    const maxX = GAME_WIDTH - this.CX - margin;
    const minY = -(this.CY - margin);
    const maxY = GAME_HEIGHT - this.CY - margin;
    this.panX = Math.max(minX, Math.min(maxX, this.panStartPanX + dx));
    this.panY = Math.max(minY, Math.min(maxY, this.panStartPanY + dy));
  }

  endPan() {
    this.isPanning = false;
  }

  private hasDragged(): boolean {
    return this.panMoved > 8;
  }

  computeNodePositions() {
    this.nodePositions.clear();
    this.nodePositions.set("root", { x: this.CX, y: this.CY });

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      const branchAngle = BRANCH_ANGLES[node.branch];
      const dist = node.depth * this.DEPTH_SPACING;
      const offsetAngle = node.angleOffset * this.BRANCH_SPREAD;
      const finalAngle = branchAngle + offsetAngle;
      this.nodePositions.set(node.id, {
        x: this.CX + Math.cos(finalAngle) * dist,
        y: this.CY + Math.sin(finalAngle) * dist,
      });
    }
  }

  private isParentMaxed(node: UpgradeNode): boolean {
    if (!node.requires || node.requires.length === 0) return true;
    const req = node.requires[0];
    return this.upgrades.getLevel(req.id) >= req.level;
  }

  handleClick(mx: number, my: number) {
    const dragged = this.hasDragged();
    this.panMoved = 0;
    if (dragged) return;

    for (const area of this.clickables) {
      if (mx >= area.x && mx <= area.x + area.w && my >= area.y && my <= area.y + area.h) {
        area.action();
        saveGame(this.upgrades.save);
        return;
      }
    }

    const wmx = mx - this.panX;
    const wmy = my - this.panY;

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      if (!this.isParentMaxed(node)) continue;
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      const dx = wmx - pos.x;
      const dy = wmy - pos.y;
      const hitRadius = this.NODE_RADIUS * 1.8;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        this.tryPurchaseNode(node);
        return;
      }
    }
  }

  tryPurchaseNode(node: UpgradeNode) {
    if (this.upgrades.purchaseUpgrade(node)) {
      saveGame(this.upgrades.save);
      this.manager.audio?.playUpgrade();

      // Purchase flash effect
      this.purchaseFlash = {
        nodeId: node.id,
        timer: 0.6,
        maxTimer: 0.6,
        color: BRANCH_COLORS[node.branch],
      };

      // Spawn celebration sparkles
      const pos = this.nodePositions.get(node.id);
      if (pos) {
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
          const speed = 30 + Math.random() * 50;
          this.sparkles.push({
            x: pos.x,
            y: pos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.5 + Math.random() * 0.4,
            maxLife: 0.9,
            size: 1.5 + Math.random() * 2,
          });
        }
      }

      if (node.id === "dmg_overclock" && this.manager.audio) {
        const audio = this.manager.audio;
        if (audio.track !== "chill") {
          audio.switchTrack("chill");
          this.manager.save.musicTrack = "chill";
          saveGame(this.manager.save);
        }
      }
    } else {
      this.manager.audio?.playError();
      this.cantAffordShake = { nodeId: node.id, timer: 0.3 };
      const level = this.upgrades.getLevel(node.id);
      const maxed = level >= node.maxLevel;
      if (maxed) {
        this.cantAffordMessage = { text: "Already maxed!", timer: 1.5 };
      } else if (!this.upgrades.isUnlocked(node)) {
        this.cantAffordMessage = {
          text: `Locked — need: ${this.getRequirementText(node)}`,
          timer: 1.5,
        };
      } else {
        const cost = getUpgradeCost(node, level);
        this.cantAffordMessage = {
          text: `Not enough coins! Need ${cost}`,
          timer: 1.5,
        };
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    this.connectionDashOffset += dt * 12;

    if (this.cantAffordShake && this.cantAffordShake.timer > 0) {
      this.cantAffordShake.timer -= dt;
      if (this.cantAffordShake.timer <= 0) this.cantAffordShake = null;
    }
    if (this.cantAffordMessage && this.cantAffordMessage.timer > 0) {
      this.cantAffordMessage.timer -= dt;
      if (this.cantAffordMessage.timer <= 0) this.cantAffordMessage = null;
    }
    if (this.purchaseFlash && this.purchaseFlash.timer > 0) {
      this.purchaseFlash.timer -= dt;
      if (this.purchaseFlash.timer <= 0) this.purchaseFlash = null;
    }

    // Update sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
      if (s.life <= 0) this.sparkles.splice(i, 1);
    }

    // Spawn ambient sparkles on maxed nodes
    if (Math.random() < dt * 3) {
      for (const node of UPGRADE_TREE) {
        if (node.id === "root") continue;
        const level = this.upgrades.getLevel(node.id);
        if (level < node.maxLevel) continue;
        if (Math.random() > 0.08) continue;
        const pos = this.nodePositions.get(node.id);
        if (!pos) continue;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * this.NODE_RADIUS * 0.6;
        this.sparkles.push({
          x: pos.x + Math.cos(angle) * dist,
          y: pos.y + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 15,
          vy: -10 - Math.random() * 20,
          life: 0.6 + Math.random() * 0.6,
          maxLife: 1.2,
          size: 1 + Math.random() * 1.5,
        });
      }
    }
  }

  render(dt: number = 1 / 60) {
    this.clickables = [];
    const renderer = this.renderer;
    const ctx = renderer.ctx;

    renderer.beginFrame(dt);

    // Subtle dark vignette overlay — lets cosmic bg shine through
    this.renderBackdrop(ctx);

    // Header
    this.renderHeader(renderer, ctx);

    // Pan offset for world-space tree
    ctx.save();
    ctx.translate(this.panX, this.panY);
    this.renderConnections(ctx);
    this.renderNodes(renderer, ctx);
    this.renderSparkles(ctx);
    ctx.restore();

    // Tooltip (screen-space)
    this.renderTooltip(renderer, ctx);

    // Bottom bar
    this.renderBottomBar(renderer, ctx);

    // Can't-afford message
    this.renderCantAffordMessage(renderer, ctx);

    renderer.endFrame();
  }

  /* ────────────────────────────────────────────
   *  BACKDROP — soft vignette over cosmic bg
   * ──────────────────────────────────────────── */
  private renderBackdrop(ctx: CanvasRenderingContext2D) {
    // Very subtle dark wash — most of the cosmic bg shows through
    ctx.fillStyle = "rgba(4, 4, 14, 0.45)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Radial vignette — darker at edges, lighter at center where tree is
    const vignette = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.2,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.7
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.6, "rgba(0,0,0,0.15)");
    vignette.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  /* ────────────────────────────────────────────
   *  HEADER — title + currency bar
   * ──────────────────────────────────────────── */
  private renderHeader(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    // Frosted top strip
    const stripH = 52;
    const grad = ctx.createLinearGradient(0, 0, 0, stripH);
    grad.addColorStop(0, "rgba(6, 8, 22, 0.8)");
    grad.addColorStop(0.7, "rgba(6, 8, 22, 0.5)");
    grad.addColorStop(1, "rgba(6, 8, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GAME_WIDTH, stripH);

    // Thin accent line at bottom of strip
    ctx.strokeStyle = "rgba(0, 180, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stripH - 1);
    ctx.lineTo(GAME_WIDTH, stripH - 1);
    ctx.stroke();

    // Title
    ctx.save();
    ctx.font = "bold 16px Tektur";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Glow
    ctx.shadowColor = "rgba(0, 200, 255, 0.4)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.player;
    ctx.fillText("UPGRADE STATION", GAME_WIDTH / 2, 64);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.restore();

    // Currency chips
    const chipY = 35 + 64;
    const chipH = 16;
    const chipR = 8;

    // Coins chip
    const coinsText = `${this.upgrades.save.coins}`;
    ctx.save();
    ctx.font = "bold 10px Tektur";
    const coinsW = ctx.measureText(coinsText).width + 32;
    const coinsX = GAME_WIDTH / 2 - coinsW - 50;
    this.drawChip(
      ctx,
      coinsX,
      chipY,
      coinsW,
      chipH,
      chipR,
      "rgba(255,200,0,0.12)",
      "rgba(255,200,0,0.3)"
    );
    ctx.font = "bold 10px Tektur";
    ctx.fillStyle = "#ffcc00";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("💰", coinsX + 6, chipY + chipH / 2);
    ctx.fillStyle = COLORS.textGold;
    ctx.fillText(coinsText, coinsX + 22, chipY + chipH / 2);
    ctx.restore();

    // Stars chip
    const starsText = `${this.upgrades.save.starCoins ?? 0}`;
    ctx.save();
    ctx.font = "bold 10px Tektur";
    const starsW = ctx.measureText(starsText).width + 32;
    const starsX = GAME_WIDTH / 2 - 20;
    this.drawChip(
      ctx,
      starsX,
      chipY,
      starsW,
      chipH,
      chipR,
      "rgba(170,130,255,0.12)",
      "rgba(170,130,255,0.3)"
    );
    ctx.font = "bold 10px Tektur";
    ctx.fillStyle = "#bb88ff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐", starsX + 6, chipY + chipH / 2);
    ctx.fillStyle = "#bb88ff";
    ctx.fillText(starsText, starsX + 22, chipY + chipH / 2);
    ctx.restore();

    // Level chip
    const lvlText = `LV ${this.upgrades.save.currentLevel ?? 1}`;
    ctx.save();
    ctx.font = "bold 10px Tektur";
    const lvlW = ctx.measureText(lvlText).width + 18;
    const lvlX = GAME_WIDTH / 2 + 50;
    this.drawChip(
      ctx,
      lvlX,
      chipY,
      lvlW,
      chipH,
      chipR,
      "rgba(0,180,255,0.12)",
      "rgba(0,180,255,0.3)"
    );
    ctx.font = "bold 10px Tektur";
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(lvlText, lvlX + 8, chipY + chipH / 2);
    ctx.restore();
  }

  /** Draw a small pill-shaped chip */
  private drawChip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    bg: string,
    border: string
  ) {
    this.renderer.roundedRectPath(x, y, w, h, r);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ────────────────────────────────────────────
   *  CONNECTIONS — luminous constellation lines
   * ──────────────────────────────────────────── */
  renderConnections(ctx: CanvasRenderingContext2D) {
    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      const childPos = this.nodePositions.get(node.id);
      if (!childPos) continue;
      const parent = getParentNode(node);
      if (!parent) continue;
      const parentPos = this.nodePositions.get(parent.id);
      if (!parentPos) continue;
      if (!this.isParentMaxed(node)) continue;

      const level = this.upgrades.getLevel(node.id);
      const branchColor = BRANCH_COLORS[node.branch];

      if (level > 0) {
        // Purchased path — solid luminous line with glow
        ctx.save();
        ctx.shadowColor = branchColor;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = this.renderer.hexToRgba(branchColor, 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Bright core line
        ctx.strokeStyle = this.renderer.hexToRgba(branchColor, 0.25);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
      } else {
        // Available but unpurchased — animated dashed line
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -this.connectionDashOffset;
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  renderBranchLabels(_renderer: Renderer) {
    // Intentionally empty — labels are integrated into tooltip
  }

  /* ────────────────────────────────────────────
   *  NODES — glowing constellation orbs
   * ──────────────────────────────────────────── */
  renderNodes(_renderer: Renderer, ctx: CanvasRenderingContext2D) {
    for (const node of UPGRADE_TREE) {
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      if (node.id !== "root" && !this.isParentMaxed(node)) continue;

      const level = this.upgrades.getLevel(node.id);
      const unlocked = this.upgrades.isUnlocked(node);
      const maxed = level >= node.maxLevel;
      const cost = maxed ? 0 : getUpgradeCost(node, level);
      const canBuy = unlocked && !maxed && this.upgrades.canAfford(cost);
      const isRoot = node.id === "root";
      const branchColor = BRANCH_COLORS[node.branch];

      const r = isRoot ? this.NODE_RADIUS + 6 : this.NODE_RADIUS;

      // Gentle float animation
      const nodeIdx = UPGRADE_TREE.indexOf(node);
      const phase = nodeIdx * 1.3;
      const bobAmp = isRoot ? 2.5 : 1.5;
      const bobSpeed = isRoot ? 1.0 : 0.8 + (nodeIdx % 3) * 0.12;
      const bobY = Math.sin(this.time * bobSpeed + phase) * bobAmp;
      const bobX = Math.cos(this.time * bobSpeed * 0.6 + phase) * bobAmp * 0.4;

      // Shake on failed purchase
      let shakeX = 0;
      let shakeY = 0;
      if (this.cantAffordShake && this.cantAffordShake.nodeId === node.id) {
        const intensity = this.cantAffordShake.timer * 20;
        shakeX = (Math.random() - 0.5) * intensity;
        shakeY = (Math.random() - 0.5) * intensity;
      }

      const nx = pos.x + shakeX + bobX;
      const ny = pos.y + shakeY + bobY;

      const pulse = (Math.sin(this.time * 2.0 + phase) + 1) / 2;

      // Purchase flash overlay
      let hasFlash = false;
      let flashAlpha = 0;
      if (this.purchaseFlash && this.purchaseFlash.nodeId === node.id) {
        flashAlpha = this.purchaseFlash.timer / this.purchaseFlash.maxTimer;
        hasFlash = true;
      }

      /* ── ROOT NODE ── */
      if (isRoot) {
        this.renderRootNode(ctx, nx, ny, r, pulse, hasFlash, flashAlpha);
        continue;
      }

      /* ── REGULAR NODES ── */

      // Outer glow aura (varies by state)
      ctx.save();
      if (maxed) {
        // Gold aura
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.5, nx, ny, r * 2.2);
        auraGrad.addColorStop(0, `rgba(255, 210, 0, ${0.08 + pulse * 0.06})`);
        auraGrad.addColorStop(0.5, `rgba(255, 180, 0, ${0.03 + pulse * 0.03})`);
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (canBuy) {
        // White breathing aura for purchasable
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.6, nx, ny, r * 1.8);
        auraGrad.addColorStop(0, `rgba(255, 255, 255, ${0.06 + pulse * 0.08})`);
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (level > 0) {
        // Branch-colored soft aura for partially purchased
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.5, nx, ny, r * 1.6);
        auraGrad.addColorStop(0, this.renderer.hexToRgba(branchColor, 0.06 + pulse * 0.04));
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Node body — dark disc with inner gradient
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(nx, ny - r * 0.3, 0, nx, ny, r);
      if (maxed) {
        bodyGrad.addColorStop(0, "rgba(40, 35, 15, 0.95)");
        bodyGrad.addColorStop(1, "rgba(15, 12, 5, 0.95)");
      } else if (level > 0) {
        bodyGrad.addColorStop(0, "rgba(20, 20, 40, 0.92)");
        bodyGrad.addColorStop(1, "rgba(8, 8, 18, 0.95)");
      } else {
        bodyGrad.addColorStop(0, "rgba(15, 15, 30, 0.9)");
        bodyGrad.addColorStop(1, "rgba(6, 6, 14, 0.92)");
      }
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.restore();

      // Ring / progress arc
      if (maxed) {
        // Gold hexagonal border
        ctx.save();
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 8 + pulse * 6;
        this.drawHexagon(ctx, nx, ny, r + 1, "transparent", "#ffd700", 1.5);
        ctx.restore();
      } else if (level > 0) {
        // Progress arc — branch color, partial fill
        const progressRatio = level / node.maxLevel;
        const progressAngle = progressRatio * Math.PI * 2;

        // Background ring (dim)
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();

        // Filled arc
        ctx.save();
        ctx.shadowColor = branchColor;
        ctx.shadowBlur = 4 + pulse * 4;
        ctx.strokeStyle = branchColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(nx, ny, r, -Math.PI / 2, -Math.PI / 2 + progressAngle);
        ctx.stroke();
        ctx.restore();
      } else if (canBuy) {
        // Pulsing white ring — "buy me!"
        ctx.save();
        ctx.shadowColor = "rgba(255,255,255,0.6)";
        ctx.shadowBlur = 4 + pulse * 8;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (unlocked) {
        // Dim red ring — can't afford
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.25 + pulse * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Very dim ring — locked
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Icon
      const iconAlpha = maxed ? 1.0 : level > 0 ? 0.85 : canBuy ? 0.7 : unlocked ? 0.4 : 0.2;
      ctx.save();
      ctx.globalAlpha = iconAlpha;
      const svgImg = node.iconPath ? this.iconImages.get(node.iconPath) : null;
      if (svgImg && svgImg.complete && svgImg.naturalWidth > 0) {
        const iconSize = r * 1.4;
        ctx.drawImage(svgImg, nx - iconSize / 2, ny - iconSize / 2, iconSize, iconSize);
      } else {
        ctx.font = "12px Tektur";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.icon, nx, ny);
      }
      ctx.restore();

      // Purchase flash overlay
      if (hasFlash) {
        ctx.save();
        ctx.globalAlpha = flashAlpha * 0.6;
        ctx.beginPath();
        ctx.arc(nx, ny, r * (1 + (1 - flashAlpha) * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = this.purchaseFlash!.color;
        ctx.fill();
        ctx.restore();
      }

      // Level badge (below node)
      if (level > 0) {
        const lvlText = maxed ? "MAX" : `${level}/${node.maxLevel}`;
        ctx.save();
        ctx.font = "bold 7px Tektur";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        if (maxed) {
          ctx.fillStyle = "#ffd700";
        } else {
          ctx.fillStyle = branchColor;
        }
        ctx.fillText(lvlText, nx, ny + r + 5);
        ctx.restore();
      }

      // Cost badge (below node, for unpurchased affordable nodes)
      if (level === 0 && canBuy) {
        ctx.save();
        ctx.font = "bold 7px Tektur";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255, 200, 0, 0.7)";
        ctx.fillText(`${cost}💰`, nx, ny + r + 5);
        ctx.restore();
      }
    }
  }

  /* ── Root node — player sprite with energy ring ── */
  private renderRootNode(
    ctx: CanvasRenderingContext2D,
    nx: number,
    ny: number,
    r: number,
    pulse: number,
    hasFlash: boolean,
    flashAlpha: number
  ) {
    // Cyan energy aura
    const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.3, nx, ny, r * 2.5);
    auraGrad.addColorStop(0, `rgba(0, 200, 255, ${0.1 + pulse * 0.08})`);
    auraGrad.addColorStop(0.4, `rgba(0, 140, 255, ${0.04 + pulse * 0.03})`);
    auraGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(nx, ny, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Rotating ring segments
    ctx.save();
    ctx.strokeStyle = `rgba(0, 200, 255, ${0.2 + pulse * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const segAngle = this.time * 0.5 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(nx, ny, r + 4, segAngle, segAngle + Math.PI * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    // Dark backdrop
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(5, 10, 20, 0.85)";
    ctx.fill();

    // Player sprite
    const sprite = imageReady(PlayerImages.glider) ? PlayerImages.glider : null;
    ctx.save();
    if (sprite) {
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 10 + pulse * 8;
      const spriteSize = r * 2;
      ctx.drawImage(sprite, nx - spriteSize / 2, ny - spriteSize / 2, spriteSize, spriteSize);
    } else {
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 10;
      ctx.fillStyle = COLORS.player;
      ctx.font = "bold 18px Tektur";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⬡", nx, ny);
    }
    ctx.restore();

    if (hasFlash) {
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.4;
      ctx.beginPath();
      ctx.arc(nx, ny, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.player;
      ctx.fill();
      ctx.restore();
    }
  }

  /* ────────────────────────────────────────────
   *  SPARKLES — tiny glowing particles
   * ──────────────────────────────────────────── */
  private renderSparkles(ctx: CanvasRenderingContext2D) {
    for (const s of this.sparkles) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#ffeedd";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ────────────────────────────────────────────
   *  TOOLTIP — floating info panel
   * ──────────────────────────────────────────── */
  renderTooltip(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice && !this.touchActive) return;

    const wx = this.mouseX - this.panX;
    const wy = this.mouseY - this.panY;

    let closest: UpgradeNode | null = null;
    let closestDist = Infinity;

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      if (!this.isParentMaxed(node)) continue;
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      const dx = wx - pos.x;
      const dy = wy - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.NODE_RADIUS * 2.5 && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    if (!closest) return;

    const level = this.upgrades.getLevel(closest.id);
    const unlocked = this.upgrades.isUnlocked(closest);
    const maxed = level >= closest.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(closest, level);
    const branchColor = BRANCH_COLORS[closest.branch];

    // Panel dimensions
    const panelW = 300;
    const panelH = 72;
    const margin = 20;

    // Position near the node but clamped to screen
    const nodePos = this.nodePositions.get(closest.id)!;
    let panelX = nodePos.x + this.panX + this.NODE_RADIUS + 15;
    let panelY = nodePos.y + this.panY - panelH / 2;

    // Clamp to screen
    if (panelX + panelW > GAME_WIDTH - margin) {
      panelX = nodePos.x + this.panX - this.NODE_RADIUS - panelW - 15;
    }
    panelX = Math.max(margin, Math.min(GAME_WIDTH - panelW - margin, panelX));
    panelY = Math.max(60, Math.min(GAME_HEIGHT - panelH - 50, panelY));

    // Panel background
    renderer.drawPanel(panelX, panelY, panelW, panelH, {
      bg: "rgba(8, 8, 24, 0.92)",
      border: renderer.hexToRgba(branchColor, 0.3),
      radius: 10,
      glow: renderer.hexToRgba(branchColor, 0.1),
      glowBlur: 12,
    });

    // Left accent bar
    ctx.save();
    renderer.roundedRectPath(panelX + 4, panelY + 8, 3, panelH - 16, 2);
    ctx.fillStyle = branchColor;
    ctx.fill();
    ctx.restore();

    // Name
    ctx.save();
    ctx.font = "bold 12px Tektur";
    ctx.fillStyle = branchColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(closest.name, panelX + 14, panelY + 10);
    ctx.restore();

    // Level badge
    ctx.save();
    ctx.font = "bold 10px Tektur";
    ctx.fillStyle = maxed ? "#ffd700" : "rgba(200,210,230,0.6)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${level}/${closest.maxLevel}`, panelX + panelW - 10, panelY + 11);
    ctx.restore();

    // Description
    ctx.save();
    ctx.font = "9px Tektur";
    ctx.fillStyle = "rgba(180, 195, 220, 0.8)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(closest.description, panelX + 14, panelY + 28);
    ctx.restore();

    // Status line
    ctx.save();
    ctx.font = "bold 9px Tektur";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (!unlocked) {
      const reqText = this.getRequirementText(closest);
      ctx.fillStyle = "rgba(180, 80, 80, 0.8)";
      ctx.fillText(`🔒 ${reqText}`, panelX + 14, panelY + 48);
    } else if (maxed) {
      ctx.fillStyle = "#ffd700";
      ctx.fillText("✓ MAXED", panelX + 14, panelY + 48);
    } else {
      const canBuy = this.upgrades.canAfford(cost);
      ctx.fillStyle = canBuy ? COLORS.textGold : "rgba(180, 80, 80, 0.8)";
      ctx.fillText(
        `💰 ${cost}  ·  Tap to ${canBuy ? "buy" : "purchase"}`,
        panelX + 14,
        panelY + 48
      );
    }
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  BOTTOM BAR — action buttons
   * ──────────────────────────────────────────── */
  renderBottomBar(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    // Frosted bottom strip — tall enough for comfortable mobile tapping
    const stripH = 80;
    const stripY = GAME_HEIGHT - stripH;
    const grad = ctx.createLinearGradient(0, stripY, 0, GAME_HEIGHT);
    grad.addColorStop(0, "rgba(6, 8, 22, 0)");
    grad.addColorStop(0.25, "rgba(6, 8, 22, 0.5)");
    grad.addColorStop(0.5, "rgba(6, 8, 22, 0.7)");
    grad.addColorStop(1, "rgba(6, 8, 22, 0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, stripY, GAME_WIDTH, stripH);

    // Thin accent line at top of strip
    ctx.strokeStyle = "rgba(0, 180, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stripY + 1);
    ctx.lineTo(GAME_WIDTH, stripY + 1);
    ctx.stroke();

    const btnY = GAME_HEIGHT - 128;
    const btnH = 44;

    // ── START RUN (center, hero button) ──
    const playBtnW = 260;
    const playBtnX = GAME_WIDTH / 2 - playBtnW / 2;
    const playPulse = (Math.sin(this.time * 2.5) + 1) / 2;

    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    renderer.drawButton(playBtnX, btnY, playBtnW, btnH, "▶  START RUN", {
      bg: "rgba(0, 50, 110, 0.9)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 14,
      radius: 10,
      glow: `rgba(0, 170, 255, ${0.1 + playPulse * 0.1})`,
    });
    ctx.restore();

    this.clickables.push({
      x: playBtnX,
      y: btnY,
      w: playBtnW,
      h: btnH,
      action: () => this.manager.startRunFromUpgrade(),
    });

    // ── RESET (top right corner, small) ──
    const resetBtnW = 70;
    const resetBtnH = 20;
    const resetBtnX = GAME_WIDTH - resetBtnW - 10;
    const resetBtnY = 64;

    renderer.drawButton(resetBtnX, resetBtnY, resetBtnW, resetBtnH, "⟲ RESET", {
      bg: "rgba(30, 6, 6, 0.7)",
      border: "rgba(255, 68, 68, 0.25)",
      textColor: "rgba(255, 80, 80, 0.6)",
      fontSize: 8,
      radius: 5,
    });

    this.clickables.push({
      x: resetBtnX,
      y: resetBtnY,
      w: resetBtnW,
      h: resetBtnH,
      action: () => {
        clearSave();
        const fresh = getDefaultSave();
        Object.assign(this.upgrades.save, fresh);
        this.upgrades.save.upgradeLevels["root"] = 1;
        saveGame(this.upgrades.save);
        this.refresh();
      },
    });

    // ── MENU (right side of bottom bar — inset for mobile) ──
    const menuBtnW = 110;
    const menuBtnX = GAME_WIDTH - menuBtnW - 40;

    renderer.drawButton(menuBtnX, btnY, menuBtnW, btnH, "⌂ MENU", {
      bg: "rgba(10, 10, 35, 0.85)",
      border: "rgba(80, 120, 200, 0.3)",
      textColor: "rgba(100, 160, 255, 0.8)",
      fontSize: 11,
      radius: 8,
    });

    this.clickables.push({
      x: menuBtnX,
      y: btnY,
      w: menuBtnW,
      h: btnH,
      action: () => this.manager.goToMenu(),
    });

    // ── PRESTIGE (left side of bottom bar — inset for mobile) ──
    const pBtnW = 140;
    const pBtnX = 40;
    const canPrestige = this.upgrades.save.highestLevel >= 10;

    if (canPrestige) {
      const pPulse = (Math.sin(this.time * 1.8 + 1) + 1) / 2;
      ctx.save();
      ctx.shadowColor = `rgba(170, 80, 200, ${0.1 + pPulse * 0.1})`;
      ctx.shadowBlur = 8;
      renderer.drawButton(pBtnX, btnY, pBtnW, btnH, "⭐ PRESTIGE", {
        bg: "rgba(30, 10, 35, 0.85)",
        border: `rgba(170, 80, 170, ${0.3 + pPulse * 0.2})`,
        textColor: "#bb66cc",
        fontSize: 11,
        radius: 8,
        glow: "rgba(170, 68, 170, 0.1)",
      });
      ctx.restore();

      this.clickables.push({
        x: pBtnX,
        y: btnY,
        w: pBtnW,
        h: btnH,
        action: () => {
          this.upgrades.prestige();
          saveGame(this.upgrades.save);
          this.refresh();
        },
      });
    } else {
      ctx.save();
      ctx.globalAlpha = 0.3;
      renderer.drawButton(pBtnX, btnY, pBtnW, btnH, "⭐ PRESTIGE", {
        bg: "rgba(10, 10, 10, 0.5)",
        border: "rgba(80, 80, 80, 0.2)",
        textColor: "#444",
        fontSize: 11,
        radius: 8,
      });
      ctx.restore();

      ctx.save();
      ctx.font = "7px Tektur";
      ctx.fillStyle = "rgba(120, 120, 140, 0.5)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `Reach Lv10 (current: ${this.upgrades.save.highestLevel ?? 0})`,
        pBtnX + 4,
        btnY - 3
      );
      ctx.restore();
    }
  }

  /* ────────────────────────────────────────────
   *  CAN'T AFFORD MESSAGE
   * ──────────────────────────────────────────── */
  private renderCantAffordMessage(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    if (!this.cantAffordMessage) return;

    const msgAlpha = Math.min(1, this.cantAffordMessage.timer);
    ctx.save();
    ctx.globalAlpha = msgAlpha;

    const msgW = 280;
    const msgH = 30;
    const msgX = GAME_WIDTH / 2 - msgW / 2;
    const msgY = GAME_HEIGHT / 2 + 100;

    renderer.drawPanel(msgX, msgY, msgW, msgH, {
      bg: "rgba(50, 10, 10, 0.88)",
      border: "rgba(255, 68, 68, 0.4)",
      radius: 8,
    });

    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = "#ff6666";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.cantAffordMessage.text, GAME_WIDTH / 2, msgY + msgH / 2);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  UTILITIES
   * ──────────────────────────────────────────── */

  private drawHexagon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string,
    lineWidth: number
  ) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + r * Math.cos(angle);
      const hy = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  private getRequirementText(node: UpgradeNode): string {
    if (!node.requires) return "";
    return node.requires
      .map((r) => {
        const parent = UPGRADE_TREE.find((n) => n.id === r.id);
        return `${parent?.name || r.id} Lv${r.level}`;
      })
      .join(", ");
  }
}

import { Renderer } from "../rendering/Renderer";
import { UpgradeManager } from "../upgrades/UpgradeManager";
import {
  UPGRADE_TREE,
  UpgradeNode,
  UpgradeBranch,
  getUpgradeCost,
  getParentNode,
  BRANCH_ANGLES,
  BRANCH_COLORS,
} from "../upgrades/UpgradeTree";
import { saveGame, clearSave, getDefaultSave } from "../utils/SaveManager";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { IGame } from "../game/GameInterface";

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

export class UpgradeScreen {
  upgrades: UpgradeManager;
  game: IGame;
  clickables: ClickableArea[] = [];
  hoveredNode: UpgradeNode | null = null;
  nodePositions: Map<string, NodePos> = new Map();
  tooltip: { node: UpgradeNode; x: number; y: number } | null = null;
  cantAffordShake: ShakeAnim | null = null;
  cantAffordMessage: { text: string; timer: number } | null = null;
  /** Preloaded SVG images keyed by iconPath */
  iconImages: Map<string, HTMLImageElement> = new Map();

  // Layout constants
  readonly CX = GAME_WIDTH / 2;
  readonly CY = GAME_HEIGHT / 2 - 20;
  readonly DEPTH_SPACING = 120;
  readonly NODE_RADIUS = 20;
  readonly BRANCH_SPREAD = 0.3;

  // Animation time
  time = 0;

  // Pan / drag state
  panX = 0;
  panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private panMoved = 0;

  constructor(upgrades: UpgradeManager, game: IGame) {
    this.upgrades = upgrades;
    this.game = game;
    this.computeNodePositions();
    this.preloadIcons();
  }

  /** Preload all unique SVG icon paths from the upgrade tree. */
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
    // Keep root node (CX, CY) at least 50px inside the viewport at all times
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

  /** A node is visible once its required parent level is met. */
  private isParentMaxed(node: UpgradeNode): boolean {
    if (!node.requires || node.requires.length === 0) return true;
    const req = node.requires[0];
    return this.upgrades.getLevel(req.id) >= req.level;
  }

  handleClick(mx: number, my: number) {
    // Suppress tap if the pointer has dragged (pan gesture)
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

    // Node positions are in world space; convert screen coords by subtracting pan
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
      this.game.audio?.playUpgrade();
    } else {
      this.game.audio?.playError();
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

  render(renderer: Renderer, dt: number = 1 / 60) {
    this.clickables = [];
    this.time += dt;
    const ctx = renderer.ctx;

    // Dark background with subtle vignette
    ctx.fillStyle = COLORS.panelBg;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Vignette effect
    const vignetteGrad = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.2,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.7
    );
    vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGrad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Title panel
    renderer.drawPanel(GAME_WIDTH / 2 - 130, 4, 260, 28, {
      bg: "rgba(6, 6, 20, 0.85)",
      border: "rgba(0, 212, 255, 0.2)",
      radius: 6,
      glow: "rgba(0, 212, 255, 0.1)",
      glowBlur: 8,
    });

    renderer.drawTitleTextOutline(
      "UPGRADE STATION",
      GAME_WIDTH / 2,
      18,
      COLORS.player,
      "#000",
      14,
      "center",
      "middle"
    );

    // Coins display panel
    const coinsStr = `💰 ${this.upgrades.save.coins}    ⭐ ${this.upgrades.save.starCoins}    LV ${this.upgrades.save.currentLevel}`;
    renderer.drawPanel(GAME_WIDTH / 2 - 150, 36, 300, 20, {
      bg: "rgba(6, 6, 20, 0.7)",
      border: "rgba(255, 221, 0, 0.15)",
      radius: 4,
    });

    ctx.save();
    ctx.font = `bold 9px Tektur`;
    ctx.fillStyle = COLORS.textGold;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(coinsStr, GAME_WIDTH / 2, 46);
    ctx.restore();

    // Update shake/message timers
    if (this.cantAffordShake && this.cantAffordShake.timer > 0) {
      this.cantAffordShake.timer -= dt;
      if (this.cantAffordShake.timer <= 0) this.cantAffordShake = null;
    }
    if (this.cantAffordMessage && this.cantAffordMessage.timer > 0) {
      this.cantAffordMessage.timer -= dt;
      if (this.cantAffordMessage.timer <= 0) this.cantAffordMessage = null;
    }

    // Apply pan offset for the world-space tree; UI panels are drawn after restore
    ctx.save();
    ctx.translate(this.panX, this.panY);
    this.renderConnections(ctx);
    this.renderBranchLabels(renderer);
    this.renderNodes(renderer, ctx);
    ctx.restore();

    this.renderTooltip(renderer, ctx);
    this.renderBottomBar(renderer, ctx);

    // Can't afford message — floating panel
    if (this.cantAffordMessage) {
      const msgAlpha = Math.min(1, this.cantAffordMessage.timer);
      ctx.save();
      ctx.globalAlpha = msgAlpha;

      const msgW = 280;
      const msgH = 28;
      const msgX = GAME_WIDTH / 2 - msgW / 2;
      const msgY = GAME_HEIGHT / 2 + 90;

      renderer.drawPanel(msgX, msgY, msgW, msgH, {
        bg: "rgba(40, 8, 8, 0.9)",
        border: "rgba(255, 68, 68, 0.5)",
        radius: 6,
      });

      ctx.font = `bold 12px Tektur`;
      ctx.fillStyle = COLORS.hpBarDamage;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.cantAffordMessage.text, GAME_WIDTH / 2, msgY + msgH / 2);

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

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

      if (level > 0) {
        ctx.strokeStyle = "#aaaaaa";
        ctx.globalAlpha = 0.5;
      } else {
        ctx.strokeStyle = "#555555";
        ctx.globalAlpha = 0.35;
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(parentPos.x, parentPos.y);
      ctx.lineTo(childPos.x, childPos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  renderBranchLabels(renderer: Renderer) {
    const ctx = renderer.ctx;
    const branches: UpgradeBranch[] = [
      "dmg",
      "guns",
      "economy",
      "movement",
      "health",
      "mothership",
    ];
    for (const branch of branches) {
      const angle = BRANCH_ANGLES[branch];
      const dist = 3.3 * this.DEPTH_SPACING;
      let ly = this.CY + Math.sin(angle) * dist;
      if (ly < 62) ly = 62;
      if (ly > GAME_HEIGHT - 48) ly = GAME_HEIGHT - 48;

      // Label with subtle bg pill
      ctx.save();
      ctx.font = `bold 8px Tektur`;

      ctx.globalAlpha = 1;

      ctx.fillStyle = BRANCH_COLORS[branch];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.restore();
    }
  }

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

      const r = isRoot ? this.NODE_RADIUS + 5 : this.NODE_RADIUS;

      // Bobbing offset — each node gets a unique phase from its index
      const nodeIdx = UPGRADE_TREE.indexOf(node);
      const phase = nodeIdx * 1.3;
      const bobAmp = isRoot ? 2 : 1.5;
      const bobSpeed = isRoot ? 1.2 : 0.9 + (nodeIdx % 3) * 0.15;
      const bobY = Math.sin(this.time * bobSpeed + phase) * bobAmp;
      const bobX = Math.cos(this.time * bobSpeed * 0.6 + phase) * bobAmp * 0.4;

      // Shake animation offset
      let shakeX = 0;
      let shakeY = 0;
      if (this.cantAffordShake && this.cantAffordShake.nodeId === node.id) {
        const intensity = this.cantAffordShake.timer * 20;
        shakeX = (Math.random() - 0.5) * intensity;
        shakeY = (Math.random() - 0.5) * intensity;
      }

      const nx = pos.x + shakeX + bobX;
      const ny = pos.y + shakeY + bobY;

      // Black background circle/hex behind every node
      if (!isRoot && maxed) {
        this.drawHexagon(ctx, nx, ny, r, "#000000", "transparent", 0);
      } else {
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
      }

      // Outer glow / ring drawn before border shape
      if (!isRoot) {
        const pulse = (Math.sin(this.time * 2.2 + phase) + 1) / 2; // 0..1
        if (maxed) {
          // Gold shimmer glow
          ctx.save();
          ctx.shadowColor = "#ffd700";
          ctx.shadowBlur = 6 + pulse * 8;
          this.drawHexagon(ctx, nx, ny, r, "rgba(255,210,0,0.18)", "#ffd700", 1.5);
          ctx.restore();
        } else if (level > 0) {
          // Partially bought — pink progress arc + dim full ring
          const progressAngle = (level / node.maxLevel) * Math.PI * 2;
          ctx.strokeStyle = "rgba(255,100,180,0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.save();
          ctx.shadowColor = "#ff69b4";
          ctx.shadowBlur = 4 + pulse * 6;
          ctx.strokeStyle = "#ff69b4";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, r, -Math.PI / 2, -Math.PI / 2 + progressAngle);
          ctx.stroke();
          ctx.restore();
        } else if (this.upgrades.isUnlocked(node)) {
          const cost2 = getUpgradeCost(node, level);
          const canBuy2 = this.upgrades.canAfford(cost2);
          ctx.save();
          if (canBuy2) {
            ctx.shadowColor = "#00ffff";
            ctx.shadowBlur = 6 + pulse * 10;
          } else {
            ctx.shadowColor = "#ff4444";
            ctx.shadowBlur = 3 + pulse * 4;
          }
          ctx.strokeStyle = canBuy2 ? "#00ffff" : "#ff4444";
          ctx.lineWidth = canBuy2 ? 1.5 : 1;
          ctx.globalAlpha = canBuy2 ? 0.9 : 0.65;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      } else {
        // Root node — gold hexagon with glow
        const pulse = (Math.sin(this.time * 1.5) + 1) / 2;
        ctx.save();
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 8 + pulse * 12;
        this.drawHexagon(ctx, nx, ny, r, "rgba(255,210,0,0.25)", "#ffd700", 2);
        ctx.restore();
      }

      // Icon alpha: locked = 0.45 (visible, greyed), unlocked-can't-afford = 0.6, else full
      const iconAlpha = !unlocked ? 0.45 : !canBuy && !maxed && level === 0 ? 0.6 : 1.0;
      ctx.save();
      ctx.globalAlpha = isRoot ? 1 : iconAlpha;
      if (node.iconPath) {
        const img = this.iconImages.get(node.iconPath);
        if (img && img.complete && img.naturalWidth > 0) {
          const iconSize = 24;
          ctx.drawImage(img, nx - iconSize / 2, ny - iconSize / 2, iconSize, iconSize);
        } else {
          ctx.font = `${isRoot ? 16 : 13}px Tektur`;
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.icon, nx, ny);
        }
      } else {
        ctx.font = `${isRoot ? 16 : 13}px Tektur`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.icon, nx, ny);
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // Level text below node
      if (level > 0 && !isRoot) {
        const lvlText = maxed ? "MAX" : `${level}/${node.maxLevel}`;
        ctx.save();
        ctx.font = `bold 7px Tektur`;
        ctx.fillStyle = maxed ? COLORS.player : BRANCH_COLORS[node.branch];
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(lvlText, nx, ny + r + 4);
        ctx.restore();
      }
    }
  }

  renderTooltip(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    const input = this.game.input;
    if (!input) return;
    // On touch devices, only show tooltip while a finger is actively on the screen
    if (input.isTouchDevice && !input.touchTargetActive) return;
    const mousePos = input.mousePos;
    if (!mousePos) return;

    // Convert screen coords to world space (undo pan offset)
    const wx = mousePos.x - this.panX;
    const wy = mousePos.y - this.panY;

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

    // Tooltip panel at bottom
    const panelW = GAME_WIDTH - 60;
    const panelH = 56;
    const panelX = 30;
    const panelY = GAME_HEIGHT - 90;

    renderer.drawPanel(panelX, panelY, panelW, panelH, {
      bg: "rgba(5, 5, 20, 0.92)",
      border: renderer.hexToRgba(BRANCH_COLORS[closest.branch], 0.4),
      radius: 8,
      glow: renderer.hexToRgba(BRANCH_COLORS[closest.branch], 0.15),
      glowBlur: 10,
    });

    // Name + icon
    ctx.save();
    ctx.font = `bold 14px  Tektur`;
    ctx.fillStyle = BRANCH_COLORS[closest.branch];
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${closest.icon} ${closest.name}`, panelX + 10, panelY + 7);
    ctx.restore();

    // Level badge
    ctx.save();
    ctx.font = `bold 12px  Tektur`;
    ctx.fillStyle = maxed ? COLORS.player : COLORS.textSecondary;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`Lv ${level}/${closest.maxLevel}`, panelX + panelW - 10, panelY + 8);
    ctx.restore();

    // Description
    ctx.save();
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(closest.description, panelX + 10, panelY + 24);
    ctx.restore();

    // Status line
    ctx.save();
    ctx.font = `bold 9px  Tektur`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (!unlocked) {
      const reqText = this.getRequirementText(closest);
      ctx.fillStyle = "#664444";
      ctx.fillText(`🔒 ${reqText}`, panelX + 10, panelY + 40);
    } else if (maxed) {
      ctx.fillStyle = COLORS.player;
      ctx.fillText("✓ MAXED", panelX + 10, panelY + 40);
    } else {
      const canBuy = this.upgrades.canAfford(cost);
      ctx.fillStyle = canBuy ? COLORS.textGold : "#664444";
      ctx.fillText(`Cost: ${cost} coins — Tap node to buy`, panelX + 10, panelY + 40);
    }
    ctx.restore();
  }

  renderBottomBar(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    // Bottom button bar
    const barY = GAME_HEIGHT - 34;
    const btnH = 30;

    // START RUN button — prominent center
    const playBtnW = 180;
    const playBtnX = GAME_WIDTH / 2 - playBtnW / 2;

    renderer.drawButton(playBtnX, barY, playBtnW, btnH, "▶  START RUN", {
      bg: "rgba(0, 55, 120, 0.9)",
      border: "rgba(0, 25, 90, 0.5)",
      textColor: COLORS.player,
      fontSize: 13,
      radius: 8,
      glow: "rgba(0, 170, 255, 0.15)",
    });

    this.clickables.push({
      x: playBtnX,
      y: barY,
      w: playBtnW,
      h: btnH,
      action: () => this.game.startRun(),
    });

    // RESET button (top right)
    const resetBtnW = 80;
    const resetBtnH = 22;
    const resetBtnX = GAME_WIDTH - resetBtnW - 8;
    const resetBtnY = 6;

    renderer.drawButton(resetBtnX, resetBtnY, resetBtnW, resetBtnH, "⟲ RESET", {
      bg: "rgba(35, 8, 8, 0.85)",
      border: "rgba(255, 68, 68, 0.4)",
      textColor: COLORS.hpBarDamage,
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

    // MENU button (bottom right)
    const menuBtnW = 80;
    const menuBtnX = GAME_WIDTH - menuBtnW - 8;

    renderer.drawButton(menuBtnX, barY, menuBtnW, btnH, "⌂ MENU", {
      bg: "rgba(10, 10, 40, 0.9)",
      border: "rgba(68, 136, 255, 0.4)",
      textColor: "#4488ff",
      fontSize: 10,
      radius: 8,
    });

    this.clickables.push({
      x: menuBtnX,
      y: barY,
      w: menuBtnW,
      h: btnH,
      action: () => {
        this.game.state = "menu";
      },
    });

    // PRESTIGE button (bottom left)
    const pBtnW = 120;
    const pBtnX = 8;

    const canPrestige = this.upgrades.save.highestLevel >= 10;

    if (canPrestige) {
      renderer.drawButton(pBtnX, barY, pBtnW, btnH, "⭐ PRESTIGE", {
        bg: "rgba(30, 10, 30, 0.9)",
        border: "rgba(170, 68, 170, 0.5)",
        textColor: "#aa44aa",
        fontSize: 10,
        radius: 8,
        glow: "rgba(170, 68, 170, 0.15)",
      });

      this.clickables.push({
        x: pBtnX,
        y: barY,
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
      ctx.globalAlpha = 0.35;
      renderer.drawButton(pBtnX, barY, pBtnW, btnH, "⭐ PRESTIGE", {
        bg: "rgba(10, 10, 10, 0.7)",
        border: "rgba(80, 80, 80, 0.3)",
        textColor: "#555",
        fontSize: 10,
        radius: 8,
      });
      ctx.globalAlpha = 1;
      ctx.restore();

      // Hint text
      ctx.save();
      ctx.font = `7px Tektur`;
      ctx.fillStyle = "#555";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`Reach Lv10 (current: ${this.upgrades.save.highestLevel})`, pBtnX, barY - 4);
      ctx.restore();
    }
  }

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

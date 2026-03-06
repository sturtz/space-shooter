import { Renderer } from "../rendering/Renderer";
import { UpgradeManager } from "../upgrades/UpgradeManager";
import {
  UPGRADE_TREE,
  STAR_UPGRADES,
  UpgradeNode,
  UpgradeBranch,
  getUpgradeCost,
  getParentNode,
  BRANCH_ANGLES,
  BRANCH_COLORS,
  BRANCH_LABELS,
} from "../upgrades/UpgradeTree";
import {
  saveGame,
  clearSave,
  getDefaultSave,
  loadGame,
} from "../utils/SaveManager";
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

  // Layout constants
  readonly CX = GAME_WIDTH / 2;
  readonly CY = GAME_HEIGHT / 2 - 10;
  readonly DEPTH_SPACING = 72;
  readonly NODE_RADIUS = 14;
  readonly BRANCH_SPREAD = 0.35;

  constructor(upgrades: UpgradeManager, game: IGame) {
    this.upgrades = upgrades;
    this.game = game;
    this.computeNodePositions();
  }

  refresh() {
    this.clickables = [];
    this.hoveredNode = null;
    this.tooltip = null;
    this.computeNodePositions();
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

  handleClick(mx: number, my: number) {
    for (const area of this.clickables) {
      if (
        mx >= area.x &&
        mx <= area.x + area.w &&
        my >= area.y &&
        my <= area.y + area.h
      ) {
        area.action();
        saveGame(this.upgrades.save);
        return;
      }
    }

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy <= this.NODE_RADIUS * this.NODE_RADIUS * 1.5) {
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

  /** Render accepts actual dt now (Bug #6 fix — was hard-coded 1/60) */
  render(renderer: Renderer, dt: number = 1 / 60) {
    this.clickables = [];
    const ctx = renderer.ctx;

    // Dark background
    ctx.fillStyle = COLORS.panelBg;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Title
    renderer.drawTextOutline(
      "UPGRADE STATION",
      GAME_WIDTH / 2,
      16,
      COLORS.player,
      "#000",
      20,
      "center",
      "top",
    );

    // Coins display
    renderer.drawText(
      `Coins: ${this.upgrades.save.coins}   ★ ${this.upgrades.save.starCoins} (prestige currency)   Level: ${this.upgrades.save.currentLevel}`,
      GAME_WIDTH / 2,
      40,
      COLORS.textGold,
      11,
      "center",
      "top",
    );

    // Update shake/message timers using actual dt
    if (this.cantAffordShake && this.cantAffordShake.timer > 0) {
      this.cantAffordShake.timer -= dt;
      if (this.cantAffordShake.timer <= 0) this.cantAffordShake = null;
    }
    if (this.cantAffordMessage && this.cantAffordMessage.timer > 0) {
      this.cantAffordMessage.timer -= dt;
      if (this.cantAffordMessage.timer <= 0) this.cantAffordMessage = null;
    }

    this.renderConnections(ctx);
    this.renderBranchLabels(renderer);
    this.renderNodes(renderer, ctx);
    this.renderTooltip(renderer, ctx);
    this.renderBottomBar(renderer, ctx);

    // Can't afford message
    if (this.cantAffordMessage) {
      const msgAlpha = Math.min(1, this.cantAffordMessage.timer);
      ctx.globalAlpha = msgAlpha;
      renderer.drawTextOutline(
        this.cantAffordMessage.text,
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 100,
        "#ff4444",
        "#000",
        13,
        "center",
        "middle",
      );
      ctx.globalAlpha = 1;
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

      const level = this.upgrades.getLevel(node.id);
      const unlocked = this.upgrades.isUnlocked(node);

      if (level > 0) {
        ctx.strokeStyle = BRANCH_COLORS[node.branch];
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
      } else if (unlocked) {
        ctx.strokeStyle = BRANCH_COLORS[node.branch];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
      } else {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2;
      }

      ctx.beginPath();
      ctx.moveTo(parentPos.x, parentPos.y);
      ctx.lineTo(childPos.x, childPos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = "#1a1a2a";
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    for (let d = 1; d <= 3; d++) {
      ctx.beginPath();
      ctx.arc(this.CX, this.CY, d * this.DEPTH_SPACING, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  renderBranchLabels(renderer: Renderer) {
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
      const dist = 3.2 * this.DEPTH_SPACING;
      let lx = this.CX + Math.cos(angle) * dist;
      let ly = this.CY + Math.sin(angle) * dist;
      if (ly < 58) ly = 58;
      if (ly > GAME_HEIGHT - 40) ly = GAME_HEIGHT - 40;

      renderer.drawText(
        BRANCH_LABELS[branch],
        lx,
        ly,
        BRANCH_COLORS[branch],
        9,
        "center",
        "middle",
      );
    }
  }

  renderNodes(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    for (const node of UPGRADE_TREE) {
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;

      const level = this.upgrades.getLevel(node.id);
      const unlocked = this.upgrades.isUnlocked(node);
      const maxed = level >= node.maxLevel;
      const cost = maxed ? 0 : getUpgradeCost(node, level);
      const canBuy = unlocked && !maxed && this.upgrades.canAfford(cost);
      const isRoot = node.id === "root";

      const r = isRoot ? this.NODE_RADIUS + 4 : this.NODE_RADIUS;

      if (isRoot) {
        ctx.fillStyle = "#222244";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.player;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (maxed) {
        ctx.fillStyle = BRANCH_COLORS[node.branch];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = BRANCH_COLORS[node.branch];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (level > 0) {
        ctx.fillStyle = "#111122";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = BRANCH_COLORS[node.branch];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        const progressAngle = (level / node.maxLevel) * Math.PI * 2;
        ctx.arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + progressAngle);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = BRANCH_COLORS[node.branch];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (canBuy) {
        ctx.fillStyle = "#111122";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = BRANCH_COLORS[node.branch];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (unlocked) {
        ctx.fillStyle = "#0a0a15";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#0a0a10";
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const iconAlpha = unlocked ? 1 : 0.3;
      ctx.globalAlpha = iconAlpha;
      renderer.drawText(
        node.icon,
        pos.x,
        pos.y - 1,
        "#fff",
        isRoot ? 14 : 11,
        "center",
        "middle",
      );
      ctx.globalAlpha = 1;

      if (level > 0 && !isRoot) {
        const lvlText = maxed ? "MAX" : `${level}`;
        renderer.drawText(
          lvlText,
          pos.x,
          pos.y + r + 6,
          maxed ? "#44ff44" : BRANCH_COLORS[node.branch],
          7,
          "center",
          "top",
        );
      }

      if (node.depth <= 1) {
        renderer.drawText(
          node.name,
          pos.x,
          pos.y + r + (level > 0 ? 14 : 6),
          unlocked ? "#aaa" : "#444",
          8,
          "center",
          "top",
        );
      }
    }
  }

  renderTooltip(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    const mousePos = this.game.input?.mousePos;
    if (!mousePos) return;

    let closest: UpgradeNode | null = null;
    let closestDist = Infinity;

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      const dx = mousePos.x - pos.x;
      const dy = mousePos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.NODE_RADIUS * 2 && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    if (!closest) return;

    const level = this.upgrades.getLevel(closest.id);
    const unlocked = this.upgrades.isUnlocked(closest);
    const maxed = level >= closest.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(closest, level);

    const panelY = GAME_HEIGHT - 80;
    const panelH = 50;
    ctx.fillStyle = "rgba(5, 5, 20, 0.95)";
    ctx.fillRect(100, panelY, GAME_WIDTH - 200, panelH);
    ctx.strokeStyle = BRANCH_COLORS[closest.branch];
    ctx.lineWidth = 1;
    ctx.strokeRect(100, panelY, GAME_WIDTH - 200, panelH);

    renderer.drawText(
      `${closest.icon} ${closest.name}`,
      GAME_WIDTH / 2 - 150,
      panelY + 6,
      BRANCH_COLORS[closest.branch],
      12,
      "left",
      "top",
    );

    renderer.drawText(
      `Lv ${level}/${closest.maxLevel}`,
      GAME_WIDTH / 2 + 150,
      panelY + 6,
      maxed ? "#44ff44" : "#aaa",
      11,
      "right",
      "top",
    );

    renderer.drawText(
      closest.description,
      GAME_WIDTH / 2 - 150,
      panelY + 22,
      COLORS.textSecondary,
      10,
      "left",
      "top",
    );

    if (!unlocked) {
      const reqText = this.getRequirementText(closest);
      renderer.drawText(
        `🔒 ${reqText}`,
        GAME_WIDTH / 2 - 150,
        panelY + 36,
        "#664444",
        9,
        "left",
        "top",
      );
    } else if (maxed) {
      renderer.drawText(
        "✓ MAXED",
        GAME_WIDTH / 2 - 150,
        panelY + 36,
        "#44ff44",
        10,
        "left",
        "top",
      );
    } else {
      const canBuy = this.upgrades.canAfford(cost);
      renderer.drawText(
        `Cost: ${cost} coins — Click node to buy`,
        GAME_WIDTH / 2 - 150,
        panelY + 36,
        canBuy ? COLORS.textGold : "#664444",
        10,
        "left",
        "top",
      );
    }

    const npos = this.nodePositions.get(closest.id);
    if (npos) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(npos.x, npos.y, this.NODE_RADIUS + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  renderBottomBar(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    // START RUN button
    const playBtnX = GAME_WIDTH / 2 - 80;
    const playBtnY = GAME_HEIGHT - 28;
    const playBtnW = 160;
    const playBtnH = 24;

    ctx.fillStyle = "#114422";
    ctx.fillRect(playBtnX, playBtnY, playBtnW, playBtnH);
    ctx.strokeStyle = "#44ff44";
    ctx.lineWidth = 1;
    ctx.strokeRect(playBtnX, playBtnY, playBtnW, playBtnH);

    renderer.drawText(
      "▶ START RUN",
      GAME_WIDTH / 2,
      playBtnY + 6,
      "#44ff44",
      14,
      "center",
      "top",
    );

    this.clickables.push({
      x: playBtnX,
      y: playBtnY,
      w: playBtnW,
      h: playBtnH,
      action: () => this.game.startRun(),
    });

    // RESET SAVE button
    const resetBtnX = GAME_WIDTH - 90;
    const resetBtnY = 8;
    const resetBtnW = 82;
    const resetBtnH = 20;

    ctx.fillStyle = "#220808";
    ctx.fillRect(resetBtnX, resetBtnY, resetBtnW, resetBtnH);
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 1;
    ctx.strokeRect(resetBtnX, resetBtnY, resetBtnW, resetBtnH);

    renderer.drawText(
      "⟲ RESET",
      resetBtnX + resetBtnW / 2,
      resetBtnY + 4,
      "#ff4444",
      10,
      "center",
      "top",
    );

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

    // MAIN MENU button
    const menuBtnX = GAME_WIDTH - 90;
    const menuBtnY = GAME_HEIGHT - 28;
    const menuBtnW = 82;
    const menuBtnH = 24;

    ctx.fillStyle = "#0a0a22";
    ctx.fillRect(menuBtnX, menuBtnY, menuBtnW, menuBtnH);
    ctx.strokeStyle = "#4488ff";
    ctx.lineWidth = 1;
    ctx.strokeRect(menuBtnX, menuBtnY, menuBtnW, menuBtnH);

    renderer.drawText(
      "⌂ MENU",
      menuBtnX + menuBtnW / 2,
      menuBtnY + 6,
      "#4488ff",
      10,
      "center",
      "top",
    );

    this.clickables.push({
      x: menuBtnX,
      y: menuBtnY,
      w: menuBtnW,
      h: menuBtnH,
      action: () => {
        this.game.state = "menu";
      },
    });

    // PRESTIGE button
    const pBtnX = 10;
    const pBtnY = GAME_HEIGHT - 28;
    const pBtnW = 120;
    const pBtnH = 24;

    const canPrestige = this.upgrades.save.highestLevel >= 10;

    if (canPrestige) {
      ctx.fillStyle = "#1a0a1a";
      ctx.fillRect(pBtnX, pBtnY, pBtnW, pBtnH);
      ctx.strokeStyle = "#aa44aa";
      ctx.lineWidth = 1;
      ctx.strokeRect(pBtnX, pBtnY, pBtnW, pBtnH);

      renderer.drawText(
        "⭐ PRESTIGE",
        pBtnX + pBtnW / 2,
        pBtnY + 6,
        "#aa44aa",
        10,
        "center",
        "top",
      );

      this.clickables.push({
        x: pBtnX,
        y: pBtnY,
        w: pBtnW,
        h: pBtnH,
        action: () => {
          this.upgrades.prestige();
          saveGame(this.upgrades.save);
          this.refresh();
        },
      });
    } else {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(pBtnX, pBtnY, pBtnW, pBtnH);
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(pBtnX, pBtnY, pBtnW, pBtnH);

      renderer.drawText(
        "⭐ PRESTIGE",
        pBtnX + pBtnW / 2,
        pBtnY + 6,
        "#555",
        10,
        "center",
        "top",
      );
      ctx.globalAlpha = 1;

      renderer.drawText(
        `Reach Lv10 to unlock (current: ${this.upgrades.save.highestLevel})`,
        pBtnX,
        pBtnY - 12,
        "#666",
        8,
        "left",
        "bottom",
      );
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

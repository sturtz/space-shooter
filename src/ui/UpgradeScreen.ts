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
import { GAME_WIDTH, GAME_HEIGHT, COLORS, isMobileDevice } from "../utils/Constants";
import { PlayerImages, imageReady } from "../utils/Assets";
import { drawUpgradeIcon } from "./UpgradeIcons";
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

/* ── purchase shockwave ── */
interface PurchaseShockwave {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  color: string;
}

/* ── engine trail particle ── */
interface TrailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
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

  /* ── Layout constants (scaled up 2× from original) ── */
  readonly CX = GAME_WIDTH / 2;
  readonly CY = GAME_HEIGHT / 2 - 20;
  readonly DEPTH_SPACING = 240;
  readonly NODE_RADIUS = 32;
  readonly BRANCH_SPREAD = 0.45;

  time = 0;
  private sparkles: Sparkle[] = [];
  private purchaseFlash: PurchaseFlash | null = null;
  private connectionDashOffset = 0;

  /* ── Camera (driven by ship position) ── */
  panX = 0;
  panY = 0;
  private cameraX = 0;
  private cameraY = 0;
  private readonly CAMERA_LERP = 0.08;

  /* ── Manual pan (fallback for mouse drag) ── */
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartShipX = 0;
  private panStartShipY = 0;
  private panMoved = 0;

  private mouseX = 0;
  private mouseY = 0;
  private touchActive = false;

  /* ── Ship state ── */
  private shipX = 0;
  private shipY = 0;
  private shipAngle = -Math.PI / 2; // facing up
  private readonly SHIP_SPEED = 280;
  private readonly SHIP_RADIUS = 12;
  private overlappingNode: UpgradeNode | null = null;
  private interactCooldown = 0;
  private shockwaves: PurchaseShockwave[] = [];
  private trailParticles: TrailParticle[] = [];
  private shipMoving = false;
  private shipPurchasePulse = 0; // timer for ship glow burst on upgrade buy
  private shipPurchaseColor = ""; // branch color of last purchase

  /* ── Ship input (keyboard — listens on document) ── */
  private shipKeys: Set<string> = new Set();

  /* ── Touch joystick for ship ── */
  private touchShipActive = false;
  private touchBaseX = 0;
  private touchBaseY = 0;
  private touchDirX = 0;
  private touchDirY = 0;
  private touchMoveId: number | null = null;
  private touchStartCssX = 0;
  private touchStartCssY = 0;
  private readonly TOUCH_JOYSTICK_RADIUS = 80; // CSS pixels
  private touchFireRequested = false;

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

    /* ── Keyboard input for ship navigation ── */
    document.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      this.shipKeys.add(key);
    });
    document.addEventListener("keyup", (e) => {
      this.shipKeys.delete(e.key.toLowerCase());
    });

    /* ── Mouse click (for bottom bar buttons + node click fallback) ── */
    canvas.addEventListener("click", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      this.handleClick(mx, my);
    });

    canvas.addEventListener("mousemove", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      this.mouseX = mx;
      this.mouseY = my;
    });

    /* ── Touch handlers — joystick-style ship control ── */
    canvas.addEventListener(
      "touchstart",
      (e) => {
        const touch = e.touches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        this.touchActive = true;
        this.mouseX = mx;
        this.mouseY = my;

        // Check if touching bottom bar buttons first
        for (const area of this.clickables) {
          if (mx >= area.x && mx <= area.x + area.w && my >= area.y && my <= area.y + area.h) {
            // Let touchend handle the click
            return;
          }
        }

        // Right side of screen = fire zone
        if (mx > GAME_WIDTH * 0.7) {
          this.touchFireRequested = true;
          return;
        }

        // Otherwise, start ship joystick
        if (this.touchMoveId === null) {
          this.touchMoveId = touch.identifier;
          this.touchShipActive = true;
          this.touchStartCssX = touch.clientX;
          this.touchStartCssY = touch.clientY;
          this.touchBaseX = mx;
          this.touchBaseY = my;
          this.touchDirX = 0;
          this.touchDirY = 0;
        }
      },
      { passive: true }
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        this.mouseX = mx;
        this.mouseY = my;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const ct = e.changedTouches[i];
          if (ct.identifier === this.touchMoveId) {
            const cssDx = ct.clientX - this.touchStartCssX;
            const cssDy = ct.clientY - this.touchStartCssY;
            const cssDist = Math.sqrt(cssDx * cssDx + cssDy * cssDy);
            const deadZone = 8;

            if (cssDist > deadZone) {
              const norm = Math.min(cssDist / this.TOUCH_JOYSTICK_RADIUS, 1);
              this.touchDirX = (cssDx / cssDist) * norm;
              this.touchDirY = (cssDy / cssDist) * norm;
            } else {
              this.touchDirX = 0;
              this.touchDirY = 0;
            }
          }
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);

        for (let i = 0; i < e.changedTouches.length; i++) {
          const ct = e.changedTouches[i];
          if (ct.identifier === this.touchMoveId) {
            this.touchMoveId = null;
            this.touchShipActive = false;
            this.touchDirX = 0;
            this.touchDirY = 0;
          }
        }

        this.touchActive = false;
        this.touchFireRequested = false;

        // Check bottom bar buttons only — no tap-on-node purchasing
        for (const area of this.clickables) {
          if (mx >= area.x && mx <= area.x + area.w && my >= area.y && my <= area.y + area.h) {
            area.action();
            saveGame(this.upgrades.save);
            return;
          }
        }
        this.panMoved = 0;
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
    this.isPanning = false;
    this.panMoved = 0;
    this.computeNodePositions();

    // Place ship at root node
    const rootPos = this.nodePositions.get("root");
    if (rootPos) {
      this.shipX = rootPos.x;
      this.shipY = rootPos.y;
      this.cameraX = rootPos.x;
      this.cameraY = rootPos.y;
      this.panX = GAME_WIDTH / 2 - this.cameraX;
      this.panY = GAME_HEIGHT / 2 - this.cameraY;
    }

    this.shipAngle = -Math.PI / 2;
    this.overlappingNode = null;
    this.interactCooldown = 0;
    this.shockwaves = [];
    this.trailParticles = [];
    this.touchDirX = 0;
    this.touchDirY = 0;
    this.touchShipActive = false;
    this.touchMoveId = null;
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

    // Check bottom bar buttons only — nodes are purchased via ship overlap + fire
    for (const area of this.clickables) {
      if (mx >= area.x && mx <= area.x + area.w && my >= area.y && my <= area.y + area.h) {
        area.action();
        saveGame(this.upgrades.save);
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

      // Purchase shockwave
      const pos = this.nodePositions.get(node.id);
      if (pos) {
        this.shockwaves.push({
          x: pos.x,
          y: pos.y,
          timer: 0.35,
          maxTimer: 0.35,
          color: BRANCH_COLORS[node.branch],
        });

        // Celebration sparkles
        for (let i = 0; i < 16; i++) {
          const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
          const speed = 40 + Math.random() * 60;
          this.sparkles.push({
            x: pos.x,
            y: pos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.6 + Math.random() * 0.4,
            maxLife: 1.0,
            size: 1.5 + Math.random() * 2.5,
          });
        }
      }

      // Ship purchase pulse — makes the player ship glow with the branch color
      this.shipPurchasePulse = 0.5;
      this.shipPurchaseColor = BRANCH_COLORS[node.branch];

      // Emit sparkles around the ship too
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
        const speed = 30 + Math.random() * 50;
        this.sparkles.push({
          x: this.shipX,
          y: this.shipY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.4 + Math.random() * 0.3,
          maxLife: 0.7,
          size: 1.5 + Math.random() * 2,
        });
      }

      // Auto-switch to chill on Scythe purchase
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

    /* ── Ship movement from keyboard ── */
    let dx = 0;
    let dy = 0;
    if (this.shipKeys.has("w") || this.shipKeys.has("arrowup")) dy -= 1;
    if (this.shipKeys.has("s") || this.shipKeys.has("arrowdown")) dy += 1;
    if (this.shipKeys.has("a") || this.shipKeys.has("arrowleft")) dx -= 1;
    if (this.shipKeys.has("d") || this.shipKeys.has("arrowright")) dx += 1;

    // Touch joystick overrides keyboard if active
    if (
      this.touchShipActive &&
      (Math.abs(this.touchDirX) > 0.05 || Math.abs(this.touchDirY) > 0.05)
    ) {
      dx = this.touchDirX;
      dy = this.touchDirY;
    }

    // Mouse-follow: ship moves toward cursor in world-space (desktop only, no keyboard/touch active)
    // Dead zone: don't follow mouse into the bottom bar area where buttons live
    const hasKeyboard = dx !== 0 || dy !== 0;
    const mouseInBottomBar = this.mouseY > GAME_HEIGHT - 160;
    if (!hasKeyboard && !this.touchShipActive && !mouseInBottomBar) {
      const worldMouseX = this.mouseX - this.panX;
      const worldMouseY = this.mouseY - this.panY;
      const toMouseX = worldMouseX - this.shipX;
      const toMouseY = worldMouseY - this.shipY;
      const mouseDist = Math.sqrt(toMouseX * toMouseX + toMouseY * toMouseY);
      const deadZone = 8; // don't jitter when very close
      if (mouseDist > deadZone) {
        dx = toMouseX / mouseDist;
        dy = toMouseY / mouseDist;
        // Slow down as we approach to avoid overshooting
        const approachSpeed = Math.min(1, mouseDist / 60);
        dx *= approachSpeed;
        dy *= approachSpeed;
      }
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    this.shipMoving = len > 0.05;
    if (this.shipMoving) {
      this.shipX += dx * this.SHIP_SPEED * dt;
      this.shipY += dy * this.SHIP_SPEED * dt;
      this.shipAngle = Math.atan2(dy, dx);

      // Engine trail particles
      if (Math.random() < dt * 30) {
        const backAngle = this.shipAngle + Math.PI;
        const spread = (Math.random() - 0.5) * 0.8;
        this.trailParticles.push({
          x: this.shipX + Math.cos(backAngle) * 12,
          y: this.shipY + Math.sin(backAngle) * 12,
          vx: Math.cos(backAngle + spread) * (30 + Math.random() * 40),
          vy: Math.sin(backAngle + spread) * (30 + Math.random() * 40),
          life: 0.3 + Math.random() * 0.2,
          maxLife: 0.5,
          size: 1.2 + Math.random() * 1.5,
        });
      }
    }

    // Clamp ship to world bounds
    const extent = this.DEPTH_SPACING * 5 + 300;
    this.shipX = Math.max(this.CX - extent, Math.min(this.CX + extent, this.shipX));
    this.shipY = Math.max(this.CY - extent, Math.min(this.CY + extent, this.shipY));

    /* ── Camera follow ── */
    this.cameraX += (this.shipX - this.cameraX) * this.CAMERA_LERP;
    this.cameraY += (this.shipY - this.cameraY) * this.CAMERA_LERP;
    this.panX = GAME_WIDTH / 2 - this.cameraX;
    this.panY = GAME_HEIGHT / 2 - this.cameraY;

    /* ── Ship-to-node collision ── */
    this.overlappingNode = null;
    this.interactCooldown = Math.max(0, this.interactCooldown - dt);

    for (const node of UPGRADE_TREE) {
      if (node.id === "root") continue;
      if (!this.isParentMaxed(node)) continue;
      const pos = this.nodePositions.get(node.id);
      if (!pos) continue;
      const ddx = this.shipX - pos.x;
      const ddy = this.shipY - pos.y;
      const touchDist = this.SHIP_RADIUS + this.NODE_RADIUS;
      if (ddx * ddx + ddy * ddy <= touchDist * touchDist) {
        this.overlappingNode = node;
        this.tooltip = { node, x: pos.x, y: pos.y };
        break;
      }
    }

    // Fire to purchase (space/enter on keyboard, or touch fire zone)
    const firePressed =
      this.shipKeys.has("shift") || this.shipKeys.has("enter") || this.touchFireRequested;
    if (this.overlappingNode && firePressed && this.interactCooldown <= 0) {
      this.tryPurchaseNode(this.overlappingNode);
      this.interactCooldown = 0.4;
    }

    /* ── Timers ── */
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

    /* ── Ship purchase pulse ── */
    if (this.shipPurchasePulse > 0) {
      this.shipPurchasePulse -= dt;
    }

    /* ── Shockwaves ── */
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      this.shockwaves[i].timer -= dt;
      if (this.shockwaves[i].timer <= 0) this.shockwaves.splice(i, 1);
    }

    /* ── Trail particles ── */
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      if (p.life <= 0) this.trailParticles.splice(i, 1);
    }

    /* ── Sparkles ── */
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
      if (s.life <= 0) this.sparkles.splice(i, 1);
    }

    // Ambient sparkles on maxed nodes
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
          size: 1.2 + Math.random() * 2.0,
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

    // Header (screen-space)
    this.renderHeader(renderer, ctx);

    // Pan offset for world-space tree
    ctx.save();
    ctx.translate(this.panX, this.panY);
    this.renderConnections(ctx);
    this.renderNodes(renderer, ctx);
    this.renderShockwaves(ctx);
    this.renderSparkles(ctx);
    this.renderTrailParticles(ctx);
    this.renderShip(ctx);
    ctx.restore();

    // Tooltip (screen-space)
    this.renderTooltip(renderer, ctx);

    // Touch joystick indicator (screen-space)
    if (this.touchShipActive) {
      this.renderTouchJoystick(ctx);
    }

    // Overlapping node prompt (screen-space)
    if (this.overlappingNode) {
      this.renderInteractPrompt(ctx);
    }

    // Bottom bar (screen-space)
    this.renderBottomBar(renderer, ctx);

    // Can't-afford message
    this.renderCantAffordMessage(renderer, ctx);

    renderer.endFrame();
  }

  /* ────────────────────────────────────────────
   *  BACKDROP — soft vignette over cosmic bg
   * ──────────────────────────────────────────── */
  private renderBackdrop(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(4, 4, 14, 0.45)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

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
    const stripH = 56;
    const grad = ctx.createLinearGradient(0, 0, 0, stripH);
    grad.addColorStop(0, "rgba(6, 8, 22, 0.85)");
    grad.addColorStop(0.7, "rgba(6, 8, 22, 0.5)");
    grad.addColorStop(1, "rgba(6, 8, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GAME_WIDTH, stripH);

    ctx.strokeStyle = "rgba(0, 180, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stripH - 1);
    ctx.lineTo(GAME_WIDTH, stripH - 1);
    ctx.stroke();

    // Title
    const mob = isMobileDevice;
    ctx.save();
    ctx.font = mob ? "bold 24px Tektur" : "bold 18px Tektur";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 200, 255, 0.4)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.player;
    ctx.fillText("UPGRADE STATION", GAME_WIDTH / 2, 64);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.restore();

    // Currency chips
    const chipY = 38 + 64;
    const chipH = 18;
    const chipR = 9;

    // Coins chip
    const coinsText = `${this.upgrades.save.coins}`;
    ctx.save();
    ctx.font = "bold 11px Tektur";
    const coinsW = ctx.measureText(coinsText).width + 34;
    const coinsX = GAME_WIDTH / 2 - coinsW - 55;
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
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = "#ffcc00";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("💰", coinsX + 6, chipY + chipH / 2);
    ctx.fillStyle = COLORS.textGold;
    ctx.fillText(coinsText, coinsX + 24, chipY + chipH / 2);
    ctx.restore();

    // Stars chip
    const starsText = `${this.upgrades.save.starCoins ?? 0}`;
    ctx.save();
    ctx.font = "bold 11px Tektur";
    const starsW = ctx.measureText(starsText).width + 34;
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
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = "#bb88ff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐", starsX + 6, chipY + chipH / 2);
    ctx.fillStyle = "#bb88ff";
    ctx.fillText(starsText, starsX + 24, chipY + chipH / 2);
    ctx.restore();

    // Level chip
    const lvlText = `LV ${this.upgrades.save.currentLevel ?? 1}`;
    ctx.save();
    ctx.font = "bold 11px Tektur";
    const lvlW = ctx.measureText(lvlText).width + 20;
    const lvlX = GAME_WIDTH / 2 + 55;
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
    ctx.font = "bold 11px Tektur";
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
        ctx.shadowBlur = 8;
        ctx.strokeStyle = this.renderer.hexToRgba(branchColor, 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Bright core line
        ctx.strokeStyle = this.renderer.hexToRgba(branchColor, 0.25);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
      } else {
        // Available but unpurchased — animated dashed line
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -this.connectionDashOffset;
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(parentPos.x, parentPos.y);
        ctx.lineTo(childPos.x, childPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
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
      const isOverlapping = this.overlappingNode?.id === node.id;

      const r = isRoot ? this.NODE_RADIUS + 8 : this.NODE_RADIUS;

      // Gentle float animation
      const nodeIdx = UPGRADE_TREE.indexOf(node);
      const phase = nodeIdx * 1.3;
      const bobAmp = isRoot ? 3.5 : 2.0;
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
      if (isOverlapping) {
        // Bright white aura when ship is touching
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.4, nx, ny, r * 2.5);
        auraGrad.addColorStop(0, `rgba(255, 255, 255, ${0.15 + pulse * 0.1})`);
        auraGrad.addColorStop(0.5, this.renderer.hexToRgba(branchColor, 0.08 + pulse * 0.06));
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (maxed) {
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.5, nx, ny, r * 2.2);
        auraGrad.addColorStop(0, `rgba(255, 210, 0, ${0.08 + pulse * 0.06})`);
        auraGrad.addColorStop(0.5, `rgba(255, 180, 0, ${0.03 + pulse * 0.03})`);
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (canBuy) {
        const auraGrad = ctx.createRadialGradient(nx, ny, r * 0.6, nx, ny, r * 1.8);
        auraGrad.addColorStop(0, `rgba(255, 255, 255, ${0.06 + pulse * 0.08})`);
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (level > 0) {
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
      if (isOverlapping) {
        // Bright pulsing highlight ring when ship overlaps
        ctx.save();
        ctx.shadowColor = branchColor;
        ctx.shadowBlur = 12 + pulse * 8;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(nx, ny, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (maxed) {
        ctx.save();
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 8 + pulse * 6;
        this.drawHexagon(ctx, nx, ny, r + 1, "transparent", "#ffd700", 1.5);
        ctx.restore();
      } else if (level > 0) {
        const progressRatio = level / node.maxLevel;
        const progressAngle = progressRatio * Math.PI * 2;

        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.save();
        ctx.shadowColor = branchColor;
        ctx.shadowBlur = 4 + pulse * 4;
        ctx.strokeStyle = branchColor;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(nx, ny, r, -Math.PI / 2, -Math.PI / 2 + progressAngle);
        ctx.stroke();
        ctx.restore();
      } else if (canBuy) {
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
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.25 + pulse * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Icon — canvas-drawn neon-geometric symbols
      const iconAlpha = maxed ? 1.0 : level > 0 ? 0.85 : canBuy ? 0.7 : unlocked ? 0.4 : 0.2;
      drawUpgradeIcon(ctx, node.id, nx, ny, r * 0.7, branchColor, iconAlpha);

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
        ctx.font = "bold 9px Tektur";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = maxed ? "#ffd700" : branchColor;
        ctx.fillText(lvlText, nx, ny + r + 6);
        ctx.restore();
      }

      // Cost badge (below node, for unpurchased affordable nodes)
      if (level === 0 && canBuy) {
        ctx.save();
        ctx.font = "bold 9px Tektur";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255, 200, 0, 0.7)";
        ctx.fillText(`${cost}💰`, nx, ny + r + 6);
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
      ctx.arc(nx, ny, r + 5, segAngle, segAngle + Math.PI * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    // Dark backdrop
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(5, 10, 20, 0.85)";
    ctx.fill();

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
   *  SHIP — player sprite flying around the map
   * ──────────────────────────────────────────── */
  private renderShip(ctx: CanvasRenderingContext2D) {
    const hasPulse = this.shipPurchasePulse > 0;
    const pulseAlpha = hasPulse ? this.shipPurchasePulse / 0.5 : 0;

    // ── Purchase pulse: expanding glow ring + radial aura (drawn before rotation) ──
    if (hasPulse) {
      ctx.save();
      const expandProgress = 1 - pulseAlpha; // 0→1
      const ringRadius = 20 + expandProgress * 30;
      const color = this.shipPurchaseColor || COLORS.player;

      // Radial glow aura
      const aura = ctx.createRadialGradient(
        this.shipX,
        this.shipY,
        4,
        this.shipX,
        this.shipY,
        ringRadius * 1.5
      );
      aura.addColorStop(0, this.renderer.hexToRgba(color, pulseAlpha * 0.35));
      aura.addColorStop(0.5, this.renderer.hexToRgba(color, pulseAlpha * 0.12));
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(this.shipX, this.shipY, ringRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Expanding ring
      ctx.globalAlpha = pulseAlpha * 0.8;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2.5 * pulseAlpha;
      ctx.beginPath();
      ctx.arc(this.shipX, this.shipY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner bright ring
      ctx.globalAlpha = pulseAlpha * 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5 * pulseAlpha;
      ctx.beginPath();
      ctx.arc(this.shipX, this.shipY, ringRadius * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.shipX, this.shipY);
    ctx.rotate(this.shipAngle + Math.PI / 2); // sprite faces up, rotate to movement dir

    const sprite = imageReady(PlayerImages.glider) ? PlayerImages.glider : null;
    if (sprite) {
      const sw = 24;
      const sh = 36;
      // Glow — amplified during purchase pulse
      const pulseColor = hasPulse ? this.shipPurchaseColor : COLORS.player;
      ctx.shadowColor = pulseColor;
      ctx.shadowBlur = 14 + (this.shipMoving ? 6 : 0) + (hasPulse ? pulseAlpha * 24 : 0);
      ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
      ctx.shadowBlur = 0;
    } else {
      // Fallback triangle
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 10;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(8, 10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  SHOCKWAVES — expanding rings on purchase
   * ──────────────────────────────────────────── */
  private renderShockwaves(ctx: CanvasRenderingContext2D) {
    for (const sw of this.shockwaves) {
      const progress = 1 - sw.timer / sw.maxTimer;
      const radius = this.NODE_RADIUS * (1 + progress * 2.5);
      const alpha = 1 - progress;

      ctx.save();
      // Outer ring
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = alpha * 0.8;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3 * (1 - progress);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring
      ctx.globalAlpha = alpha * 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  /* ────────────────────────────────────────────
   *  TRAIL PARTICLES — engine exhaust behind ship
   * ──────────────────────────────────────────── */
  private renderTrailParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.trailParticles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = COLORS.player;
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
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
   *  TOUCH JOYSTICK — visual indicator
   * ──────────────────────────────────────────── */
  private renderTouchJoystick(ctx: CanvasRenderingContext2D) {
    const bx = this.touchBaseX;
    const by = this.touchBaseY;
    const tx = bx + this.touchDirX * 30;
    const ty = by + this.touchDirY * 30;

    // Base ring
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 35, 0, Math.PI * 2);
    ctx.stroke();

    // Thumb dot
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(tx, ty, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  INTERACT PROMPT — "SPACE to buy" hint
   * ──────────────────────────────────────────── */
  private renderInteractPrompt(ctx: CanvasRenderingContext2D) {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const promptText = isTouchDevice ? "TAP RIGHT SIDE TO BUY" : "DASH TO BUY";
    const promptY = GAME_HEIGHT - (isTouchDevice ? 170 : 150);

    ctx.save();
    ctx.font = isTouchDevice ? "bold 16px Tektur" : "bold 11px Tektur";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const pulse = (Math.sin(this.time * 4) + 1) / 2;
    ctx.fillStyle = `rgba(0, 200, 255, ${0.5 + pulse * 0.5})`;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 6;
    ctx.fillText(promptText, GAME_WIDTH / 2, promptY);
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  TOOLTIP — floating info panel
   * ──────────────────────────────────────────── */
  renderTooltip(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    // Show tooltip for overlapping node (ship collision) or mouse hover
    let closest: UpgradeNode | null = this.overlappingNode;

    if (!closest) {
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (isTouchDevice && !this.touchActive) return;

      const wx = this.mouseX - this.panX;
      const wy = this.mouseY - this.panY;

      let closestDist = Infinity;
      for (const node of UPGRADE_TREE) {
        if (node.id === "root") continue;
        if (!this.isParentMaxed(node)) continue;
        const pos = this.nodePositions.get(node.id);
        if (!pos) continue;
        const dx = wx - pos.x;
        const dy = wy - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.NODE_RADIUS * 5 && dist < closestDist) {
          closestDist = dist;
          closest = node;
        }
      }
    }

    if (!closest) return;

    const level = this.upgrades.getLevel(closest.id);
    const unlocked = this.upgrades.isUnlocked(closest);
    const maxed = level >= closest.maxLevel;
    const cost = maxed ? 0 : getUpgradeCost(closest, level);
    const branchColor = BRANCH_COLORS[closest.branch];

    // Panel dimensions (scaled up)
    const panelW = 340;
    const panelH = 84;
    const margin = 20;

    const nodePos = this.nodePositions.get(closest.id)!;
    let panelX = nodePos.x + this.panX + this.NODE_RADIUS + 18;
    let panelY = nodePos.y + this.panY - panelH / 2;

    if (panelX + panelW > GAME_WIDTH - margin) {
      panelX = nodePos.x + this.panX - this.NODE_RADIUS - panelW - 18;
    }
    panelX = Math.max(margin, Math.min(GAME_WIDTH - panelW - margin, panelX));
    panelY = Math.max(60, Math.min(GAME_HEIGHT - panelH - 50, panelY));

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
    ctx.font = "bold 14px Tektur";
    ctx.fillStyle = branchColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(closest.name, panelX + 14, panelY + 10);
    ctx.restore();

    // Level badge
    ctx.save();
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = maxed ? "#ffd700" : "rgba(200,210,230,0.6)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${level}/${closest.maxLevel}`, panelX + panelW - 12, panelY + 12);
    ctx.restore();

    // Description
    ctx.save();
    ctx.font = "10px Tektur";
    ctx.fillStyle = "rgba(180, 195, 220, 0.8)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(closest.description, panelX + 14, panelY + 32);
    ctx.restore();

    // Status line
    ctx.save();
    ctx.font = "bold 10px Tektur";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (!unlocked) {
      const reqText = this.getRequirementText(closest);
      ctx.fillStyle = "rgba(180, 80, 80, 0.8)";
      ctx.fillText(`🔒 ${reqText}`, panelX + 14, panelY + 56);
    } else if (maxed) {
      ctx.fillStyle = "#ffd700";
      ctx.fillText("✓ MAXED", panelX + 14, panelY + 56);
    } else {
      const canBuy = this.upgrades.canAfford(cost);
      ctx.fillStyle = canBuy ? COLORS.textGold : "rgba(180, 80, 80, 0.8)";
      const action = this.overlappingNode
        ? canBuy
          ? "Dash to buy"
          : "Can't afford"
        : canBuy
          ? "Fly here to buy"
          : "Can't afford";
      ctx.fillText(`💰 ${cost}  ·  ${action}`, panelX + 14, panelY + 56);
    }
    ctx.restore();
  }

  /* ────────────────────────────────────────────
   *  BOTTOM BAR — action buttons
   * ──────────────────────────────────────────── */
  renderBottomBar(renderer: Renderer, ctx: CanvasRenderingContext2D) {
    const stripH = 80;
    const stripY = GAME_HEIGHT - stripH;
    const grad = ctx.createLinearGradient(0, stripY, 0, GAME_HEIGHT);
    grad.addColorStop(0, "rgba(6, 8, 22, 0)");
    grad.addColorStop(0.25, "rgba(6, 8, 22, 0.5)");
    grad.addColorStop(0.5, "rgba(6, 8, 22, 0.7)");
    grad.addColorStop(1, "rgba(6, 8, 22, 0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, stripY, GAME_WIDTH, stripH);

    ctx.strokeStyle = "rgba(0, 180, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stripY + 1);
    ctx.lineTo(GAME_WIDTH, stripY + 1);
    ctx.stroke();

    const mob = isMobileDevice;
    const btnY = GAME_HEIGHT - (mob ? 140 : 128);
    const btnH = mob ? 58 : 44;

    // ── START RUN (center, hero button) ──
    const playBtnW = mob ? 340 : 260;
    const playBtnX = GAME_WIDTH / 2 - playBtnW / 2;
    const playPulse = (Math.sin(this.time * 2.5) + 1) / 2;

    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    renderer.drawButton(playBtnX, btnY, playBtnW, btnH, "▶  START RUN", {
      bg: "rgba(0, 50, 110, 0.9)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 16,
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

    // ── MENU (right side of bottom bar) ──
    const menuBtnW = 110;
    const menuBtnX = GAME_WIDTH - menuBtnW - 40;

    renderer.drawButton(menuBtnX, btnY, menuBtnW, btnH, "⌂ MENU", {
      bg: "rgba(10, 10, 35, 0.85)",
      border: "rgba(80, 120, 200, 0.3)",
      textColor: "rgba(100, 160, 255, 0.8)",
      fontSize: 13,
      radius: 8,
    });

    this.clickables.push({
      x: menuBtnX,
      y: btnY,
      w: menuBtnW,
      h: btnH,
      action: () => this.manager.goToMenu(),
    });

    // ── PRESTIGE (left side of bottom bar) ──
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
        fontSize: 13,
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
        fontSize: 13,
        radius: 8,
      });
      ctx.restore();

      ctx.save();
      ctx.font = "8px Tektur";
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

    const msgW = 300;
    const msgH = 34;
    const msgX = GAME_WIDTH / 2 - msgW / 2;
    const msgY = GAME_HEIGHT / 2 + 120;

    renderer.drawPanel(msgX, msgY, msgW, msgH, {
      bg: "rgba(50, 10, 10, 0.88)",
      border: "rgba(255, 68, 68, 0.4)",
      radius: 8,
    });

    ctx.font = "bold 12px Tektur";
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

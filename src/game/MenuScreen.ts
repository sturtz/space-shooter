import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { hitTestRect } from "../utils/Math";
import type { ScreenManager } from "./ScreenManager";

// Tutorial button layout
const TUTORIAL_BTN_W = 180;
const TUTORIAL_BTN_H = 32;
const TUTORIAL_BTN_X = GAME_WIDTH / 2 - TUTORIAL_BTN_W / 2;
const TUTORIAL_BTN_Y = GAME_HEIGHT / 2 + 66;

/**
 * Self-contained menu screen with its own canvas.
 * Handles: title screen, tutorial button, and transitions to game.
 * The old static 3-page tutorial is replaced by the interactive TutorialSystem.
 */
export class MenuScreen {
  renderer: Renderer;
  manager: ScreenManager;

  private time: number = 0;
  private menuPulse: number = 0;

  constructor(renderer: Renderer, manager: ScreenManager) {
    this.renderer = renderer;
    this.manager = manager;

    const canvas = renderer.canvas;

    const getScaledCoords = (clientX: number, clientY: number) => {
      return {
        mx: (clientX - this.renderer.gameOffsetX) / this.renderer.gameScale,
        my: (clientY - this.renderer.gameOffsetY) / this.renderer.gameScale,
      };
    };

    const handleClick = (mx: number, my: number) => {
      // First-time players: auto-launch interactive tutorial
      if (!this.manager.save.tutorialSeen) {
        this.manager.startTutorial("menu");
        return;
      }
      // Tutorial button
      if (hitTestRect(mx, my, TUTORIAL_BTN_X, TUTORIAL_BTN_Y, TUTORIAL_BTN_W, TUTORIAL_BTN_H)) {
        this.manager.startTutorial("menu");
        return;
      }
      // Start game
      this.manager.startGame();
    };

    canvas.addEventListener("click", (e) => {
      const { mx, my } = getScaledCoords(e.clientX, e.clientY);
      handleClick(mx, my);
    });

    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const { mx, my } = getScaledCoords(touch.clientX, touch.clientY);
        handleClick(mx, my);
      },
      { passive: false }
    );
  }

  update(dt: number) {
    this.time += dt;
    this.menuPulse += dt;
  }

  render() {
    const r = this.renderer;
    r.beginFrame(1 / 60);
    this.renderMenuContent();
    r.endFrame();
  }

  // ── Menu Content ──────────────────────────────────────────────────────

  private renderMenuContent() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const ctx = this.renderer.ctx;
    const save = this.manager.save;

    // Decorative mothership glow
    const pulse = 1 + Math.sin(this.menuPulse * 1.5) * 0.1;
    ctx.save();
    ctx.globalAlpha = 0.15;
    const motherGlow = ctx.createRadialGradient(cx, cy + 180, 0, cx, cy + 180, 80 * pulse);
    motherGlow.addColorStop(0, COLORS.mothership);
    motherGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = motherGlow;
    ctx.beginPath();
    ctx.arc(cx, cy + 180, 80 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Title with glow
    const titleScale = 1 + Math.sin(this.menuPulse * 2) * 0.02;
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 20;
    this.renderer.drawTitleTextOutline(
      "SPACE SHOOTER",
      cx,
      cy - 120,
      COLORS.player,
      "#000",
      30 * titleScale,
      "center",
      "middle"
    );
    ctx.restore();

    // Subtitle
    this.renderer.drawTitleText(
      "Defend the Mothership",
      cx,
      cy - 78,
      COLORS.textSecondary,
      12,
      "center",
      "middle"
    );

    // Stats panel
    const statsPanelW = 300;
    this.renderer.drawPanel(cx - statsPanelW / 2, cy - 50, statsPanelW, 30, {
      bg: "rgba(6, 6, 20, 0.8)",
      border: "rgba(255, 221, 0, 0.2)",
      radius: 6,
    });

    ctx.save();
    ctx.font = `bold 12px Tektur`;
    ctx.fillStyle = COLORS.textGold;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Round: ${save.roundNumber}   ⭐ ${save.starCoins}   💰 ${save.coins}`,
      cx,
      cy - 35
    );
    ctx.restore();

    // Start button
    const blink = Math.sin(this.menuPulse * 3) > 0;
    const playPulse = (Math.sin(this.menuPulse * 2.5) + 1) / 2;
    const startBtnW = 260;
    const startBtnH = 44;
    const startBtnX = cx - startBtnW / 2;
    const startBtnY = cy + 10;

    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    this.renderer.drawButton(startBtnX, startBtnY, startBtnW, startBtnH, "▶  TAP TO START", {
      bg: blink ? "rgba(0, 50, 110, 0.9)" : "rgba(0, 30, 70, 0.8)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 16,
      radius: 10,
      glow: `rgba(0, 170, 255, ${0.1 + playPulse * 0.1})`,
    });
    ctx.restore();

    // Tutorial button — below start button
    this.renderer.drawButton(
      TUTORIAL_BTN_X,
      TUTORIAL_BTN_Y,
      TUTORIAL_BTN_W,
      TUTORIAL_BTN_H,
      "📖  TUTORIAL",
      {
        bg: "rgba(15, 15, 35, 0.85)",
        border: "rgba(100, 120, 160, 0.35)",
        textColor: COLORS.textSecondary,
        fontSize: 11,
        radius: 8,
      }
    );

    // Controls info panel
    const controlsY = cy + 115;
    this.renderer.drawPanel(cx - 200, controlsY - 8, 400, 45, {
      bg: "rgba(6, 6, 20, 0.6)",
      border: "rgba(100, 120, 160, 0.15)",
      radius: 6,
    });

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      ctx.save();
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Touch & drag to move  •  Right edge: Dash", cx, controlsY + 4);
      ctx.fillText("Auto-shoot  •  Destroy enemies → Coins → Upgrade", cx, controlsY + 18);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Mouse to move  •  Click / Space to dash", cx, controlsY + 8);
      ctx.fillText("Auto-fires to beat  •  Destroy enemies → Coins → Upgrade", cx, controlsY + 24);
      ctx.restore();
    }
  }
}

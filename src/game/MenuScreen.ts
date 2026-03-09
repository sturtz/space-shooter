import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import type { ScreenManager } from "./ScreenManager";

/**
 * Self-contained menu screen with its own canvas.
 * Handles: title screen, tutorial overlay, and transitions to game.
 */
export class MenuScreen {
  renderer: Renderer;
  manager: ScreenManager;

  private time: number = 0;
  private menuPulse: number = 0;

  // Tutorial state
  private showTutorial: boolean;
  private tutorialStep: 1 | 2 = 1;

  constructor(renderer: Renderer, manager: ScreenManager) {
    this.renderer = renderer;
    this.manager = manager;
    this.showTutorial = !manager.save.tutorialSeen;

    // Click handler — uses scaled coordinates
    const canvas = renderer.canvas;

    const getScaledCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / rect.width;
      const scaleY = GAME_HEIGHT / rect.height;
      return {
        mx: (clientX - rect.left) * scaleX,
        my: (clientY - rect.top) * scaleY,
      };
    };

    const handleClick = (_mx: number, _my: number) => {
      if (this.showTutorial) {
        this.advanceTutorial();
      } else {
        this.manager.startGame();
      }
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

  private advanceTutorial() {
    if (this.tutorialStep === 1) {
      this.tutorialStep = 2;
    } else {
      this.showTutorial = false;
      this.manager.save.tutorialSeen = true;
      import("../utils/SaveManager").then(({ saveGame }) => saveGame(this.manager.save));
    }
  }

  update(dt: number) {
    this.time += dt;
    this.menuPulse += dt;
  }

  render() {
    const r = this.renderer;
    const lastDt = 1 / 60;
    r.beginFrame(lastDt);

    if (this.showTutorial) {
      this.renderTutorial();
    } else {
      this.renderMenuContent();
    }

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
      `Level: ${save.currentLevel}   ⭐ ${save.starCoins}   💰 ${save.coins}`,
      cx,
      cy - 35
    );
    ctx.restore();

    // Start button (blinking)
    const blink = Math.sin(this.menuPulse * 3) > 0;
    const startBtnW = 260;
    const startBtnH = 40;
    const startBtnX = cx - startBtnW / 2;
    const startBtnY = cy + 10;

    this.renderer.drawButton(startBtnX, startBtnY, startBtnW, startBtnH, "TAP TO START", {
      bg: blink ? "rgba(14, 185, 211, 0.9)" : "rgba(8, 80, 95, 0.7)",
      border: "rgba(5, 78, 81, 0.5)",
      textColor: blink ? "#fff" : "rgba(255,255,255,0.5)",
      fontSize: 16,
      radius: 10,
      glow: blink ? "rgba(0, 234, 255, 0.2)" : undefined,
    });

    // Controls info panel
    const controlsY = cy + 75;
    this.renderer.drawPanel(cx - 200, controlsY - 8, 400, 45, {
      bg: "rgba(6, 6, 20, 0.6)",
      border: "rgba(100, 120, 160, 0.15)",
      radius: 6,
    });

    // Detect touch device
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
      ctx.fillText("Mouse to move  •  Shift to dash", cx, controlsY + 8);
      ctx.fillText("Auto-fires to beat  •  Destroy enemies → Coins → Upgrade", cx, controlsY + 24);
      ctx.restore();
    }
  }

  // ── Tutorial ──────────────────────────────────────────────────────────

  private renderTutorial() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const t = this.time;

    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Step indicator dots
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const active = i + 1 === this.tutorialStep;
      ctx.globalAlpha = active ? 1 : 0.3;
      ctx.fillStyle = active ? COLORS.player : "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 8 + i * 16, 30, active ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.tutorialStep === 1) {
      ctx.save();
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 14;
      this.renderer.drawTitleTextOutline(
        "HOW TO PLAY",
        cx,
        70,
        COLORS.player,
        "#000",
        22,
        "center",
        "middle"
      );
      ctx.restore();

      this.renderer.drawTitleText(
        "1 / 2  —  MOVEMENT",
        cx,
        100,
        COLORS.textSecondary,
        10,
        "center",
        "middle"
      );

      this.renderer.drawPanel(cx - 180, 128, 360, 90, {
        bg: "rgba(8, 8, 24, 0.88)",
        border: "rgba(0, 212, 255, 0.25)",
        radius: 10,
      });

      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TAP & DRAG anywhere", cx, 152);
      ctx.font = `11px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("to move your ship", cx, 172);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = "rgba(0,212,255,0.6)";
      ctx.fillText("Auto-shoots to the music beat", cx, 196);
      ctx.restore();

      // Animated drag illustration
      const dragCX = cx;
      const dragCY = 330;
      const dragLen = 80;
      const dragPhase = (t * 0.7) % 1;
      const fingerX = dragCX - dragLen / 2 + dragPhase * dragLen;

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(dragCX - dragLen / 2, dragCY);
      ctx.lineTo(dragCX + dragLen / 2, dragCY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const trailAlpha = dragPhase < 0.85 ? 0.75 : 0.75 * (1 - (dragPhase - 0.85) / 0.15);
      ctx.save();
      ctx.globalAlpha = trailAlpha;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fingerX, dragCY, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.player;
      ctx.globalAlpha = trailAlpha * 0.25;
      ctx.beginPath();
      ctx.arc(fingerX, dragCY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(fingerX, dragCY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      this.renderer.drawPanel(cx - 170, GAME_HEIGHT - 140, 340, 50, {
        bg: "rgba(4, 4, 14, 0.85)",
        border: "rgba(0,212,255,0.2)",
        radius: 8,
      });
      ctx.save();
      ctx.font = `9px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Your ship follows your finger.", cx, GAME_HEIGHT - 122);
      ctx.fillText(
        "Enemies fly toward the Mothership — don't let them reach it!",
        cx,
        GAME_HEIGHT - 106
      );
      ctx.restore();
    } else {
      // Step 2: Dash
      ctx.save();
      ctx.shadowColor = COLORS.dashReady;
      ctx.shadowBlur = 14;
      this.renderer.drawTitleTextOutline(
        "DASH",
        cx,
        70,
        COLORS.dashReady,
        "#000",
        22,
        "center",
        "middle"
      );
      ctx.restore();

      this.renderer.drawTitleText(
        "2 / 2  —  DASH",
        cx,
        100,
        COLORS.textSecondary,
        10,
        "center",
        "middle"
      );

      this.renderer.drawPanel(cx - 180, 128, 360, 90, {
        bg: "rgba(8, 8, 24, 0.88)",
        border: "rgba(100, 220, 255, 0.25)",
        radius: 10,
      });

      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TAP the DASH button", cx, 152);
      ctx.font = `11px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("bottom-right corner", cx, 172);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = "rgba(100,220,255,0.6)";
      ctx.fillText("Teleport + clear nearby bullets", cx, 196);
      ctx.restore();

      const dashBtnX = GAME_WIDTH - 60;
      const dashBtnY = GAME_HEIGHT - 80;
      const dashR = 30;
      const ringScale = 1 + 0.2 * Math.sin(t * 4);

      ctx.save();
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4);
      const glow = ctx.createRadialGradient(dashBtnX, dashBtnY, 0, dashBtnX, dashBtnY, dashR * 2);
      glow.addColorStop(0, COLORS.dashReady);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, dashR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, dashR * ringScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.font = `bold 9px Tektur`;
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashBtnX, dashBtnY);
      ctx.restore();

      const empProgress = (t * 0.7) % 1;
      const empRadius = empProgress * 90;
      const empAlpha = (1 - empProgress) * 0.35;
      ctx.save();
      ctx.globalAlpha = empAlpha;
      ctx.strokeStyle = "#44ccff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashBtnX, dashBtnY, empRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      this.renderer.drawPanel(cx - 170, GAME_HEIGHT - 140, 340, 50, {
        bg: "rgba(4, 4, 14, 0.85)",
        border: "rgba(100,220,255,0.2)",
        radius: 8,
      });
      ctx.save();
      ctx.font = `9px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Dash teleports you & fires an EMP ring.", cx, GAME_HEIGHT - 122);
      ctx.fillText("Clears enemy bullets • damages nearby enemies.", cx, GAME_HEIGHT - 106);
      ctx.restore();
    }

    // Continue button
    const blink = Math.sin(t * 3) > 0;
    const btnLabel = this.tutorialStep === 2 ? "GOT IT — LET'S GO!" : "TAP TO CONTINUE";
    const btnW = 240;
    const btnH = 36;
    const btnX = cx - btnW / 2;
    const btnY = GAME_HEIGHT - 52;

    this.renderer.drawButton(btnX, btnY, btnW, btnH, btnLabel, {
      bg: blink ? "rgba(4, 20, 16, 0.9)" : "rgba(4, 14, 10, 0.8)",
      border: blink ? "rgba(0, 212, 255, 0.5)" : "rgba(0, 212, 255, 0.22)",
      textColor: blink ? "#fff" : "rgba(255,255,255,0.55)",
      fontSize: 13,
      radius: 10,
      glow: blink ? "rgba(0, 212, 255, 0.18)" : undefined,
    });
  }
}

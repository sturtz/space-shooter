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

  constructor(renderer: Renderer, manager: ScreenManager) {
    this.renderer = renderer;
    this.manager = manager;
    this.showTutorial = !manager.save.tutorialSeen;

    // Click handler — uses scaled coordinates
    const canvas = renderer.canvas;

    const getScaledCoords = (clientX: number, clientY: number) => {
      return {
        mx: (clientX - this.renderer.gameOffsetX) / this.renderer.gameScale,
        my: (clientY - this.renderer.gameOffsetY) / this.renderer.gameScale,
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
    this.showTutorial = false;
    this.manager.save.tutorialSeen = true;
    import("../utils/SaveManager").then(({ saveGame }) => saveGame(this.manager.save));
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
    const cy = GAME_HEIGHT / 2;
    const t = this.time;

    // Dim overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Title
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    this.renderer.drawTitleTextOutline(
      "CONTROLS",
      cx,
      60,
      COLORS.player,
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    // ── Player ship in center (simulated) ──
    const playerX = cx;
    const playerY = cy - 20;

    // Player ship triangle
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COLORS.player;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playerX, playerY - 14);
    ctx.lineTo(playerX - 10, playerY + 10);
    ctx.lineTo(playerX + 10, playerY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Engine glow
    ctx.globalAlpha = 0.15;
    const engGlow = ctx.createRadialGradient(playerX, playerY, 0, playerX, playerY, 30);
    engGlow.addColorStop(0, COLORS.player);
    engGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = engGlow;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // "YOU" label above player
    ctx.save();
    ctx.font = `bold 10px Tektur`;
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.7;
    ctx.fillText("YOU", playerX, playerY - 30);
    ctx.restore();

    // Pulse ring around player (cone weapon range indicator)
    const pulseR = 18;
    const pulseAlpha = 0.2 + 0.1 * Math.sin(t * 4);
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(playerX, playerY, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Joystick area (left side) ──
    const joyX = 180;
    const joyY = cy + 100;
    const joyR = 50;
    const thumbPhase = (t * 0.5) % 1;
    const thumbOffX = Math.sin(thumbPhase * Math.PI * 2) * 25;
    const thumbOffY = Math.cos(thumbPhase * Math.PI * 2) * 15;

    // Outer ring
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(joyX, joyY, joyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(joyX, joyY, joyR, 0, Math.PI * 2);
    ctx.stroke();
    // Inner thumb
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(joyX + thumbOffX, joyY + thumbOffY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(joyX + thumbOffX, joyY + thumbOffY, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Joystick label
    ctx.save();
    ctx.font = `bold 12px Tektur`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DRAG TO MOVE", joyX, joyY - joyR - 18);
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Touch anywhere on left", joyX, joyY - joyR - 4);
    ctx.restore();

    // Arrow from joystick → player
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(joyX + joyR + 10, joyY - 30);
    ctx.lineTo(playerX - 30, playerY + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Dash button (right side) ──
    const dashX = GAME_WIDTH - 120;
    const dashY = GAME_HEIGHT - 120;
    const dashR = 48;
    const ringScale = 1 + 0.15 * Math.sin(t * 4);

    // Glow
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.1 * Math.sin(t * 4);
    const dashGlow = ctx.createRadialGradient(dashX, dashY, 0, dashX, dashY, dashR * 1.8);
    dashGlow.addColorStop(0, COLORS.dashReady);
    dashGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = dashGlow;
    ctx.beginPath();
    ctx.arc(dashX, dashY, dashR * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ring
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = COLORS.dashReady;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(dashX, dashY, dashR * ringScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.font = `bold 14px Tektur`;
    ctx.fillStyle = COLORS.dashReady;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DASH", dashX, dashY);
    ctx.restore();

    // Dash label
    ctx.save();
    ctx.font = `bold 12px Tektur`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TELEPORT + EMP", dashX, dashY - dashR - 18);
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Clears bullets nearby", dashX, dashY - dashR - 4);
    ctx.restore();

    // EMP ripple animation
    const empProgress = (t * 0.6) % 1;
    const empRadius = empProgress * 70;
    const empAlpha = (1 - empProgress) * 0.25;
    ctx.save();
    ctx.globalAlpha = empAlpha;
    ctx.strokeStyle = "#44ccff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(dashX, dashY, empRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Bottom info strip ──
    ctx.save();
    ctx.font = `11px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Auto-fires to the beat  •  Destroy enemies → Coins → Upgrade", cx, GAME_HEIGHT - 85);
    ctx.restore();

    // ── Continue button ──
    const blink = Math.sin(t * 3) > 0;
    const btnW = 280;
    const btnH = 44;
    const btnX = cx - btnW / 2;
    const btnY = GAME_HEIGHT - 52;

    this.renderer.drawButton(btnX, btnY, btnW, btnH, "GOT IT — LET'S GO!", {
      bg: blink ? "rgba(4, 20, 16, 0.9)" : "rgba(4, 14, 10, 0.8)",
      border: blink ? "rgba(0, 212, 255, 0.5)" : "rgba(0, 212, 255, 0.22)",
      textColor: blink ? "#fff" : "rgba(255,255,255,0.55)",
      fontSize: 15,
      radius: 10,
      glow: blink ? "rgba(0, 212, 255, 0.18)" : undefined,
    });
  }
}

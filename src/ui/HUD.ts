import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { vec2 } from "../utils/Math";

export interface HUDData {
  roundTimer: number;
  roundDuration: number;
  coins: number;
  roundCoins: number;
  roundKills: number;
  killStreak: number;
  level: number;
  mothershipHp: number;
  mothershipMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  playerShields: number;
  playerMaxShields: number;
  streakCoinBonus: number;
  dashReady: boolean;
  dashCooldownRatio: number;
  isMobile: boolean;
}

export class HUD {
  render(renderer: Renderer, data: HUDData) {
    const ctx = renderer.ctx;

    // Timer bar at top
    const timerRatio = Math.max(0, data.roundTimer / data.roundDuration);
    const timerBarWidth = GAME_WIDTH - 20;
    const timerColor = timerRatio > 0.3 ? COLORS.timerBar : COLORS.timerBarLow;

    renderer.drawRect(10, 8, timerBarWidth, 6, "#111");
    renderer.drawRect(10, 8, timerBarWidth * timerRatio, 6, timerColor);
    renderer.drawRectStroke(10, 8, timerBarWidth, 6, "#333");

    // Timer text
    const timeStr = data.roundTimer.toFixed(1) + "s";
    renderer.drawTextOutline(
      timeStr,
      GAME_WIDTH / 2,
      22,
      timerRatio > 0.3 ? COLORS.textPrimary : COLORS.timerBarLow,
      "#000",
      14,
      "center",
      "top",
    );

    // Level
    renderer.drawTextOutline(
      `Level ${data.level}`,
      10,
      22,
      COLORS.textSecondary,
      "#000",
      12,
      "left",
      "top",
    );

    // Coins (top right)
    renderer.drawTextOutline(
      `💰 ${data.coins}`,
      GAME_WIDTH - 10,
      22,
      COLORS.textGold,
      "#000",
      14,
      "right",
      "top",
    );

    // Round coins (below total)
    renderer.drawTextOutline(
      `+${data.roundCoins} this round`,
      GAME_WIDTH - 10,
      40,
      COLORS.coin,
      "#000",
      10,
      "right",
      "top",
    );

    // === PLAYER HP (prominent display, left side) ===
    const hpY = 42;
    const heartSize = 14;
    const heartSpacing = 18;

    // HP label
    renderer.drawTextOutline(
      "HP",
      10,
      hpY,
      COLORS.playerHp,
      "#000",
      11,
      "left",
      "top",
    );

    // Draw hearts for HP
    for (let i = 0; i < data.playerMaxHp; i++) {
      const hx = 30 + i * heartSpacing;
      const filled = i < data.playerHp;
      this.drawHeart(ctx, hx, hpY + heartSize / 2 + 1, heartSize / 2, filled);
    }

    // Player shields (below HP)
    if (data.playerMaxShields > 0) {
      const shieldY = hpY + 18;
      let shieldStr = "🛡";
      for (let i = 0; i < data.playerMaxShields; i++) {
        shieldStr += i < data.playerShields ? " ●" : " ○";
      }
      renderer.drawTextOutline(
        shieldStr,
        10,
        shieldY,
        COLORS.shield,
        "#000",
        10,
        "left",
        "top",
      );
    }

    // Dash indicator (below shields/HP)
    const dashY = data.playerMaxShields > 0 ? hpY + 36 : hpY + 18;
    if (data.dashReady) {
      renderer.drawTextOutline(
        "⟿ DASH READY",
        10,
        dashY,
        COLORS.dashReady,
        "#000",
        10,
        "left",
        "top",
      );
    } else {
      const pct = Math.floor(data.dashCooldownRatio * 100);
      renderer.drawTextOutline(
        `⟿ DASH ${pct}%`,
        10,
        dashY,
        COLORS.dashCooldown,
        "#000",
        10,
        "left",
        "top",
      );
    }

    // Kill streak (bottom left) with actual coin multiplier from econ_combo
    if (data.killStreak > 1) {
      const streakColor =
        data.killStreak > 10
          ? "#ff4444"
          : data.killStreak > 5
            ? "#ffaa00"
            : "#ffff00";
      const mult = data.streakCoinBonus;
      const multStr = mult > 1.0 ? ` ×${mult.toFixed(2)} coins` : "";
      renderer.drawTextOutline(
        `${data.killStreak}x STREAK!${multStr}`,
        10,
        GAME_HEIGHT - 20,
        streakColor,
        "#000",
        14,
        "left",
        "bottom",
      );
    }

    // Kills (bottom right)
    renderer.drawTextOutline(
      `☠ ${data.roundKills}`,
      GAME_WIDTH - 10,
      GAME_HEIGHT - 20,
      COLORS.textSecondary,
      "#000",
      12,
      "right",
      "bottom",
    );

    // Mobile controls hint
    if (data.isMobile) {
      renderer.drawTextOutline(
        "TAP RIGHT → DASH",
        GAME_WIDTH - 10,
        GAME_HEIGHT - 40,
        COLORS.mobileControl,
        "#000",
        9,
        "right",
        "bottom",
      );
    }
  }

  /** Draw a heart shape at the given position */
  private drawHeart(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    filled: boolean,
  ) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    // Heart shape using bezier curves
    const s = size;
    ctx.moveTo(0, s * 0.4);
    ctx.bezierCurveTo(-s * 0.1, s * 0.1, -s, s * 0.1, -s, -s * 0.3);
    ctx.bezierCurveTo(-s, -s * 0.8, -s * 0.2, -s * 0.9, 0, -s * 0.4);
    ctx.bezierCurveTo(s * 0.2, -s * 0.9, s, -s * 0.8, s, -s * 0.3);
    ctx.bezierCurveTo(s, s * 0.1, s * 0.1, s * 0.1, 0, s * 0.4);
    ctx.closePath();

    if (filled) {
      ctx.fillStyle = COLORS.playerHp;
      ctx.fill();
      ctx.strokeStyle = "#ff6666";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.playerHpBg;
      ctx.fill();
      ctx.strokeStyle = "#662222";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }
}

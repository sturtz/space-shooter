import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";

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
  playerShields: number;
  playerMaxShields: number;
  streakCoinBonus: number; // actual multiplier from econ_combo
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

    // Player shields (below level, left side)
    if (data.playerMaxShields > 0) {
      let shieldStr = "🛡";
      for (let i = 0; i < data.playerMaxShields; i++) {
        shieldStr += i < data.playerShields ? " ●" : " ○";
      }
      renderer.drawTextOutline(
        shieldStr,
        10,
        40,
        COLORS.shield,
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
  }
}

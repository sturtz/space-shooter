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
  playerHp: number;
  playerMaxHp: number;
  dashReady: boolean;
  dashCooldownRatio: number;
  isMobile: boolean;
}

export class HUD {
  render(renderer: Renderer, data: HUDData) {
    const ctx = renderer.ctx;
    const pad = 8;

    // ═══════════════════════════════════════════════════════════
    // TOP BAR — Timer + Level + Coins
    // ═══════════════════════════════════════════════════════════
    const topBarH = 32;
    const pauseSpace = 80; // leave room for pause button on right
    renderer.drawPanel(pad, pad, GAME_WIDTH - pad * 2 - pauseSpace, topBarH, {
      bg: "rgba(6, 6, 18, 0.82)",
      border: "rgba(40, 60, 100, 0.35)",
      radius: 6,
    });

    // Level badge (left)
    const lvlW = 56;
    renderer.drawRoundedRect(pad + 4, pad + 4, lvlW, topBarH - 8, 4, "rgba(0, 212, 255, 0.1)");
    renderer.drawRoundedRectStroke(
      pad + 4,
      pad + 4,
      lvlW,
      topBarH - 8,
      4,
      "rgba(0, 212, 255, 0.3)",
      1
    );
    renderer.drawTitleText(
      `LV ${data.level}`,
      pad + 4 + lvlW / 2,
      pad + topBarH / 2,
      COLORS.player,
      10,
      "center",
      "middle"
    );

    // Timer bar (center)
    const timerRatio = Math.max(0, data.roundTimer / data.roundDuration);
    const timerBarX = pad + lvlW + 14;
    const timerBarW = GAME_WIDTH - pad * 2 - pauseSpace - lvlW - 14 - 100;
    const timerBarY = pad + 9;
    const timerBarH = 14;
    const timerColorStart = timerRatio > 0.3 ? COLORS.timerGradA : COLORS.timerLowA;
    const timerColorEnd = timerRatio > 0.3 ? COLORS.timerGradB : COLORS.timerLowB;
    renderer.drawGradientBar(
      timerBarX,
      timerBarY,
      timerBarW,
      timerBarH,
      timerRatio,
      timerColorStart,
      timerColorEnd,
      "rgba(0,0,0,0.4)",
      "rgba(255,255,255,0.08)"
    );
    ctx.save();
    ctx.font = renderer.getFont(9, true);
    ctx.fillStyle = COLORS.textPrimary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      data.roundTimer.toFixed(1) + "s",
      timerBarX + timerBarW / 2,
      timerBarY + timerBarH / 2 + 1
    );
    ctx.restore();

    // Coins (right)
    const coinX = GAME_WIDTH - pad - pauseSpace - 6;
    ctx.save();
    ctx.font = renderer.getFont(11, true);
    ctx.fillStyle = COLORS.textGold;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`💰 ${data.coins}`, coinX, pad + topBarH / 2 - 2);
    ctx.font = renderer.getFont(9);
    ctx.fillStyle = "rgba(255, 221, 0, 0.5)";
    ctx.fillText(`+${data.roundCoins}`, coinX, pad + topBarH / 2 + 10);
    ctx.restore();

    // Dash indicator removed — ship glow/pulse communicates dash readiness

    // ═══════════════════════════════════════════════════════════
    // BOTTOM AREA — Streak + Kills
    // ═══════════════════════════════════════════════════════════
    if (data.killStreak > 1) {
      const streakColor =
        data.killStreak > 10 ? "#ff4444" : data.killStreak > 5 ? "#ffaa00" : "#ffff00";
      const streakY = GAME_HEIGHT - 14;
      renderer.drawPanel(pad, streakY - 12, 160, 22, {
        bg: "rgba(40, 20, 0, 0.7)",
        border: renderer.hexToRgba(streakColor, 0.3),
        radius: 4,
      });
      ctx.save();
      ctx.font = renderer.getFont(11, true);
      ctx.fillStyle = streakColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`🔥 ${data.killStreak}x STREAK`, pad + 8, streakY);
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // PLAYER HP — hearts displayed below the top bar
    // ═══════════════════════════════════════════════════════════
    if (data.playerMaxHp > 0) {
      const hpY = pad + topBarH + 8;
      const heartSize = 10;
      const heartGap = 4;
      const hpStartX = pad + 4;

      ctx.save();
      // Label
      ctx.font = renderer.getFont(8, true);
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("HP", hpStartX, hpY + heartSize / 2);

      const heartsX = hpStartX + 18;
      for (let i = 0; i < data.playerMaxHp; i++) {
        const x = heartsX + i * (heartSize + heartGap);
        const filled = i < data.playerHp;

        if (filled) {
          // Filled heart — red with glow
          ctx.fillStyle = COLORS.playerHp;
          ctx.shadowColor = COLORS.playerHp;
          ctx.shadowBlur = 4;
        } else {
          // Empty heart — dark outline
          ctx.fillStyle = "rgba(80, 30, 30, 0.6)";
          ctx.shadowBlur = 0;
        }

        // Draw diamond-heart shape
        ctx.beginPath();
        ctx.moveTo(x + heartSize / 2, hpY + heartSize - 1); // bottom point
        ctx.lineTo(x + heartSize - 1, hpY + heartSize / 3); // right
        ctx.lineTo(x + heartSize / 2, hpY); // top
        ctx.lineTo(x + 1, hpY + heartSize / 3); // left
        ctx.closePath();
        ctx.fill();

        if (!filled) {
          ctx.strokeStyle = "rgba(120, 50, 50, 0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    const killY = GAME_HEIGHT - 14;
    ctx.save();
    ctx.font = renderer.getFont(11, true);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`☠ ${data.roundKills}`, GAME_WIDTH - pad - 4, killY);
    ctx.restore();

    if (data.isMobile) {
      ctx.save();
      ctx.font = renderer.getFont(8);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("↘ DASH  (bottom-right)", GAME_WIDTH - pad - 4, GAME_HEIGHT - 28);
      ctx.restore();
    }
  }
}

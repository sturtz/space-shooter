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
    const pad = 8;

    // ═══════════════════════════════════════════════════════════
    // TOP BAR — Timer + Level + Coins in a sleek panel
    // ═══════════════════════════════════════════════════════════
    const topBarH = 32;
    renderer.drawPanel(pad, pad, GAME_WIDTH - pad * 2, topBarH, {
      bg: "rgba(6, 6, 18, 0.82)",
      border: "rgba(40, 60, 100, 0.35)",
      radius: 6,
    });

    // Level badge (left)
    const lvlW = 56;
    renderer.drawRoundedRect(
      pad + 4,
      pad + 4,
      lvlW,
      topBarH - 8,
      4,
      "rgba(0, 255, 204, 0.1)",
    );
    renderer.drawRoundedRectStroke(
      pad + 4,
      pad + 4,
      lvlW,
      topBarH - 8,
      4,
      "rgba(0, 255, 204, 0.3)",
      1,
    );
    renderer.drawTitleText(
      `LV ${data.level}`,
      pad + 4 + lvlW / 2,
      pad + topBarH / 2,
      COLORS.player,
      10,
      "center",
      "middle",
    );

    // Timer bar (center) — prominent gradient bar
    const timerRatio = Math.max(0, data.roundTimer / data.roundDuration);
    const timerBarX = pad + lvlW + 14;
    const timerBarW = GAME_WIDTH - pad * 2 - lvlW - 14 - 100;
    const timerBarY = pad + 9;
    const timerBarH = 14;

    const timerColorStart = timerRatio > 0.3 ? "#2266ff" : "#ff2244";
    const timerColorEnd = timerRatio > 0.3 ? "#44aaff" : "#ff6644";
    renderer.drawGradientBar(
      timerBarX,
      timerBarY,
      timerBarW,
      timerBarH,
      timerRatio,
      timerColorStart,
      timerColorEnd,
      "rgba(0, 0, 0, 0.4)",
      "rgba(255, 255, 255, 0.08)",
    );

    // Timer text centered on bar
    const timeStr = data.roundTimer.toFixed(1) + "s";
    ctx.save();
    ctx.font = `bold 9px 'Orbitron', monospace`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      timeStr,
      timerBarX + timerBarW / 2,
      timerBarY + timerBarH / 2 + 1,
    );
    ctx.restore();

    // Coins (right side of top bar)
    const coinX = GAME_WIDTH - pad - 6;
    ctx.save();
    ctx.font = `bold 11px 'Orbitron', monospace`;
    ctx.fillStyle = COLORS.textGold;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`💰 ${data.coins}`, coinX, pad + topBarH / 2 - 2);
    ctx.font = `9px monospace`;
    ctx.fillStyle = "rgba(255, 221, 0, 0.5)";
    ctx.fillText(`+${data.roundCoins}`, coinX, pad + topBarH / 2 + 10);
    ctx.restore();

    // ═══════════════════════════════════════════════════════════
    // LEFT PANEL — Player HP + Shields + Dash
    // ═══════════════════════════════════════════════════════════
    const leftPanelX = pad;
    const leftPanelY = pad + topBarH + 6;
    const leftPanelW = 140;
    const leftPanelH = data.playerMaxShields > 0 ? 62 : 46;

    renderer.drawPanel(leftPanelX, leftPanelY, leftPanelW, leftPanelH, {
      bg: "rgba(6, 6, 18, 0.75)",
      border: "rgba(50, 30, 30, 0.3)",
      radius: 6,
    });

    // HP Bar
    const hpBarX = leftPanelX + 6;
    const hpBarY = leftPanelY + 6;
    const hpBarW = leftPanelW - 12;
    const hpBarH = 10;
    const hpRatio = data.playerMaxHp > 0 ? data.playerHp / data.playerMaxHp : 0;

    renderer.drawGradientBar(
      hpBarX,
      hpBarY,
      hpBarW,
      hpBarH,
      hpRatio,
      "#cc2233",
      "#ff5566",
      "rgba(60, 10, 10, 0.6)",
      "rgba(255, 80, 80, 0.2)",
    );

    // HP label on top of bar
    ctx.save();
    ctx.font = `bold 7px 'Orbitron', monospace`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `♥ ${data.playerHp}/${data.playerMaxHp}`,
      hpBarX + 3,
      hpBarY + hpBarH / 2 + 1,
    );
    ctx.restore();

    // Shield Bar (if applicable)
    let nextY = hpBarY + hpBarH + 5;
    if (data.playerMaxShields > 0) {
      const shieldRatio =
        data.playerMaxShields > 0
          ? data.playerShields / data.playerMaxShields
          : 0;
      renderer.drawGradientBar(
        hpBarX,
        nextY,
        hpBarW,
        hpBarH,
        shieldRatio,
        "#2244aa",
        "#4488ff",
        "rgba(10, 10, 40, 0.6)",
        "rgba(68, 136, 255, 0.2)",
      );

      ctx.save();
      ctx.font = `bold 7px 'Orbitron', monospace`;
      ctx.fillStyle = "#aaccff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `🛡 ${data.playerShields}/${data.playerMaxShields}`,
        hpBarX + 3,
        nextY + hpBarH / 2 + 1,
      );
      ctx.restore();

      nextY += hpBarH + 5;
    }

    // Dash indicator — cooldown arc style
    const dashSize = 8;
    const dashCenterX = leftPanelX + 14;
    const dashCenterY = nextY + dashSize;

    if (data.dashReady) {
      // Glowing ready indicator
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = COLORS.dashReady;
      ctx.beginPath();
      ctx.arc(dashCenterX, dashCenterY, dashSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dashCenterX, dashCenterY, dashSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = `bold 8px 'Orbitron', monospace`;
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashCenterX + dashSize + 5, dashCenterY);
      ctx.restore();
    } else {
      // Cooldown ring
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashCenterX, dashCenterY, dashSize, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 2;
      const arc = data.dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        dashCenterX,
        dashCenterY,
        dashSize,
        -Math.PI / 2,
        -Math.PI / 2 + arc,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      const pct = Math.floor(data.dashCooldownRatio * 100);
      ctx.save();
      ctx.font = `bold 8px 'Orbitron', monospace`;
      ctx.fillStyle = COLORS.dashCooldown;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${pct}%`, dashCenterX + dashSize + 5, dashCenterY);
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // BOTTOM AREA — Streak + Kills
    // ═══════════════════════════════════════════════════════════

    // Kill streak (bottom left) — flashy
    if (data.killStreak > 1) {
      const streakColor =
        data.killStreak > 10
          ? "#ff4444"
          : data.killStreak > 5
            ? "#ffaa00"
            : "#ffff00";
      const mult = data.streakCoinBonus;
      const multStr = mult > 1.0 ? ` ×${mult.toFixed(1)}` : "";

      const streakY = GAME_HEIGHT - 14;
      const streakPanelW = 160;

      renderer.drawPanel(pad, streakY - 12, streakPanelW, 22, {
        bg: "rgba(40, 20, 0, 0.7)",
        border: renderer.hexToRgba(streakColor, 0.3),
        radius: 4,
      });

      ctx.save();
      ctx.font = `bold 11px 'Orbitron', monospace`;
      ctx.fillStyle = streakColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`🔥 ${data.killStreak}x STREAK${multStr}`, pad + 8, streakY);
      ctx.restore();
    }

    // Kills (bottom right)
    const killY = GAME_HEIGHT - 14;
    ctx.save();
    ctx.font = `bold 11px 'Orbitron', monospace`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`☠ ${data.roundKills}`, GAME_WIDTH - pad - 4, killY);
    ctx.restore();

    // Mobile controls hint
    if (data.isMobile) {
      ctx.save();
      ctx.font = `8px monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("TAP RIGHT → DASH", GAME_WIDTH - pad - 4, GAME_HEIGHT - 28);
      ctx.restore();
    }
  }
}

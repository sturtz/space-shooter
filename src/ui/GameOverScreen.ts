import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";

export interface GameOverData {
  deathCause: "mothership" | "player" | "time" | "";
  roundCoins: number;
  roundKills: number;
  totalCoins: number;
  currentLevel: number;
  gameTime: number;
}

export class GameOverScreen {
  render(renderer: Renderer, data: GameOverData) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const ctx = renderer.ctx;

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    let title: string;
    let subtitle: string;
    let titleColor: string;
    let panelBorder: string;
    let panelGlow: string;

    switch (data.deathCause) {
      case "mothership":
        title = "MOTHERSHIP DESTROYED";
        subtitle = "The mothership exploded!";
        titleColor = "#ff4444";
        panelBorder = "rgba(255, 68, 68, 0.3)";
        panelGlow = "rgba(255, 68, 68, 0.15)";
        break;
      case "player":
        title = "SHIP DESTROYED";
        subtitle = "Killed by enemy fire!";
        titleColor = "#ff6644";
        panelBorder = "rgba(255, 100, 68, 0.3)";
        panelGlow = "rgba(255, 100, 68, 0.15)";
        break;
      case "time":
        title = "TIME EXPIRED";
        subtitle = "The clock ran out!";
        titleColor = "#ffaa00";
        panelBorder = "rgba(255, 170, 0, 0.3)";
        panelGlow = "rgba(255, 170, 0, 0.15)";
        break;
      default:
        title = "ROUND COMPLETE";
        subtitle = `Level ${data.currentLevel}`;
        titleColor = "#00d4ff";
        panelBorder = "rgba(0, 180, 255, 0.3)";
        panelGlow = "rgba(0, 180, 255, 0.15)";
        break;
    }

    const panelW = 320;
    const panelH = 220;
    renderer.drawPanel(cx - panelW / 2, cy - panelH / 2, panelW, panelH, {
      bg: "rgba(6, 6, 20, 0.92)",
      border: panelBorder,
      radius: 12,
      glow: panelGlow,
      glowBlur: 20,
    });

    ctx.save();
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 15;
    renderer.drawTitleTextOutline(title, cx, cy - 82, titleColor, "#000", 18, "center", "middle");
    ctx.restore();

    ctx.save();
    ctx.font = "11px Tektur";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(subtitle, cx, cy - 56);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 100, cy - 40);
    ctx.lineTo(cx + 100, cy - 40);
    ctx.stroke();
    ctx.restore();

    const statY = cy - 22;
    const lineH = 22;

    ctx.save();
    ctx.font = "bold 11px Tektur";
    ctx.textBaseline = "middle";

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Coins Earned", cx - 100, statY);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.textGold;
    ctx.fillText(`+${data.roundCoins}`, cx + 100, statY);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Enemies Defeated", cx - 100, statY + lineH);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8866";
    ctx.fillText(`${data.roundKills}`, cx + 100, statY + lineH);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Total Coins", cx - 100, statY + lineH * 2);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.coin;
    ctx.fillText(`${data.totalCoins}`, cx + 100, statY + lineH * 2);

    ctx.restore();

    // Continue button — cyan START RUN style
    const blink = Math.sin(data.gameTime * 3) > 0;
    const playPulse = (Math.sin(data.gameTime * 2.5) + 1) / 2;
    const btnW = 260;
    const btnH = 44;
    const btnX = cx - btnW / 2;
    const btnY = cy + 60;

    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    renderer.drawButton(btnX, btnY, btnW, btnH, "▶  CONTINUE", {
      bg: blink ? "rgba(0, 50, 110, 0.9)" : "rgba(0, 30, 70, 0.8)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 14,
      radius: 10,
      glow: `rgba(0, 170, 255, ${0.1 + playPulse * 0.1})`,
    });
    ctx.restore();
  }
}

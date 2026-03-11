import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import type { InputManager } from "../input/InputManager";

export class MobileControls {
  render(renderer: Renderer, input: InputManager, dashReady: boolean, dashCooldownRatio: number) {
    const ctx = renderer.ctx;
    const joy = input.joystick;

    // Floating virtual joystick
    if (joy.active) {
      const baseR = input.JOYSTICK_RADIUS;
      const thumbR = 14;

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, baseR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, baseR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joy.thumbX, joy.thumbY, thumbR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joy.thumbX, joy.thumbY, thumbR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(joy.baseX, joy.baseY, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Dash button
    const dashX = GAME_WIDTH - 120;
    const dashY = GAME_HEIGHT - 120;
    const dashR = 48;
    ctx.save();

    if (dashReady) {
      ctx.globalAlpha = 0.1;
      const dashGlow = ctx.createRadialGradient(dashX, dashY, 0, dashX, dashY, dashR * 1.5);
      dashGlow.addColorStop(0, COLORS.dashReady);
      dashGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dashGlow;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.font = "bold 14px Tektur";
      ctx.fillStyle = COLORS.dashReady;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashX, dashY);
    } else {
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = "#445";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.dashReady;
      ctx.lineWidth = 3;
      const arc = dashCooldownRatio * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(dashX, dashY, dashR, -Math.PI / 2, -Math.PI / 2 + arc);
      ctx.stroke();
      const pct = Math.floor(dashCooldownRatio * 100);
      ctx.globalAlpha = 0.25;
      ctx.font = "bold 14px Tektur";
      ctx.fillStyle = COLORS.dashCooldown;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${pct}%`, dashX, dashY);
    }
    ctx.restore();
  }
}

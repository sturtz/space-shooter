import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { hitTestRect } from "../utils/Math";
import { saveGame } from "../utils/SaveManager";
import type { MusicTrack, SaveData } from "../utils/SaveManager";
import type { AudioManager } from "../audio/AudioManager";

/** Convert a hex color string (e.g. "#ff6644") to rgba with the given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Pause menu layout rectangles — scaled for mobile fat-finger usability */
interface PauseLayout {
  panel: { x: number; y: number; w: number; h: number };
  tracks: Array<{ track: MusicTrack; x: number; y: number; w: number; h: number }>;
  volumeBar: { x: number; y: number; w: number; h: number };
  algoArt: { x: number; y: number; w: number; h: number };
  resume: { x: number; y: number; w: number; h: number };
  tutorial: { x: number; y: number; w: number; h: number };
  forfeit: { x: number; y: number; w: number; h: number };
}

/** Pause button constants (top-right, always visible) */
const PAUSE_BTN_X = GAME_WIDTH - 72;
const PAUSE_BTN_Y = 6;
const PAUSE_BTN_W = 64;
const PAUSE_BTN_H = 36;

const PANEL_W = 420;
const PANEL_H = 530;

export class PauseMenu {
  /** Track whether user is dragging the volume bar (touch) */
  volumeDragActive = false;

  hitTestPauseButton(mx: number, my: number): boolean {
    return hitTestRect(mx, my, PAUSE_BTN_X, PAUSE_BTN_Y, PAUSE_BTN_W, PAUSE_BTN_H);
  }

  getLayout(): PauseLayout {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const px = cx - PANEL_W / 2;
    const py = cy - PANEL_H / 2;

    const btnW = PANEL_W - 50;
    const btnH = 40;
    const btnX = cx - btnW / 2;

    const tracks: MusicTrack[] = ["fire", "chill", "trap"];
    const trackBtnW = 90;
    const trackBtnH = 38;
    const trackGap = 14;
    const totalTrackW = trackBtnW * tracks.length + trackGap * (tracks.length - 1);
    const trackStartX = cx - totalTrackW / 2;
    const trackY = py + 100;

    const volBarX = px + 35;
    const volBarY = py + 210;
    const volBarW = PANEL_W - 70;
    const volBarH = 30;

    return {
      panel: { x: px, y: py, w: PANEL_W, h: PANEL_H },
      tracks: tracks.map((t, i) => ({
        track: t,
        x: trackStartX + i * (trackBtnW + trackGap),
        y: trackY,
        w: trackBtnW,
        h: trackBtnH,
      })),
      volumeBar: { x: volBarX, y: volBarY, w: volBarW, h: volBarH },
      algoArt: { x: btnX, y: py + 258, w: btnW, h: 34 },
      resume: { x: btnX, y: py + 310, w: btnW, h: btnH },
      tutorial: { x: btnX, y: py + 360, w: btnW, h: 34 },
      forfeit: { x: btnX, y: py + 405, w: btnW, h: btnH },
    };
  }

  /** Handle touch drag on the volume bar */
  handleVolumeTouch(mx: number, audio: AudioManager, save: SaveData) {
    const vb = this.getLayout().volumeBar;
    const ratio = Math.max(0, Math.min(1, (mx - vb.x) / vb.w));
    audio.setMusicVolume(ratio);
    save.musicVolume = ratio;
    saveGame(save);
  }

  /** Handle clicks within the pause menu. Returns action to take. */
  handleClick(
    mx: number,
    my: number,
    audio: AudioManager,
    save: SaveData
  ): "resume" | "forfeit" | "tutorial" | null {
    const layout = this.getLayout();

    // Track buttons
    for (const tb of layout.tracks) {
      if (hitTestRect(mx, my, tb.x, tb.y, tb.w, tb.h)) {
        const unlocked = audio.isTrackUnlocked(tb.track, save.upgradeLevels, save.prestigeCount);
        if (!unlocked) {
          audio.playError();
          return null;
        }
        audio.switchTrack(tb.track);
        save.musicTrack = tb.track;
        saveGame(save);
        audio.playClick();
        return null;
      }
    }

    // Volume bar
    const vb = layout.volumeBar;
    if (hitTestRect(mx, my, vb.x, vb.y, vb.w, vb.h)) {
      const ratio = Math.max(0, Math.min(1, (mx - vb.x) / vb.w));
      audio.setMusicVolume(ratio);
      save.musicVolume = ratio;
      saveGame(save);
      return null;
    }

    // Algo art toggle
    const aa = layout.algoArt;
    if (hitTestRect(mx, my, aa.x, aa.y, aa.w, aa.h)) {
      save.algoArtEnabled = !save.algoArtEnabled;
      saveGame(save);
      audio.playClick();
      return null;
    }

    // Resume button
    const rb = layout.resume;
    if (hitTestRect(mx, my, rb.x, rb.y, rb.w, rb.h)) {
      audio.playClick();
      return "resume";
    }

    // Tutorial button
    const tb = layout.tutorial;
    if (hitTestRect(mx, my, tb.x, tb.y, tb.w, tb.h)) {
      audio.playClick();
      return "tutorial";
    }

    // Forfeit button
    const fb = layout.forfeit;
    if (hitTestRect(mx, my, fb.x, fb.y, fb.w, fb.h)) {
      audio.playClick();
      return "forfeit";
    }

    return null;
  }

  /** Render the pause button (top-right, always visible during gameplay) */
  renderPauseButton(renderer: Renderer) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.globalAlpha = 0.35;
    renderer.drawRoundedRect(
      PAUSE_BTN_X,
      PAUSE_BTN_Y,
      PAUSE_BTN_W,
      PAUSE_BTN_H,
      6,
      "rgba(8, 8, 24, 0.85)"
    );
    ctx.globalAlpha = 0.25;
    renderer.drawRoundedRectStroke(
      PAUSE_BTN_X,
      PAUSE_BTN_Y,
      PAUSE_BTN_W,
      PAUSE_BTN_H,
      6,
      "rgba(100, 120, 180, 0.4)",
      1
    );

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffffff";
    const iconX = PAUSE_BTN_X + PAUSE_BTN_W / 2;
    const iconY = PAUSE_BTN_Y + PAUSE_BTN_H / 2;
    const barW = 5;
    const barH = 20;
    const barGap = 6;
    ctx.fillRect(iconX - barGap - barW, iconY - barH / 2, barW, barH);
    ctx.fillRect(iconX + barGap, iconY - barH / 2, barW, barH);
    ctx.restore();
  }

  /** Render the full pause overlay */
  renderOverlay(renderer: Renderer, audio: AudioManager, save: SaveData, isTouchDevice: boolean) {
    const ctx = renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const layout = this.getLayout();
    const p = layout.panel;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    renderer.drawPanel(p.x, p.y, p.w, p.h, {
      bg: "rgba(8, 8, 24, 0.94)",
      border: "rgba(100, 120, 180, 0.4)",
      radius: 14,
      glow: "rgba(100, 150, 255, 0.1)",
      glowBlur: 18,
    });

    // Title
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 12;
    renderer.drawTitleTextOutline("PAUSED", cx, p.y + 36, "#fff", "#000", 22, "center", "middle");
    ctx.restore();

    // Divider
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 20, p.y + 60);
    ctx.lineTo(p.x + p.w - 20, p.y + 60);
    ctx.stroke();
    ctx.restore();

    // Music Track Section
    ctx.save();
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MUSIC TRACK", cx, p.y + 80);
    ctx.restore();

    const trackColors: Record<string, string> = {
      fire: "#ff6644",
      chill: "#44ccff",
      trap: "#cc44ff",
    };
    const trackEmojis: Record<string, string> = { fire: "🔥", chill: "❄️", trap: "🎵" };

    for (const tb of layout.tracks) {
      const isActive = audio.track === tb.track;
      const isUnlocked = audio.isTrackUnlocked(tb.track, save.upgradeLevels, save.prestigeCount);
      const color = trackColors[tb.track] || "#fff";

      if (!isUnlocked) {
        const lockHint = tb.track === "chill" ? "Scythe" : "Prestige";
        renderer.drawButton(tb.x, tb.y, tb.w, tb.h, `🔒 ${tb.track.toUpperCase()}`, {
          bg: "rgba(10, 10, 20, 0.85)",
          border: "rgba(60, 60, 80, 0.3)",
          textColor: "rgba(100, 100, 120, 0.5)",
          fontSize: 11,
          radius: 8,
        });
        ctx.save();
        ctx.font = "8px Tektur";
        ctx.fillStyle = "rgba(100, 100, 130, 0.45)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`Req: ${lockHint}`, tb.x + tb.w / 2, tb.y + tb.h + 2);
        ctx.restore();
      } else {
        renderer.drawButton(
          tb.x,
          tb.y,
          tb.w,
          tb.h,
          `${trackEmojis[tb.track]} ${tb.track.toUpperCase()}`,
          {
            bg: isActive ? "rgba(40, 40, 80, 0.95)" : "rgba(15, 15, 35, 0.85)",
            border: isActive ? color : "rgba(100, 110, 140, 0.35)",
            textColor: isActive ? color : "rgba(180, 180, 200, 0.7)",
            fontSize: 11,
            radius: 8,
            glow: isActive ? hexToRgba(color, 0.2) : undefined,
          }
        );
      }
    }

    // Volume Section
    ctx.save();
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VOLUME", cx, p.y + 195);
    ctx.restore();

    const vb = layout.volumeBar;
    const vol = audio.getMusicVolume();
    renderer.drawGradientBar(
      vb.x,
      vb.y,
      vb.w,
      vb.h,
      vol,
      "#4488ff",
      "#00d4ff",
      "rgba(20, 20, 40, 0.8)",
      "rgba(80, 100, 160, 0.3)",
      vb.h / 2
    );

    ctx.save();
    ctx.font = "bold 11px Tektur";
    ctx.fillStyle = "#aabbcc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(vol * 100)}%`, cx, vb.y + vb.h / 2);
    ctx.restore();

    // Algo Art Toggle
    const aa = layout.algoArt;
    const aaOn = save.algoArtEnabled;
    const aaColor = aaOn ? "#aa44ff" : "rgba(100, 100, 120, 0.5)";
    const aaLabel = aaOn ? "✦  ALGO ART: ON" : "✦  ALGO ART: OFF";
    renderer.drawButton(aa.x, aa.y, aa.w, aa.h, aaLabel, {
      bg: aaOn ? "rgba(40, 20, 60, 0.9)" : "rgba(15, 15, 25, 0.85)",
      border: aaOn ? "rgba(170, 68, 255, 0.45)" : "rgba(60, 60, 80, 0.3)",
      textColor: aaColor,
      fontSize: 11,
      radius: 8,
      glow: aaOn ? "rgba(170, 68, 255, 0.15)" : undefined,
    });

    // Resume Button
    const rb = layout.resume;
    renderer.drawButton(rb.x, rb.y, rb.w, rb.h, "▶  RESUME", {
      bg: "rgba(20, 60, 50, 0.9)",
      border: "rgba(68, 255, 136, 0.45)",
      textColor: "#44ff88",
      fontSize: 14,
      radius: 8,
      glow: "rgba(68, 255, 136, 0.12)",
    });

    // Tutorial Button
    const tutBtn = layout.tutorial;
    renderer.drawButton(tutBtn.x, tutBtn.y, tutBtn.w, tutBtn.h, "📖  TUTORIAL", {
      bg: "rgba(15, 15, 35, 0.85)",
      border: "rgba(100, 120, 160, 0.35)",
      textColor: COLORS.textSecondary,
      fontSize: 11,
      radius: 8,
    });

    // Forfeit Button
    const fb = layout.forfeit;
    renderer.drawButton(fb.x, fb.y, fb.w, fb.h, "↩  BACK TO UPGRADES", {
      bg: "rgba(50, 20, 20, 0.85)",
      border: "rgba(255, 80, 80, 0.3)",
      textColor: "rgba(255, 120, 120, 0.8)",
      fontSize: 12,
      radius: 8,
    });

    // Keyboard hint (desktop only)
    if (!isTouchDevice) {
      ctx.save();
      ctx.font = "8px Tektur";
      ctx.fillStyle = "rgba(120, 130, 160, 0.5)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P / ESC to resume  ·  K to forfeit", cx, p.y + p.h - 14);
      ctx.restore();
    }
  }
}

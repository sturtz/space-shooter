import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import { hitTestRect } from "../utils/Math";
import { hasAbility } from "../utils/SaveManager";
import type { SaveData } from "../utils/SaveManager";

export interface BossRewardChoice {
  id: string;
  name: string;
  lines: string[];
  color: string;
  borderColor: string;
  glowColor: string;
}

export const BOSS_REWARD_CHOICES: BossRewardChoice[] = [
  {
    id: "laser",
    name: "TARGETING LASER",
    lines: ["Fires where you aim", "every 2.5 seconds", "Deals 3× weapon damage"],
    color: "#ff4444",
    borderColor: "rgba(255,68,68,0.7)",
    glowColor: "rgba(255,68,68,0.15)",
  },
  {
    id: "bomb_dash",
    name: "DASH BOMB",
    lines: ["Dash drops a bomb at", "start point", "2× damage, 80px blast"],
    color: "#ffaa00",
    borderColor: "rgba(255,170,0,0.7)",
    glowColor: "rgba(255,170,0,0.15)",
  },
  {
    id: "flashbang",
    name: "STUN FIELD",
    lines: ["Dash EMP freezes all", "enemies for 2 seconds", "+20px EMP range bonus"],
    color: "#44ccff",
    borderColor: "rgba(68,200,255,0.7)",
    glowColor: "rgba(68,200,255,0.15)",
  },
];

export class BossRewardScreen {
  private getCardLayout(): Array<{ x: number; y: number; w: number; h: number }> {
    const cardW = 155;
    const cardH = 220;
    const gap = 15;
    const totalW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - totalW) / 2;
    const startY = 280;
    return BOSS_REWARD_CHOICES.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    }));
  }

  /** Returns the chosen ability id, "continue" for auto-granted, or null for no action */
  handleClick(mx: number, my: number, autoGrantedAbility: string | null): string | null {
    if (autoGrantedAbility) {
      return "continue";
    }
    const layout = this.getCardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const card = layout[i];
      if (hitTestRect(mx, my, card.x, card.y, card.w, card.h)) {
        return BOSS_REWARD_CHOICES[i].id;
      }
    }
    return null;
  }

  render(renderer: Renderer, save: SaveData, autoGrantedAbility: string | null, gameTime: number) {
    const ctx = renderer.ctx;
    const cx = GAME_WIDTH / 2;

    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.save();
    ctx.shadowColor = COLORS.engineGlow;
    ctx.shadowBlur = 22;
    renderer.drawTitleTextOutline(
      "BOSS DEFEATED!",
      cx,
      180,
      COLORS.engineGlow,
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    if (autoGrantedAbility) {
      this.renderAutoGrant(renderer, autoGrantedAbility, gameTime);
      return;
    }
    this.renderChoiceScreen(renderer, save, gameTime);
  }

  private renderAutoGrant(renderer: Renderer, abilityId: string, gameTime: number) {
    const ctx = renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const choice = BOSS_REWARD_CHOICES.find((c) => c.id === abilityId);
    if (!choice) return;

    renderer.drawTitleText("New Ability Unlocked!", cx, 218, "#ffffff", 14, "center", "middle");

    const cardW = 220;
    const cardH = 260;
    const cardX = cx - cardW / 2;
    const cardY = 250;

    renderer.drawPanel(cardX, cardY, cardW, cardH, {
      bg: "rgba(25,25,55,0.96)",
      border: choice.borderColor,
      radius: 12,
      glow: choice.glowColor,
      glowBlur: 28,
    });

    this.drawAbilityIcon(ctx, choice.id, cx, cardY + 60, choice.color);

    ctx.save();
    ctx.font = "bold 16px Tektur";
    ctx.fillStyle = choice.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = choice.color;
    ctx.shadowBlur = 12;
    ctx.fillText(choice.name, cx, cardY + 110);
    ctx.restore();

    ctx.save();
    ctx.font = "11px Tektur";
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let j = 0; j < choice.lines.length; j++) {
      ctx.fillText(choice.lines[j], cx, cardY + 140 + j * 20);
    }
    ctx.restore();

    ctx.save();
    ctx.font = "bold 12px Tektur";
    ctx.fillStyle = choice.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓ EQUIPPED", cx, cardY + cardH - 28);
    ctx.restore();

    const blink = Math.sin(gameTime * 3) > 0;
    const btnW = 260;
    const btnH = 36;
    const btnX = cx - btnW / 2;
    const btnY = cardY + cardH + 20;
    renderer.drawButton(btnX, btnY, btnW, btnH, "TAP TO CONTINUE", {
      bg: blink ? "rgba(61, 180, 150, 0.9)" : "rgba(10, 20, 15, 0.8)",
      border: blink ? "rgba(38, 180, 180, 0.4)" : "rgba(100, 200, 150, 0.2)",
      textColor: blink ? "#fff" : "rgba(255,255,255,0.5)",
      fontSize: 13,
      radius: 8,
      glow: blink ? "rgba(15, 210, 228, 0.15)" : undefined,
    });
  }

  private renderChoiceScreen(renderer: Renderer, save: SaveData, gameTime: number) {
    const ctx = renderer.ctx;
    const cx = GAME_WIDTH / 2;

    renderer.drawTitleText(
      "Choose your Special Ability",
      cx,
      218,
      COLORS.textSecondary,
      12,
      "center",
      "middle"
    );

    if (save.specialAbilities.length > 0) {
      const owned = save.specialAbilities
        .map((id) => BOSS_REWARD_CHOICES.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      ctx.save();
      ctx.font = "8px Tektur";
      ctx.fillStyle = "#aabbcc";
      ctx.globalAlpha = 0.7;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Owned: ${owned} — pick a new one to add`, cx, 242);
      ctx.restore();
    }

    const layout = this.getCardLayout();
    for (let i = 0; i < BOSS_REWARD_CHOICES.length; i++) {
      const choice = BOSS_REWARD_CHOICES[i];
      const card = layout[i];
      const isCurrent = hasAbility(save, choice.id);

      renderer.drawPanel(card.x, card.y, card.w, card.h, {
        bg: isCurrent ? "rgba(25,25,55,0.96)" : "rgba(10,10,28,0.94)",
        border: isCurrent ? choice.borderColor : "rgba(120,120,160,0.35)",
        radius: 10,
        glow: choice.glowColor,
        glowBlur: isCurrent ? 22 : 10,
      });

      this.drawAbilityIcon(ctx, choice.id, card.x + card.w / 2, card.y + 52, choice.color);

      ctx.save();
      ctx.font = "bold 12px Tektur";
      ctx.fillStyle = choice.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = choice.color;
      ctx.shadowBlur = isCurrent ? 8 : 0;
      ctx.fillText(choice.name, card.x + card.w / 2, card.y + 98);
      ctx.restore();

      ctx.save();
      ctx.font = "8.5px Tektur";
      ctx.fillStyle = COLORS.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let j = 0; j < choice.lines.length; j++) {
        ctx.fillText(choice.lines[j], card.x + card.w / 2, card.y + 122 + j * 16);
      }
      ctx.restore();

      const btnY = card.y + card.h - 36;
      const btnX = card.x + 12;
      const btnW = card.w - 24;
      renderer.drawButton(btnX, btnY, btnW, 24, isCurrent ? "EQUIPPED ✓" : "CHOOSE", {
        bg: isCurrent ? "rgba(30,30,60,0.9)" : "rgba(10,20,35,0.85)",
        border: choice.borderColor,
        textColor: isCurrent ? choice.color : "#ffffff",
        fontSize: 9,
        radius: 5,
      });
    }

    // Suppress unused var — gameTime reserved for future animation
    void gameTime;

    ctx.save();
    ctx.font = "8px Tektur";
    ctx.fillStyle = "rgba(150,150,180,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Tap a card to equip — ability carries into future runs",
      cx,
      layout[0].y + layout[0].h + 22
    );
    ctx.restore();
  }

  private drawAbilityIcon(
    ctx: CanvasRenderingContext2D,
    id: string,
    cx: number,
    cy: number,
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.92;

    if (id === "laser") {
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let g = 0; g < 4; g++) {
        const angle = (g / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 17, cy + Math.sin(angle) * 17);
        ctx.lineTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 10);
      ctx.lineTo(cx + 10, cy - 22);
      ctx.stroke();
    } else if (id === "bomb_dash") {
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 8);
      ctx.quadraticCurveTo(cx + 16, cy - 16, cx + 11, cy - 22);
      ctx.stroke();
      ctx.fillStyle = COLORS.engineGlow;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx + 11, cy - 22, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "flashbang") {
      const spikes = 8;
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7);
        ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 18);
        ctx.stroke();
        const perpA = angle + Math.PI / 2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * 18 + Math.cos(perpA) * 4,
          cy + Math.sin(angle) * 18 + Math.sin(perpA) * 4
        );
        ctx.lineTo(
          cx + Math.cos(angle) * 18 - Math.cos(perpA) * 4,
          cy + Math.sin(angle) * 18 - Math.sin(perpA) * 4
        );
        ctx.stroke();
        ctx.lineWidth = 2;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

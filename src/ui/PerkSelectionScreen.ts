import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../utils/Constants";
import type { PerkDef } from "../systems/PerkSystem";

/**
 * Perk selection overlay — shown mid-run when player levels up.
 * Displays 3 perk cards to pick from. Pauses gameplay while visible.
 */
export class PerkSelectionScreen {
  /** Hit-test a click and return the selected perk ID, or null */
  handleClick(mx: number, my: number, choices: PerkDef[]): string | null {
    const layout = this.getCardLayout(choices.length);
    for (let i = 0; i < layout.length; i++) {
      const card = layout[i];
      if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
        return choices[i].id;
      }
    }
    return null;
  }

  /** Render the perk selection overlay */
  render(renderer: Renderer, choices: PerkDef[], perkLevel: number, gameTime: number): void {
    const ctx = renderer.ctx;

    // ── Dim overlay ──
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // ── Title ──
    const titleY = GAME_HEIGHT * 0.18;
    const pulse = 0.85 + 0.15 * Math.sin(gameTime * 4);
    ctx.globalAlpha = pulse;
    ctx.font = renderer.getFont(22, true);
    ctx.fillStyle = "#ffdd00";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffdd00";
    ctx.shadowBlur = 12;
    ctx.fillText(`⬆ LEVEL ${perkLevel}`, GAME_WIDTH / 2, titleY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Subtitle
    ctx.font = renderer.getFont(11);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Choose a perk", GAME_WIDTH / 2, titleY + 28);

    // ── Perk cards ──
    const layout = this.getCardLayout(choices.length);
    for (let i = 0; i < choices.length; i++) {
      this.renderCard(renderer, choices[i], layout[i], gameTime);
    }

    ctx.restore();
  }

  private getCardLayout(count: number): { x: number; y: number; w: number; h: number }[] {
    const cardW = 180;
    const cardH = 200;
    const gap = 24;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2;
    const cardY = GAME_HEIGHT * 0.32;

    const cards: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < count; i++) {
      cards.push({
        x: startX + i * (cardW + gap),
        y: cardY,
        w: cardW,
        h: cardH,
      });
    }
    return cards;
  }

  private renderCard(
    renderer: Renderer,
    perk: PerkDef,
    rect: { x: number; y: number; w: number; h: number },
    gameTime: number
  ): void {
    const ctx = renderer.ctx;
    const { x, y, w, h } = rect;

    // Card background
    renderer.drawPanel(x, y, w, h, {
      bg: "rgba(10, 10, 35, 0.92)",
      border: perk.color,
      radius: 10,
    });

    // Glow border pulse
    const glowAlpha = 0.2 + 0.1 * Math.sin(gameTime * 3);
    ctx.save();
    ctx.globalAlpha = glowAlpha;
    ctx.shadowColor = perk.color;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = perk.color;
    ctx.lineWidth = 2;
    renderer.drawRoundedRectStroke(x, y, w, h, 10, perk.color, 2);
    ctx.restore();

    // Icon
    ctx.save();
    ctx.font = "36px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(perk.icon, x + w / 2, y + 50);
    ctx.restore();

    // Name
    ctx.save();
    ctx.font = renderer.getFont(13, true);
    ctx.fillStyle = perk.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(perk.name, x + w / 2, y + 95);
    ctx.restore();

    // Description
    ctx.save();
    ctx.font = renderer.getFont(10);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(perk.description, x + w / 2, y + 125);
    ctx.restore();

    // Max stacks indicator
    ctx.save();
    ctx.font = renderer.getFont(8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`max ×${perk.maxStacks}`, x + w / 2, y + h - 18);
    ctx.restore();
  }
}

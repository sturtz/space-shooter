import { Renderer } from "../rendering/Renderer";
import { GAME_WIDTH, GAME_HEIGHT, COLORS, CONE_RANGE } from "../utils/Constants";
import { PlayerImages, ShipImages, AsteroidImages, ItemImages, imageReady } from "../utils/Assets";
import { saveGame } from "../utils/SaveManager";
import type { ScreenManager } from "./ScreenManager";

const TUTORIAL_PAGES = 3;

/**
 * Self-contained menu screen with its own canvas.
 * Handles: title screen, multi-page tutorial overlay, and transitions to game.
 */
export class MenuScreen {
  renderer: Renderer;
  manager: ScreenManager;

  private time: number = 0;
  private menuPulse: number = 0;

  // Tutorial state
  private showTutorial: boolean;
  private tutorialPage: number = 0; // 0-based page index

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
    this.tutorialPage++;
    if (this.tutorialPage >= TUTORIAL_PAGES) {
      this.showTutorial = false;
      this.manager.save.tutorialSeen = true;
      saveGame(this.manager.save);
    }
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

    // Start button — cyan START RUN style
    const blink = Math.sin(this.menuPulse * 3) > 0;
    const playPulse = (Math.sin(this.menuPulse * 2.5) + 1) / 2;
    const startBtnW = 260;
    const startBtnH = 44;
    const startBtnX = cx - startBtnW / 2;
    const startBtnY = cy + 10;

    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    this.renderer.drawButton(startBtnX, startBtnY, startBtnW, startBtnH, "▶  TAP TO START", {
      bg: blink ? "rgba(0, 50, 110, 0.9)" : "rgba(0, 30, 70, 0.8)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 16,
      radius: 10,
      glow: `rgba(0, 170, 255, ${0.1 + playPulse * 0.1})`,
    });
    ctx.restore();

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

  // ── Tutorial (Multi-page) ────────────────────────────────────────────

  private renderTutorial() {
    switch (this.tutorialPage) {
      case 0:
        this.renderTutorialPage1_Allies();
        break;
      case 1:
        this.renderTutorialPage2_HowToPlay();
        break;
      case 2:
        this.renderTutorialPage3_Controls();
        break;
    }
  }

  // ── Shared tutorial helpers ───────────────────────────────────────────

  /** Draw page indicator dots */
  private drawPageDots(y: number) {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const dotSpacing = 18;
    const startX = cx - ((TUTORIAL_PAGES - 1) * dotSpacing) / 2;

    for (let i = 0; i < TUTORIAL_PAGES; i++) {
      ctx.save();
      const isActive = i === this.tutorialPage;
      ctx.fillStyle = isActive ? COLORS.player : "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(startX + i * dotSpacing, y, isActive ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Draw continue button at bottom — cyan START RUN style, positioned high enough for mobile */
  private drawContinueButton(label: string) {
    const cx = GAME_WIDTH / 2;
    const t = this.time;
    const blink = Math.sin(t * 3) > 0;
    const playPulse = (Math.sin(t * 2.5) + 1) / 2;
    const btnW = 280;
    const btnH = 48;
    const btnX = cx - btnW / 2;
    // Position higher — same Y zone as the START RUN button on upgrade screen (bottom bar area)
    const btnY = GAME_HEIGHT - 80;

    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.shadowColor = `rgba(0, 200, 255, ${0.15 + playPulse * 0.15})`;
    ctx.shadowBlur = 12 + playPulse * 8;
    this.renderer.drawButton(btnX, btnY, btnW, btnH, label, {
      bg: blink ? "rgba(0, 50, 110, 0.9)" : "rgba(0, 30, 70, 0.8)",
      border: `rgba(0, 180, 255, ${0.4 + playPulse * 0.2})`,
      textColor: COLORS.player,
      fontSize: 15,
      radius: 10,
      glow: `rgba(0, 170, 255, ${0.1 + playPulse * 0.1})`,
    });
    ctx.restore();

    // Page dots above button
    this.drawPageDots(btnY - 18);
  }

  /** Draw a dim background overlay */
  private drawOverlay() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  /** Draw a labeled sprite at a position with optional floating animation */
  private drawSpriteShowcase(
    sprite: HTMLImageElement,
    x: number,
    y: number,
    size: number,
    label: string,
    labelColor: string,
    floatOffset: number = 0,
    rotation: number = 0,
    description?: string
  ) {
    const ctx = this.renderer.ctx;
    const t = this.time;
    const floatY = y + Math.sin(t * 2 + floatOffset) * 4;

    // Glow behind sprite
    ctx.save();
    ctx.globalAlpha = 0.25;
    const glow = ctx.createRadialGradient(x, floatY, 0, x, floatY, size * 0.8);
    glow.addColorStop(0, labelColor);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, floatY, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sprite
    if (imageReady(sprite)) {
      ctx.save();
      ctx.translate(x, floatY);
      if (rotation) ctx.rotate(rotation);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    // Label
    ctx.save();
    ctx.font = `bold 12px Tektur`;
    ctx.fillStyle = labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = labelColor;
    ctx.shadowBlur = 6;
    ctx.fillText(label, x, floatY + size / 2 + 16);
    ctx.shadowBlur = 0;

    // Description
    if (description) {
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.shadowBlur = 0;
      ctx.fillText(description, x, floatY + size / 2 + 34);
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 1: KNOW YOUR FLEET — Allies only (player, mothership, coins)
  // ═══════════════════════════════════════════════════════════════════════

  private renderTutorialPage1_Allies() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const t = this.time;

    this.drawOverlay();

    // Title
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    this.renderer.drawTitleTextOutline(
      "KNOW YOUR FLEET",
      cx,
      60,
      COLORS.player,
      "#000",
      24,
      "center",
      "middle"
    );
    ctx.restore();

    ctx.save();
    ctx.font = `11px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("These are your allies in battle", cx, 90);
    ctx.restore();

    // ── The three allies displayed large and centered ──
    const rowY = 280;

    // Player ship — large showcase
    this.drawSpriteShowcase(
      PlayerImages.glider,
      cx - 250,
      rowY,
      80,
      "YOUR SHIP",
      COLORS.player,
      0,
      Math.PI / 2, // SVG nose points up, rotate to face right
      "Fly toward enemies to attack"
    );

    // Mothership (spins slowly) — centerpiece
    this.drawSpriteShowcase(
      ShipImages.mothership,
      cx,
      rowY,
      100,
      "MOTHERSHIP",
      COLORS.mothership,
      1,
      t * 0.5,
      "Protect at all costs!"
    );

    // Coin
    this.drawSpriteShowcase(
      ItemImages.coin,
      cx + 250,
      rowY,
      50,
      "COINS",
      COLORS.coin,
      2,
      0,
      "Collect to buy upgrades"
    );

    // ── Bottom tip ──
    ctx.save();
    ctx.font = `11px Tektur`;
    ctx.fillStyle = COLORS.mothership;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠  If the Mothership is destroyed, you lose!", cx, GAME_HEIGHT - 110);
    ctx.restore();

    this.drawContinueButton("NEXT →");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 2: HOW TO PLAY — Core gameplay loop
  // ═══════════════════════════════════════════════════════════════════════

  private renderTutorialPage2_HowToPlay() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const t = this.time;

    this.drawOverlay();

    // Title
    ctx.save();
    ctx.shadowColor = "#ffdd00";
    ctx.shadowBlur = 16;
    this.renderer.drawTitleTextOutline(
      "HOW TO PLAY",
      cx,
      48,
      "#ffdd00",
      "#000",
      22,
      "center",
      "middle"
    );
    ctx.restore();

    // ── Step 1: Move to enemies (asteroid) ──
    const step1X = cx - 300;
    const step1Y = 190;
    this.drawStepPanel(step1X - 120, step1Y - 70, 240, 220, "1");

    // Asteroid (target) — floating gently
    const asteroidSprite = AsteroidImages.big[0];
    const asteroidX = step1X + 20;
    const asteroidY = step1Y - 5 + Math.sin(t * 1.2) * 3;

    // Player ship (smoothly moving toward and over asteroid)
    const playerStartX = step1X - 60;
    const playerEndX = asteroidX; // player reaches the asteroid
    const movePhase = 0.5 + 0.5 * Math.sin(t * 0.8);
    const playerMoveX = playerStartX + (playerEndX - playerStartX) * movePhase;
    const playerMoveY = step1Y + 5 - (playerEndX - playerMoveX) * 0.08;

    // Draw asteroid first (behind player)
    if (imageReady(asteroidSprite)) {
      ctx.save();
      ctx.translate(asteroidX, asteroidY);
      ctx.rotate(t * 0.3); // slow spin like in-game
      // Glow
      const rockGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
      rockGlow.addColorStop(0, "rgba(220,160,90,0.5)");
      rockGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rockGlow;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = "brightness(1.5) drop-shadow(1px 1px 5px rgba(255,255,255,0.3))";
      ctx.drawImage(asteroidSprite, -20, -20, 40, 40);
      ctx.filter = "none";
      ctx.restore();
    }

    // Draw player on top of asteroid
    if (imageReady(PlayerImages.glider)) {
      ctx.save();
      // Face toward asteroid
      const dx = asteroidX - playerMoveX;
      const dy = asteroidY - playerMoveY;
      const aimAngle = Math.atan2(dy, dx);
      ctx.translate(playerMoveX, playerMoveY);
      ctx.rotate(aimAngle + Math.PI / 2); // SVG nose-up → aim direction
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 10;
      ctx.drawImage(PlayerImages.glider, -14, -20, 28, 40);
      ctx.restore();
    }

    // Label
    ctx.save();
    ctx.font = `bold 13px Tektur`;
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MOVE TO ENEMIES", step1X, step1Y + 60);
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Fly your ship toward", step1X, step1Y + 80);
    ctx.fillText("asteroids & enemy ships", step1X, step1Y + 95);
    ctx.restore();

    // ── Step 2: Hit with the beat — matching in-game loader ring + shockwave ──
    const step2X = cx;
    const step2Y = 190;
    this.drawStepPanel(step2X - 120, step2Y - 70, 240, 220, "2");

    // Slow beat cycle: ~3 seconds per beat for readability
    const beatCycleDuration = 3.0;
    const beatProgress = (t % beatCycleDuration) / beatCycleDuration; // 0→1 over cycle
    const firePoint = 0.85; // fire happens at 85% of cycle
    const isFiring = beatProgress > firePoint;
    const flashPower = isFiring ? 1 - (beatProgress - firePoint) / (1 - firePoint) : 0;

    // Position for the asteroid + player cluster (player overlapping asteroid)
    const clusterX = step2X;
    const clusterY = step2Y - 15;

    // Asteroid drawn first (behind player)
    if (imageReady(asteroidSprite)) {
      ctx.save();
      ctx.translate(clusterX + 8, clusterY - 6);
      ctx.rotate(t * 0.2);
      if (isFiring) {
        ctx.filter = "brightness(3)";
        ctx.globalAlpha = 0.6;
      }
      // Glow
      const rockGlow2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      rockGlow2.addColorStop(0, "rgba(220,160,90,0.4)");
      rockGlow2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rockGlow2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(asteroidSprite, -16, -16, 32, 32);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Player ship on top of asteroid
    if (imageReady(PlayerImages.glider)) {
      ctx.save();
      ctx.translate(clusterX, clusterY);
      ctx.rotate(Math.PI / 2); // face right
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 8;
      ctx.drawImage(PlayerImages.glider, -12, -18, 24, 36);
      ctx.restore();
    }

    // Loader ring — fills up over the beat cycle (matches in-game)
    const loaderRadius = 18;
    const loaderArc = Math.min(beatProgress / firePoint, 1) * Math.PI * 2;
    const loaderAlpha = 0.3 + Math.min(beatProgress / firePoint, 1) * 0.5;

    ctx.save();
    ctx.globalAlpha = loaderAlpha;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(clusterX, clusterY, loaderRadius, -Math.PI / 2, -Math.PI / 2 + loaderArc);
    ctx.stroke();
    ctx.restore();

    // Ready glow when loader is nearly full
    if (beatProgress > firePoint * 0.75 && !isFiring) {
      const readyPulse = (beatProgress / firePoint - 0.75) * 4;
      ctx.save();
      ctx.globalAlpha = readyPulse * 0.08;
      const readyGrad = ctx.createRadialGradient(
        clusterX,
        clusterY,
        0,
        clusterX,
        clusterY,
        CONE_RANGE
      );
      readyGrad.addColorStop(0, COLORS.player);
      readyGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = readyGrad;
      ctx.beginPath();
      ctx.arc(clusterX, clusterY, CONE_RANGE, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shockwave on fire — expanding ring (matches in-game)
    if (isFiring) {
      const expandProgress = 1 - flashPower;
      const shockRadius = CONE_RANGE * (0.4 + expandProgress * 0.8) * 1.5;

      // Outer shockwave ring (cyan)
      ctx.save();
      ctx.globalAlpha = flashPower * 0.7;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 3 * flashPower;
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 12 * flashPower;
      ctx.beginPath();
      ctx.arc(clusterX, clusterY, shockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner ring (white)
      ctx.save();
      ctx.globalAlpha = flashPower * 0.4;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * flashPower;
      ctx.beginPath();
      ctx.arc(clusterX, clusterY, shockRadius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Central flash fill
      ctx.save();
      const splashGrad = ctx.createRadialGradient(
        clusterX,
        clusterY,
        0,
        clusterX,
        clusterY,
        CONE_RANGE * 1.5
      );
      splashGrad.addColorStop(0, `rgba(136, 238, 255, ${flashPower * 0.25})`);
      splashGrad.addColorStop(0.4, `rgba(0, 212, 255, ${flashPower * 0.1})`);
      splashGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = splashGrad;
      ctx.beginPath();
      ctx.arc(clusterX, clusterY, CONE_RANGE * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Radial spike lines
      ctx.save();
      ctx.globalAlpha = flashPower * 0.3;
      ctx.strokeStyle = "#aaeeff";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + expandProgress * 0.3;
        const innerR = CONE_RANGE * 0.15;
        const outerR = CONE_RANGE * (0.5 + expandProgress * 0.5) * 1.5;
        ctx.beginPath();
        ctx.moveTo(clusterX + Math.cos(a) * innerR, clusterY + Math.sin(a) * innerR);
        ctx.lineTo(clusterX + Math.cos(a) * outerR, clusterY + Math.sin(a) * outerR);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Damage number on hit
    if (isFiring && flashPower > 0.5) {
      ctx.save();
      ctx.font = `bold 12px Tektur`;
      ctx.fillStyle = COLORS.bullet;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = flashPower;
      ctx.fillText("-1", clusterX + 30, clusterY - 28);
      ctx.restore();
    }

    // Label
    ctx.save();
    ctx.font = `bold 13px Tektur`;
    ctx.fillStyle = COLORS.bullet;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HIT TO THE BEAT", step2X, step2Y + 60);
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Your ship auto-fires in", step2X, step2Y + 80);
    ctx.fillText("rhythm — get close to hit!", step2X, step2Y + 95);
    ctx.restore();

    // ── Step 3: Collect coins & upgrade ──
    const step3X = cx + 300;
    const step3Y = 190;
    this.drawStepPanel(step3X - 120, step3Y - 70, 240, 220, "3");

    // Explosion particles
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 + t * 0.5;
      const dist = 12 + Math.sin(t * 3 + i) * 8;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = COLORS.explosion;
      ctx.beginPath();
      ctx.arc(
        step3X - 10 + Math.cos(angle) * dist,
        step3Y - 20 + Math.sin(angle) * dist,
        2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    // Coins spreading out from explosion
    if (imageReady(ItemImages.coin)) {
      for (let i = 0; i < 3; i++) {
        const coinAngle = (Math.PI * 2 * i) / 3 + 0.5;
        const coinDist = 20 + Math.sin(t * 2 + i * 2) * 10;
        const coinX = step3X + Math.cos(coinAngle) * coinDist;
        const coinY = step3Y - 10 + Math.sin(coinAngle) * coinDist;
        ctx.save();
        ctx.globalAlpha = 0.9;
        const coinGlow = ctx.createRadialGradient(coinX, coinY, 0, coinX, coinY, 10);
        coinGlow.addColorStop(0, "rgba(255,221,0,0.4)");
        coinGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = coinGlow;
        ctx.beginPath();
        ctx.arc(coinX, coinY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(ItemImages.coin, coinX - 10, coinY - 10, 20, 20);
        ctx.restore();
      }
    }

    // Arrow pointing to upgrade icon
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = COLORS.coin;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(step3X, step3Y + 10);
    ctx.lineTo(step3X, step3Y + 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.coin;
    ctx.beginPath();
    ctx.moveTo(step3X, step3Y + 34);
    ctx.lineTo(step3X - 5, step3Y + 28);
    ctx.lineTo(step3X + 5, step3Y + 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Upgrade arrow icon
    ctx.save();
    ctx.font = `20px Tektur`;
    ctx.fillStyle = COLORS.coin;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⬆", step3X, step3Y + 44);
    ctx.restore();

    // Label
    ctx.save();
    ctx.font = `bold 13px Tektur`;
    ctx.fillStyle = COLORS.coin;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COLLECT & UPGRADE", step3X, step3Y + 65);
    ctx.font = `10px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText("Defeated enemies drop", step3X, step3Y + 85);
    ctx.fillText("coins — spend on upgrades!", step3X, step3Y + 100);
    ctx.restore();

    // ── Bottom gameplay loop summary ──
    const summaryY = 480;
    this.renderer.drawPanel(cx - 340, summaryY - 14, 680, 65, {
      bg: "rgba(6, 6, 20, 0.7)",
      border: "rgba(100, 120, 160, 0.15)",
      radius: 8,
    });

    const loopItems = [
      { text: "🛸 Fly to enemies", color: COLORS.player },
      { text: "→", color: "rgba(255,255,255,0.3)" },
      { text: "💥 Destroy them", color: COLORS.enemyShip },
      { text: "→", color: "rgba(255,255,255,0.3)" },
      { text: "💰 Collect coins", color: COLORS.coin },
      { text: "→", color: "rgba(255,255,255,0.3)" },
      { text: "⬆ Upgrade ship", color: "#44ff88" },
    ];

    const loopStartX = cx - 290;
    const loopSpacing = 86;
    ctx.save();
    ctx.font = `11px Tektur`;
    ctx.textBaseline = "middle";
    for (let i = 0; i < loopItems.length; i++) {
      const item = loopItems[i];
      ctx.fillStyle = item.color;
      ctx.textAlign = "center";
      ctx.fillText(item.text, loopStartX + i * loopSpacing, summaryY + 8);
    }
    ctx.restore();

    // Protect mothership reminder
    ctx.save();
    ctx.font = `bold 10px Tektur`;
    ctx.fillStyle = COLORS.mothership;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "⚠  Keep enemies away from the Mothership — if it's destroyed, you lose!",
      cx,
      summaryY + 34
    );
    ctx.restore();

    this.drawContinueButton("NEXT →");
  }

  /** Helper: Draw a numbered step panel background */
  private drawStepPanel(x: number, y: number, w: number, h: number, num: string) {
    const ctx = this.renderer.ctx;

    // Panel background
    this.renderer.drawPanel(x, y, w, h, {
      bg: "rgba(6, 6, 20, 0.6)",
      border: "rgba(100, 120, 160, 0.1)",
      radius: 8,
    });

    // Step number badge
    ctx.save();
    ctx.fillStyle = "rgba(0, 212, 255, 0.15)";
    ctx.beginPath();
    ctx.arc(x + 24, y + 24, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold 14px Tektur`;
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(num, x + 24, y + 24);
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 3: CONTROLS — Player model moving up top, movement & dash
  // ═══════════════════════════════════════════════════════════════════════

  private renderTutorialPage3_Controls() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const t = this.time;
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    this.drawOverlay();

    // Title
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    this.renderer.drawTitleTextOutline(
      "CONTROLS",
      cx,
      48,
      COLORS.player,
      "#000",
      22,
      "center",
      "middle"
    );
    ctx.restore();

    // ── Player ship moving around up top ──
    const playerCenterX = cx;
    const playerCenterY = 180;
    const orbitRadius = 60;

    // Smooth figure-8 / orbit movement
    const moveX = playerCenterX + Math.sin(t * 0.7) * orbitRadius;
    const moveY = playerCenterY + Math.sin(t * 1.1) * 25;

    // Facing direction (based on movement)
    const faceDx = Math.cos(t * 0.7) * orbitRadius * 0.7;
    const faceDy = Math.cos(t * 1.1) * 25 * 1.1;
    const faceAngle = Math.atan2(faceDy, faceDx);

    // Trail dots behind player
    for (let i = 1; i <= 4; i++) {
      const trailT = t - i * 0.08;
      const tx = playerCenterX + Math.sin(trailT * 0.7) * orbitRadius;
      const ty = playerCenterY + Math.sin(trailT * 1.1) * 25;
      ctx.save();
      ctx.globalAlpha = (0.1 * (5 - i)) / 5;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw actual player sprite moving
    if (imageReady(PlayerImages.glider)) {
      ctx.save();
      ctx.translate(moveX, moveY);
      ctx.rotate(faceAngle + Math.PI / 2);
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 14;
      ctx.drawImage(PlayerImages.glider, -16, -24, 32, 48);
      ctx.restore();
    }

    // "YOU" label
    ctx.save();
    ctx.font = `bold 10px Tektur`;
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.7;
    ctx.fillText("YOUR SHIP", playerCenterX, playerCenterY - 50);
    ctx.restore();

    if (isTouchDevice) {
      // ── MOBILE CONTROLS ──────────────────────────────────────────

      // Joystick area (left side) — moved lower
      const joyX = cx - 260;
      const joyY = 430;
      const joyR = 50;
      const thumbPhase = (t * 0.5) % 1;
      const thumbOffX = Math.sin(thumbPhase * Math.PI * 2) * 25;
      const thumbOffY = Math.cos(thumbPhase * Math.PI * 2) * 16;

      // Panel behind joystick
      this.renderer.drawPanel(joyX - 100, joyY - 100, 200, 200, {
        bg: "rgba(6, 6, 20, 0.5)",
        border: "rgba(0, 212, 255, 0.1)",
        radius: 8,
      });

      // Labels above panel
      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DRAG TO MOVE", joyX, joyY - 82);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("Touch & drag anywhere", joyX, joyY - 66);
      ctx.fillText("on the left side", joyX, joyY - 52);
      ctx.restore();

      // Outer ring
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joyX, joyY + 10, joyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joyX, joyY + 10, joyR, 0, Math.PI * 2);
      ctx.stroke();
      // Inner thumb
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(joyX + thumbOffX, joyY + 10 + thumbOffY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(joyX + thumbOffX, joyY + 10 + thumbOffY, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Dash button (right side) — moved lower, shows player dashing
      const dashX = cx + 260;
      const dashY = 430;

      // Panel behind dash
      this.renderer.drawPanel(dashX - 100, dashY - 100, 200, 200, {
        bg: "rgba(6, 6, 20, 0.5)",
        border: "rgba(0, 212, 255, 0.1)",
        radius: 8,
      });

      // Labels above panel
      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DASH", dashX, dashY - 82);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("Tap right side to", dashX, dashY - 66);
      ctx.fillText("teleport forward", dashX, dashY - 52);
      ctx.restore();

      // Dash animation: player teleporting
      const dashPhase = (t * 0.4) % 1;
      const dashStartX = dashX - 30;
      const dashEndX = dashX + 30;
      const dashCurrentX = dashStartX + (dashEndX - dashStartX) * dashPhase;

      // Ghost trail at start position
      if (imageReady(PlayerImages.glider)) {
        ctx.save();
        ctx.globalAlpha = 0.15 * (1 - dashPhase);
        ctx.translate(dashStartX, dashY + 10);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(PlayerImages.glider, -10, -14, 20, 28);
        ctx.restore();

        // Main ship dashing
        ctx.save();
        ctx.globalAlpha = 0.7 + 0.3 * dashPhase;
        ctx.translate(dashCurrentX, dashY + 10);
        ctx.rotate(Math.PI / 2);
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 12;
        ctx.drawImage(PlayerImages.glider, -10, -14, 20, 28);
        ctx.restore();
      }

      // Dash ripple ring at start
      const ringProgress = dashPhase;
      const ringRadius = ringProgress * 35;
      const ringAlpha = (1 - ringProgress) * 0.3;
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dashStartX, dashY + 10, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // ── DESKTOP CONTROLS ─────────────────────────────────────────

      // Left panel — Mouse movement
      const moveBoxX = cx - 260;
      const moveBoxY = 430;

      this.renderer.drawPanel(moveBoxX - 110, moveBoxY - 100, 220, 200, {
        bg: "rgba(6, 6, 20, 0.5)",
        border: "rgba(0, 212, 255, 0.1)",
        radius: 8,
      });

      // Labels above
      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MOUSE TO MOVE", moveBoxX, moveBoxY - 82);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("Ship follows your cursor", moveBoxX, moveBoxY - 66);
      ctx.fillText("Auto-fires on the beat", moveBoxX, moveBoxY - 52);
      ctx.restore();

      // Mouse cursor icon (animated)
      const cursorPhase = (t * 0.4) % 1;
      const cursorX = moveBoxX + Math.sin(cursorPhase * Math.PI * 2) * 30;
      const cursorY = moveBoxY + 10 + Math.cos(cursorPhase * Math.PI * 2) * 20;

      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cursorX, cursorY - 10);
      ctx.lineTo(cursorX - 6, cursorY + 6);
      ctx.lineTo(cursorX - 1, cursorY + 4);
      ctx.lineTo(cursorX + 2, cursorY + 10);
      ctx.lineTo(cursorX + 5, cursorY + 8);
      ctx.lineTo(cursorX + 2, cursorY + 3);
      ctx.lineTo(cursorX + 7, cursorY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Right panel — Shift to dash (shows player dashing)
      const dashPanelX = cx + 260;
      const dashPanelY = 430;

      this.renderer.drawPanel(dashPanelX - 110, dashPanelY - 100, 220, 200, {
        bg: "rgba(6, 6, 20, 0.5)",
        border: "rgba(0, 212, 255, 0.1)",
        radius: 8,
      });

      // Labels above
      ctx.save();
      ctx.font = `bold 13px Tektur`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SHIFT TO DASH", dashPanelX, dashPanelY - 82);
      ctx.font = `10px Tektur`;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText("Teleport forward", dashPanelX, dashPanelY - 66);
      ctx.fillText("Clears nearby bullets", dashPanelX, dashPanelY - 52);
      ctx.restore();

      // Dash animation: player teleporting
      const dashPhase = (t * 0.4) % 1;
      const dashStartX = dashPanelX - 35;
      const dashEndX = dashPanelX + 35;
      const dashCurrentX = dashStartX + (dashEndX - dashStartX) * dashPhase;

      // Ghost trail at start position
      if (imageReady(PlayerImages.glider)) {
        ctx.save();
        ctx.globalAlpha = 0.15 * (1 - dashPhase);
        ctx.translate(dashStartX, dashPanelY + 15);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(PlayerImages.glider, -10, -14, 20, 28);
        ctx.restore();

        // Main ship dashing
        ctx.save();
        ctx.globalAlpha = 0.7 + 0.3 * dashPhase;
        ctx.translate(dashCurrentX, dashPanelY + 15);
        ctx.rotate(Math.PI / 2);
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 12;
        ctx.drawImage(PlayerImages.glider, -10, -14, 20, 28);
        ctx.restore();
      }

      // Dash ripple ring at start
      const ringProgress = dashPhase;
      const ringRadius = ringProgress * 40;
      const ringAlpha = (1 - ringProgress) * 0.3;
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dashStartX, dashPanelY + 15, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Keyboard key below dash animation
      const keyW = 70;
      const keyH = 28;
      const keyX = dashPanelX - keyW / 2;
      const keyY = dashPanelY + 52;
      const keyPulse = Math.sin(t * 3) > 0;

      ctx.save();
      ctx.fillStyle = keyPulse ? "rgba(0, 212, 255, 0.15)" : "rgba(30, 30, 50, 0.8)";
      ctx.strokeStyle = keyPulse ? COLORS.dashReady : "rgba(100, 120, 160, 0.3)";
      ctx.lineWidth = 1.5;
      const keyRadius = 5;
      ctx.beginPath();
      ctx.moveTo(keyX + keyRadius, keyY);
      ctx.lineTo(keyX + keyW - keyRadius, keyY);
      ctx.quadraticCurveTo(keyX + keyW, keyY, keyX + keyW, keyY + keyRadius);
      ctx.lineTo(keyX + keyW, keyY + keyH - keyRadius);
      ctx.quadraticCurveTo(keyX + keyW, keyY + keyH, keyX + keyW - keyRadius, keyY + keyH);
      ctx.lineTo(keyX + keyRadius, keyY + keyH);
      ctx.quadraticCurveTo(keyX, keyY + keyH, keyX, keyY + keyH - keyRadius);
      ctx.lineTo(keyX, keyY + keyRadius);
      ctx.quadraticCurveTo(keyX, keyY, keyX + keyRadius, keyY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = `bold 11px Tektur`;
      ctx.fillStyle = keyPulse ? "#ffffff" : "rgba(255,255,255,0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SHIFT", dashPanelX, keyY + keyH / 2);
      ctx.restore();
    }

    // ── Bottom tip ──
    ctx.save();
    ctx.font = `11px Tektur`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "🎵  Your weapons fire automatically to the music beat  🎵",
      cx,
      GAME_HEIGHT - 100
    );
    ctx.restore();

    this.drawContinueButton("GOT IT — LET'S GO!");
  }
}

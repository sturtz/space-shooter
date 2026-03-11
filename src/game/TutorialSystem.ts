import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { Player } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { EnemyShip } from "../entities/EnemyShip";
import { Debris } from "../entities/Debris";
import { PlayerImages, imageReady } from "../utils/Assets";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  isMobileDevice,
  MOBILE_CAMERA_ZOOM,
} from "../utils/Constants";
import { vec2, Vec2, vecDist, randomRange } from "../utils/Math";
import { compactAlive } from "../utils/Array";
import { MobileControls } from "../ui/MobileControls";
import { PlayerStats } from "../upgrades/UpgradeManager";

export type TutorialStep = 1 | 2 | 3;
export type StepPhase =
  | "ghost_demo"
  | "player_turn"
  | "success"
  | "destroy_ship"
  | "mothership_explode";

/** Callback when the tutorial finishes all 3 steps */
export type TutorialCompleteCallback = () => void;

// ── Ghost Ship ──────────────────────────────────────────────────────

interface GhostShip {
  pos: Vec2;
  angle: number;
  alpha: number;
  visible: boolean;
  targetPos: Vec2;
  speed: number;
  /** Trail positions for faint path line */
  trail: Vec2[];
}

function createGhost(x: number, y: number): GhostShip {
  return {
    pos: vec2(x, y),
    angle: 0,
    alpha: 0.3,
    visible: false,
    targetPos: vec2(x, y),
    speed: 120,
    trail: [],
  };
}

// ── Tutorial System ─────────────────────────────────────────────────

export class TutorialSystem {
  private renderer: Renderer;
  private input: InputManager;
  private particles: ParticleSystem;
  private mobileControls = new MobileControls();

  player: Player;
  private mothership!: Mothership;
  private ghost: GhostShip;
  private debris: Debris[] = [];
  private debrisTimer = 0;

  private step: TutorialStep = 1;
  private phase: StepPhase = "ghost_demo";
  private phaseTimer = 0;
  private time = 0;

  // Step 1: waypoint
  private waypointPos: Vec2 = vec2(0, 0);
  private waypointActive = false;

  // Step 2: dash
  private dashDetected = false;

  // Step 3: enemy ship + mothership explosion
  private tutorialEnemy: EnemyShip | null = null;
  private enemyKilled = false;
  private mothershipExploded = false;

  // Success text
  private successText = "";
  private successTimer = 0;

  // Text overlay
  private instructionText = "";
  private subText = "";

  // Completion
  private onComplete: TutorialCompleteCallback;
  private finished = false;

  // Dash enabled per step
  private dashEnabled = false;

  // Stats for player
  private stats: PlayerStats;

  constructor(
    renderer: Renderer,
    input: InputManager,
    stats: PlayerStats,
    onComplete: TutorialCompleteCallback
  ) {
    this.renderer = renderer;
    this.input = input;
    this.stats = stats;
    this.onComplete = onComplete;
    this.particles = new ParticleSystem();

    // Create player at center
    this.player = new Player();
    this.player.updateStats(stats);
    this.player.resetHp(99); // won't die in tutorial

    // Create ghost at player start
    this.ghost = createGhost(this.player.pos.x, this.player.pos.y);

    // Create mothership (used in step 3)
    this.mothership = new Mothership(5);

    // Camera setup
    if (isMobileDevice) {
      this.renderer.cameraZoom = MOBILE_CAMERA_ZOOM;
      this.renderer.cameraX = this.player.pos.x;
      this.renderer.cameraY = this.player.pos.y;
    } else {
      this.renderer.cameraZoom = 1.0;
    }

    this.beginStep(1);
  }

  get isFinished(): boolean {
    return this.finished;
  }

  // ── Step Flow ─────────────────────────────────────────────────────

  private beginStep(step: TutorialStep) {
    this.step = step;
    this.phaseTimer = 0;
    this.dashDetected = false;

    switch (step) {
      case 1:
        this.dashEnabled = false;
        this.instructionText = isMobileDevice ? "DRAG TO MOVE" : "MOVE YOUR MOUSE";
        this.subText = "Follow the ghost to the marker";
        // Waypoint ahead of player (upper area)
        this.waypointPos = vec2(GAME_WIDTH / 2 - 180, GAME_HEIGHT / 2 - 120);
        this.waypointActive = false;
        // Ghost starts at player position, heads to waypoint
        this.ghost.pos = vec2(this.player.pos.x, this.player.pos.y);
        this.ghost.targetPos = vec2(this.waypointPos.x, this.waypointPos.y);
        this.ghost.visible = true;
        this.ghost.trail = [];
        this.ghost.speed = 120;
        // Start with ghost demo — player can move immediately
        this.phase = "ghost_demo";
        break;

      case 2:
        this.dashEnabled = true;
        this.instructionText = isMobileDevice ? "TAP DASH" : "PRESS SHIFT";
        this.subText = "Watch the ghost dash, then you try!";
        // Ghost starts at player position
        this.ghost.pos = vec2(this.player.pos.x, this.player.pos.y);
        this.ghost.visible = true;
        this.ghost.trail = [];
        this.ghost.speed = 400; // fast dash speed
        // Waypoint ahead of player facing
        this.waypointPos = vec2(
          this.player.pos.x + Math.cos(this.player.angle) * 150,
          this.player.pos.y + Math.sin(this.player.angle) * 150
        );
        // Clamp waypoint to screen
        this.waypointPos.x = Math.max(100, Math.min(GAME_WIDTH - 100, this.waypointPos.x));
        this.waypointPos.y = Math.max(100, Math.min(GAME_HEIGHT - 100, this.waypointPos.y));
        this.ghost.targetPos = vec2(this.waypointPos.x, this.waypointPos.y);
        this.waypointActive = false;
        this.phase = "ghost_demo";
        break;

      case 3:
        this.dashEnabled = true;
        this.waypointActive = false;
        this.ghost.visible = false;
        this.enemyKilled = false;
        this.mothershipExploded = false;
        this.tutorialEnemy = null;
        // Reset mothership for step 3
        this.mothership = new Mothership(5);
        // Spawn an enemy ship near the player (1 HP, doesn't shoot, doesn't move)
        this.spawnTutorialEnemy();
        this.phase = "destroy_ship";
        this.instructionText = "DESTROY THE ENEMY!";
        this.subText = "Fly close to blast it with your pulse";
        break;
    }
  }

  private setPhase(phase: StepPhase) {
    this.phase = phase;
    this.phaseTimer = 0;
  }

  private showSuccess(text: string) {
    this.successText = text;
    this.successTimer = 1.2;
    this.setPhase("success");
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.phaseTimer += dt;
    this.particles.update(dt);

    // Update debris
    this.debrisTimer -= dt;
    if (this.debrisTimer <= 0 && this.debris.length < 15) {
      const edge = Math.random();
      let dx: number, dy: number;
      if (edge < 0.5) {
        dx = randomRange(-80, GAME_WIDTH + 80);
        dy = randomRange(-50, -20);
      } else if (edge < 0.75) {
        dx = randomRange(-50, -20);
        dy = randomRange(-50, GAME_HEIGHT * 0.4);
      } else {
        dx = GAME_WIDTH + randomRange(20, 50);
        dy = randomRange(-50, GAME_HEIGHT * 0.4);
      }
      this.debris.push(new Debris(dx, dy));
      this.debrisTimer = randomRange(0.5, 1.0);
    }
    for (const d of this.debris) d.update(dt);
    compactAlive(this.debris);

    // ── Player always has control ──
    this.player.move(this.input, dt);
    this.player.update(dt);

    // Always consume dash input to drain stale requests between steps.
    // Only actually execute dash during player_turn and destroy_ship phases.
    if (this.input.consumeDash()) {
      if (this.dashEnabled && (this.phase === "player_turn" || this.phase === "destroy_ship")) {
        const result = this.player.tryDash();
        if (result.dashed) {
          this.particles.emit(this.player.pos, 8, COLORS.player, 60, 0.2, 1.5);
          this.renderer.shake(2);
          if (this.step === 2 && !this.dashDetected) {
            this.dashDetected = true;
          }
        }
      }
    }

    // Camera follow
    if (this.renderer.cameraZoom > 1) {
      const lerpSpeed = 0.08;
      const targetX = this.player.pos.x;
      const targetY = this.player.pos.y + 40;
      this.renderer.cameraX += (targetX - this.renderer.cameraX) * lerpSpeed;
      this.renderer.cameraY += (targetY - this.renderer.cameraY) * lerpSpeed;
    }

    // Ghost alpha breathing
    if (this.ghost.visible) {
      this.ghost.alpha = 0.2 + 0.15 * Math.sin(this.time * 3);
    }

    // During ghost demo, player auto-faces toward ghost
    if (this.phase === "ghost_demo" && this.ghost.visible && !this.player.isMoving) {
      const dx = this.ghost.pos.x - this.player.pos.x;
      const dy = this.ghost.pos.y - this.player.pos.y;
      if (dx * dx + dy * dy > 4) {
        this.player.angle = Math.atan2(dy, dx);
      }
    }

    switch (this.step) {
      case 1:
        this.updateStep1(dt);
        break;
      case 2:
        this.updateStep2(dt);
        break;
      case 3:
        this.updateStep3(dt);
        break;
    }

    // Success timer countdown
    if (this.phase === "success") {
      this.successTimer -= dt;
      if (this.successTimer <= 0) {
        this.advanceStep();
      }
    }
  }

  private updateStep1(dt: number) {
    switch (this.phase) {
      case "ghost_demo":
        // Ghost flies toward waypoint while player has full control
        this.moveGhostToward(this.ghost.targetPos, dt);
        if (vecDist(this.ghost.pos, this.ghost.targetPos) < 8) {
          // Ghost reached waypoint — now it's explicitly player's turn
          this.setPhase("player_turn");
          this.ghost.visible = false;
          this.waypointActive = true;
          this.instructionText = "YOUR TURN!";
          this.subText = "Move to the marker";
        }
        break;

      case "player_turn":
        // Player already moving from top-level update — just check waypoint
        if (this.waypointActive && vecDist(this.player.pos, this.waypointPos) < 35) {
          this.waypointActive = false;
          this.particles.emit(this.waypointPos, 12, COLORS.player, 80, 0.3, 2);
          this.showSuccess("GREAT!");
        }
        break;
    }
  }

  private updateStep2(dt: number) {
    switch (this.phase) {
      case "ghost_demo":
        // Ghost does a quick dash motion
        this.moveGhostToward(this.ghost.targetPos, dt);
        // Emit particles behind ghost during dash
        if (this.phaseTimer < 0.5) {
          this.particles.emit(this.ghost.pos, 1, COLORS.player, 30, 0.1, 1);
        }
        if (vecDist(this.ghost.pos, this.ghost.targetPos) < 8 || this.phaseTimer > 1.0) {
          // Ghost "dashed" — show ripple ring
          this.particles.emit(this.ghost.pos, 8, COLORS.player, 60, 0.2, 1.5);
          this.setPhase("player_turn");
          this.ghost.visible = false;
          this.instructionText = "YOUR TURN!";
          this.subText = isMobileDevice ? "Tap the DASH button" : "Press SHIFT to dash";
          this.player.dashCooldown = 0; // ensure dash is ready
        }
        break;

      case "player_turn":
        // Dash detection is handled in top-level update
        // Wait for dash to complete
        if (this.dashDetected && !this.player.isDashing) {
          this.showSuccess("NICE!");
        }
        break;
    }
  }

  private updateStep3(dt: number) {
    this.mothership.update(dt);

    switch (this.phase) {
      case "destroy_ship": {
        const enemy = this.tutorialEnemy;
        if (!enemy || !enemy.alive) {
          // Enemy already dead — transition to mothership explosion
          if (!this.enemyKilled) {
            this.enemyKilled = true;
            // Brief pause before mothership blows up
            setTimeout(() => {
              if (this.finished) return;
              this.triggerMothershipExplosion();
            }, 800);
          }
          break;
        }

        // Auto-fire pulse simulation: if player is close enough, 1-hit kill
        const dx = this.player.pos.x - enemy.pos.x;
        const dy = this.player.pos.y - enemy.pos.y;
        const distSq = dx * dx + dy * dy;
        // Kill range ~22px (same as cone range feel)
        if (distSq < 22 * 22) {
          // Pulse hit — kill immediately
          enemy.takeDamage(999);
          this.enemyKilled = true;

          // Big explosion particles
          this.particles.emit(enemy.pos, 20, COLORS.explosion, 120, 0.5, 3);
          this.particles.emit(enemy.pos, 10, "#ffaa00", 80, 0.3, 2);
          this.particles.emit(enemy.pos, 6, "#ffffff", 60, 0.2, 1.5);
          this.renderer.shake(4);

          this.instructionText = "ENEMY DESTROYED!";
          this.subText = "";

          // After a pause, blow up the mothership
          setTimeout(() => {
            if (this.finished) return;
            this.triggerMothershipExplosion();
          }, 1200);
        }
        break;
      }

      case "mothership_explode": {
        // Mothership explosion is playing — wait for the delay then show final message
        if (!this.mothershipExploded && this.phaseTimer > 0.1) {
          this.mothershipExploded = true;
          // Destroy the mothership visually
          this.mothership.isDestroyed = true;

          // Massive particle explosion
          const mp = this.mothership.pos;
          this.particles.emit(mp, 50, "#ff4444", 200, 0.8, 6);
          this.particles.emit(mp, 30, "#ffaa00", 160, 0.6, 5);
          this.particles.emit(mp, 20, "#ffffff", 120, 0.4, 3);
          this.renderer.shake(10);
        }

        // After explosion settles, show the defend message and end tutorial
        if (this.mothershipExploded && this.phaseTimer > 1.8) {
          this.instructionText = "DEFEND THE MOTHERSHIP!";
          this.subText = "Don't let enemies reach it";
          this.showSuccess("GOT IT — LET'S GO!");
        }
        break;
      }
    }
  }

  // ── Step 3 helpers ────────────────────────────────────────────────

  private spawnTutorialEnemy() {
    // Spawn enemy ship ~100px from the player, stationary, 1 HP, no shooting
    const angle = randomRange(0, Math.PI * 2);
    const dist = 100;
    const ex = Math.max(60, Math.min(GAME_WIDTH - 60, this.player.pos.x + Math.cos(angle) * dist));
    const ey = Math.max(60, Math.min(GAME_HEIGHT - 60, this.player.pos.y + Math.sin(angle) * dist));

    // 1 HP, speed 0 (stationary), no shooting, pulse variant for visual clarity
    const enemy = new EnemyShip(ex, ey, 1, 0, false, "pulse");
    // Override target to its own position so it doesn't try to move
    enemy.targetPos = vec2(ex, ey);
    this.tutorialEnemy = enemy;
  }

  private triggerMothershipExplosion() {
    this.setPhase("mothership_explode");
    this.instructionText = "OH NO...";
    this.subText = "";
  }

  // ── Ghost Movement ────────────────────────────────────────────────

  private moveGhostToward(target: Vec2, dt: number) {
    const dx = target.x - this.ghost.pos.x;
    const dy = target.y - this.ghost.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      const invDist = 1 / dist;
      const nx = dx * invDist;
      const ny = dy * invDist;
      const step = Math.min(this.ghost.speed * dt, dist);
      this.ghost.pos.x += nx * step;
      this.ghost.pos.y += ny * step;
      this.ghost.angle = Math.atan2(ny, nx);

      // Record trail
      this.ghost.trail.push(vec2(this.ghost.pos.x, this.ghost.pos.y));
      if (this.ghost.trail.length > 30) this.ghost.trail.shift();
    }
  }

  // ── Advance to Next Step ──────────────────────────────────────────

  private advanceStep() {
    if (this.step < 3) {
      this.beginStep((this.step + 1) as TutorialStep);
    } else {
      this.finished = true;
      this.onComplete();
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  render() {
    this.renderer.beginFrame(1 / 60);

    // Background debris
    for (const d of this.debris) d.render(this.renderer);

    // Step 3: mothership
    if (this.step === 3) {
      this.mothership.render(this.renderer);
    }

    // Tutorial enemy ship
    if (this.tutorialEnemy && this.tutorialEnemy.alive) {
      this.tutorialEnemy.render(this.renderer);

      // Pulsing "target" ring around enemy to draw player attention
      if (this.phase === "destroy_ship") {
        const ctx = this.renderer.ctx;
        const ex = this.tutorialEnemy.pos.x;
        const ey = this.tutorialEnemy.pos.y;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);

        ctx.save();
        ctx.globalAlpha = pulse * 0.6;
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -this.time * 20;
        ctx.beginPath();
        ctx.arc(ex, ey, 30 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Ghost ship
    if (this.ghost.visible) {
      this.renderGhost();
    }

    // Waypoint marker
    if (this.waypointActive) {
      this.renderWaypoint();
    }

    // Player
    this.player.render(this.renderer);

    // Particles
    this.particles.render(this.renderer);

    // ── Switch to screen-space for UI overlays ──
    this.renderer.pushScreenSpace();

    // Mobile controls
    if (this.input.isTouchDevice) {
      this.mobileControls.render(
        this.renderer,
        this.input,
        this.player.dashReady && this.dashEnabled,
        this.dashEnabled ? this.player.dashCooldownRatio : 0
      );
    }

    // Instruction text overlay
    this.renderInstructionOverlay();

    // Success text
    if (this.phase === "success" && this.successTimer > 0) {
      this.renderSuccessText();
    }

    // Step indicator
    this.renderStepIndicator();

    // Skip hint
    this.renderSkipHint();

    this.renderer.popScreenSpace();
    this.renderer.endFrame();
  }

  // ── Render Helpers ────────────────────────────────────────────────

  private renderGhost() {
    const ctx = this.renderer.ctx;
    const sprite = PlayerImages.glider;

    // Trail
    if (this.ghost.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(this.ghost.trail[0].x, this.ghost.trail[0].y);
      for (let i = 1; i < this.ghost.trail.length; i++) {
        ctx.lineTo(this.ghost.trail[i].x, this.ghost.trail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Ghost sprite
    ctx.save();
    ctx.globalAlpha = this.ghost.alpha;
    ctx.translate(this.ghost.pos.x, this.ghost.pos.y);
    ctx.rotate(this.ghost.angle + Math.PI / 2);

    if (imageReady(sprite)) {
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 14;
      ctx.drawImage(sprite, -8, -12, 16, 24);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // "DEMO" label above
    ctx.save();
    ctx.globalAlpha = this.ghost.alpha * 0.7;
    ctx.font = "bold 8px Tektur";
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("DEMO", this.ghost.pos.x, this.ghost.pos.y - 18);
    ctx.restore();
  }

  private renderWaypoint() {
    const ctx = this.renderer.ctx;
    const wx = this.waypointPos.x;
    const wy = this.waypointPos.y;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);

    // Outer pulsing ring
    ctx.save();
    ctx.globalAlpha = pulse * 0.5;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(wx, wy, 20 + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner glow
    ctx.globalAlpha = pulse * 0.15;
    const glow = ctx.createRadialGradient(wx, wy, 0, wx, wy, 25);
    glow.addColorStop(0, COLORS.player);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(wx, wy, 25, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(wx, wy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Diamond icon
    ctx.save();
    ctx.globalAlpha = pulse * 0.8;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(wx, wy - s);
    ctx.lineTo(wx + s, wy);
    ctx.lineTo(wx, wy + s);
    ctx.lineTo(wx - s, wy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private renderInstructionOverlay() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;

    // Semi-transparent bar at top
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, GAME_WIDTH, 70);

    // Main instruction — red for mothership explosion, green for player action, cyan otherwise
    ctx.font = "bold 20px Tektur";
    if (this.phase === "mothership_explode") {
      ctx.fillStyle = "#ff4444";
    } else if (this.phase === "player_turn" || this.phase === "destroy_ship") {
      ctx.fillStyle = "#00ff88";
    } else {
      ctx.fillStyle = COLORS.player;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillText(this.instructionText, cx, 28);
    ctx.shadowBlur = 0;

    // Sub instruction
    if (this.subText) {
      ctx.font = "11px Tektur";
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText(this.subText, cx, 52);
    }

    ctx.restore();

    // Arrow pointing to dash button on mobile (step 2 player_turn)
    if (this.step === 2 && this.phase === "player_turn" && this.input.isTouchDevice) {
      this.renderDashArrow();
    }
  }

  private renderDashArrow() {
    const ctx = this.renderer.ctx;
    const dashX = GAME_WIDTH - 120;
    const dashY = GAME_HEIGHT - 120;
    const pulse = Math.sin(this.time * 4) * 6;

    ctx.save();
    ctx.globalAlpha = 0.8;

    // Simple pulsing circle highlight around the dash button area
    ctx.strokeStyle = COLORS.dashReady;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.beginPath();
    ctx.arc(dashX, dashY, 58 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label above the circle
    ctx.font = "bold 12px Tektur";
    ctx.fillStyle = COLORS.dashReady;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = COLORS.dashReady;
    ctx.shadowBlur = 8;
    ctx.fillText("TAP HERE!", dashX, dashY - 62);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  private renderSuccessText() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const progress = 1 - this.successTimer / 1.2;
    const scale = 1 + progress * 0.3;
    const alpha = Math.min(1, this.successTimer / 0.3);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${32 * scale}px Tektur`;
    ctx.fillStyle = "#00ff88";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 20;
    ctx.fillText(this.successText, cx, cy);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private renderStepIndicator() {
    const ctx = this.renderer.ctx;
    const cx = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 30;

    // Step dots
    for (let i = 1; i <= 3; i++) {
      const dotX = cx + (i - 2) * 24;
      const isActive = i === this.step;
      const isDone = i < this.step;

      ctx.save();
      ctx.fillStyle = isDone ? "#00ff88" : isActive ? COLORS.player : "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(dotX, y, isActive ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.restore();
    }

    // Step label
    ctx.save();
    ctx.font = "9px Tektur";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Step ${this.step} of 3`, cx, y - 14);
    ctx.restore();
  }

  private renderSkipHint() {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.font = "8px Tektur";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      isMobileDevice ? "Tap anywhere to skip" : "Press ESC to skip",
      GAME_WIDTH - 20,
      GAME_HEIGHT - 10
    );
    ctx.restore();
  }

  // ── Skip Tutorial ─────────────────────────────────────────────────

  skip() {
    this.finished = true;
    this.onComplete();
  }
}

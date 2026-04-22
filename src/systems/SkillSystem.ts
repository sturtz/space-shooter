import { Renderer } from "../rendering/Renderer";
import { Vec2, vec2, vecDist, randomRange } from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SKILL_MIN_SPAWN_TIME,
  SKILL_SPAWN_INTERVAL_MIN,
  SKILL_SPAWN_INTERVAL_MAX,
  SKILL_PICKUP_RADIUS,
  SKILL_PICKUP_LIFETIME,
} from "../utils/Constants";

// ── Skill Definitions ───────────────────────────────────────────────────

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Duration in seconds */
  duration: number;
  /** Upgrade node ID that unlocks this skill */
  requiredUpgrade: string;
  /** Required level of that upgrade */
  requiredLevel: number;
}

/** All available in-round skills. Each is gated behind a specific upgrade. */
export const SKILL_POOL: SkillDef[] = [
  {
    id: "bullet_hell",
    name: "Bullet Hell",
    description: "3× fire rate + all bullets pierce for 8s",
    icon: "🔫",
    color: "#ff4466",
    duration: 8,
    requiredUpgrade: "dmg_overclock",
    requiredLevel: 1,
  },
  {
    id: "juggernaut",
    name: "Juggernaut",
    description: "Invulnerable + 50% bonus damage for 10s",
    icon: "🛡️",
    color: "#cc44ff",
    duration: 10,
    requiredUpgrade: "hp_shield",
    requiredLevel: 2,
  },
  {
    id: "warp_speed",
    name: "Warp Speed",
    description: "3× move speed + damage trail for 8s",
    icon: "⚡",
    color: "#00ffcc",
    duration: 8,
    requiredUpgrade: "move_afterimage",
    requiredLevel: 1,
  },
  {
    id: "gold_rush",
    name: "Gold Rush",
    description: "All coins worth 5× for 12s",
    icon: "💎",
    color: "#ffdd00",
    duration: 12,
    requiredUpgrade: "econ_lucky",
    requiredLevel: 2,
  },
  {
    id: "overdrive",
    name: "Overdrive",
    description: "Every kill triggers chain explosion for 8s",
    icon: "💥",
    color: "#ff8800",
    duration: 8,
    requiredUpgrade: "dmg_overcharge",
    requiredLevel: 1,
  },
  {
    id: "fortress_surge",
    name: "Fortress Surge",
    description: "Mothership turret fires nonstop + barrier for 10s",
    icon: "🏰",
    color: "#4488ff",
    duration: 10,
    requiredUpgrade: "ms_turret",
    requiredLevel: 2,
  },
];

// ── Skill Pickup (floating orb in arena) ────────────────────────────────

export class SkillPickup {
  pos: Vec2;
  skill: SkillDef;
  lifetime: number;
  alive: boolean = true;
  bobOffset: number;
  age: number = 0;

  constructor(x: number, y: number, skill: SkillDef) {
    this.pos = vec2(x, y);
    this.skill = skill;
    this.lifetime = SKILL_PICKUP_LIFETIME;
    this.bobOffset = randomRange(0, Math.PI * 2);
  }

  update(dt: number) {
    this.age += dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.alive = false;
    }
  }

  render(renderer: Renderer) {
    if (!this.alive) return;
    const ctx = renderer.ctx;
    const bob = Math.sin(this.age * 3 + this.bobOffset) * 3;
    const px = this.pos.x;
    const py = this.pos.y + bob;
    const pulse = 0.6 + 0.4 * Math.sin(this.age * 4);
    const radius = SKILL_PICKUP_RADIUS;

    ctx.save();

    // Fade out near death
    if (this.lifetime < 3) {
      ctx.globalAlpha = this.lifetime / 3;
    }

    // Outer glow ring
    const outerGlow = ctx.createRadialGradient(px, py, radius * 0.5, px, py, radius * 2.5);
    outerGlow.addColorStop(0, this.skill.color + "44");
    outerGlow.addColorStop(1, this.skill.color + "00");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(px, py, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Spinning dashed ring
    ctx.strokeStyle = this.skill.color;
    ctx.globalAlpha = (ctx.globalAlpha || 1) * pulse * 0.5;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -this.age * 30;
    ctx.beginPath();
    ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Core orb
    ctx.globalAlpha = this.lifetime < 3 ? this.lifetime / 3 : 1;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, this.skill.color);
    grad.addColorStop(1, this.skill.color + "88");
    ctx.fillStyle = grad;
    ctx.shadowColor = this.skill.color;
    ctx.shadowBlur = 12 * pulse;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Icon
    ctx.font = "12px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.skill.icon, px, py);

    // Name label below
    ctx.font = renderer.getFont(7, true);
    ctx.fillStyle = this.skill.color;
    ctx.globalAlpha = (this.lifetime < 3 ? this.lifetime / 3 : 1) * 0.8;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(this.skill.name, px, py + radius + 6);

    ctx.restore();
  }

  destroy() {
    this.alive = false;
  }
}

// ── Active Skill Instance ───────────────────────────────────────────────

export interface ActiveSkill {
  def: SkillDef;
  remaining: number;
}

// ── Skill System ────────────────────────────────────────────────────────

export class SkillSystem {
  activeSkills: Map<string, ActiveSkill> = new Map();
  pickups: SkillPickup[] = [];
  private spawnTimer: number = 0;
  private nextSpawnInterval: number = 0;
  /** Skills unlocked via upgrade tree (set each run) */
  private unlockedSkillIds: Set<string> = new Set();

  /** Configure which skills are available based on upgrade levels */
  setUnlockedSkills(upgradeGetter: (id: string) => number) {
    this.unlockedSkillIds.clear();
    for (const skill of SKILL_POOL) {
      if (upgradeGetter(skill.requiredUpgrade) >= skill.requiredLevel) {
        this.unlockedSkillIds.add(skill.id);
      }
    }
  }

  /** Get list of unlocked skill defs (for UI display) */
  getUnlockedSkills(): SkillDef[] {
    return SKILL_POOL.filter((s) => this.unlockedSkillIds.has(s.id));
  }

  /** Check if a specific skill is currently active */
  isActive(skillId: string): boolean {
    return this.activeSkills.has(skillId);
  }

  /** Get remaining duration of an active skill (0 if not active) */
  getRemaining(skillId: string): number {
    return this.activeSkills.get(skillId)?.remaining ?? 0;
  }

  /** Activate a skill */
  activate(skill: SkillDef) {
    this.activeSkills.set(skill.id, { def: skill, remaining: skill.duration });
  }

  /**
   * Main update — tick active skills, spawn pickups.
   * @param dt delta time
   * @param elapsedTime time elapsed in current round
   * @param playerPos player position for pickup collision
   * @param collectRange pickup radius
   * @returns array of newly collected skill IDs this frame
   */
  update(
    dt: number,
    elapsedTime: number,
    playerPos: Vec2,
    collectRange: number
  ): string[] {
    const collected: string[] = [];

    // Tick active skill durations
    for (const [id, skill] of this.activeSkills) {
      skill.remaining -= dt;
      if (skill.remaining <= 0) {
        this.activeSkills.delete(id);
      }
    }

    // Update pickups
    for (const pickup of this.pickups) {
      pickup.update(dt);
    }

    // Check pickup collection (player walks over)
    for (const pickup of this.pickups) {
      if (!pickup.alive) continue;
      if (vecDist(playerPos, pickup.pos) <= collectRange + SKILL_PICKUP_RADIUS) {
        this.activate(pickup.skill);
        collected.push(pickup.skill.id);
        pickup.destroy();
      }
    }

    // Remove dead pickups
    this.pickups = this.pickups.filter((p) => p.alive);

    // Spawn new pickups (only after MIN_SPAWN_TIME, max 1 on field)
    if (
      elapsedTime >= SKILL_MIN_SPAWN_TIME &&
      this.unlockedSkillIds.size > 0 &&
      this.pickups.length === 0
    ) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= this.nextSpawnInterval) {
        this.spawnPickup();
        this.spawnTimer = 0;
        this.nextSpawnInterval = randomRange(
          SKILL_SPAWN_INTERVAL_MIN,
          SKILL_SPAWN_INTERVAL_MAX
        );
      }
    }

    return collected;
  }

  /** Spawn a random unlocked skill pickup at a safe location */
  private spawnPickup() {
    const available = SKILL_POOL.filter(
      (s) => this.unlockedSkillIds.has(s.id) && !this.activeSkills.has(s.id)
    );
    if (available.length === 0) return;

    const skill = available[Math.floor(Math.random() * available.length)];

    // Spawn in arena but away from center (mothership) and edges
    const margin = 80;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    let x: number, y: number;
    let attempts = 0;
    do {
      x = margin + Math.random() * (GAME_WIDTH - margin * 2);
      y = margin + Math.random() * (GAME_HEIGHT - margin * 2);
      attempts++;
    } while (
      // Avoid spawning too close to mothership (center)
      Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) < 80 &&
      attempts < 10
    );

    this.pickups.push(new SkillPickup(x, y, skill));
  }

  /** Render all pickups */
  renderPickups(renderer: Renderer) {
    for (const pickup of this.pickups) {
      pickup.render(renderer);
    }
  }

  /** Reset everything for new run */
  reset() {
    this.activeSkills.clear();
    this.pickups = [];
    this.spawnTimer = 0;
    this.nextSpawnInterval = randomRange(
      SKILL_SPAWN_INTERVAL_MIN,
      SKILL_SPAWN_INTERVAL_MAX
    );
  }
}

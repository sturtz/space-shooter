import { IGame } from "../game/GameInterface";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Bullet } from "../entities/Bullet";
import { vec2, vecSub, vecNormalize, randomAngle, vecDist } from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_DISTANCE,
  ROCK_BASE_HP,
  ROCK_BIG_HP,
  ROCK_BASE_SPEED,
  ENEMY_SHIP_BASE_HP,
  ENEMY_SHIP_BASE_SPEED,
  COLORS,
  ENEMY_HP_LEVEL_SCALE,
  SHOOTING_ENEMY_MIN_ROUND,
  SHOOTING_ENEMY_RAMP,
} from "../utils/Constants";

/**
 * Handles enemy spawning, turret auto-fire, and slow aura, extracted from Game.ts.
 */
export class SpawnSystem {
  private turretCooldown: number = 0;
  private msRegenTimer: number = 0;
  private msBarrierTimer: number = 0;
  private msBarrierHitsRemaining: number = 0;

  reset(game: IGame) {
    this.turretCooldown = 0;
    this.msRegenTimer = 0;
    this.msBarrierTimer = 0;
    this.msBarrierHitsRemaining = game.stats.msBarrierHits > 0 ? game.stats.msBarrierHits : 0;
  }

  /** Spawn an enemy at the edge of the map */
  spawnEnemy(game: IGame) {
    const angle = randomAngle();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const x = cx + Math.cos(angle) * SPAWN_DISTANCE;
    const y = cy + Math.sin(angle) * SPAWN_DISTANCE;
    const round = game.save.roundNumber;

    // Determine enemy type based on round + bosses killed
    // Round 1-3: rocks only. Ships phase in round 4+ (gated by bosses killed too)
    const bossesKilled = game.bossesKilledThisRun ?? 0;
    // Cap boss contribution to prevent turbo-acceleration into shooting enemy territory
    const effectiveRound = round + Math.min(2, bossesKilled);
    const rockChance = effectiveRound <= 3 ? 1 : Math.max(0.3, 0.9 - (effectiveRound - 3) * 0.08);
    if (Math.random() < rockChance) {
      // Rocks — three sizes: small / medium / large.
      // Big + medium chances ramp up over the round.
      const elapsed = game.roundDuration - game.roundTimer;
      const roundProgress = game.roundDuration > 0 ? Math.min(1, elapsed / game.roundDuration) : 0;
      const bigRockChance = 0.05 + roundProgress * 0.3; // 5% → 35%
      const medRockChance = 0.1 + roundProgress * 0.2; // 10% → 30%

      const roll = Math.random();
      const isBig = roll < bigRockChance;
      const isMed = !isBig && roll < bigRockChance + medRockChance;

      // HP: lg=ROCK_BIG_HP, md≈3, sm=ROCK_BASE_HP
      const baseHp = isBig ? ROCK_BIG_HP : isMed ? 3 : ROCK_BASE_HP;
      const hp = Math.ceil(baseHp * (1 + ENEMY_HP_LEVEL_SCALE * Math.log(round + 1)));
      const speed = ROCK_BASE_SPEED + round * 2;
      // Medium rocks use small sprite pool at 1.4× scale (radius ≈ 14px)
      const sizeScale = isMed ? 1.4 : 1.0;
      const rock = new Rock(x, y, hp, speed, isBig, sizeScale);

      // Coin values: small=1, medium=3, large=5
      rock.coinValue = isBig ? 5 : isMed ? 3 : 1;

      // Elite check — requires round 5+ or 2+ bosses killed
      if (effectiveRound >= 5 && Math.random() < 0.05) {
        rock.isElite = true;
        rock.hp *= 3;
        rock.maxHp = rock.hp;
        rock.coinValue = 10;
        rock.radius *= 1.3;
      }

      game.enemies.push(rock);
    } else {
      // Enemy ship — pulse variant needs round 5+ or 2 bosses killed
      const isPulseShip = effectiveRound >= 5 && Math.random() < 0.35;
      const hp = isPulseShip
        ? Math.max(1, ENEMY_SHIP_BASE_HP - 1) // pulse ships are fragile
        : Math.ceil(ENEMY_SHIP_BASE_HP * (1 + ENEMY_HP_LEVEL_SCALE * Math.log(round + 1)));
      const speed = isPulseShip
        ? ENEMY_SHIP_BASE_SPEED * 3 + round * 4 // really fast!
        : ENEMY_SHIP_BASE_SPEED + round * 2;
      // Gradual shooting ramp — no binary flip, probability-based past gate
      const shootChance = isPulseShip ? 0 :
        effectiveRound >= SHOOTING_ENEMY_MIN_ROUND
          ? Math.min(0.8, (effectiveRound - SHOOTING_ENEMY_MIN_ROUND) * SHOOTING_ENEMY_RAMP)
          : 0;
      const canShoot = Math.random() < shootChance;
      const variant = isPulseShip ? ("pulse" as const) : ("normal" as const);
      const ship = new EnemyShip(x, y, hp, speed, canShoot, variant);
      ship.coinValue = isPulseShip ? 1 : 2 + Math.floor(round * 0.3);

      if (!isPulseShip && effectiveRound >= 7 && Math.random() < 0.05) {
        ship.isElite = true;
        ship.hp *= 3;
        ship.maxHp = ship.hp;
        ship.coinValue *= 10;
      }

      game.enemies.push(ship);
    }
  }

  /**
   * Handle enemy ship shooting — targets player instead of mothership (Issue #17 fix).
   */
  handleEnemyShooting(game: IGame) {
    for (const enemy of game.enemies) {
      if (enemy instanceof EnemyShip && enemy.shouldShoot()) {
        // Target the PLAYER, not the mothership
        const dir = vecNormalize(vecSub(game.player.pos, enemy.pos));
        const bullet = new Bullet(enemy.pos.x, enemy.pos.y, dir, 120, 1, false, 0, true);
        game.enemyBullets.push(bullet);
      }
    }
  }

  /** Pulse enemies chase the player; all others head for the mothership */
  updateEnemyTargets(game: IGame) {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (enemy instanceof EnemyShip && enemy.variant === "pulse") {
        // Pulse enemies hunt the player
        enemy.targetPos = { x: game.player.pos.x, y: game.player.pos.y };
      }
      // All other enemies keep the default targetPos (mothership / center)
    }
  }

  /** Apply slow aura around the player (move_slow_aura upgrade) */
  applySlowAura(game: IGame) {
    if (game.stats.slowAuraRange <= 0) return;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (vecDist(game.player.pos, enemy.pos) <= game.stats.slowAuraRange) {
        enemy.applySlow(game.stats.slowAuraFactor, 0.5); // re-apply each frame
      }
    }
  }

  /** Mothership gravity well — slow enemies near the mothership (ms_slow upgrade) */
  applyMothershipSlow(game: IGame) {
    if (game.stats.msSlowRadius <= 0) return;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (vecDist(game.mothership.pos, enemy.pos) <= game.stats.msSlowRadius) {
        enemy.applySlow(game.stats.msSlowStrength, 0.5); // re-apply each frame
      }
    }
  }

  /** Mothership defense turret auto-fire (ms_turret upgrade) */
  updateTurret(game: IGame, dt: number) {
    if (game.stats.turretLevel <= 0) return;

    this.turretCooldown -= dt;
    if (this.turretCooldown > 0) return;

    // Fire rate: 1 shot per (2 / turretLevel) seconds, minimum 0.3s
    // Fortress mode: turret fires 3× faster
    let cooldown = Math.max(0.3, 2 / game.stats.turretLevel);
    if (game.stats.msFortressActive) cooldown /= 3;
    this.turretCooldown = Math.max(0.1, cooldown);

    // Find closest enemy to mothership
    let closest: Rock | EnemyShip | null = null;
    let closestDist = 400;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const d = vecDist(game.mothership.pos, enemy.pos);
      if (d < closestDist) {
        closestDist = d;
        closest = enemy;
      }
    }

    if (!closest) return;

    const dir = vecNormalize(vecSub(closest.pos, game.mothership.pos));
    const turretDmg = game.stats.damage * 0.5 * game.stats.turretDamageMult;
    const bullet = new Bullet(
      game.mothership.pos.x + dir.x * 20,
      game.mothership.pos.y + dir.y * 20,
      dir,
      350,
      turretDmg,
      false,
      0,
      false
    );
    game.bullets.push(bullet);

    // Visual
    game.particles.emitDirectional(
      vec2(game.mothership.pos.x + dir.x * 20, game.mothership.pos.y + dir.y * 20),
      Math.atan2(dir.y, dir.x),
      0.2,
      2,
      COLORS.mothership,
      60,
      0.1,
      1
    );
  }

  /** Mothership auto-regen (ms_regen upgrade) */
  updateMothershipRegen(game: IGame, dt: number) {
    if (game.stats.msRepairInterval <= 0) return;
    if (game.mothership.hp >= game.mothership.maxHp) return;

    this.msRegenTimer += dt;
    if (this.msRegenTimer >= game.stats.msRepairInterval) {
      this.msRegenTimer = 0;
      game.mothership.heal(1);
    }
  }

  /** Mothership energy barrier (ms_barrier upgrade) */
  updateMothershipBarrier(game: IGame, dt: number) {
    if (game.stats.msBarrierHits <= 0) return;

    if (this.msBarrierHitsRemaining <= 0) {
      this.msBarrierTimer += dt;
      if (this.msBarrierTimer >= game.stats.msBarrierCooldown) {
        this.msBarrierTimer = 0;
        this.msBarrierHitsRemaining = game.stats.msBarrierHits;
      }
    }
  }

  /** Check if barrier absorbs a hit. Returns true if absorbed. */
  barrierAbsorb(): boolean {
    if (this.msBarrierHitsRemaining > 0) {
      this.msBarrierHitsRemaining--;
      return true;
    }
    return false;
  }

  get barrierActive(): boolean {
    return this.msBarrierHitsRemaining > 0;
  }
}

import { IGame } from "../game/GameInterface";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Bullet } from "../entities/Bullet";
import {
  Vec2,
  vec2,
  vecSub,
  vecNormalize,
  randomAngle,
  randomRange,
  vecDist,
} from "../utils/Math";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_DISTANCE,
  SPAWN_RATE_BASE,
  ROCK_BASE_HP,
  ROCK_BIG_HP,
  ROCK_BASE_SPEED,
  ENEMY_SHIP_BASE_HP,
  ENEMY_SHIP_BASE_SPEED,
  COLORS,
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
    this.msBarrierHitsRemaining =
      game.stats.msBarrierHits > 0 ? game.stats.msBarrierHits : 0;
  }

  /** Spawn an enemy at the edge of the map */
  spawnEnemy(game: IGame) {
    const angle = randomAngle();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const x = cx + Math.cos(angle) * SPAWN_DISTANCE;
    const y = cy + Math.sin(angle) * SPAWN_DISTANCE;
    const level = game.save.currentLevel;

    // Determine enemy type based on level
    if (level <= 3 || Math.random() < 0.5 / level) {
      // Rocks — big rock chance ramps up over the round
      // Early: mostly small rocks (5% big). Late: up to 40% big.
      const elapsed = game.roundDuration - game.roundTimer;
      const roundProgress =
        game.roundDuration > 0 ? Math.min(1, elapsed / game.roundDuration) : 0;
      const bigRockChance = 0.05 + roundProgress * 0.35; // 5% → 40%
      const isBig = Math.random() < bigRockChance;
      const baseHp = isBig ? ROCK_BIG_HP : ROCK_BASE_HP;
      const hp = baseHp + Math.floor(level * 0.3);
      const speed = ROCK_BASE_SPEED + level * 2;
      const rock = new Rock(x, y, hp, speed, isBig);

      // Elite check
      if (level >= 5 && Math.random() < 0.05) {
        rock.isElite = true;
        rock.hp *= 3;
        rock.maxHp = rock.hp;
        rock.coinValue = 10;
        rock.radius *= 1.3;
      }

      game.enemies.push(rock);
    } else {
      // Enemy ship
      const hp = ENEMY_SHIP_BASE_HP + level;
      const speed = ENEMY_SHIP_BASE_SPEED + level * 2;
      const canShoot = level >= 4;
      const ship = new EnemyShip(x, y, hp, speed, canShoot);
      ship.coinValue = 2 + Math.floor(level * 0.3);

      if (level >= 5 && Math.random() < 0.05) {
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
        const bullet = new Bullet(
          enemy.pos.x,
          enemy.pos.y,
          dir,
          200,
          1,
          false,
          0,
          true,
        );
        game.enemyBullets.push(bullet);
      }
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

  /** Mothership defense turret auto-fire (ms_turret upgrade) */
  updateTurret(game: IGame, dt: number) {
    if (game.stats.turretLevel <= 0) return;

    this.turretCooldown -= dt;
    if (this.turretCooldown > 0) return;

    // Fire rate: 1 shot per (2 / turretLevel) seconds, minimum 0.3s
    this.turretCooldown = Math.max(0.3, 2 / game.stats.turretLevel);

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
      false,
    );
    game.bullets.push(bullet);

    // Visual
    game.particles.emitDirectional(
      vec2(
        game.mothership.pos.x + dir.x * 20,
        game.mothership.pos.y + dir.y * 20,
      ),
      Math.atan2(dir.y, dir.x),
      0.2,
      2,
      COLORS.mothership,
      60,
      0.1,
      1,
    );
  }

  /** Mothership auto-regen (ms_regen upgrade) */
  updateMothershipRegen(game: IGame, dt: number) {
    if (game.stats.msRegenInterval <= 0) return;
    if (game.mothership.hp >= game.mothership.maxHp) return;

    this.msRegenTimer += dt;
    if (this.msRegenTimer >= game.stats.msRegenInterval) {
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

import { IGame } from "../game/GameInterface";
import { Enemy } from "../entities/Enemy";
import { Coin } from "../entities/Coin";
import { Vec2, vecDistSq, circleCollision, randomAngle } from "../utils/Math";
import {
  COIN_SIZE,
  COLORS,
  CHAIN_RANGE,
  SPLASH_DAMAGE_MULT,
  BOSS_MOTHERSHIP_DAMAGE,
  BOSS_BULLET_DAMAGE,
  PLAYER_COLLISION_RADIUS,
} from "../utils/Constants";

/** Options for the AoE damage helper. */
export interface AoEOptions {
  /** If provided, each hit rolls for crit with this chance/multiplier. */
  crit?: { chance: number; multiplier: number };
  /** If > 0, apply stun to each enemy in radius (seconds). */
  stunDuration?: number;
  /** If true, skip damage entirely (stun-only). */
  stunOnly?: boolean;
}

/**
 * Handles all collision detection and resolution, extracted from Game.ts.
 */
export class CollisionSystem {
  /**
   * Damage all enemies within `radius` of `center`.
   * Handles damage numbers, kill checks, and optional crit/stun.
   * Returns the number of enemies hit.
   *
   * Particle effects are NOT emitted here — call sites handle their own
   * visual feedback since effects vary by context.
   */
  damageEnemiesInRadius(
    game: IGame,
    center: Vec2,
    radius: number,
    damage: number,
    opts?: AoEOptions
  ): number {
    let hitCount = 0;
    const radiusSq = radius * radius;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (vecDistSq(center, enemy.pos) > radiusSq) continue;

      hitCount++;

      if (opts?.stunDuration && opts.stunDuration > 0) {
        enemy.applyStun(opts.stunDuration);
      }
      if (opts?.stunOnly) continue;

      let dmg = damage;
      let isCrit = false;
      if (opts?.crit) {
        isCrit = Math.random() < opts.crit.chance;
        if (isCrit) dmg *= opts.crit.multiplier;
      }

      const wasAlive = enemy.alive;
      enemy.takeDamage(dmg);
      game.spawnDamageNumber(enemy.pos.x, enemy.pos.y, dmg, isCrit);

      if (wasAlive && !enemy.alive) {
        game.onEnemyKilled(enemy);
      }
    }
    return hitCount;
  }

  /**
   * Player bullets vs enemies.
   * Implements: pierce, splash (on every hit), chain lightning,
   * poison, slow, damage numbers on kill.
   */
  checkBulletEnemyCollisions(game: IGame) {
    for (const bullet of game.bullets) {
      if (!bullet.alive) continue;
      for (const enemy of game.enemies) {
        if (!enemy.alive) continue;
        if (circleCollision(bullet.pos, bullet.radius, enemy.pos, enemy.radius)) {
          const killed = enemy.takeDamage(bullet.damage);

          // Always show damage number
          game.spawnDamageNumber(bullet.pos.x, bullet.pos.y, bullet.damage, bullet.isCrit);

          // Apply poison debuff
          if (game.stats.poisonDps > 0) {
            enemy.applyPoison(game.stats.poisonDps, 3);
          }

          // Apply slow debuff
          if (game.stats.slowOnHit > 0) {
            enemy.applySlow(game.stats.slowOnHit, 2);
          }

          if (killed) {
            game.onEnemyKilled(enemy);
          } else {
            // Hit particles
            game.particles.emit(bullet.pos, 3, COLORS.bullet, 40, 0.2, 1);
          }

          // Splash damage — triggers on every hit, not just kills (P3: skip when no splash)
          if (game.stats.splashRadius > 0) {
            const splashDmg = bullet.damage * SPLASH_DAMAGE_MULT;
            const splashRadiusSq = game.stats.splashRadius * game.stats.splashRadius;
            for (const other of game.enemies) {
              if (!other.alive || other === enemy) continue; // P12: skip dead enemies
              const dx = enemy.pos.x - other.pos.x;
              const dy = enemy.pos.y - other.pos.y;
              if (dx * dx + dy * dy < splashRadiusSq) {
                const splashKilled = other.takeDamage(splashDmg);
                game.spawnDamageNumber(other.pos.x, other.pos.y, splashDmg, false);
                if (splashKilled) {
                  game.onEnemyKilled(other);
                }
              }
            }
          }

          // Chain lightning — bounces to nearby enemies on kill (P3: skip when no chain)
          if (killed && game.stats.chainTargets > 0) {
            this.chainLightning(
              game,
              enemy.pos,
              bullet.damage * SPLASH_DAMAGE_MULT,
              game.stats.chainTargets,
              enemy
            );
          }

          // Pierce: bullet may survive the hit
          if (bullet.onHitEnemy()) {
            bullet.destroy();
          }
          break; // Move to next bullet even if piercing (one enemy per frame per bullet)
        }
      }
    }
  }

  /** Chain lightning: damage bounces to N nearby enemies */
  private chainLightning(
    game: IGame,
    origin: Vec2,
    damage: number,
    targets: number,
    source: Enemy
  ) {
    const hit = new Set<Enemy>([source]);
    let currentPos = origin;
    let remaining = targets;
    const chainRangeSq = CHAIN_RANGE * CHAIN_RANGE;

    while (remaining > 0) {
      let closest: Enemy | null = null;
      let closestDistSq = chainRangeSq;

      for (const enemy of game.enemies) {
        if (!enemy.alive || hit.has(enemy)) continue; // P12: skip dead enemies
        const dSq = vecDistSq(currentPos, enemy.pos);
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closest = enemy;
        }
      }

      if (!closest) break;
      hit.add(closest);

      // Visual: lightning line
      game.particles.emitDirectional(
        closest.pos,
        randomAngle(),
        Math.PI,
        3,
        "#88aaff",
        40,
        0.15,
        1
      );

      if (closest.takeDamage(damage)) {
        game.onEnemyKilled(closest);
      }
      game.spawnDamageNumber(closest.pos.x, closest.pos.y, damage, false);

      currentPos = closest.pos;
      remaining--;
    }
  }

  /**
   * Enemies colliding with mothership.
   * Bug #1 fix: barrier is checked before applying damage — if the barrier
   * absorbs the hit, no HP is lost and no time penalty is applied.
   */
  checkEnemyMothershipCollisions(game: IGame): boolean {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (circleCollision(enemy.pos, enemy.radius, game.mothership.pos, game.mothership.radius)) {
        enemy.destroy();
        game.particles.emit(enemy.pos, 8, COLORS.mothershipDamaged, 80, 0.3, 2);

        // Barrier absorbs the hit if active
        if (game.spawner.barrierAbsorb()) {
          game.particles.emit(enemy.pos, 6, COLORS.shield, 60, 0.2, 1.5);
          game.renderer.shake(2);
          continue; // hit absorbed — no damage, no time penalty
        }

        // Bosses deal much more damage to mothership
        const dmg = enemy.isBoss ? BOSS_MOTHERSHIP_DAMAGE : 1;
        const destroyed = game.mothership.takeDamage(dmg);
        game.roundTimer -= game.stats.timePenaltyPerHit * dmg;
        game.renderer.shake(enemy.isBoss ? 8 : 5);
        game.audio.playMothershipHit();

        if (destroyed) {
          game.endRound(true, "mothership");
          return true;
        }
        if (game.roundTimer <= 0) {
          game.endRound(true, "time");
          return true;
        }
      }
    }

    // Enemy bullets hitting mothership
    for (const bullet of game.enemyBullets) {
      if (!bullet.alive) continue;
      if (circleCollision(bullet.pos, bullet.radius, game.mothership.pos, game.mothership.radius)) {
        bullet.destroy();
        game.particles.emit(bullet.pos, 5, COLORS.mothershipDamaged, 60, 0.2, 1.5);

        // Barrier absorbs the hit if active
        if (game.spawner.barrierAbsorb()) {
          game.particles.emit(bullet.pos, 4, COLORS.shield, 40, 0.15, 1);
          game.renderer.shake(2);
          continue; // hit absorbed
        }

        // Boss bullets deal extra damage
        const bulletDmg = bullet.damage > 1 ? BOSS_BULLET_DAMAGE : 1;
        const destroyed = game.mothership.takeDamage(bulletDmg);
        game.roundTimer -= game.stats.timePenaltyPerHit * bulletDmg;
        game.renderer.shake(bulletDmg > 1 ? 6 : 4);
        game.audio.playMothershipHit();

        if (destroyed) {
          game.endRound(true, "mothership");
          return true;
        }
        if (game.roundTimer <= 0) {
          game.endRound(true, "time");
          return true;
        }
      }
    }

    return false;
  }

  /** Coin collection by player */
  checkCoinCollections(game: IGame) {
    // Check if in overtime for bonus
    const inOvertime = game.stats.overtimeBonus > 0 && game.roundTimer <= 10;
    const overtimeMult = inOvertime ? 1 + game.stats.overtimeBonus : 1;
    const pickupRange = COIN_SIZE + game.player.radius;
    const pickupRangeSq = pickupRange * pickupRange;

    for (const coin of game.coins) {
      if (!coin.alive) continue;
      if (vecDistSq(coin.pos, game.player.pos) < pickupRangeSq) {
        coin.destroy();
        const value = Math.round(coin.value * overtimeMult);
        game.roundCoins += value;
        game.save.coins += value;
        game.save.lifetimeCoins += value;

        // Juicy coin pickup feedback — more particles, bigger burst, rising "+N" text
        const isPurple = coin.value >= 50;
        const isGold = coin.value >= 5;
        const particleColor = isPurple ? COLORS.coinRare : isGold ? "#ffaa00" : COLORS.coin;
        const isRare = isPurple || isGold;
        game.particles.emit(coin.pos, isRare ? 12 : 8, particleColor, isRare ? 60 : 45, 0.3, 1.5);
        // Extra white sparkle ring
        game.particles.emit(coin.pos, 4, "#ffffff", 35, 0.15, 0.8);
        // Show coin value as floating number
        game.spawnDamageNumber(coin.pos.x, coin.pos.y - 5, value, isRare);
        game.audio.playCoinPickup();
      }
    }
  }

  /**
   * Player bullets vs debris asteroids.
   * Debris has 1 HP — any bullet kills it. 50% chance to drop 1 coin (min 1 if dropping).
   * Bullet is NOT consumed (pierces through debris).
   */
  checkBulletDebrisCollisions(game: IGame) {
    for (const bullet of game.bullets) {
      if (!bullet.alive) continue;
      for (const debris of game.debris) {
        if (!debris.alive) continue;
        if (circleCollision(bullet.pos, bullet.radius, debris.pos, debris.radius)) {
          const killed = debris.takeDamage(bullet.damage);
          if (killed) {
            // Small rock-crumble particle burst
            game.particles.emit(debris.pos, 4, "#888888", 30, 0.2, 1);

            // 50% chance to drop a coin (min value 1)
            if (Math.random() < 0.5) {
              const coin = new Coin(debris.pos.x, debris.pos.y, 1);
              coin.magnetRange = game.stats.coinMagnetRange;
              game.coins.push(coin);
            }
          }
          // Bullet pierces through debris — don't consume it
          break; // one debris per bullet per frame
        }
      }
    }
  }

  /**
   * Enemy bullets hitting the player.
   * Player takes 1 HP damage per hit. Invulnerability frames prevent rapid hits.
   * Returns true if player is killed (round should end).
   */
  checkEnemyBulletPlayerCollisions(game: IGame): boolean {
    if (game.player.isInvulnerable) return false; // skip check entirely during i-frames

    const playerHitRadius = PLAYER_COLLISION_RADIUS + 6; // slightly generous hitbox for bullets

    for (const bullet of game.enemyBullets) {
      if (!bullet.alive) continue;
      if (circleCollision(bullet.pos, bullet.radius, game.player.pos, playerHitRadius)) {
        bullet.destroy();

        const killed = game.player.takeDamage(1);
        game.particles.emit(game.player.pos, 8, COLORS.playerHp, 60, 0.25, 2);
        game.particles.emit(game.player.pos, 4, "#ffffff", 30, 0.15, 1);
        game.renderer.shake(4);
        game.audio.playMothershipHit(); // reuse hit SFX

        if (killed) {
          // Player destroyed — end round
          game.particles.emit(game.player.pos, 30, COLORS.playerHp, 120, 0.5, 4);
          game.particles.emit(game.player.pos, 20, COLORS.player, 100, 0.4, 3);
          game.endRound(true, "player");
          return true;
        }

        break; // only process one hit per frame (i-frames kick in)
      }
    }

    return false;
  }
}
